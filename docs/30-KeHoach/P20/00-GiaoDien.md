# P20 — Giao diện (bản chốt với chủ dự án)

> Lập 30/09/2026, **làm bù** sau khi code (chủ dự án: plan thiếu mô tả giao diện — luật mới ở `CLAUDE.md` §Quy trình).
> Mô tả **đúng những gì đang chạy** trên nhánh `dev`. Cột "Đối thủ" để so; cột "Chốt" để chủ dự án đánh dấu ✅ giữ / ✏️ đổi.
> Ảnh: `anh/20-0x-*.png`.

## 1. Menu trái (khu quản trị)

| Mục menu | Ai thấy | Vị trí | Đối thủ | Chốt |
|---|---|---|---|---|
| **Nhà cung cấp** | Chủ + quản lý | Sau "Nguyên liệu" | KiotViet: Đối tác → Nhà cung cấp; CUKCUK: Danh mục → NCC | |
| **Sổ quỹ** | Chủ + quản lý | Sau "Nhà cung cấp" | KiotViet: Sổ quỹ; Sapo: Thu chi | |
| Phiếu nhập | — | **Không có mục riêng** — là tab trong "Nguyên liệu" | KiotViet FnB: Giao dịch → Nhập hàng (mục riêng) | |
| Kết quả kinh doanh | Chỉ chủ | **Không có mục riêng** — là khối trong "Báo cáo" | KiotViet: Báo cáo → Tài chính; Sapo: Báo cáo tài chính | |

## 2. Nguyên liệu (5 tab)

| Tab | Nội dung | Chốt |
|---|---|---|
| **Nhập hôm nay** | Thẻ "Nhập nguyên liệu hôm nay" (phiếu nhập) · thẻ "Gợi ý nhập" (nếu có dự báo) · thẻ "Chế biến" · danh sách "Tồn hiện tại" | |
| **Phiếu nhập** *(mới)* | Danh sách phiếu + bộ lọc; bấm dòng → chi tiết phiếu | |
| Kiểm kê & hủy | Như P10 | |
| Nguyên liệu | Danh mục nguyên liệu (form thêm/sửa) | |
| Định lượng món | Như P10 | |

### 2a. Thẻ nhập hàng (tab Nhập hôm nay)

- **Nhà cung cấp** (ô chọn, không bắt buộc; mặc định "— Không chọn (mua lẻ, trả đủ) —").
- Mỗi dòng: **Nguyên liệu** · **Số lượng** + đơn vị lúc mua · **Đơn giá** (không bắt buộc) · **Thành tiền** (chỉ màn rộng) · ✕.
  Danh sách điền sẵn nguyên liệu của lần nhập trước; "+ Thêm nguyên liệu khác"; "Điền theo gợi ý".
- Phần tiền (chữ theo KiotViet): **Tổng tiền hàng · Giảm giá · Cần trả NCC · Tiền trả NCC** + chọn **Tiền mặt / Chuyển khoản /
  Chưa trả (ghi nợ)** · dòng "Tính vào công nợ: …" · Ghi chú.
- Nút: **Lưu tạm** · **Hoàn thành**. Lưu xong chuyển sang trang chi tiết phiếu.

### 2b. Tab Phiếu nhập — danh sách

- Lọc: **Trạng thái** (Phiếu tạm / Đã nhập hàng / Đã hủy) · **Nhà cung cấp** · **Thanh toán** (Chưa / Một phần / Đã thanh toán) ·
  **Từ ngày – Đến ngày** · nút "Lọc" · nút "**+ Nhập hàng**" (về tab Nhập hôm nay).
- Cột: **Mã phiếu · Ngày · Nhà cung cấp · Hàng nhập** (tên + SL, 3 dòng đầu +N) **· Cần trả NCC · Đã trả · Còn nợ · Trạng thái**.
  Bấm cả dòng → chi tiết.

### 2c. Chi tiết phiếu nhập

