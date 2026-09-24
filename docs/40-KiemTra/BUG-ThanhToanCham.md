# BUG — Thanh toán chậm

> Điều tra 24/09/2026. Trạng thái: **đã tối ưu `payBill` (−38%)**; nguyên nhân chính cần di trú
> vùng, xem `50-PhienBan/DiTru-Singapore.md`.

## Nguyên nhân chính: compute chạy ở nửa kia địa cầu

`X-Vercel-Id: hkg1::iad1` — request vào qua Hồng Kông, **hàm chạy ở Virginia**, database ở `us-east-1`.

Đo từ Việt Nam:

| | Thời gian |
|---|---|
| Tệp tĩnh (biên, gần VN) | **123 ms** |
| Trang có truy vấn DB | **510–535 ms** |

~400ms chênh là vé khứ hồi Việt Nam ↔ Mỹ. Đó là **sàn** — không tối ưu truy vấn nào hạ được.

Một lần thanh toán tốn ít nhất **hai** lượt như vậy: lượt gọi action, rồi lượt `router.refresh()`
do sự kiện realtime trên bảng `bills` kích hoạt. ⇒ ~1 giây trước khi màn hình ổn định.

## Nguyên nhân phụ: `payBill` xếp hàng 15 lượt khứ hồi

Hiện tại nó rẻ (~5ms/lượt) **chỉ vì** hàm nằm cùng vùng với database. Nhưng nó là quả mìn cho bất
kỳ thay đổi vùng nào — và đó chính là việc sắp làm.

Đo từ Việt Nam (mô phỏng đúng tình huống compute và DB khác vùng):

| | Thời gian | Lượt khứ hồi nối tiếp |
|---|---|---|
| Trước | **3.607 ms** | 15 |
| Sau | **~2.220 ms** | **7** |

Giảm **38%**. Bốn chỗ gộp:

1. **Đọc bill song song với RPC `pay_bill`** — bill chỉ phục vụ phần đuôi, không quyết định được
   phép thu hay không (RPC kiểm lại dưới khóa).
2. **Roll-up đơn → `served` trước đây là N+1**: mỗi đơn một lượt đọc + một lượt ghi. Hóa đơn gộp 5
   đơn = 10 lượt nối tiếp. Nay một lượt đọc, gom trong bộ nhớ, một lượt ghi.
3. `order_items` và `paidQtyMap` cùng dựa trên `holderOiIds` → đi cùng lượt.
4. `closeSessionIfSettled`: 2 đọc song song + 2 ghi song song (4 lượt → 2), và các phiên bàn xử
   song song thay vì xếp hàng.

## Lưới an toàn — viết TRƯỚC khi sửa

`tests/rls/pay-bill.test.ts` thu tiền thật rồi kiểm từng hệ quả: hóa đơn `paid`, dòng thanh toán,
món `served`, đơn `served`, phiên bàn đóng, bàn về trống, tiền thối đúng. Cộng hai phép idempotent.

Hai lần test đỏ đầu tiên đều là **giả định của tôi sai**, không phải sản phẩm sai:

1. Gửi lại **không kèm khóa** bị từ chối — **đúng**, đó là bảo vệ tiền.
2. `p_idem` của RPC là kiểu `uuid`; chuỗi tự đặt bị `normalizeIdempotencyKey` loại, nên lượt hai
   rơi vào nhánh "hóa đơn đã đóng".

## Một sai lầm của tôi, ghi lại để không ai lặp

Tôi đã commit `regions: ["sin1"]` vào `vercel.json` rồi phải gỡ ra. Đổi vùng compute **một mình**,
khi database còn ở Mỹ, làm mỗi lượt truy vấn thành ~230ms:

| Cấu hình | Tổng cho một `payBill` |
|---|---|
| Hiện nay (`iad1` + DB `us-east-1`) | ~465 ms |
| **Chỉ đổi `sin1`** | **~1.650 ms** ❌ |
| Đổi cả hai sang Singapore | **~75 ms** ✅ |

Đổi vùng compute chỉ đúng khi đi **cùng lúc** với database.

## Còn lại

- **Di trú sang Singapore** — `50-PhienBan/DiTru-Singapore.md`. Đây mới là thứ phá được sàn 430ms.
- **Lượt refresh thừa sau thanh toán**: sự kiện realtime trên `bills` kích `router.refresh()` trên
  mọi thiết bị. Chưa đụng — thuộc nhóm "viết lại realtime" (hướng C của P8), quyết bằng số của
  PERF-04.
