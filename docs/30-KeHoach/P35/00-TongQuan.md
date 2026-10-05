# P35 — Quán vừa bán không bàn (sáng) vừa bán theo bàn (lẩu tối)

> Lập 05/10/2026. **Trạng thái: CODE XONG 05/10/2026** (chủ dự án chốt giao diện cùng ngày). Tổng kết `35-01-SUMMARY.md`. Migration 0086 đã
> áp lên DB dùng chung lúc 13:50 (chủ dự án cho phép); chưa phát hành `main`.
> Chủ dự án (05/10): "sáng bán đồ ăn sáng thì thường không có bàn, nhưng tôi bán lẩu thì phải bán theo bàn — xử lí như nào?"

## Hiện trạng

- Quán chọn **một** chế độ phục vụ trong Cài đặt: "Theo bàn" hoặc "Tại quầy" (`service_mode`, `lib/tenant/settings.ts`).
- Quán lẩu phải để "Theo bàn". Buổi sáng nhân viên bấm **"Mang về"** để gõ đơn không bàn → bán được, nhưng phiếu bếp,
  hóa đơn và báo cáo đều ghi **"Mang về"** dù khách ngồi ăn tại quán (`orderPlaceLabel`, `lib/orders/place-label.ts`).
  Báo cáo không tách được khách ăn tại chỗ với khách mang về thật.

## Đối thủ làm thế nào (tra 05/10/2026, trang hướng dẫn chính thức)

| | Loại đơn trên order | Ăn tại quán mà không chọn bàn | Ghi chú |
|---|---|---|---|
| **CUKCUK** | "Hình thức phục vụ": **Ngồi tại bàn / Mang về / Giao hàng** (chọn khi lập order) | Có cài đặt **"Bắt buộc chọn bàn khi lập order"** (Thiết lập hệ thống › Thiết lập chung › tab Mua hàng/Bán hàng › Bán hàng › Sửa). Bật thì chọn "Ngồi tại bàn" mà chưa chọn bàn sẽ bị báo và hiện sơ đồ bàn. Tài liệu không nói rõ khi tắt thì lưu ra sao | Đổi được order "Mang về" → "Ngồi tại bàn" sau khi đã lưu: Thông tin order › tích "Ngồi tại bàn" › Đồng ý › Cất. Có "Chọn nhanh hình thức phục vụ khi lập order" (Tiện ích › Thiết lập) cho điện thoại. "Mô hình triển khai" (tại bàn / phục vụ nhanh) chọn một cho cả nhà hàng |
| **iPOS** | Nguồn đơn cố định, không sửa/xóa được: **"Tại chỗ"** và **"Mang về"** | Có: thu ngân vào tab Bán hàng, chọn nguồn **"TẠI CHỖ"** rồi gọi món | Đơn online "Tự đến lấy" lưu vào bàn "Pick Up". (Thông tin "Tại chỗ / Mang về" lấy từ kết quả tìm kiếm trang FABI, chưa mở được trang chi tiết) |
| **Sapo FnB** | **Đơn ăn tại bàn / Đơn mang đi / Đơn giao hàng** | Bỏ qua "Chọn bàn", bấm **mũi tên 2 chiều cạnh nút "Chọn bàn"** để đổi loại đơn. Tài liệu không nói "Đơn ăn tại bàn" có cho trống bàn không | Nút "Lưu", "Thanh toán" |
| **KiotViet FnB** | Bàn đặc biệt trong danh sách phòng/bàn: **"Mang về"** ("dành cho khách mua trực tiếp và mang đi") và **"Giao đi"** | Không thấy trong tài liệu: khách ngồi ăn không bàn cũng phải vào bàn "Mang về" (giống mình hiện nay) | Có thể đổi kênh bán sang "Mang về" khi sửa thông tin chung đơn |
| **POS365** | Chọn phòng/bàn hoặc "lên hóa đơn dành cho khách hàng mang về" | Không thấy trong tài liệu | — |

**Kết luận:** CUKCUK và iPOS (hai bên làm rõ nhất) đều coi **"ăn tại chỗ / mang về / giao hàng" là thuộc tính của đơn**,
tách khỏi việc có chọn bàn hay không. Sapo cũng có loại đơn chọn bằng nút đổi cạnh "Chọn bàn". Chỉ KiotViet dồn khách không
bàn vào "bàn Mang về", cùng nhược điểm với mình hiện nay.

