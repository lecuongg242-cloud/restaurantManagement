# P20 — Nghiên cứu nghiệp vụ: mua hàng, nhà cung cấp, công nợ, sổ quỹ, chuyển hàng

> Tra 29/09/2026. Nguồn: trang hướng dẫn chính thức của đối thủ, văn bản pháp luật trên chinhphu.vn / luatvietnam.vn,
> và rà code thật của repo. Bảng đối thủ tóm tắt nằm ở `00-TongQuan.md` §Đối thủ làm thế nào; file này giữ phần chi
> tiết, pháp lý, hiện trạng code và phân tích thiết kế. Chỗ ghi **(?)** là chưa xác minh được.

## 1. Tóm tắt

1. **Chứng từ trung tâm là "Phiếu nhập hàng"**, không phải đơn đặt hàng. 5/5 đối thủ có phiếu nhập gắn NCC, tiền trả
   ngay, phần thiếu tự "Tính vào công nợ". Đơn đặt hàng nhập (PO) riêng chỉ 3/5 có (KiotViet ghi cho bán lẻ, CUKCUK,
   iPOS). Sapo FnB và POS365 dùng phiếu nhập ở trạng thái nháp để làm việc đặt hàng.
2. **Phiếu đã hoàn thành không sửa số liệu**: muốn sửa thì **Hủy bỏ** (hoàn tồn kho và công nợ) rồi **Sao chép** ra phiếu
   mới (KiotViet, POS365; Sapo chỉ sửa khi còn "Đặt hàng"). Cách này hợp với chốt sổ ngày bất biến của P10.
3. **Mọi dòng tiền đi qua "Sổ quỹ"** có phiếu thu/chi, tab Tiền mặt / Ngân hàng / Tổng quỹ. Trả nợ NCC sinh phiếu chi.
   Chỉ phiếu có ô **"Hạch toán vào kết quả kinh doanh"** mới vào báo cáo lãi lỗ; trả nợ NCC không bao giờ là chi phí.
4. **Không đối thủ nào có tuổi nợ (aging)** và không ai có vai trò "Kế toán" hay "Thu mua" mặc định.
5. **Chuyển hàng giữa chi nhánh**: KiotViet làm rõ nhất. Một phiếu đi qua Phiếu tạm → Đang chuyển → Đã nhận / Đã hủy.
   Bên nhận bấm "Nhận hàng" và sửa số lượng thực nhận; phần thiếu hoàn về kho gửi; giá chuyển mặc định bằng giá vốn.
6. **Pháp lý: màn sổ quỹ không cần giống mẫu sổ**, nhưng dữ liệu phải đủ để **xuất** S2c-HKD (doanh thu, chi phí) và
   S2e-HKD (tiền). Hộ doanh thu > 3 tỷ **bắt buộc** giữ S2b + S2c + S2d + S2e. qt-food ước ~3,7 tỷ/năm
   (`PhanTichDoiThu.md:73`), nên plan 14-04 (chỉ S1a/S2a) **không đủ** cho quán này nếu qt-food là hộ kinh doanh.
7. **Code: kho P10 đã có chỗ cắm** (`stock_entries.kind = 'receipt'`), nhưng chưa có NCC, số chứng từ, thành tiền, sổ
   quỹ, ca làm việc, và nguyên liệu giữa các chi nhánh không nối với nhau.

## 2. Đối thủ — chi tiết theo nghiệp vụ

### 2.1 Nhà cung cấp

- **Trường số đông:** Tên (bắt buộc), Mã (tự sinh), SĐT (không trùng), Email, Địa chỉ, Công ty, MST, Nhóm NCC, Ghi chú.
  POS365 có thêm "Dư nợ" (nợ đầu kỳ) ngay trên form tạo.
- **Danh sách luôn có hai cột tiền:** KiotViet "Tổng mua" + **"Nợ cần trả hiện tại"**; POS365 "Tổng giao dịch" + "Dư
  nợ"; Sapo "Công nợ phải trả". Lọc theo nhóm, khoảng tổng mua, khoảng nợ.
