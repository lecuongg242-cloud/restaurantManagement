# P29 — Làm lại màn "Nguyên liệu" theo đối thủ: bảng danh sách + hộp thoại thêm / sửa

> Lập 04/10/2026. **Trạng thái: CHỦ DỰ ÁN CHỐT 04/10/2026** ("Chốt như đề xuất"). **29-01 XONG, chưa deploy** — `29-01-SUMMARY.md`. Yêu cầu: PURCH-09.
> Chủ dự án (04/10): "màn thêm nguyên liệu tôi thấy không hợp lí… đã tham khảo các bên khác chưa? sao cho đúng nhất và hợp lí nhất".
> Màn này làm ở P10 và P26. Hồi đó chỉ nghiên cứu nghiệp vụ (trừ kho, kiểm kê), **chưa tra màn thêm nguyên liệu của đối thủ**.

## Hiện trạng (tab Kho hàng → Nguyên liệu)

- Form "Thêm nguyên liệu" **luôn mở** trên đầu trang, 8 ô kèm 3 đoạn chú thích dài.
- Đơn vị khó hiểu: "Đơn vị trừ kho" (g / ml / cái…) và "Đơn vị lúc mua" (gõ tay); quy đổi chỉ hiện khi gõ đơn vị lạ.
- Nhãn giá "Giá gần nhất / g".
- Ô "% dùng được (tự tính)" chỉ để xem nhưng vẫn nằm trong form thêm mới, luôn ghi "100% · chưa đủ dữ liệu".
- Danh sách: mỗi nguyên liệu là một thẻ cao, chữ "Sửa" mở form ngay trong thẻ. Không có cột tồn kho, không tìm được.

## Đối thủ làm thế nào (tra 04/10/2026)

| | Sapo FnB | KiotViet FnB | CUKCUK |
|---|---|---|---|
| Mở form | Kho hàng → Danh sách tồn kho → nút **"Tạo nguyên liệu"** (góc phải) → **hộp thoại** | Kho hàng → Danh sách hàng hóa → **"+ Thêm mới" → "Nguyên vật liệu"** → hộp thoại | Danh mục → Nguyên vật liệu → **"Thêm"** |
| Ô | **Tên nguyên liệu** (bắt buộc), **Đơn vị**, **Số lượng ban đầu**, **Đơn giá**, Số lượng tối thiểu | Mã hàng, Tên hàng, Nhóm hàng, **Giá vốn**, **Tồn kho**, định mức tồn, đơn vị tính | Mã NVL, Tên NVL, Tính chất, Nhóm, **Đơn vị tính chính** |
| Đơn vị mua khác đơn vị dùng | Tab **"Quy đổi đơn vị"**: "1 Hộp = 10 Trứng" | Thêm đơn vị → "Giá trị quy đổi" so với đơn vị cơ bản | "Thêm dòng" đơn vị chuyển đổi: tỷ lệ, phép tính |
| Nút | Lưu | **Lưu · Lưu & Thêm mới · Bỏ qua** | — |
| Danh sách | Bảng | Bảng: mã, tên, nhóm, giá vốn, tồn kho, trạng thái | Bảng, trạng thái "Ngừng theo dõi" |

