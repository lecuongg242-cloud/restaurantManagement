# 12-05 SUMMARY — POS trên điện thoại

> Thực hiện 27/09/2026. Yêu cầu: ORDER-20. Quyết định: QD-020 D1, D2.
> **Trạng thái: code + E2E 8 luồng xanh ở 390×844 và 360×800; `/pos/m` đã về hưu (xem "Bổ sung 27/09").
> Còn: người thật trên iPhone/Android thật (nghiệm thu 2); đo tải ở một quán có ≥ 2 điện thoại (nghiệm thu 4).**

## Lệch khỏi plan — có chủ đích

| Plan ghi | Làm | Vì sao |
|---|---|---|
| Mọi hộp thoại đổi sang ngăn kéo `vaul` | Giữ hộp thoại, thêm `max-sm:` để **toàn màn hình** trên điện thoại | 8 hộp thoại dùng CHUNG một khuôn (`fixed inset-0 … max-w-md`) và đã vừa chiều ngang 360 px. Đạt đúng tiêu chí ("vừa màn hình, không tràn") với 16 thay đổi class thay vì viết lại 8 component; khổ ≥ 640 không đổi |
| `/pos/m` chuyển hướng về `/pos` sau nghiệm thu 2 | Làm **trước** nghiệm thu 2 (bổ sung 27/09) | Chủ dự án yêu cầu "triển khai hết P12". Ghi lệch vào QD-020 D2 |

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `components/pos/MobileTabBar.tsx` (mới) | Thanh tab dưới Bàn · Thực đơn · Đơn (chế độ quầy: bỏ "Bàn"); badge số món chưa gửi; vùng an toàn iPhone; `sm:hidden`; không `fixed` (phần tử cuối cột flex, không che nội dung) |
| `components/pos/PosBoard.tsx` | `mobileTab`; ba cột `max-sm:` hiện/ẩn theo tab; chọn bàn / mang về → tự sang Thực đơn; ô tìm co giãn; **ba băng thông báo gọn thành một dòng chip cuộn ngang trên điện thoại**; sửa lỗi mất món (dưới) |
| `components/pos/TakeawayPanel.tsx`, `lib/orders/cart.ts` | `conLaiSauKhiGui` — sửa lỗi mất món |
| 8 hộp thoại POS | Toàn màn hình dưới 640 px |
| `components/staff/StationScreen.tsx` | Header điện thoại: ẩn tên quán + chữ "Nhân viên:", tên cắt gọn |
| `components/pos/OrderPanel.tsx`, `BillPanel.tsx` | Ô ghi chú 44 px + chữ 16 px dưới lg; nút chọn hóa đơn ≥ 44 px dưới lg |
| `components/pos/TablePickerDrawer.tsx` | Ẩn trên điện thoại (đã có tab "Bàn") |
| `tests/e2e/pos-dien-thoai.spec.ts` (mới) | 7 luồng + lỗi mất món; tự dọn các bàn nó dùng |

## Bằng chứng

```
E2E 390×844: 7/7 xanh · 360×800: 7/7 xanh
  1–3 gọi món có tùy chọn + ghi chú → màn bếp nhận (thấy "ít cay") → gọi thêm cùng phiên → hủy món có lý do → thu tiền
  4   tách bill theo món → 2 hóa đơn → giảm 10% một hóa đơn → thu từng hóa đơn
  5   gộp T2 + V1 → thu MỘT lần → DB: T2 không còn phiên mở
  6   mang về → tạo đơn → thu tiền & hoàn tất
  7   gọi nhân viên → chạm chip → hết; duyệt đơn QR thật (qua API khách) → DB `confirmed`; xác nhận đặt bàn
  +   món thêm trong lúc đang gửi không mất (đối chứng âm đỏ — BUG-MatMonKhiDangGui)
Mỗi luồng: không tràn ngang (đo mép phải mọi nút/liên kết/hộp thoại, trừ vùng cuộn ngang có chủ đích)
Cổng ảnh ≥1024: 6/6 khớp — ảnh gốc chụp từ code 12-04 trên CÙNG dữ liệu, so với code 12-05
E2E tablet (12-04) 4/4 · E2E cũ p3/order15/print-mode 4 xanh 1 bỏ qua · unit 642 · tsc · lint · build sạch
```