- **Chi tiết NCC (KiotViet):** 3 tab "Thông tin" / "Lịch sử nhập/trả hàng" / **"Nợ cần trả NCC"**; nút "Thanh toán",
  "Điều chỉnh", "Ngừng hoạt động", "Xóa".
- Nhập/xuất Excel: KiotViet, CUKCUK, POS365. iPOS có **bảng giá mua theo NCC theo giai đoạn** (riêng iPOS).
- Sapo FnB gọi NCC là **"đối tác"** và để dưới Thiết lập. Không theo cách này: 4/5 gọi "Nhà cung cấp".

### 2.2 Phiếu nhập hàng

KiotViet FnB (Quản lý → Giao dịch → Nhập hàng → **"+ Nhập hàng"**):

| Khối | Nội dung |
|---|---|
| Dòng hàng | "Mã hàng", "Tên hàng", "ĐVT", "Số lượng", "Đơn giá", "Giảm giá", "Giá nhập", "Thành tiền"; thêm theo tìm kiếm / nhóm hàng / Excel; nhập nhanh F6 |
| Đầu phiếu | "Tìm nhà cung cấp (F4)" (+ tạo nhanh NCC), mã phiếu, ngày giờ nhập (sửa được), người nhập |
| Tiền | "Tổng tiền hàng" − "Giảm giá" + "Chi phí nhập hàng" = **"Cần trả nhà cung cấp"**; **"Tiền trả nhà cung cấp"** (Tiền mặt / Thẻ / Chuyển khoản); **"Tính vào công nợ"** |
| Lưu | **"Lưu tạm"** → "Phiếu tạm" · **"Hoàn thành"** → "Đã nhập hàng" (cộng tồn) |
| Sau khi xong | Chỉ sửa người tạo, thời gian, ghi chú. **"Hủy bỏ"** hỏi có hủy luôn phiếu chi đi kèm; trừ lại tồn, cập nhật lại công nợ. **"Sao chép"** tạo phiếu tạm mới |
| Khác | Tab "Lịch sử thanh toán", "In", "Xuất file"; lọc theo mã, hàng, NCC, trạng thái, thời gian |

Khác biệt ở các hãng khác:
- **Sapo FnB:** "Loại phiếu nhập" = Nhập hàng / Điều chuyển từ nhà hàng khác / Nhập khác; nút **"Đặt hàng"** (chưa cộng
  kho) và **"Đặt hàng & nhập kho"**; hủy phiếu **không hoàn giá vốn**; app điện thoại **không** nhập kho được.
- **CUKCUK:** thanh toán **"Ghi nợ nhà cung cấp"** hoặc **"Thanh toán ngay"** (tự sinh phiếu chi); có **"Hạn sử dụng"**
  trên dòng; lập phiếu "Từ đơn đặt hàng" / **"Từ phiếu báo hàng"** (bếp báo cần hàng).
- **iPOS:** NCC không bắt buộc; loại "Nhập mua hàng" / "Nhập chế biến" / "Nhập sơ chế"…
- **POS365:** "Lưu" → "Đang xử lý", "Hoàn thành"; chỉ xóa được phiếu đã hủy.
- **Nhập trên điện thoại:** chỉ KiotViet làm đủ (NCC, Lưu tạm/Hoàn thành). CUKCUK app có phiếu nhập kho nhưng không NCC,
  không thanh toán. Sapo không có.
- **Giá vốn:** KiotViet và Sapo dùng bình quân gia quyền cập nhật mỗi lần nhập. CUKCUK tính lại theo kỳ (≤ 31 ngày).
- **Mã phiếu, mẫu in phiếu nhập:** không hãng nào công bố (?).

### 2.3 Đặt hàng nhập (PO) và trả hàng nhập

