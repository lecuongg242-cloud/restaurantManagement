# P28 — Gom các trang kho vào một mục "Kho hàng" có tab ngang

> Lập 04/10/2026. **Trạng thái: CHỦ DỰ ÁN CHỐT 04/10/2026** (chọn phương án "Kho hàng").
> Yêu cầu: PURCH-08. Sửa quyết định G1 (`P20/00-GiaoDien.md`): trước đây "Nhập hàng" là mục menu riêng như KiotViet FnB.

## Vì sao làm

Ngày 04/10 chủ dự án yêu cầu: "các phần nhập hàng tôi muốn gom thành 1 menu ở sidebar bên trái; ấn vào menu thì sẽ có menu ngang
cho các phần nhập liệu đó".

Sidebar trang quản trị đang có ba mục rời cho cùng một việc: **Nguyên liệu** (bên trong có 4 tab), **Nhập hàng**, **Nhà cung
cấp**.

## Đối thủ làm thế nào (tra 04/10/2026)

| Đối thủ | Cách gom |
|---|---|
| Sapo FnB | Một mục **"Tồn kho"** ở sidebar, mục con: Nguyên liệu · Nhập kho · Xuất kho · Kiểm kê · Nhà cung cấp |
| CUKCUK | Một menu **"Kho"**: Nhập kho, Xuất kho, Kiểm kê, Tổng hợp tồn kho |
| KiotViet FnB | Tách ra nhiều menu: Nhập hàng / Xuất hủy ở "Giao dịch", Kiểm kho ở "Hàng hóa", Nhà cung cấp ở "Đối tác" (cách G1 đã theo) |

Ta làm theo Sapo FnB / CUKCUK: gom vào một mục.

Nguồn:
- [Sapo — Tổng quan quản lý tồn kho](https://help.sapo.vn/tong-quan-quan-ly-ton-kho-tren-sapo-fnb)
- [CUKCUK — Theo dõi nhập, xuất, tồn kho](https://helpv2.cukcuk.vn/vi/kb/1010100_nhap_xuat_ton_kho)
- [KiotViet — Nhập hàng (FnB)](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/nhap-hang-web-fnb/)
- [KiotViet — Kiểm kho](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/kiem-kho/)

## Giao diện (chốt 04/10/2026)

| Màn | Giao diện |
|---|---|
| Sidebar | Ba mục "Nguyên liệu", "Nhập hàng", "Nhà cung cấp" thay bằng **một mục "Kho hàng"** (biểu tượng hộp), đặt ngay dưới "Thực đơn". Bấm → tab **Tồn kho**. Mục sáng khi đang ở bất kỳ tab hay trang con nào của kho (chi tiết phiếu nhập, lập phiếu, chi tiết nhà cung cấp) |
| Đầu trang | Tiêu đề **"Kho hàng"**, dưới là hàng tab ngang theo thứ tự: **Tồn kho · Nhập hàng · Kiểm kê & hủy · Nguyên liệu · Định lượng món · Nhà cung cấp**. Tab dạng **viên thuốc** như tab Sơ đồ bàn / Thực đơn bên POS: đang mở nền cam đặc chữ trắng, tab khác viền xám (chủ dự án chọn 04/10/2026, thay kiểu nền kem bị chê xấu). Trang con (lập phiếu, chi tiết phiếu, chi tiết nhà cung cấp) giữ tab cha sáng |
| Nội dung tab | Giữ nguyên như hiện nay. Riêng trang Nhập hàng và Nhà cung cấp bỏ tiêu đề lớn trùng với tên tab, giữ dòng mô tả và các nút |
| Điện thoại | Hàng tab cuộn ngang trong chính nó, không cuộn cả trang |
| Đường dẫn | Giữ nguyên (`/inventory/…`, `/nhap-hang/…`, `/nha-cung-cap/…`), link cũ không gãy |
| Quyền | Như cũ: chủ quán và quản lý |

## Thứ tự sidebar (chủ dự án 04/10/2026: "bạn tự đánh giá và sắp xếp")

Xếp theo tần suất dùng:

- **Trên (hằng ngày):** Tổng quan · Báo cáo · Kho hàng · Sổ quỹ · Khách hàng.
- **Dưới, nhóm "THIẾT LẬP"** (có đường kẻ và tiêu đề nhóm; khai một lần, thỉnh thoảng sửa): Thực đơn · Nhân viên · Bàn & QR · Máy in · Chi nhánh · Cài đặt.

Thực đơn nằm ở nhóm Thiết lập vì việc hằng ngày với món (báo hết món) làm trên POS; trang Thực đơn chỉ vào khi thêm món hoặc đổi giá.

## Kiểm bằng

- E2E `p20-giao-dien` G1: sidebar có "Kho hàng", không còn mục "Nhập hàng" riêng; bấm "Kho hàng" vào Tồn kho; tab "Nhập hàng"
  → danh sách → "+ Nhập hàng".
- E2E `p25-nhap-kiem-ke`: hàng tab đúng 6 tab, đúng thứ tự.
- Ảnh 1366 và 390: `anh/`.
