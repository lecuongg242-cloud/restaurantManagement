# P25 — Gọn khu kho: một chỗ nhập hàng, kiểm kê thấy lệch

> Lập 01/10/2026. **Trạng thái: CHỦ DỰ ÁN CHỐT 01/10/2026 ("A + B"); CODE XONG 25-01**, kết quả ở `25-01-SUMMARY.md`.
> Yêu cầu: INV-11 (kiểm kê thấy lệch), INV-12 (một chỗ nhập hàng). Sửa: QD-027 C2/D2, P20 `00-GiaoDien.md` G1.
> Phụ thuộc: P10 (kho, kiểm kê), P18 (gợi ý nhập), P20 (phiếu nhập).

## Vì sao làm

Ngày 01/10/2026 chủ dự án nhận xét giao diện kho "không hợp lí", ở hai điểm:

1. **Hai chỗ nhập hàng.** Có menu "Nhập hàng" rồi mà Nguyên liệu vẫn còn tab "Nhập hôm nay". Cả hai dùng chung một form
   (`ReceiptForm`) và cùng ghi ra một phiếu nhập. Nguyên nhân là chốt G1 ngày 30/09 thêm menu "Nhập hàng" nhưng vẫn giữ tab
   cũ, trái với QD-027 C2 ("không làm màn nhập thứ hai"). Tab "Nhập hôm nay" còn ôm cả "Chế biến" và "Tồn hiện tại", hai
   thứ không liên quan đến việc nhập hàng.
2. **Kiểm kê ghi im lặng.** Sổ có 10 kg, gõ số đếm 82 kg thì hệ thống tự ghi điều chỉnh +72 kg. Không hiện số lệch, không
   hỏi lại, chỉ báo "Đã ghi kiểm kê N nguyên liệu". Gõ nhầm 82 thay vì 8,2 sẽ đi thẳng vào sổ, rồi làm sai báo cáo hao hụt
   và "% dùng được".

**P25 xong khi:** nhập hàng chỉ còn ở menu Nhập hàng; Nguyên liệu có 4 tab, mở đầu bằng "Tồn kho"; màn kiểm kê hiện Tồn kho,
Thực tế, SL lệch, Giá trị lệch và tổng lệch tăng/giảm như KiotViet; lệch lớn thì bôi vàng và phải xác nhận trước khi ghi.

## Đối thủ làm thế nào (tra 01/10/2026)

| | KiotViet FnB | Sapo FnB | CUKCUK | iPOS |
|---|---|---|---|---|
| Kiểm kê ở đâu | Hàng hóa → **Kiểm kho** → "+ Kiểm kho" | Kho hàng → **Kiểm kê kho** → "Thêm phiếu kiểm" | Kho → tab Kiểm kê kho | Quản lý tồn kho → Kiểm kê |
| Cột | **Tồn kho · Thực tế · SL lệch · Giá trị lệch** | Số lượng ban đầu · Kiểm kê · Chênh lệch · Lý do | Số lượng theo sổ · Số lượng kiểm kê · Giá trị kiểm kê | Ô thực tế + nguyên nhân |
| Lọc | Tất cả / Khớp / Lệch / Chưa kiểm | — | — | — |
| Tổng | **Tổng lệch tăng · Tổng lệch giảm · Tổng chênh lệch** | — | — | — |
| Nút | Lưu tạm · **Hoàn thành** (tự cân bằng kho) | Lưu · Lưu & Cân bằng kho | Lưu → Xử lý | Lưu |
| Chặn số đếm cao bất thường | Không thấy trong hướng dẫn | Không thấy | Không thấy | Không thấy |
| Giá trị lệch | SL lệch × giá vốn lúc tạo phiếu | — | Đơn giá nhập gần nhất | — |
| Nhập hàng ở đâu | **Chỉ** Giao dịch → Nhập hàng; có **"Sao chép"** phiếu cũ | Kho hàng → Nhập kho, hoặc dấu "+" ở Danh sách tồn kho | — | — |