Nguồn:
- [Sapo — Tạo nguyên liệu](https://help.sapo.vn/tao-nguyen-lieu-tren-trang-quan-tri-sapo-fnb)
- [Sapo — Đơn vị tính](https://help.sapo.vn/don-vi-tinh-cua-mat-hang-nguyen-lieu)
- [KiotViet FnB — Danh mục hàng hóa](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/danh-muc-hang-hoa-web-fnb/)
- [CUKCUK — Khai báo nguyên vật liệu](https://helpv2.cukcuk.vn/vi/kb/1060300_them_nvl)

Điểm chung của cả ba: **danh sách dạng bảng**, form thêm / sửa nằm trong **hộp thoại** mở bằng nút ở góc phải, **một đơn vị
chính** và **quy đổi ghi dạng "1 thùng = 24 lon"**.

## Giao diện đề xuất

**Tab Nguyên liệu**

- Hàng trên cùng: ô **"Tìm nguyên liệu"**, lọc **"Đang dùng (n) · Đã ẩn (n)"**, nút cam **"+ Thêm nguyên liệu"** ở góc phải.
- Bảng, cột: **Tên nguyên liệu · Loại · Đơn vị · Giá vốn · Tồn kho · Dùng được · Kiểm cuối ngày**. Cột Đơn vị ghi như Sapo: "1 thùng = 24 cái", "1 kg = 1.000 g".
  - Loại: "Mua vào" hoặc "Tự nấu".
  - Giá vốn theo đơn vị nhập, ví dụ "280.000₫ / kg".
  - Dùng được: % tự tính, "—" khi chưa đủ dữ liệu.
  - Bấm một dòng → hộp thoại **Sửa nguyên liệu**.
  - Dòng "Tự nấu" có thêm nút **"Công thức mẻ"** (mở hộp thoại công thức như hiện nay).
- Trống: "Chưa có nguyên liệu nào. Bấm '+ Thêm nguyên liệu' để khai nguyên liệu đầu tiên."
- Điện thoại: mỗi dòng thành một hàng gọn (tên + giá vốn, dòng dưới: đơn vị · tồn kho).

**Hộp thoại "Thêm nguyên liệu" / "Sửa nguyên liệu"**

| Ô | Ghi chú |
|---|---|
| Tên nguyên liệu * | |
| Loại | Hai nút chọn: **Mua vào** · **Quán tự nấu** |
| Đơn vị tính * | g · kg · ml · lít · cái… Là đơn vị ghi định lượng và tồn kho |
| Đơn vị nhập hàng | Dòng **"1 [thùng] = [24] cái"**. Đơn vị quen (kg, lít) thì số tự điền. Để trống = nhập theo đơn vị tính |
| Giá vốn | "___ ₫ / [đơn vị nhập]". Không bắt buộc. Chỉ có ở loại Mua vào |
| 1 mẻ nấu ra | "___ [đơn vị tính]". Chỉ có ở loại Quán tự nấu |
| Tồn kho ban đầu | "___ [đơn vị nhập]". Chỉ hiện khi nguyên liệu chưa có phát sinh kho (như hiện nay) |
| ☐ Kiểm kê cuối ngày | "nguyên liệu đắt: thịt, hải sản, nước dùng" |

- Nút: **Bỏ qua · Lưu & thêm mới · Lưu** (như KiotViet). Ở hộp thoại Sửa có thêm "Ẩn nguyên liệu" bên trái.
- Lỗi (ví dụ trùng tên): giữ hộp thoại, câu lỗi hiện ở cuối hộp thoại; thông báo góc màn vẫn có như mọi form khác.
- Bỏ khỏi form: ô "% dùng được" (đưa sang cột trong bảng) và các đoạn chú thích dài (rút thành một dòng ngắn dưới ô cần).

**Khác đối thủ (cần chủ dự án đồng ý):**
- Không làm Mã nguyên liệu, Nhóm, Số lượng tối thiểu. Quán nhỏ ít khi cần; hiện ta chưa có cảnh báo hết hàng nên ô "tối thiểu"
  chưa có tác dụng.
- Chỉ một đơn vị nhập cho mỗi nguyên liệu (đối thủ cho nhiều dòng quy đổi). Dữ liệu hiện tại cũng chỉ có một.

## Kiểm bằng (sau khi chốt)

- E2E: thêm nguyên liệu bằng hộp thoại ("Lưu & thêm mới" giữ hộp thoại, xóa trắng ô); sửa từ dòng bảng; tìm; Đã ẩn / hiện
  lại; tồn kho ban đầu; quy đổi "1 thùng = 24 cái" và nhập hàng theo thùng ra đúng số cái.
- Hồi quy: `inventory.spec.ts`, `kho-thuc-te.spec.ts`, `p25-nhap-kiem-ke.spec.ts`.
- Ảnh 1366 và 390.
