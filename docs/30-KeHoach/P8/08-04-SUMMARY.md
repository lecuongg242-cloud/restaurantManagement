# 08-04 SUMMARY — Đo lường theo tenant

> Thực hiện 24/09/2026. Yêu cầu: PERF-04. **Wave 1 — mục đích chính là sinh số nền cho 08-01/08-02.**

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `lib/observability/log.ts` (mới) | `logRequest`, `timed` — một chỗ duy nhất định nghĩa dạng log |
| `middleware.ts` | Một dòng JSON mỗi request vào mọi route |
| `lib/orders/pos.ts` | `getPosSnapshot(tenantId, slug?)` bọc `timed`; thân thật tách thành `readPosSnapshot` |
| `lib/orders/customer-menu.ts` | `getCustomerMenu` bọc `timed`; thân thật tách thành `readCustomerMenu` |
| `app/r/[slug]/pos/page.tsx`, `pos/m/page.tsx` | Truyền `slug` để log theo slug, không theo uuid |
| `tests/observability/log.test.ts` (mới) | 6 test |

Chữ ký công khai không đổi — `slug` là tham số **tùy chọn** thêm vào cuối, nên không lối gọi nào
buộc phải sửa.

## Kết quả test

```
tests/observability/log.test.ts   6 passed
toàn bộ unit                    350 passed
tsc + lint + build              sạch
```

## Chạy thật

```
{"evt":"req","tenant":null,"path":"/","ms":3,"status":200}
{"evt":"req","tenant":"pho-viet","path":"/r/pho-viet/menu","ms":1,"status":200}
{"evt":"op","name":"getCustomerMenu","tenant":"pho-viet","ms":1173,"ok":true}
{"evt":"req","tenant":"pho-viet","path":"/r/pho-viet/menu","ms":0,"status":200}
{"evt":"op","name":"getCustomerMenu","tenant":"pho-viet","ms":575,"ok":true}
```

Gọi bằng URL có `?t=b98186ed87d27ff86d` (token bàn). `grep` token đó trong toàn bộ log:
**0 kết quả** — query bị cắt đúng như yêu cầu.

## SỐ NỀN (dùng cho 08-01 và 08-02)

### PERF-02 — chi phí đọc thực đơn mỗi lần render

| | Số đo |
|---|---|
| `getCustomerMenu`, lần đầu | **1.173 ms** |
| `getCustomerMenu`, lần sau | **575 ms** |
| Truy vấn mỗi lần render `/pos` | **11** (7 của `getPosSnapshot` + 2 của `getCustomerMenu` + memberships + tenants) |

Mỗi sự kiện realtime kích một lần render trên **mọi** thiết bị đang mở. 08-02 cắt phần
`getCustomerMenu` khỏi con số đó.

### PERF-01 — chi phí phát trạng thái cho bill gộp 5 đơn

Mô phỏng **đúng** cơ chế hiện tại (mỗi đơn mở một kênh, chờ `SUBSCRIBED`, gửi, đóng — tuần tự như
vòng lặp ở `bill.ts:597`):

| Cách | 5 đơn |
|---|---|
| Hiện tại (5 lần mở/đóng WebSocket, tuần tự) | **1.001 ms** |
| REST broadcast, 1 request 5 message | **163 ms** |

**Đính chính cho plan 08-01:** con số "15 giây" trong plan là **xấu nhất lý thuyết** (5 × guard
timeout 3s), không phải số điển hình. Đo thật trong điều kiện mạng bình thường là ~1 giây. Cải
thiện thật là **6×**, cộng với việc bỏ hẳn đuôi rủi ro 3 giây/đơn khi WebSocket bắt tay chậm — đó
mới là thứ làm BILL-04 vỡ, và nó không xuất hiện trong phép đo lúc mạng tốt.

## Còn lại

Sau 2 tuần chạy thật trên production: viết `docs/40-KiemTra/PERF-04-TruyVanLog.md` (câu truy vấn
Vercel) và chốt `QD-014` — có viết lại realtime hay không, **kèm số**.