| | KiotViet | Sapo FnB | CUKCUK | iPOS | POS365 |
|---|---|---|---|---|---|
| PO riêng | Có, "+ Đặt hàng nhập"; tài liệu ghi cho bán lẻ, bản FnB (?) | Không (phiếu nhập "Đặt hàng") | Có, thêm bước **"Báo hàng"** của bếp/bar | Có, NCC có app thì tự xác nhận | Không |
| Trạng thái PO | Phiếu tạm → Đã xác nhận NCC → Nhập một phần → Hoàn thành / Đã hủy; nút **"Kết thúc"** | — | (?) | Chờ xử lý → Đã xác nhận → Hoàn thành / Đã hủy | — |
| Gợi ý số lượng | "Tồn ít nhất − Tồn hiện tại" hoặc bán 30 ngày | "gợi ý nhập" (?) | Theo món dự kiến bán | (?) | — |
| Trả hàng nhập | Có: trả nhanh hoặc theo phiếu nhập; "Tính vào công nợ" | **Không** | Có, "Trả lại hàng mua" | Nút "Trả lại" | Có |

### 2.4 Công nợ nhà cung cấp

- **Nợ phát sinh từ phiếu nhập:** phần "Cần trả" − "Tiền trả NCC". Sapo chỉ ghi nợ khi bật "Ghi nhận thanh toán" (gói FnB Pro).
- **Trả nợ:**
  - KiotViet: tab nợ → "Thanh toán" → ô "Trả cho NCC" → **"Tạo phiếu chi"** / "Tạo phiếu chi & In".
  - Sapo: **"Trả nợ"** → hộp "Trả nợ đối tác": "Giá trị chi (VND)", "Phương thức thanh toán", "Thời gian ghi nhận",
    "Mã chứng từ", file chứng từ, **"Chọn công nợ trả"** (tích từng phiếu).
  - CUKCUK: "Mua hàng → Trả nợ" → "Lấy dữ liệu" → nhập "Số trả" (tự phân bổ **phát sinh trước trả trước**) hoặc "Tích
    chọn các chứng từ cần trả" → "Trả tiền" (tự sinh phiếu chi).
