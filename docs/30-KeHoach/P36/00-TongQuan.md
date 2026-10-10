# P36 — Trang Bàn & QR làm lại: thêm hàng loạt, nhập Excel, thao tác nhiều bàn

> Lập 10/10/2026. **Trạng thái: CODE XONG 10/10/2026** (chủ dự án chốt giao diện cùng ngày). Tổng kết `36-01-SUMMARY.md`. Không migration. **Phát hành `main` 10/10/2026** (commit 532d1fe, merge 8716faf).
> Chủ dự án (10/10): "giao diện bàn này không chuyên nghiệp — 1 khu có 100 bàn thì setup 100 lần à?"

## Hiện trạng

- Trang Quản trị › Bàn & QR (`app/r/[slug]/admin/(protected)/tables/`): hai ô "Khu vực mới" và "Bàn mới" ở đầu trang,
  bên dưới mỗi khu là lưới thẻ bàn. Mỗi thẻ hiện tên, số ghế, chuỗi **"QR: 2185baea…"** (vô nghĩa với chủ quán) và các nút
  ↑ ↓ Sửa Xóa.
- **Chỉ thêm được từng bàn một.** Quán 100 bàn phải gõ và bấm 100 lần. Không chọn được nhiều bàn để chuyển khu hay xóa.
  "Xuất QR" luôn in mọi bàn.

## Đối thủ làm thế nào (tra 10/10/2026, trang hướng dẫn chính thức)

**KiotViet FnB** ([Quản lý Phòng/bàn](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-thiet-lap/quan-ly-phong-ban/) ·
[Bước 1 – Khởi tạo phòng bàn](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-lam-quen-voi-kiotviet/buoc-1-khoi-tao-phong-ban/)):

| Việc | KiotViet |
|---|---|
| Bố cục | Quản lý › **Phòng/bàn**: khu vực ở **cột trái** (nút **+** thêm khu, cây bút sửa/xóa), bàn của khu đang chọn ở bên phải |
| Thêm một bàn | **"+ Thêm phòng bàn"** → hộp thoại: Tên phòng bàn, Khu vực (có "Tạo mới"), Số thứ tự, Số ghế, Ghi chú → **Lưu** (app điện thoại có **"Lưu và thêm mới"**) |
| Thêm hàng loạt | Tab **"Thêm hàng loạt"**: **Tên phòng bàn**, **Số lượng**, **Số bắt đầu** (bắt buộc), Số ghế, Ghi chú → **Lưu** → "Bàn 1, Bàn 2, … Bàn 100" |
| Nhập Excel | Nút **"Import"** → **"Tải file mẫu"** → điền (Tên bàn, Khu vực, Số ghế, Trạng thái, Ghi chú, Số thứ tự) → **"Chọn file dữ liệu"** → **"Thực hiện"**. Ví dụ 50 bàn chia Tầng 1 / Tầng 2 / Sân vườn |
| Nhiều bàn | 3 chấm › **"Chọn phòng bàn"** → tích → **Xóa / Ngừng hoạt động / Hoạt động** |
| Xóa | Bàn đã phát sinh doanh thu không xóa được (dùng "Ngừng hoạt động") |

Sapo FnB, CUKCUK, iPOS, POS365: không tìm được trang hướng dẫn công khai cho phần tạo bàn (tra 10/10/2026), nên làm theo
KiotViet.

## Hướng đã chốt (chủ dự án 10/10/2026)

Làm theo KiotViet: khu vực cột trái + bảng bàn bên phải, **Thêm hàng loạt**, **Nhập Excel** (file mẫu), **chọn nhiều bàn**
để chuyển khu / đổi số ghế / in QR / xóa.

Ngoài phạm vi (chủ dự án không chọn): "Ngừng hoạt động" bàn (cần cột DB mới), ghi chú bàn.

Khác KiotViet (nhỏ, có lý do):
- File mẫu chỉ 3 cột **Tên bàn · Khu vực · Số ghế** — mình không có cột Trạng thái / Ghi chú; thứ tự = thứ tự dòng trong file.
- Khu vực ghi trong file mà chưa có → **tự tạo khu** (KiotViet không nói rõ; tự tạo đỡ một bước cho chủ quán).
- Bàn trùng tên trong cùng khu → **bỏ qua và báo tên** (không tạo bàn trùng, vì POS tìm bàn theo tên).

## Giao diện (ĐÃ CHỐT 10/10/2026)

Vị trí menu không đổi: Quản trị › THIẾT LẬP › **Bàn & QR**. Một màn, không tab.