- Đầu trang: mã phiếu + nhãn trạng thái · ngày chứng từ · ngày vào kho · nhà cung cấp (link) · nút **Sao chép**.
- **Phiếu tạm**: hiện lại form nhập để sửa tiếp (Lưu tạm / Hoàn thành) + **Hủy bỏ**.
- **Đã nhập hàng**: bảng **Tên hàng · Số lượng · Đơn giá · Thành tiền**; tổng (Tổng tiền hàng, Giảm giá, Cần trả NCC, Đã trả,
  Còn nợ); thẻ **Lịch sử thanh toán** (mã phiếu chi → sổ quỹ); thẻ **Sửa thông tin** (ngày chứng từ, gắn NCC nếu trống, ghi chú);
  **Hủy bỏ** + ô "Hủy luôn phiếu chi đi kèm".
- **Đã hủy**: chỉ xem + Sao chép.

Đối thủ: KiotViet danh sách nhập hàng có cột Mã nhập hàng · Thời gian · NCC · Cần trả NCC · Trạng thái; bấm dòng **mở rộng ngay
trong danh sách** (tab Thông tin / Lịch sử thanh toán) thay vì sang trang riêng.

## 3. Nhà cung cấp

| Màn | Nội dung | Đối thủ | Chốt |
|---|---|---|---|
| Danh sách | Nút lọc **Đang nợ** · ô tìm (tên / SĐT / mã) · khối gập "**+ Nhà cung cấp**" (form thêm) · bảng **Mã · Tên nhà cung cấp · Điện thoại · Tổng mua · Nợ cần trả hiện tại** · dòng tổng nợ ở đầu trang | KiotViet: cùng các cột; nút "+ Nhà cung cấp" mở hộp thoại | |
| Chi tiết — tab **Thông tin** | Form: Tên*, SĐT, MST, Email, Địa chỉ, Ghi chú · **Lưu** · **Ngừng hoạt động** | KiotViet: tab "Thông tin" | |
| Chi tiết — tab **Lịch sử nhập hàng** | Bảng phiếu nhập của NCC | KiotViet: "Lịch sử nhập/trả hàng" | |
| Chi tiết — tab **Nợ cần trả NCC** | Bảng **Mã phiếu · Ngày · Cần trả · Đã trả · Còn nợ** + dòng điều chỉnh + "Trả trước" + tổng · thẻ **Thanh toán** (Trả cho NCC, Quỹ, Thời gian, tích "Chọn công nợ trả", Ghi chú → **Tạo phiếu chi**) · thẻ **Điều chỉnh** (Tăng / Giảm nợ, Giá trị nợ điều chỉnh, Mô tả) | KiotViet: tab "Nợ cần trả NCC", nút Thanh toán / Điều chỉnh | |

## 4. Sổ quỹ

| Màn | Nội dung | Đối thủ | Chốt |
|---|---|---|---|
| Sổ quỹ | Liên kết con "Sổ quỹ · **Loại thu chi**" · nút **+ Phiếu thu · + Phiếu chi · Xuất file** · chọn kỳ (Hôm nay / 7 ngày / 30 ngày / Tuần này / Tháng này / Tùy chọn / ‹ ›) · tab **Tiền mặt / Ngân hàng (tên NH ·4 số cuối) / Tổng quỹ** · 4 ô **Quỹ đầu kỳ · Tổng thu · Tổng chi · Tồn quỹ** · thẻ "Nhập số dư đầu kỳ" (khi chưa có) · bảng **Mã phiếu · Thời gian · Loại thu chi · Người nộp/nhận · (Quỹ) · Thu · Chi**; tiền bán hàng = 1 dòng/ngày/phương thức, bấm mở báo cáo ngày | KiotViet: tab Tiền mặt / Ngân hàng / Tổng quỹ, cùng 4 số; mỗi hóa đơn một phiếu thu (khác — đã chốt C7) | |
| + Phiếu thu / chi | **Loại***, **Giá trị***, **Thời gian**, **Quỹ**, **Nhóm người nộp/nhận** (NCC → chọn NCC), Tên, Ghi chú, ô **Hạch toán vào kết quả kinh doanh**, mục gập "Chứng từ gốc" → **Lưu phiếu** | KiotViet: cùng các trường | |
| Chi tiết phiếu | Thông tin phiếu · thẻ **Sửa phiếu** (thời gian, ghi chú) · **Hủy phiếu** | KiotViet: sửa phiếu tay được nhiều trường hơn | |
| Loại thu chi | Hai khối **Loại chi / Loại thu**: mỗi dòng Tên · Mục chi phí · ô Hạch toán · **Lưu** · **Ngừng dùng**; dòng cuối **+ Thêm** | KiotViet: "Loại thu/chi" + "Tạo mới" trong form phiếu | |