- **Nợ đầu kỳ / sai lệch:** KiotViet dùng **"Điều chỉnh"** ("Giá trị nợ điều chỉnh", "Mô tả", gợi ý ghi "Công nợ tồn đầu
  kỳ"), tự sinh phiếu điều chỉnh. POS365 có ô "Dư nợ" khi tạo NCC. Sapo, CUKCUK: không thấy.
- **Báo cáo:** CUKCUK "Công nợ nhà cung cấp" (xuất Excel); POS365 **"In sổ nợ"** → "Bảng kê công nợ chi tiết"; KiotViet
  Báo cáo → Nhà cung cấp.
- **Tuổi nợ: không hãng nào có.**

### 2.5 Sổ quỹ (thu chi)

| | KiotViet FnB | Sapo FnB | CUKCUK | POS365 |
|---|---|---|---|---|
| Đường vào | Quản lý → **"Sổ quỹ"**; tab Tiền mặt / Ngân hàng / Ví điện tử / **Tổng quỹ** | "Thu chi" → Danh sách phiếu / Loại phiếu; Báo cáo → "Sổ quỹ" | Hai phân hệ "Quỹ tiền mặt", "Quỹ tiền gửi" | "Thu & Chi": Tổng thu, Tổng chi, **Tồn quỹ** |
| Nút | "+ Phiếu thu", "+ Phiếu chi", "Xuất file", "Lưu & In" | Tạo phiếu thu / chi | Thêm → "Thu tiền" / "Chi tiền" | "Phiếu thu", "Phiếu chi", "Chuyển khoản" |
| Trường | Mã phiếu (trống = tự sinh), Thời gian, **Loại thu/chi** (+ Tạo mới), Người thu/chi, **Nhóm người nộp/nhận** (Khách hàng / NCC / Nhân viên / Khác), Tên, Giá trị, Ghi chú, ô **"Hạch toán vào kết quả kinh doanh"**, file chứng từ (mobile) | Giá trị, Loại phiếu, Nhóm người nộp (Đối tác / Khách hàng / Khác), Tên, Phương thức, Mô tả, Thời gian ghi nhận, Chứng từ gốc, ô hạch toán | Loại chứng từ "Trả nợ"/"Khác", "Thu nợ"/"Khác"; ô **"Tính vào công nợ"**, **"Tính vào thu nhập khác"**; tài liệu đính kèm | Mã chứng từ, Hạng mục (+ Thêm mới), Người nộp/nhận, Ngày, Giá trị, Ghi chú |
| Mã phiếu | TTM/CTM (tiền mặt), TNH/CNH (ngân hàng) | Tự sinh (?) | (?) | Tự sinh |
| Phiếu tự sinh | Từ hóa đơn, đặt hàng, trả hàng, nhập hàng, trả hàng nhập; chỉ sửa thời gian, nhân viên, phương thức, ghi chú | Có | Nhập hàng thanh toán ngay | (?) |
| Sửa / hủy | Phiếu thủ công sửa được; **"Hủy phiếu"** = vô hiệu, không xóa | **Không sửa**, chỉ hủy + tạo lại; lùi ngày tối đa 3 ngày | Sửa → Cất | Hủy, xóa |
| Chuyển quỹ | Loại "Chuyển/Rút", tự sinh phiếu đối ứng | — | — | "Chuyển khoản" giữa TK / chi nhánh |

- **Sổ quỹ báo cáo (Sapo):** A. TIỀN ĐẦU KỲ · B. TIỀN THU TRONG KỲ (thực thu bán hàng, đặt cọc, các loại thu) · C. TIỀN
  CHI TRONG KỲ · D. TIỀN CUỐI KỲ = A + B − C; cột "PTTT tiền mặt" / "PTTT khác" / "Tổng".
- **Chi tiền trong ca:** CUKCUK thu ngân vào ☰ → **"Chi tiền mặt"**, khoản chi in lên biên bản bàn giao ca. Sapo có
  **"Rút tiền mặt"** khỏi két. KiotViet mở ca nhập "Tiền mặt đầu ca", đóng ca nhập "Tiền mặt bàn giao thực tế".
- **Loại thu/chi mặc định:** không hãng nào công bố danh sách. Ví dụ gặp: đi chợ, tiền đá, lương nhân viên, thuê mặt bằng,
  điện, nước, quảng cáo, thuế; thu: thanh lý tài sản, tiền phạt.

### 2.6 Báo cáo lãi lỗ (kết quả kinh doanh)

- **Sapo FnB (đầy đủ nhất):** Doanh thu bán hàng (tiền hàng, phí dịch vụ, thuế, phí giao) − Giảm trừ (giảm giá, hủy/hoàn…)
  = **Doanh thu thuần** − Giá vốn hàng bán = **Lợi nhuận gộp** − Chi phí + Thu nhập khác = **Lợi nhuận trước thuế**.
- **KiotViet:** Doanh thu thuần = Doanh thu bán hàng − Giảm trừ; Lợi nhuận thuần = (Lợi nhuận từ HĐKD + Thu nhập khác) −
  Chi phí khác. Phiếu chi có ô hạch toán vào "chi phí khác", phiếu thu vào "thu nhập khác".
- **CUKCUK:** chi phí NVL tính bằng **giá trị xuất kho**; phiếu chi gom theo khoản mục mỗi tháng, **không gồm trả nợ**.
- **iPOS:** có chi phí **phân bổ nhiều tháng** (tên, số tiền, số tháng) và khóa sổ tháng.

### 2.7 Chuyển hàng giữa chi nhánh

| | KiotViet FnB | Sapo FnB | CUKCUK | iPOS | POS365 |
|---|---|---|---|---|---|
| Luồng | Kho hàng → Chuyển hàng → **"+ Chuyển hàng"** → "Tới chi nhánh" → "Lưu tạm" / "Hoàn thành" | Hai phiếu rời (xuất "Điều chuyển đến nhà hàng khác" + nhập "Điều chuyển từ nhà hàng khác") | Hai phiếu, bên nhận "Chọn chứng từ" → "Lấy dữ liệu" | Yêu cầu xuất kho nội bộ → kho cấp xác nhận → tự sinh xuất + nhập | "Chuyển hàng nội bộ" |
| Trạng thái | Phiếu tạm / **Đang chuyển** / **Đã nhận** / Đã hủy | Độc lập | Nối qua chứng từ | Chờ xử lý / Đã xác nhận / Đã xuất / Hoàn thành | Đang xử lý / Hoàn thành |
| Bên nhận | **"Nhận hàng"**, sửa "Số lượng nhận"; **thiếu thì phần chênh tự cộng lại kho gửi**; mobile bắt nhập ghi chú khi thiếu | Không xác nhận | Sửa được trước khi lưu | "Xác nhận nhập kho" / "Trả lại" | (?) |
| Giá | **"Giá chuyển (thường là giá vốn)"**, sửa được | Chỉ gói Pro | Bình quân từng kho | (?) | (?) |

### 2.8 Phân quyền

KiotViet: vai trò theo chi nhánh ("Quản trị chi nhánh", "Nhân viên kho", "Nhân viên thu ngân") + tự tạo vai trò. Sapo:
quyền rời "Xem/Tạo/Sửa/Hủy phiếu thu chi", "Tạo & Sửa phiếu nhập kho", "Báo cáo tài chính". CUKCUK: "Quản lý kho",
"Quản lý nhà hàng"… **Không hãng nào có vai trò "Kế toán" hay "Thu mua" mặc định.**

## 3. Pháp lý: sổ kế toán hộ kinh doanh (TT 152/2025)

### 3.1 Ai giữ sổ nào

TT 152/2025/TT-BTC (ký 31/12/2025, hiệu lực 01/01/2026, thay TT 88/2021) chia theo **cách nộp thuế**. Ngưỡng theo NĐ
68/2026, được NĐ 141/2026 sửa mốc 500 triệu → **1 tỷ**, áp dụng từ 01/01/2026:

| Doanh thu năm | Thuế | Sổ phải giữ |
|---|---|---|
| ≤ 1 tỷ | Không chịu GTGT, TNCN | **S1a** |
| > 1 – 3 tỷ | GTGT theo %; TNCN **được chọn**: % trên phần vượt 1 tỷ **hoặc** 15% × (doanh thu − chi phí), giữ ổn định 2 năm | S2a, **hoặc** S2b + S2c + S2d + S2e |
| > 3 tỷ | TNCN **bắt buộc** trên thu nhập (17%); khai theo quý | **S2b + S2c + S2d + S2e** |

Doanh thu > 1 tỷ còn bắt buộc hóa đơn điện tử từ máy tính tiền (P14). TT 152 Điều 3 khoản 3: hộ được **thêm sổ hoặc sửa
mẫu** cho hợp nhu cầu, miễn có tên sổ, ngày lập, chữ ký người đại diện. Lưu tối thiểu 5 năm, giấy hoặc điện tử.

### 3.2 Mẫu các sổ liên quan P20

- **Khối đầu sổ chung:** `HỘ, CÁ NHÂN KINH DOANH` / `Địa chỉ` / `Mã số thuế`; bên phải `Mẫu số S…-HKD (Kèm theo Thông
  tư số 152/2025/TT-BTC …)`; `Kỳ kê khai`, `Đơn vị tính`. Khối ký: `NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/ CÁ NHÂN KINH DOANH`.
- **S2c-HKD — Sổ chi tiết doanh thu, chi phí.** Cột: Chứng từ [Số hiệu | Ngày, tháng] | Diễn giải | Số tiền. Dòng in sẵn:
  1. Doanh thu · 2. Chi phí hợp lý: **a)** nguyên liệu, vật liệu, nhiên liệu, năng lượng, hàng hóa · **b)** tiền lương,
  tiền công, phụ cấp, bảo hiểm · **c)** khấu hao TSCĐ · **d)** dịch vụ mua ngoài (điện, nước, điện thoại, internet, vận
  chuyển, **thuê tài sản**, sửa chữa) · **đ)** lãi vay · **e)** chi khác · 3. Chênh lệch = (1) − (2) · 4. Thuế TNCN =
  (3) × thuế suất. Dòng 1, 2 ghi tổng hoặc từng nghiệp vụ.