## Lỗi thật tìm ra (đã sửa)

1. **Mất món khi thêm trong lúc đang gửi** — ở cả POS bàn và bán mang về. Chi tiết:
   `40-KiemTra/BUG-MatMonKhiDangGui.md`.
2. **Ba băng thông báo chiếm nửa màn hình điện thoại** (ảnh chụp 390×844: vùng đơn còn một khe) → một dòng
   chip cuộn ngang mỗi băng.
3. Nút chọn hóa đơn (sau tách bill) thấp hơn 44 px; ô ghi chú 36 px chữ 14 px (iOS tự phóng to khi chạm).

## Test sai — đã sửa, ghi lại vì cùng một bài học

Database dùng chung ⇒ **mọi khẳng định tuyệt đối về dữ liệu đều dễ sai**: "có Đơn #" luôn đúng khi bàn còn
đơn cũ (che mất lỗi mất món); "đơn QR đầu tiên của V1" trúng đơn cũ; "hóa đơn đang chọn có nút Thu tiền" sai
khi phiên có hóa đơn đã thu. Sửa: đếm trước/sau, dọn các bàn test dùng ở `beforeAll`/`afterAll` (hủy, không
xóa), chờ hộp hóa đơn tải xong. Cổng ảnh ≥1024 cũng vậy — lần chạy đầu đỏ 6/6 chỉ vì một băng "Đơn cần in
phiếu" mới xuất hiện; so đúng cách là chụp gốc từ code cũ **trên cùng dữ liệu**.

Và một lần test bắt được đúng việc nó được viết ra để bắt: vòng lặp thử món gửi quá 10 đơn/phút cho một bàn
→ **429** từ giới hạn tần suất 11-03.

## Chưa kiểm được

| Nghiệm thu | Chờ |
|---|---|
| 2. Người thật, iPhone + Android thật, một ca thử trên quán demo | Thiết bị + người |
| 3. ~~`/pos/m` → `/pos`, xóa `StaffMobileOrder`~~ | Đã làm 27/09 (dưới) |
| 4. Đo tải: quán có ≥ 2 điện thoại dùng POS trong 2 ngày bán → số lần tải lại/ngày và /đơn, so PERF-04 | Quán thật |

## Bổ sung 27/09 — `/pos/m` về hưu (nghiệm thu 3)

| Tệp | Việc |
|---|---|
| `app/r/[slug]/pos/m/page.tsx` | Chỉ còn chuyển hướng về `/pos` — lối tắt cũ trên điện thoại phục vụ vẫn mở đúng chỗ |
| `components/pos/StaffMobileOrder.tsx` | **Xóa**. Tìm `StaffMobileOrder` trong `app/ components/ lib/ tests/` = 0 |
| `components/customer/CartSheet.tsx` | Bỏ chế độ `staff` (chỉ `StaffMobileOrder` dùng) |
| `tests/e2e/order15-mobile.spec.ts` | Viết lại trên `/pos` ở 360 px: `/pos/m` → `/pos`; chọn bàn → thêm món → gửi → đơn vào thẳng (không hỏi tên khách); máy quầy 1366 hiện "Đơn cần in phiếu" |
| `tests/e2e/pos-dien-thoai.spec.ts` | + luồng 8: trang Đơn online vừa màn hình, nút "Về sơ đồ bàn" về đúng POS |
| `docs/60-BanGiao/03-CaiDat.md`, `07-HuongDan-PhucVu.md` | Điện thoại mở `/pos`; hướng dẫn phục vụ theo 3 tab; in hóa đơn ra máy quầy |

**Hệ quả cần biết:** phục vụ (vai `waiter`) trên điện thoại giờ làm được **mọi** việc của máy quầy, kể cả thu
tiền. Quyền này vốn có trên `/pos` từ trước (`canAccess(waiter, "pos")`), chỉ là trước đây điện thoại không
tới được. Quán muốn phục vụ không thu tiền: hiện chưa chặn theo vai trò — cần một yêu cầu riêng.

```
E2E order15-mobile 1/1 · pos-dien-thoai 390×844 8/8 · 360×800 8/8 · tablet 4/4 · cổng ảnh ≥1024 6/6
unit 665 · test:rls 274 · tsc · lint · build (/pos/m 162 B)
```