Nguồn: [CUKCUK – Thiết lập tiện ích khi mua hàng/bán hàng](https://helpv2.cukcuk.vn/vi/kb/1071100_thiet_lap_tien_ich_khi_mua_hang_ban_hang) ·
[CUKCUK – Sửa order Mang về thành Ngồi tại bàn](https://helpv2.cukcuk.vn/vi/kb/khach_order_mang_ve_sau_do_doi_y_o_lai_an_luon_thi_sua_order_nhu_the_nao) ·
[CUKCUK – Chọn nhanh hình thức phục vụ](https://helpv2.cukcuk.vn/vi/kb/thiet-lap-chon-nhanh-hinh-thuc-phuc-vu-khi-lap-order-2) ·
[CUKCUK – Ghi order phục vụ nhanh](https://helpv2.cukcuk.vn/vi/kb/ghi-order-cho-khach-den-an-uong-tai-nha-hang) ·
[CUKCUK – Chuyển đổi hình thức phục vụ](https://helpv2.cukcuk.vn/vi/kb/chuyen_doi_hinh_thuc_phuc_vu_tai_nha_hang) ·
[iPOS – Hướng dẫn CMS FABI](https://fabi-docs.ipos.vn/) ·
[iPOS – Hệ thống POS tại cửa hàng](https://huongdan.ipos.vn/docs/tai-lieu-van-hanh-ipos-web-order-pc/cac-luu-y-trong-quy-trinh-van-hanh/he-thong-pos-tai-cua-hang/) ·
[Sapo FnB – Tạo hóa đơn bán hàng](https://help.sapo.vn/Huong-dan-tao-hoa-don-ban-hang-tren-Sapo-FnB) ·
[KiotViet FnB – Gọi món](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-goi-mon/goi-mon/) ·
[POS365 – Hướng dẫn sử dụng](https://www.pos365.vn/huong-dan-su-dung-phan-mem-ban-hang-5971.html)

## Hướng đã chốt (chủ dự án 05/10/2026)

Làm theo CUKCUK / iPOS: quán vẫn để chế độ **"Theo bàn"**; mỗi đơn không bàn chọn **"Tại quán"** hoặc **"Mang về"**.
Chữ trên nút: **"Tại quán"**. Mặc định khi gõ đơn không bàn: **"Tại quán"**. Lựa chọn này quyết định chữ in trên phiếu bếp,
màn bếp, phiếu khách, hóa đơn và nhóm trong báo cáo.

Ngoài phạm vi: quán chế độ **"Tại quầy"** giữ nguyên như hiện nay (mọi đơn = "Tại quán", không có công tắc). Đơn khách tự
đặt online vẫn là "Mang về" / "Giao tận nơi".

## Giao diện (ĐÃ CHỐT 05/10/2026)

Chỉ đổi màn **Bán hàng (POS)** ở quán chế độ "Theo bàn" và **chữ** trên giấy in / báo cáo. Không thêm màn, không thêm cài đặt.

### 1. Ô trên sơ đồ bàn (POS › tab Sơ đồ bàn)
Ô đầu tiên hiện là **"Bán mang về"** (dưới ghi "không gắn bàn" hoặc "N đơn chờ"). Đổi chữ:

| Chỗ | Hiện tại | Sau |
|---|---|---|
| Ô trên sơ đồ bàn | Bán mang về | **Khách không bàn** |
| Nút chọn bàn (máy < 1024px) khi đang mở | Mang về | **Không bàn** |
| Tab "Thực đơn · …" (máy ≥ 1024px) | Thực đơn · Mang về | **Thực đơn · Không bàn** |
| Tiêu đề khung bên phải | Bán mang về | **Khách không bàn** |

(KiotViet để ô "Mang về" trên sơ đồ bàn, Sapo để nút đổi loại đơn cạnh "Chọn bàn". Mình giữ vị trí ô như KiotViet, chỉ đổi
chữ để không còn nói mọi đơn là mang về.)

### 2. Khung "Đơn mới" (cột phải máy tính / ngăn "Giỏ hàng" trên điện thoại)
Thêm **công tắc hai nút** ngay dưới chữ "Đơn mới", trên ô Tên khách:

```
┌ Đơn mới ─────────────────────────────┐
│ [■ Tại quán ] [  Mang về  ]          │  ← mặc định "Tại quán", mỗi đơn mới quay về "Tại quán"
│ Tên khách (tùy chọn)  [           ]  │
│ SĐT (tùy chọn)        [           ]  │
│ Phở bò tái      − 2 +   90.000  Xoá  │
│ [ Tạo đơn · 90.000₫ ]                │  ← trước: "Tạo đơn mang về · 90.000₫"
└──────────────────────────────────────┘
```
- Nút tạo đơn: **"Tạo đơn · <tiền>"** (bỏ chữ "mang về").
- **Lượt gọi thêm** ("Đang thêm vào Đơn #12"): ẩn công tắc, theo đơn gốc.
- Điện thoại: hai nút chia đôi bề ngang, cao ≥ 44px.

### 3. Thẻ đơn trong danh sách "Đang chờ" / "Đã xong"
Cạnh số đơn thêm nhãn nhỏ **"Tại quán"** hoặc **"Mang về"** (Mang về nền kem, chữ đỏ như phiếu bếp hiện nay; Tại quán chữ
xám) — nhân viên biết bưng ra bàn hay gói. Ô tìm đơn: dòng gợi ý ghi "Tại quán" / "Mang về" theo đơn.

### 4. Giấy in và màn bếp
| Nơi | Đơn "Tại quán" | Đơn "Mang về" |
|---|---|---|
| Phiếu bếp (in) + màn bếp | **Tại quán** (khung thường) | Mang về (khung kem nổi bật như hiện nay) |
| Phiếu khách, tạm tính, hóa đơn | Tại quán | Mang về |

### 5. Báo cáo
- **Doanh thu theo nơi phục vụ**: "Tại quán" và "Mang về" thành hai dòng riêng (khối này đã có sẵn 4 nhóm **Tại bàn · Tại quán ·
  Mang về · Giao tận nơi**, chỉ là trước giờ quán "Theo bàn" dồn hết đơn không bàn vào "Mang về").
- **Danh sách hóa đơn**, cột nơi: "Tại quán" / "Mang về" (hiện ghi "Mang về" hoặc "Không gắn bàn").
- Đơn cũ trước khi làm P35 giữ nguyên "Mang về" (đúng như giấy đã in hôm đó).

### Trạng thái trống / lỗi
Không có trạng thái mới. Mất mạng: như hiện nay (đơn không bàn khóa khi mất mạng).

### Chủ dự án đã chốt
1. Ô sơ đồ bàn ghi **"Khách không bàn"**.
2. **Chưa** cho đổi Tại quán ↔ Mang về sau khi đã tạo đơn (CUKCUK có — để đợt sau nếu cần).

## Yêu cầu đo được (đã đưa vào `00-Requirements.md`)

| Mã | Yêu cầu | Tiêu chí chấp nhận |
|---|---|---|
| ORDER-27 | Đơn không bàn chọn Tại quán / Mang về | Quán "Theo bàn": khung Đơn mới có công tắc **Tại quán · Mang về**, mặc định Tại quán, đơn kế quay lại Tại quán; lượt gọi thêm theo đơn gốc. Quán "Tại quầy": không có công tắc, hành vi y hệt hiện nay |
| ORDER-28 | Chữ in đúng nơi | Đơn Tại quán: phiếu bếp in, màn bếp, phiếu khách, tạm tính, hóa đơn đều ghi "Tại quán"; đơn Mang về ghi "Mang về". Kiểm bằng unit test `orderPlaceLabel` + E2E tạo 2 đơn và đọc nhãn trên màn bếp |
| ORDER-29 | Báo cáo tách nơi | Ngày có 1 đơn Tại quán 50.000₫ + 1 đơn Mang về 30.000₫ (thu đủ): "Theo nơi phục vụ" ra Tại quán 50.000₫, Mang về 30.000₫; danh sách hóa đơn ghi đúng từng dòng |
| ORDER-30 | Không hồi quy | Đơn cũ vẫn hiện "Mang về"; đơn online, giao hàng, đơn tại bàn, quán chế độ quầy không đổi; E2E POS hiện có xanh |

Kỹ thuật (để plan chi tiết): thêm cột `orders.eat_in boolean not null default false` (đơn cũ = false ⇒ "Mang về" như đã in);
`orderPlaceLabel` / `orderPlaceGroup` đọc thêm `eat_in`; `report_by_channel` trả thêm `eat_in`; `createStaffTakeawayOrder`
nhận `eatIn`, lượt gọi thêm lấy theo đơn gốc. Giữ `channel='takeaway'` để không đụng luồng hàng chờ / thu tiền.