- **S2e-HKD — Sổ chi tiết tiền.** Cột: Chứng từ [Số hiệu | Ngày tháng] | Diễn giải | Thu/Gửi vào | Chi/Rút ra. Khối
  **Tiền mặt** (đầu kỳ, phát sinh, tổng thu, tổng chi, tồn cuối) + **mỗi ngân hàng một khối** tiền gửi.
- **S2d-HKD — Sổ chi tiết vật liệu, hàng hóa** (mỗi mặt hàng một sổ): Chứng từ | Diễn giải | ĐVT | Đơn giá | Nhập
  [SL | Tiền] | Xuất [SL | Tiền] | Tồn [SL | Tiền] | Ghi chú. **Đơn giá xuất = bình quân gia quyền cả kỳ** ⇒ khác QD-017 D6
  (bình quân theo ngày); xuất sổ phải tính riêng.
- **S2b** gần như trùng S2a (bỏ dòng TNCN) ⇒ nên thêm vào 14-04.

### 3.3 Chứng từ của chi phí được trừ (NĐ 68/2026 Điều 6)

- Phải có hóa đơn/chứng từ; thanh toán **từng lần từ 5 triệu phải không dùng tiền mặt**.
- **Không được trừ:** chi không đủ chứng từ; **lương chủ hộ và thành viên hộ**; lương nhân viên **không** đóng bảo hiểm
  bắt buộc (trừ lao động dưới 1 tháng); tiền phạt; chi cá nhân, gia đình.
