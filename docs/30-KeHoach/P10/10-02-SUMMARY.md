# 10-02 — Summary: Nhập buổi sáng, chế biến mẻ, số phần trên POS

> Yêu cầu: INV-04, INV-05, INV-06, INV-07 (+ INV-10). Làm 24/09/2026. TDD.

## Kết quả

| Cam kết | Trạng thái | Bằng chứng |
|---|---|---|
| INV-04 nhập buổi sáng | ◐ code + kiểm xong | `/admin/inventory/today`; E2E: gõ "1" (kg) → sổ lưu **1000** g; điền sẵn danh sách lần nhập gần nhất; `day.test.ts` 23:59 / 00:01 giờ VN đúng dưới `TZ=UTC` |
| INV-05 phiếu chế biến mẻ | ◐ | `batch.test.ts`: **40 l công thức, thực 38 l, con 600.000đ → 15.789đ/l, hụt 2 l**; `record-batch.test.ts` 5/5: đủ 1 phiếu + 1 ra mẻ + 2 trừ con, quán khác bị từ chối và **không ghi dòng nào**, nguyên liệu lạ → rollback cả phiếu |
| INV-06 tồn & số phần | ◐ | `inventory-usage.test.ts` 9/9 trên DB thật: QR chưa duyệt không trừ · đã xác nhận trừ · hủy trước in không trừ · hủy sau in trừ · in hai lần lấy mốc sớm nhất · **hủy cả đơn sau in trừ** · đơn trước mốc gốc không trừ · trứng theo qty dòng · bán thành phẩm chỉ tính tồn đã nấu |
| INV-07 nhãn trên POS | ◐ | E2E: POS hiện **"còn ~5"**; bán 5 phần → **"Có thể đã hết — hãy hỏi bếp"**, món vẫn bấm được, "Tạo đơn" bật, `is_available` vẫn `true`; HTML `/menu` của khách không chứa "còn ~" hay "hỏi bếp"; dọn sổ xong → POS không còn nhãn nào (INV-10) |
| INV-10 | ☑ cho 10-02 | `git diff -- lib/orders/create-order.ts lib/billing` rỗng; trang khách không đổi |

## Số đo

| | Kết quả |
|---|---|
| `npm run test` | **532/532**, 44 file |
| `npm run test:rls` | **221/221**, 12 file; ma trận **22 bảng** |
| `schema:check` · `tsc` · `lint` · `build` | sạch (29 bảng, 26 hàm) |
| E2E `inventory.spec.ts` | 4/4, 360px không cuộn ngang ở cả 3 tab |
| **`menu_portions`**, tenant demo, 12 món khai định lượng, **310 dòng món** (60 đơn giả lập có phiếu in + hủy sau in) | DB **3,9 ms**; tính cả mạng từ máy dev tới Singapore 66 ms. Chạy **song song** với `getPosSnapshot` nên không cộng thêm vào thời gian tải POS. Dưới xa ngưỡng 150 ms — không cần cache |

Migration **0046 đã áp** (2 bảng + 3 hàm, không đổi bảng cũ). Dữ liệu đo đã dọn.

## Lệch so với plan — đã ghi vào QD-017

- **Chỉ nguyên liệu đã từng có dòng sổ mới tham gia số phần.** Plan không nêu; phát hiện khi viết
  SQL: muối, nước mắm khai trong định lượng nhưng không ai nhập mỗi sáng → tồn ≤ 0 → món nào cũng
  báo "có thể đã hết". Test `muối chưa từng nhập không kéo số phần về 0` khẳng định.
- **Số phần đi đường riêng `getMenuPortions`**, truyền prop tới `MenuPanel` và `ModifierSheet`
  (prop tùy chọn — trang khách không truyền nên không đổi gì).

## Cạm bẫy gặp thật

- PostgREST **chèn nhiều dòng một lệnh thì cột thiếu ở một dòng thành `null`**, không lấy giá trị
  mặc định → `kind`, `yield_pct` null. Test chèn từng dòng. Code app chèn nhiều dòng đều cùng khuôn
  cột nên không dính.
- Test đầu đặt giờ đơn ở **tương lai** → RPC (chỉ tính trước `now()`) ra 0. Mọi mốc test đưa về quá khứ.
- `pho-viet` đang ở chế độ **bán tại quầy** → không có nút bàn; E2E kiểm "Tạo đơn" bật thay vì chọn bàn.

## Còn chờ

Checkpoint người thật: một buổi sáng nhập hàng thật trên điện thoại, ghi một mẻ nước dùng, xem nhãn
trên POS trong ca.
