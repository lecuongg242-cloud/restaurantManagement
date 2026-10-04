# P32 — Tab danh mục ngang cho màn "Thực đơn" (admin)

> Lập 04/10/2026. **Trạng thái: CHỦ DỰ ÁN CHỐT 04/10/2026** ("bấm tab = lọc" + "thay ô Tên danh mục mới bằng nút").
> **Code xong 04/10/2026, chưa deploy.** Yêu cầu: MENU-05. Chủ dự án (04/10): "thực đơn đang thiếu tab ngang".

## Hiện trạng

- Trang Thực đơn bày mọi danh mục nối tiếp nhau; muốn tới danh mục cuối phải cuộn qua hết.
- Ô "Tên danh mục mới" + nút "Thêm danh mục" luôn mở, chiếm một hàng lớn trên đầu trang.

## Đối thủ làm thế nào (tra 04/10/2026)

- **KiotViet FnB** — Hàng hóa → Danh mục: cột **"Nhóm hàng"** bên trái, chọn nhóm thì lọc danh sách; nút "+" cạnh "Nhóm hàng"
  mở cửa sổ **"Thêm nhóm hàng"**. [Nguồn](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/danh-muc-hang-hoa-web-fnb/)
- **Sapo FnB** — Danh sách mặt hàng: nút **"Lọc mặt hàng" → Danh mục**. [Nguồn](https://help.sapo.vn/xem-loc-va-xoa-mat-hang-tren-trang-quan-tri-sapo-fnb)

Cả hai **lọc món theo danh mục** và thêm danh mục bằng **cửa sổ nhỏ**. Khác đối thủ: dùng **hàng tab ngang** thay cột trái /
nút lọc — chủ dự án yêu cầu, cùng kiểu tab Kho hàng (P28) và POS nên chủ quán đã quen.

## Giao diện (đã chốt)

- Dưới tiêu đề "Thực đơn": hàng tab viên thuốc **Tất cả (n) · <danh mục> (n) · …**, đang chọn nền cam đặc; điện thoại vuốt ngang.
- **Tất cả**: mọi danh mục như cũ. **Một danh mục**: chỉ danh mục đó (dòng "Sửa tên · ↑ ↓ · Xóa" vẫn trên lưới món).
- Tab nằm trong địa chỉ (`?nhom=`): sửa / thêm / bật tắt món không nhảy về Tất cả; danh mục vừa xóa → về Tất cả.
- Cuối hàng tab: nút **"+ Danh mục"** → hộp thoại **"Thêm danh mục"** (Tên danh mục *; Bỏ qua · Lưu) → lưu xong chuyển sang tab
  danh mục mới để thêm món. Bỏ ô "Tên danh mục mới" luôn mở.
- Trên hàng tab: ô **"Tìm món"** (chủ dự án thêm 04/10/2026) — gõ không dấu vẫn ra, tìm trong **mọi** danh mục (hàng tab mờ
  đi như POS), "Không tìm thấy món." khi không khớp; xóa ô → về tab đang chọn. Lọc ngay trên trình duyệt, không tải lại trang.
- Trống: "Chưa có danh mục. Bấm "+ Danh mục" để thêm danh mục đầu tiên."

## Kiểm bằng

- E2E `p32-thuc-don-tab.spec.ts` (quán demo, không đụng qt-food): tab đủ danh mục + số món; bấm tab chỉ hiện danh mục đó;
  "+ Danh mục" thêm xong sang tab mới; bật/tắt món giữ tab; 390 px không tràn ngang. Hồi quy `nghiem-thu.spec.ts` (hết món).

## Kết quả (04/10/2026)

File: `menu/page.tsx` (tab + ô tìm; bỏ ô "Tên danh mục mới"), `menu/actions.ts` (`createCategory` trả id), mới
`components/admin/menu/MenuTabs.tsx` (hàng tab + hộp thoại "+ Danh mục"), `components/admin/menu/MenuSearch.tsx` (ô tìm + lọc).

- E2E `tests/e2e/p32-thuc-don-tab.spec.ts` PASS (localhost:3000, `pho-viet`): tab đủ danh mục + số món, bấm tab chỉ còn danh
  mục đó, ô tìm không dấu ra món ở danh mục khác + "Không tìm thấy món.", bật/tắt món giữ tab, "+ Danh mục" sang tab mới,
  id lạ về Tất cả, 390 px không tràn. Hồi quy `nghiem-thu.spec.ts` (hết món → khách thấy "Hết") PASS. `tsc --noEmit` sạch.
- Ảnh: `anh/1-tab-danh-muc-1366.png`, `anh/2-hop-thoai-danh-muc-1366.png`, `anh/3-dien-thoai-390.png`, `anh/4-tim-mon-1366.png`.