- **Mua chợ không hóa đơn:** TT 152 yêu cầu "Bảng kê mua hàng hóa, dịch vụ" nhưng không cho mẫu. Mẫu dùng thực tế là
  **02/TNDN** (TT 20/2026): ngày mua, người bán (tên, địa chỉ, **số căn cước**, SĐT), hàng (tên, SL, đơn giá, tổng), ghi
  chú; tổng hợp hằng tháng. MISA AMIS HKD in sẵn mẫu này.

### 3.4 Điểm chưa chắc về luật — không chặn

> Chủ dự án 29/09/2026: **không cần quan tâm phần này** — khoản nào được trừ do người dùng tự cấu hình (loại thu/chi: mục
> chi phí + "Hạch toán"). Danh sách giữ lại để tham khảo khi làm sổ, không phải điều kiện làm P20.

1. Hộ kinh doanh có dùng được **Mẫu 02/TNDN** không (văn bản là của thuế TNDN, áp cho hộ là suy ra tương tự).
2. Dòng a) của S2c ghi **giá trị nguyên liệu mua vào** hay **giá trị xuất dùng** (theo S2d).
3. Tiền bán qua chuyển khoản/QR ghi vào S2e vào ngày bán hay ngày tiền về.
4. Thuế suất 15/17/20% (Luật TNCN 109/2025) và khoảng "1–3 tỷ được chọn" của NĐ 141 — mới thấy qua nguồn thứ cấp.

**Đối thủ:** KiotViet "Sổ kế toán (Thông tư 152)": quán khai nhóm doanh thu + cách tính thuế → hệ thống hiện đúng bộ
sổ; S2e lấy từ phiếu thu/chi; nút **"Tải sổ"** và **"Khóa sổ"**. CUKCUK có đủ S1a–S3a; S2c lấy chi phí qua bước **"Rà
soát chi phí"**.

