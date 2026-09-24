# Kế hoạch P8 — Tối ưu tải & chi phí

> Lập 24/09/2026. Nguồn: `superpowers/specs/2026-09-24-p8-toi-uu-tai-chi-phi-design.md`,
> `15-QuyetDinh/QD-013` §3. Yêu cầu: **PERF-01..04**, **OPS-07**.
> Mục tiêu quy mô: **10–20 quán trong 12 tháng**. Hiện: **1 quán chạy thật, 0 số liệu**.

## P8 là gì (một câu)

Cắt những chỗ hệ thống tiêu tài nguyên theo số **thiết bị × quán** thay vì theo số **việc thật sự
phải làm**, và dựng khả năng đo để biết cái gì đáng tối ưu tiếp.

## Năm plan

| Plan | Tên | Wave | Phụ thuộc | Yêu cầu |
|---|---|---|---|---|
| 08-01 | Gỡ WebSocket churn trong `broadcastOrderStatus` | 2 | 08-04 (để có số trước) | PERF-01 |
| 08-02 | POS thôi nạp lại thực đơn mỗi lần refresh | 2 | 08-04 | PERF-02 |
| 08-03 | Cầu in nhịp thích ứng | 2 | — | PERF-03 |
| 08-04 | Đo lường theo tenant | **1** | — | PERF-04 |
| 08-05 | Chốt chặn lệch schema trong CI | 1 | — | OPS-07 |

`08-04` đi **trước** vì nó là thước đo: làm 08-01/02 rồi mới cài đo thì không còn số "trước" để so.
`08-03` và `08-05` độc lập hoàn toàn, chen vào đâu cũng được.

## Vì sao chỉ có bằng này việc

Với 1 quán thật và 0 số liệu, tối ưu theo phỏng đoán là cách chắc chắn nhất để bỏ công vào chỗ
không đau. P8 chỉ nhận hai loại việc: **lãng phí cấu trúc** (nhìn code là biết thừa) và **đo lường**.

Cụ thể bị loại khỏi P8:

| Mục | Vì sao hoãn |
|---|---|
| Viết lại realtime, bỏ `router.refresh()` | Chạm sâu `PosBoard`/`KdsBoard` — hai bề mặt qt-food dùng thật hằng ngày. **Quyết sau khi 08-04 có số**, không quyết bằng cảm giác |
| Rate limit endpoint ẩn danh | Chưa đo thì không biết đặt ngưỡng nào. Ngưỡng sai chặn khách thật |
| `findAuthUserByEmail` quét tuyến tính | Chỉ chạy lúc tạo tenant |
| Gói cước SaaS | V3 (`50-PhienBan/V2-KeHoach.md`) |

## Một chỗ đang hỏng ngay hôm nay

`broadcastOrderStatus` mở + đóng một WebSocket, chờ tới 3 giây, **mỗi lần** đổi trạng thái. Hai lối
gọi nó trong vòng lặp tuần tự (`pos/actions.ts:1076`, `lib/billing/bill.ts:597`), nên đóng một bill
gộp 5 đơn có thể mất **15 giây** — phá thẳng BILL-04 "đóng bill ≤5s". Đây không phải vấn đề của lúc
đông quán; nó đang xảy ra với một quán.

Vì vậy 08-01 tuy xếp wave 2 nhưng là plan đáng làm nhất.

## Giả định rủi ro nhất — đã kiểm trước khi lập kế hoạch

08-01 đặt cược vào việc REST broadcast thay được WebSocket. Nếu sai thì cả plan phải thiết kế lại,
nên kiểm trước (24/09/2026, trên chính project này):

```
POST /realtime/v1/api/broadcast, 2 message trong 1 request  →  HTTP 202, 305ms
Client supabase-js đang channel('order:<id>')               →  nhận sau 281ms, payload nguyên vẹn
```

Kết luận: **không phải đổi gì phía client**. `ORDER_CHANNEL` và event `status` giữ nguyên.

## Tiêu chí hoàn thành P8

Không phải "code xong" mà là **đo được**:

1. Đóng bill gộp 5 đơn **≤ 5s** (PERF-01), có số trước/sau.
2. Số truy vấn mỗi lần render POS giảm đúng phần thực đơn (PERF-02), **và không cũ dữ liệu** ở
   từng lối ghi.
3. Cầu in lúc quán vắng ≤ 400 request/giờ, phiếu đầu sau kỳ vắng ra ≤ 10s (PERF-03).
4. Sau 2 tuần log thật: trả lời được **"POS render bao nhiêu lần mỗi giờ cao điểm"** (PERF-04).
5. CI đỏ khi có object trên DB mà không có migration; xanh lại khi gỡ (OPS-07).
6. `tsc` + `lint` + `build` sạch; 344 unit + 148 RLS không hồi quy.

Mục 4 quan trọng nhất. **P8 kết thúc bằng "đã biết cái gì đáng tối ưu tiếp", không phải "đã tối
ưu".** Kết quả của nó là một quyết định có căn cứ về hướng C, ghi thành `QD-014`.