## 5. Báo cáo → khối "Kết quả kinh doanh" (chỉ chủ) + Cài đặt → "Thuế nộp nhà nước"

- Khối nằm **sau thẻ dự báo, trước biểu đồ doanh thu**; theo kỳ đang chọn; có ở "Chi nhánh này" và "Tất cả chi nhánh".
- Dòng: Doanh thu bán hàng · Giảm giá · Doanh thu món thuần · (Phí phục vụ) · **Doanh thu thuần** · Giá vốn hàng bán (hoặc Chi phí mua
  nguyên liệu theo phiếu nhập) · **Lợi nhuận gộp** · từng loại chi phí · Tổng chi phí · (Thu nhập khác) · **Lợi nhuận** · từng dòng thuế ·
  **Lợi nhuận sau thuế** · ghi chú dòng nối VAT → KPI · nút **Xuất Excel kết quả kinh doanh**.
- Cài đặt: khối **Thuế nộp nhà nước** 5 dòng (Tên thuế · % · trên doanh thu / trên lợi nhuận) · **Lưu thuế**.

Đối thủ: KiotViet / Sapo để ở **mục báo cáo riêng** "Báo cáo tài chính" / "Kết quả kinh doanh", không phải một khối trong trang báo cáo.

## 6. Nguyên liệu — thay đổi 29–30/09/2026

- Đơn vị trừ kho: **gam · kilôgam · mililít · lít · cái/quả/lon**.
- Đơn vị lúc mua quen (kg, lạng, tạ, lít, ml…) → dòng "**1 kg = 1.000 g · tự tính**" (khóa); đơn vị riêng (vỉ, thùng…) → ô gõ.
- **% dùng được**: chỉ hiển thị "89% · từ 6 lần kiểm kê gần nhất" / "100% · chưa đủ dữ liệu"; không gõ tay.

## Chủ dự án đã chốt (30/09/2026)

| # | Câu hỏi | Chốt | Việc phải làm |
|---|---|---|---|
| G1 | Phiếu nhập ở đâu | **Mục menu riêng "Nhập hàng"** (như KiotViet FnB) — danh sách phiếu + "+ Nhập hàng"; tab "Nhập hôm nay" giữ cho nhập nhanh buổi sáng | ☑ 30/09: mục menu "Nhập hàng" (`/nhap-hang`, "+ Nhập hàng" → `/nhap-hang/moi`), bỏ tab "Phiếu nhập" trong Nguyên liệu, đường cũ tự chuyển. **01/10 (P25): bỏ luôn tab "Nhập hôm nay"**, chỉ còn một chỗ nhập ("+ Nhập hàng" + "Lấy hàng lần trước"); tab mới "Tồn kho" — xem `P25/00-TongQuan.md` |
| G1′ | (P28, 04/10/2026) | **Gom vào mục "Kho hàng"** cùng Nguyên liệu và Nhà cung cấp; "Nhập hàng" thành một tab | ☑ xem `P28/00-TongQuan.md` |
| G2 | Bấm phiếu nhập | **Sang trang chi tiết** (như hiện nay) | — |
| G3 | Kết quả kinh doanh | **Giữ khối trong trang Báo cáo** (như hiện nay) | — |
| G4 | "+ Nhà cung cấp" | **Hộp thoại** (như KiotViet) | ☑ 30/09: hộp thoại "Thêm nhà cung cấp" (Lưu / Bỏ qua; lỗi thì giữ hộp thoại) |

## Câu hỏi ban đầu

1. **Phiếu nhập** để là tab trong Nguyên liệu (như hiện nay) hay **mục menu riêng "Nhập hàng"** như KiotViet FnB?
2. Bấm một phiếu nhập: **sang trang chi tiết** (hiện nay) hay **mở rộng ngay trong danh sách** như KiotViet?
3. **Kết quả kinh doanh**: giữ là khối trong trang Báo cáo hay tách thành **trang / tab riêng** ("Báo cáo tài chính")?
4. "+ Nhà cung cấp": khối gập trên trang (hiện nay) hay **hộp thoại** như KiotViet?
5. Tab / cột / nút nào thấy thiếu hoặc thừa ở các bảng trên.