Nguồn: TT 152 toàn văn https://xaydungchinhsach.chinhphu.vn/toan-van-thong-tu-152-2025-tt-bt-huong-dan-ke-toan-cho-cac-ho-kinh-doanh-ca-nhan-kinh-doanh-119260112105136458.htm ·
S2c https://luatvietnam.vn/bieu-mau/mau-so-chi-tiet-doanh-thu-chi-phi-cua-ho-kinh-doanh-571-106418-article.html ·
S2e https://luatvietnam.vn/bieu-mau/mau-so-s2e-hkd-mau-so-chi-tiet-tien-cua-ho-kinh-doanh-571-106426-article.html ·
S2d https://luatvietnam.vn/bieu-mau/mau-so-chi-tiet-vat-lieu-dung-cu-san-pham-hang-hoa-cua-ho-kinh-doanh-571-106421-article.html ·
NĐ 68/2026 https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-68-2026-nd-cp-quy-dinh-ve-chinh-sach-thue-quan-ly-thue-voi-ho-kinh-doanh-119260306102906789.htm ·
NĐ 141/2026 https://baochinhphu.vn/chinh-thuc-nang-nguong-chiu-thue-voi-ho-kinh-doanh-len-01-ty-dong-nam-ap-dung-tu-1-1-2026-102260429185517215.htm ·
02/TNDN https://luatvietnam.vn/bieu-mau/mau-so-02-tndn-bang-ke-thu-mua-hang-hoa-dich-vu-khong-co-hoa-don-571-107727-article.html ·
KiotViet sổ HKD https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ke-toan-hkd-so-ke-toan/so-ke-toan/ ·
CUKCUK S2c https://helpv2.cukcuk.vn/vi/kb/s2c-hkd-mobile

## 4. Hiện trạng code (rà 29/09/2026)

| Chỗ | Hiện có | Hệ quả cho P20 |
|---|---|---|
| `stock_entries` (`0046:24-44`) | `kind` ∈ receipt, batch_in, batch_out, waste, count_adjust; `qty` đơn vị gốc; `unit_cost` 6 số lẻ; **không** có NCC, số chứng từ, thành tiền | Phiếu nhập là bảng mới; dòng sổ thêm cột tham chiếu phiếu. Tiền (int VND) lưu ở dòng phiếu, `unit_cost` suy ra |
| Nhập buổi sáng (`inventory/actions.ts:337` `recordReceipts`) | Nhận `rows[{ingredient_id, qty, price}]`, giá theo **đơn vị nhập**, điền sẵn danh sách lần trước; gợi ý P18 đổ vào qua nút "Điền theo gợi ý" | Đây chính là "phiếu nhập" không NCC. Gộp thành một luồng, không làm màn thứ hai |
| Chốt sổ ngày (`close-server.ts:14-61`) | Tự chốt tới **hôm qua** mỗi khi mở khu Nguyên liệu/Báo cáo; không có job đêm | Dòng sổ ghi vào ngày đã chốt **bị bỏ qua im lặng** (`inventory_on_hand` lọc `business_date > close_date`, `0047:137`). Phiếu nhập lùi ngày: ngày chứng từ (cho công nợ, sổ) tách khỏi ngày vào kho |
| Giá vốn (`close.ts:56-72`) | Bình quân gia quyền **theo ngày**, chỉ đọc kind `receipt`/`batch_in` | Hàng chuyển đến chi nhánh B phải vào bằng kind mà `loadPrices` đọc, có `unit_cost`, nếu không B rơi về "giá cũ" |
| Thêm `kind` mới | Phải sửa 2 CHECK, `inventory_on_hand`, `inventory_day`, `DayRow`, payload chốt, `loadPrices`, `report_waste` | Tránh thêm kind nếu được: dùng lại `receipt` / `waste`-kiểu cũ + cột tham chiếu |
| RLS kho (`0045:55-67`) | `for all` theo `auth_tenant_ids()` ⇒ mọi vai trò ghi được ở DB, chặn ở app | Bảng tiền P20 dùng `manager_tenants()` (`0068:9-23`) như 0069/0071/0073 |
| Ca, két, thu chi | **Không có gì** | Sổ quỹ làm từ đầu; tiền bán hàng **tính** từ `payments` (cash/transfer), không chép |
| `payments.method` | Chỉ `cash` / `transfer` | Tiền mặt → quỹ tiền mặt; chuyển khoản → TK ngân hàng mặc định (`tenants.settings.bank`, P13) |
| Doanh thu (BILL-05) | Mốc thật là `bills_revenue.business_at` (`0040:14-50`); lãi gộp P10 dùng `paid_at` (`0048:36-43`) | Lãi lỗ phải chọn một mốc và đối soát với KPI "Doanh thu". Tài liệu P14 ghi `paid_at` là sai |
| Vai trò (`lib/auth/rbac.ts`) | owner, manager, cashier, waiter, kitchen, station, printer; `ManageSection` bằng `switch` | Thêm mục `purchasing`/`cashbook` vào `ManageSection` + `AdminNav`; không thêm vai trò (khớp đối thủ) |
| Chuỗi (`0063` `sync_menu_from_root`) | Tiền lệ ghi nhiều tenant: `security definer`, kiểm cùng brand + quyền; nối bằng `source_id` | Chưa có RPC ghi A ↔ B; **`ingredients` không có `source_id`** ⇒ chuyển hàng cần bước nối nguyên liệu |
| Số chứng từ | `nextBillNo` max+1, **không unique** | Mã phiếu (PN, PC, PT, CH…) cấp trong RPC có khóa + unique `(tenant_id, code)` |
| Xuất Excel | `lib/reports/xlsx.ts` `taoXlsx` tự viết; `export_logs.kind` CHECK (`0071:10`) | Dùng lại, thêm kind mới vào CHECK |
| Quy ước | Migration kế tiếp **0076** (0075 đã dùng cho P21); ma trận RLS khóa `toHaveLength(23)`; `schema-snapshot.json`; test `TZ=UTC` | Theo khuôn P10/P16 |

