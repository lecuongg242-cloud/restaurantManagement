# 08-01 SUMMARY — Gỡ WebSocket churn trong `broadcastOrderStatus`

> Thực hiện 24/09/2026. Yêu cầu: PERF-01. Số nền lấy từ `08-04-SUMMARY.md`.

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `lib/orders/broadcast.ts` | Gửi qua REST `/realtime/v1/api/broadcast`; thêm `broadcastOrderStatuses`; thêm seam tiêm client để test |
| `app/r/[slug]/pos/actions.ts` | Vòng lặp tuần tự → một lời gọi gộp |
| `lib/billing/bill.ts` | Vòng lặp tuần tự → một lời gọi gộp |
| `tests/orders/broadcast.test.ts` (mới) | 8 test hình dạng request |
| `tests/rls/broadcast-e2e.test.ts` (mới) | 2 test đầu-cuối thật |

Chữ ký `broadcastOrderStatus(orderId)` và `OrderStatusPayload` **không đổi** — 8 lối gọi đơn lẻ
không phải sửa. Client cũng không đổi: vẫn `channel(ORDER_CHANNEL(id))`, vẫn event `status`.

## Đo trước/sau (5 đơn — bill gộp)

| | Thời gian |
|---|---|
| Trước (5 lần mở/đóng WebSocket, tuần tự) | **1.001 ms** |
| Sau (1 request, 5 message) | **163 ms** |

**6× nhanh hơn**, và quan trọng hơn: bỏ hẳn đuôi rủi ro **3 giây/đơn** của guard timeout khi bắt
tay WebSocket chậm. Đuôi đó mới là thứ làm BILL-04 ("đóng bill ≤5s") vỡ, và nó **không** xuất hiện
trong phép đo lúc mạng tốt — đó là lý do không thể chỉ nhìn số trung bình mà kết luận.

## Đính chính

Plan 08-01 viết "đóng bill gộp 5 đơn có thể mất **15 giây**". Con số đó là **xấu nhất lý thuyết**
(5 × timeout 3s), không phải số điển hình. Đo thật trong điều kiện mạng bình thường là ~1 giây.
Vấn đề vẫn có thật, nhưng mô tả ban đầu của tôi nghiêm trọng hơn thực tế.

## Test

```
tests/orders/broadcast.test.ts      8 passed
tests/rls/broadcast-e2e.test.ts     2 passed
toàn bộ unit                      358 passed
tsc + lint + build                sạch
```

Test đáng chú ý:

- *"năm đơn → ĐÚNG MỘT request"* — chính là tính chất phá bỏ vòng lặp tuần tự.
- *"broadcast.ts không còn mở kênh Realtime nào"* — đọc mã nguồn, đếm `.channel(` = 0. Giữ cho
  WebSocket không lặng lẽ quay lại.
- Đầu-cuối: khách subscribe thật, nhận payload đúng trong **≤ 2 giây**. Mọi test mock đều không
  chứng minh được điều này.

## Đã cân nhắc, không làm

Đọc payload vẫn theo từng đơn (chạy song song bằng `Promise.all`), chỉ gộp phần **gửi**. Gộp cả
phần đọc thành một truy vấn `in (...)` sẽ nhanh hơn nữa nhưng phải dựng lại cấu trúc payload theo
đơn — đổi nhiều để lấy phần nhỏ, trong khi nút cổ chai đã được gỡ.

`bill.ts:565` còn một vòng lặp tuần tự khác (roll-up trạng thái đơn theo món) — **không đụng**, đó
là truy vấn DB chứ không phải broadcast, và nằm ngoài phạm vi plan này.