```
Bàn & QR                                [In QR (100 bàn)] [Nhập Excel] [Thêm hàng loạt] [+ Thêm bàn]
Khai báo khu vực và bàn. Mỗi bàn có mã QR riêng để khách quét gọi món.
┌──────────────────┬──────────────────────────────────────────────────────────────┐
│ KHU VỰC       [+]│ Tầng 1 · 20 bàn                              [Tìm bàn…     ] │
│ Tất cả       100 │ ☐  Tên bàn    Khu vực   Số ghế   Mã QR       Thứ tự          ⋯ │
│ Tầng 1     ⋯  20 │ ☐  Bàn 1      Tầng 1    4        Xem / In    ↑ ↓          Sửa Xóa │
│ Tầng 2        30 │ …                                                            │
│ Chưa xếp khu   0 │ Đã chọn 5 bàn: [Chuyển khu ▾] [Đổi số ghế] [In QR] [Xóa] [Bỏ chọn] │
└──────────────────┴──────────────────────────────────────────────────────────────┘
```

### Cột khu vực (trái, rộng ~240px)
- Tiêu đề **"Khu vực"** + nút **+** (mở ô nhập tên khu ngay trong cột, Enter để lưu).
- Dòng **"Tất cả"** (đầu), từng khu theo thứ tự, **"Chưa xếp khu"** (cuối, chỉ hiện khi có bàn chưa xếp). Mỗi dòng có số bàn.
- Khu đang chọn nền cam nhạt. Nút **⋯** của khu: **Sửa tên · Chuyển lên · Chuyển xuống · Xóa khu** (xóa → bàn về "Chưa xếp khu",
  như hiện nay).

### Bảng bàn (phải)
- Tiêu đề: tên khu đang chọn · số bàn; ô **"Tìm bàn…"** lọc theo tên.
- Cột: **☐ · Tên bàn · Khu vực · Số ghế · Mã QR** (liên kết **"Xem / In"** mở trang in QR chỉ bàn đó) **· Thứ tự** (↑ ↓, chỉ
  hiện khi xem một khu và không tìm) **· Sửa · Xóa**.
- Tích ≥ 1 bàn → thanh **"Đã chọn N bàn"**: **Chuyển khu** (chọn khu) · **Đổi số ghế** · **In QR** (trang in chỉ các bàn đã chọn) ·
  **Xóa** (hỏi lại) · **Bỏ chọn**. Ô tích ở đầu cột chọn/bỏ mọi bàn đang hiện.

### Hộp thoại "+ Thêm bàn" / "Sửa bàn"
- Ô: **Tên bàn**, **Khu vực** (mặc định khu đang xem), **Số ghế** (mặc định 4).
- Nút: **Hủy** · **Lưu & thêm tiếp** (chỉ khi thêm; giữ hộp thoại, xóa ô tên, tăng số cuối tên: "Bàn 7" → "Bàn 8") · **Lưu**.

### Hộp thoại "Thêm hàng loạt"
```
Khu vực      [Tầng 1 ▾]
Tên bàn      [Bàn     ]    Số bắt đầu [1]    Số lượng [20]    Số ghế [4]
Sẽ tạo: Bàn 1, Bàn 2, Bàn 3 … Bàn 20 (20 bàn)
                                              [Hủy]  [Tạo 20 bàn]
```
- Số lượng 1–200. Tên = tên + dấu cách + số (tên để trống → chỉ số: "1, 2, …").
- Bàn trùng tên trong khu → bỏ qua; thông báo "Đã thêm 18 bàn. Bỏ qua 2 bàn trùng tên: Bàn 1, Bàn 2."

### Hộp thoại "Nhập Excel"
- Bước 1: liên kết **"Tải file mẫu"** (file `.xlsx` cột **Tên bàn · Khu vực · Số ghế**, có 3 dòng ví dụ).
- Bước 2: **"Chọn file"** (.xlsx) → nút **"Nhập"**.
- Kết quả (thông báo): "Đã nhập N bàn, tạo khu mới: Sân vườn. Bỏ qua M dòng: dòng 5 thiếu tên, dòng 9 trùng tên Bàn 3 (Tầng 1)."
- Tối đa 500 dòng mỗi file. File sai định dạng → "File không đọc được. Hãy dùng file mẫu."

### Trạng thái trống / lỗi
- Chưa có bàn nào: bảng thay bằng khung "Chưa có bàn nào. Tạo nhanh bằng **Thêm hàng loạt** (ví dụ Bàn 1 → Bàn 20) hoặc
  **Nhập Excel**." kèm hai nút.
- Khu đang chọn chưa có bàn: "Khu này chưa có bàn." + nút **Thêm hàng loạt**.
- Tìm không thấy: "Không có bàn nào tên chứa "…"."
- Lỗi lưu → toast đỏ như các màn quản trị khác.

### Điện thoại (< 768px)
- Cột khu vực thành **hàng chip cuộn ngang** trên bảng (Tất cả · Tầng 1 · …; nút + và ⋯ của khu đang chọn ở cuối hàng).
- Bảng thành danh sách: mỗi dòng ☐ · **Tên bàn** (dưới: khu · số ghế) · **⋯** (Xem QR, Sửa, Lên, Xuống, Xóa).
- Bốn nút đầu trang xuống dòng, cao ≥ 44px. Hộp thoại chiếm gần trọn bề ngang.

## Yêu cầu

`docs/20-DanhSachYeuCau/00-Requirements.md`: **TABLE-07 … TABLE-10**.