## 5. Đặc thù quán nhỏ — không bê nguyên phần mềm bán lẻ

1. **Mua chợ mỗi sáng, thường không hóa đơn, không NCC cố định.** NCC phải **tùy chọn** trên phiếu nhập (như iPOS). Nhập
   buổi sáng giữ nguyên tốc độ: một màn, điền sẵn, dùng trên điện thoại.
2. **Nợ NCC thật chủ yếu ở mối quen** (bia, nước ngọt, gạo, gas, thịt giao tận nơi) — trả theo tuần/tháng. Đây là chỗ
   công nợ có giá trị.
3. **Tiền két là tiền đi chợ.** Nhiều quán lấy tiền mặt trong két đi chợ ⇒ phiếu nhập "trả ngay tiền mặt" phải trừ quỹ
   tiền mặt. Chi tiền trong ca (CUKCUK, Sapo) cần module ca — hiện chưa có.
4. **Giá trị lãi lỗ ở chỗ gộp chi phí ngoài nguyên liệu** (thuê nhà, lương, điện nước). Lãi gộp P10 đã có; P20 thêm
   phần dưới.

## 6. Hai nguồn "chi phí nguyên liệu" — phải chọn một cho lãi lỗ

| Nguồn | Ưu | Nhược |
|---|---|---|
| **Giá vốn** từ bản chốt P10 (giá trị xuất dùng theo định lượng) | Đúng kỳ, khớp lãi gộp P10, giống CUKCUK ("giá trị xuất kho"), KiotViet, Sapo | Chỉ có ở quán bật kho + khai định lượng; món chưa đủ giá bị loại |
| **Tiền mua** theo phiếu nhập | Quán nào có phiếu nhập cũng có số; khớp S2c dòng a) nếu kế toán hiểu là "mua vào" | Mua dồn đầu tháng thì tháng đó lỗ giả |

Đề xuất: theo số đông đối thủ, **giá vốn** là mặc định; quán không khai định lượng thì dùng **tiền mua** và ghi rõ nhãn
"theo tiền mua". Phiếu nhập thanh toán **không** vào chi phí lần hai (như CUKCUK: trả nợ không là chi phí).