Nguồn:
[KiotViet FnB – Kiểm kho](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/kiem-kho/) (cột và tổng
đọc từ ảnh chụp trên trang) ·
[KiotViet – Tạo phiếu kiểm kho](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-kiem-kho/tao-phieu-kiem-kho/) ·
[KiotViet FnB – Nhập hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/nhap-hang-web-fnb/) ·
[Sapo – Tạo phiếu kiểm kê](https://help.sapo.vn/tao-phieu-kiem-ke-kho-nguyen-lieu-mat-hang-tren-trang-quan-tri-sapo-fnb) ·
[Sapo – Tạo phiếu nhập kho](https://help.sapo.vn/tao-phieu-nhap-kho-nguyen-lieu-mat-hang-tren-trang-quan-tri-sapo-fnb) ·
[CUKCUK – Kiểm kê kho](https://helpv2.cukcuk.vn/vi/kb/1010200_kiem_ke_kho) ·
[iPOS – Kiểm kê](https://huongdan.ipos.vn/docs/huong-dan-su-dung-ipos-inventory/van-hanh/kiem-ke/).

**Khác đối thủ (chủ dự án đã đồng ý khi chốt B):**
- Lệch lớn thì bôi vàng và hỏi lại. Không hướng dẫn nào của đối thủ nhắc tới cảnh báo này. Ta thêm vì chính chủ dự án
  gặp lỗi gõ 82.
- Nút "Lấy hàng lần trước" thay cho việc tự điền sẵn của tab cũ. KiotViet dùng "Sao chép" một phiếu cũ, và ta cũng đã có
  "Sao chép" ở chi tiết phiếu (P20). Nút mới chỉ chép danh sách nguyên liệu, không chép số lượng và giá, cho đúng thói quen
  "sáng nào cũng mua chừng ấy món, chỉ sửa số".
- Chưa làm: lọc Khớp / Lệch / Chưa kiểm, và phiếu kiểm có mã KK…/Lưu tạm. Danh sách cần kiểm của một quán thường ngắn
  (chỉ nguyên liệu đánh dấu "cần kiểm"); khi nào cần thì làm sau.

## Chủ dự án đã chốt (01/10/2026)

| # | Đề xuất | Chốt |
|---|---|---|
| A | Mỗi việc một chỗ: nhập hàng chỉ ở menu **Nhập hàng** ("+ Nhập hàng" có nút "Lấy hàng lần trước"); Nguyên liệu còn 4 tab **Tồn kho · Kiểm kê & hủy · Nguyên liệu · Định lượng món**; bỏ tab "Nhập hôm nay" | ✅ |
| B | Kiểm kê như KiotViet: cột Tồn kho / Thực tế / SL lệch / Giá trị lệch, tổng lệch tăng / giảm; lệch lớn thì bôi vàng và hỏi xác nhận trước "Hoàn thành"; không chặn | ✅ |
| C | Sửa câu chú thích công thức tồn kho | Không chọn riêng. Câu này chuyển sang tab Tồn kho mới nên viết lại cho đủ luôn |

## Giao diện (đã chốt theo A + B)

### 1. Menu trái

Không đổi: Nguyên liệu · **Nhập hàng** · Nhà cung cấp…

### 2. Nguyên liệu: 4 tab

| Tab | Đường dẫn | Nội dung |
|---|---|---|
| **Tồn kho** (mới, thay "Nhập hôm nay") | `/admin/inventory/stock` | Khối "Tồn hiện tại (ước tính)": mỗi dòng có tên và lượng theo đơn vị nhập (đơn vị gốc trong ngoặc), số ≤ 0 tô đỏ; link "+ Nhập hàng" góc phải. Khối "Chế biến" (form mẻ cũ) |
| Kiểm kê & hủy | `/admin/inventory/count` | Mục 4 |
| Nguyên liệu | `/admin/inventory` | Không đổi |
| Định lượng món | `/admin/inventory/recipes` | Không đổi |

Đường cũ `/admin/inventory/today` tự chuyển sang `/admin/nhap-hang/moi`, để link hay tab đang mở không bị gãy.

Chú thích tồn: *"= tồn đầu ngày + đã nhập + chế biến ra − chế biến dùng − xuất hủy − đã dùng theo đơn, ± lệch kiểm kê."*

### 3. Nhập hàng → "+ Nhập hàng" (Lập phiếu nhập)

- Form P20 giữ nguyên. Thêm nút **"Lấy hàng lần trước"** cạnh "+ Thêm nguyên liệu khác". Nút chỉ hiện khi đã có ngày nhập
  trước hôm nay. Bấm vào thì thêm dòng cho các nguyên liệu của ngày nhập gần nhất, ô số lượng và giá để trống. Dòng đã có
  không bị đụng, bấm lần hai không nhân đôi.
- Khối **"Gợi ý nhập theo dự báo hôm nay"** (P18) và nút "Điền theo gợi ý" chuyển từ tab cũ sang dưới form.
- Câu dẫn ở danh sách Nhập hàng: *"Nhập buổi sáng: bấm "+ Nhập hàng" → "Lấy hàng lần trước"."*

### 4. Kiểm kê cuối ngày

| Chỗ | Máy tính | Điện thoại 360px |
|---|---|---|
| Bảng | Cột **Nguyên liệu · Tồn kho · Thực tế** (ô nhập + đơn vị) **· SL lệch · Giá trị lệch** | Tên, dưới là "Tồn kho: 10 kg"; ô Thực tế bên phải; dòng dưới "Lệch +72 kg · +5.040.000₫" |
| Màu lệch | Dư: xanh. Thiếu: đỏ. Khớp hoặc chưa đếm: "—" | Như máy tính |
| Lệch lớn | \|lệch\| > 50% tồn sổ (sổ 0 thì đếm được gì cũng tính là lớn): dòng nền vàng, nhãn **"Lệch lớn"** | Như máy tính |
| Tổng (khi có ít nhất 1 dòng đếm) | **Tổng lệch tăng (n)** · **Tổng lệch giảm (n)** · **Tổng chênh lệch** (tiền); "n nguyên liệu lệch chưa có giá — không tính vào tiền" | Như máy tính |
| Nút | **"Hoàn thành"** (trước là "Ghi kiểm kê"); bên trái có "n dòng lệch lớn — kiểm tra lại số đếm." | Như máy tính |
| Xác nhận | Có dòng lệch lớn thì hiện hộp: *"Lệch lớn — kiểm tra lại số đếm: • Thịt: tồn kho 10 kg, thực tế 82 kg (lệch +72 kg). Vẫn hoàn thành kiểm kê?"* Hủy thì không ghi gì | Hộp của trình duyệt |

Giá trị lệch = SL lệch × giá vốn hiện tại theo đơn vị nhập, dùng cùng hàm `unitCost` với màn định lượng (giống KiotViet:
"giá vốn tại thời điểm tạo phiếu"). Server vẫn tính lại lệch theo tồn lúc bấm, như trước.

## Kế hoạch (25-01, một phần, làm trong phiên bằng TDD)

| Bước | File | Kiểm bằng |
|---|---|---|
| Hàm lệch / lệch lớn / tổng | `lib/inventory/count.ts` (mới): `countDiff`, `isBigDiff`, `countSummary`, `BIG_DIFF_RATIO = 0.5` | `tests/inventory/count.test.ts` (8 ca) |
| Màn kiểm kê | `components/admin/inventory/CountForm.tsx`, `inventory/count/page.tsx` | E2E P25 "B" |
| Tab Tồn kho | `inventory/stock/page.tsx` (mới), `InventoryTabs.tsx`, `inventory/today/page.tsx` → chuyển hướng | E2E P25 "A" |
| + Nhập hàng | `nhap-hang/moi/page.tsx` (thêm gợi ý P18 + danh sách lần trước), `ReceiptForm.tsx` (`prefill` → `lastIngredients`, nút mới) | E2E P25 "A", `goi-y-nhap.spec.ts`, `p20-nhap.spec.ts` |
| Dùng chung | `qtyLabel` chuyển vào `lib/inventory/types.ts` | `tsc` |

**Cạm bẫy đã biết:** `inventory_on_hand` lấy tồn đầu từ bản chốt sổ gần nhất. Dòng nhập ghi vào ngày đã chốt thì không hiện
ở tồn hôm nay, nên test phải ghi vào hôm nay.
