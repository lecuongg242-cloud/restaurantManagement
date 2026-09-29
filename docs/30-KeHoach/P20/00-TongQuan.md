# P20 — Mua hàng, nhà cung cấp, công nợ, sổ quỹ

> Lập 27/09/2026 (khung phạm vi). **Nghiên cứu + chốt phạm vi 29/09/2026.** Plan là hợp đồng + nghiệm thu, không phải bản
> nháp code. **Trạng thái: SẴN SÀNG LÀM** 20-01 → 20-04.
> Quyết định: `15-QuyetDinh/QD-027` · Yêu cầu: PURCH-01..06, CASH-01..04, REPORT-20 · Nghiên cứu chi tiết (đối thủ, pháp lý
> TT 152/2025, hiện trạng code): `00-NghienCuu-NghiepVu.md`.
> Phụ thuộc: P10 (kho, nhập buổi sáng, chốt sổ ngày), P13 (tài khoản ngân hàng của quán), P15 (báo cáo chuỗi),
> P18 18-02 (gợi ý nhập).

## Vì sao P20 là việc này

Chủ quán đã thấy **lãi gộp từng món** (P10) nhưng chưa thấy **lãi thật của quán**: thuê nhà, lương, điện nước, gas nằm
ngoài hệ thống; tiền nợ mối bia, mối thịt ghi sổ tay. Đối thủ nào cũng có "Nhà cung cấp", "Nhập hàng", "Sổ quỹ" và báo
cáo "Kết quả kinh doanh". Từ 2026 hộ doanh thu > 3 tỷ **bắt buộc** tính thuế trên (doanh thu − chi phí) và giữ sổ chi phí,
sổ tiền (TT 152/2025) — quán cỡ qt-food (~3,7 tỷ/năm) thuộc nhóm này nếu là hộ kinh doanh.

**P20 kết thúc bằng: chủ quán biết đang nợ mối nào bao nhiêu, két và tài khoản còn bao nhiêu, tháng này lãi hay lỗ sau
mọi chi phí.**

## Đối thủ làm thế nào (tra 29/09/2026)

Nguồn: trang hướng dẫn chính thức, đọc toàn văn hoặc qua công cụ tóm tắt; **(?)** là chưa xác minh. Chi tiết từng màn,
chữ trên nút: `00-NghienCuu-NghiepVu.md` §2.

| Việc | KiotViet FnB | Sapo FnB | CUKCUK | iPOS | POS365 |
|---|---|---|---|---|---|
| Nhà cung cấp | "+ Nhà cung cấp"; cột **"Tổng mua"**, **"Nợ cần trả hiện tại"**; tab "Nợ cần trả NCC" [1][2] | Gọi là "đối tác", cột "Công nợ phải trả" [6] | Danh mục NCC, nhập Excel, nợ đầu kỳ [10] | "Nguồn cung cấp"; bảng giá theo NCC [15] | Cột "Tổng giao dịch", "Dư nợ"; "In sổ nợ" [18] |
| Phiếu nhập | **"Lưu tạm" / "Hoàn thành"**; "Cần trả NCC", "Tiền trả NCC", **"Tính vào công nợ"**; sửa = **Hủy bỏ + Sao chép** [3] | "Đặt hàng" / "Đặt hàng & nhập kho"; hủy không hoàn giá vốn; app **không** nhập [7] | "Ghi nợ NCC" / "Thanh toán ngay"; hạn sử dụng trên dòng [11] | NCC không bắt buộc; "Nhập mua hàng" [15] | "Lưu" / "Hoàn thành"; chỉ xóa phiếu đã hủy [19] |
| Đặt hàng nhập (PO) | Có (tài liệu bán lẻ; FnB ?) [4] | Không | Có + bếp **"Báo hàng"** [12] | Có [16] | Không |
| Trả hàng nhập | Có [5] | Không | Có | "Trả lại" | Có |
| Trả nợ NCC | "Thanh toán" → **"Tạo phiếu chi"**; "Điều chỉnh" cho nợ đầu kỳ [2] | "Trả nợ", **tích chọn phiếu** [6] | Tự phân bổ **phiếu cũ trước** hoặc tích chọn [13] | "Thanh toán" chọn quỹ | Phiếu chi trong chi tiết NCC |
| Tuổi nợ | Không | Không | Không | Không | Không |
| Sổ quỹ | "Sổ quỹ": Tiền mặt / Ngân hàng / **Tổng quỹ**; "+ Phiếu thu", "+ Phiếu chi"; ô **"Hạch toán vào kết quả kinh doanh"**; hủy = vô hiệu [8] | "Thu chi"; phiếu không sửa, chỉ hủy [9] | "Quỹ tiền mặt", "Quỹ tiền gửi"; thu ngân **"Chi tiền mặt"** trong ca [14] | "Quỹ tiền", chi phí phân bổ tháng [17] | "Thu & Chi": Tổng thu, Tổng chi, Tồn quỹ [20] |
| Lãi lỗ | DT thuần − giá vốn + thu khác − chi khác [8] | DT thuần − giá vốn − chi phí + thu nhập = LN trước thuế [9] | Chi phí NVL = giá trị xuất kho; trả nợ không là chi phí [14] | Có biểu đồ 13 tháng [17] | Có (?) |
| Chuyển hàng | **Phiếu tạm → Đang chuyển → Đã nhận**; bên nhận sửa "Số lượng nhận", thiếu hoàn về kho gửi; giá chuyển = giá vốn [5b] | Hai phiếu rời | Hai phiếu, nối "Chọn chứng từ" | Yêu cầu → xuất → nhập | "Chuyển hàng nội bộ" |
| Sổ HKD TT 152 | "Sổ kế toán": khai cách tính thuế → hiện đúng bộ sổ, **"Tải sổ"**, "Khóa sổ" [21] | (?) | Đủ S1a–S3a; "Rà soát chi phí" [22] | (?) | (?) |
| Vai trò | Quản trị chi nhánh / Nhân viên kho / Thu ngân + tự tạo | Tích quyền rời | Quản lý kho / nhà hàng / chuỗi | Chức vụ + quyền | Quyền từng nhân viên |

**Điểm chung (làm theo):** (1) phiếu nhập là chứng từ trung tâm, NCC trên phiếu, trả ngay một phần, phần thiếu thành nợ;
(2) phiếu đã hoàn thành không sửa số — hủy rồi sao chép; (3) mọi dòng tiền vào sổ quỹ bằng phiếu thu/chi, trả nợ sinh
phiếu chi; (4) chỉ phiếu có ô "hạch toán" vào lãi lỗ; (5) danh sách NCC có cột nợ hiện tại; (6) không tuổi nợ, không vai
trò kế toán riêng.

[1] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/nha-cung-cap/ ·
[2] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-nha-cung-cap/quan-ly-no-can-tra-nha-cung-cap/ ·
[3] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-giao-dich/nhap-hang/ ·
[4] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/quan-ly-giao-dich/dat-hang-nhap-web-retail/ ·
[5] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-giao-dich/tra-hang-nhap/ ·
[5b] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-kho-hang/chuyen-hang/ ·
[6] https://help.sapo.vn/xem-nha-cung-cap-va-thanh-toan-cong-no-nha-cung-cap-tren-sapo-fnb ·
[7] https://help.sapo.vn/tao-phieu-nhap-kho-nguyen-lieu-mat-hang-tren-trang-quan-tri-sapo-fnb ·
[8] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-so-quy/so-quy/ ·
[9] https://help.sapo.vn/tao-phieu-thu-chi-tren-trang-quan-tri-sapo-fnb , https://help.sapo.vn/bao-cao-tai-chinh-tren-quan-tri-sapo-fnb ·
[10] https://helpv2.cukcuk.vn/vi/kb/1060800_them_ncc ·
[11] https://helpv2.cukcuk.vn/vi/kb/1020300_nhap_hang ·
[12] https://helpv2.cukcuk.vn/vi/kb/lap-phieu-bao-hang ·
[13] https://helpv2.cukcuk.vn/vi/kb/1020400_tra_no_ncc ·
[14] https://helpv2.cukcuk.vn/vi/kb/1040000_chi_tien_mat , https://helpv2.cukcuk.vn/vi/kb/1090000_tong_hop_chi_phi ·
[15] https://huongdan.ipos.vn/docs/huong-dan-su-dung-ipos-inventory/van-hanh/nhap-hang/ ·
[16] https://huongdan.ipos.vn/docs/huong-dan-su-dung-ipos-inventory/van-hanh/luong-van-hanh-mua-hang-po-den-nha-cung-cap-ngoai/ ·
[17] https://huongdan.ipos.vn/docs/tai-lieu-van-hanh-ke-toan-vo/ ·
[18] https://www.pos365.vn/docs/quan-ly-nha-cung-cap-2297.html ·
[19] https://www.pos365.vn/docs/them-moi-phieu-nhap-hang-2344.html ·
[20] https://www.pos365.vn/docs/thu-chi-2377.html ·
[21] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ke-toan-hkd-so-ke-toan/so-ke-toan/ ·
[22] https://helpv2.cukcuk.vn/vi/kb/s2c-hkd-mobile

**Chỗ khung phạm vi 27/09 khác đối thủ (đề xuất sửa):**

| Khung 27/09 | Đối thủ | Đề xuất |
|---|---|---|
| "Đơn mua hàng → nhận hàng → sinh phiếu nhập" | PO riêng chỉ 3/5; Sapo FnB, POS365 dùng **phiếu nhập "Lưu tạm"** làm đặt hàng | Phiếu nhập có trạng thái "Phiếu tạm"; gợi ý P18 điền vào phiếu tạm. PO riêng để sau |
| Công nợ "tuổi nợ" | 0/5 có | Bỏ |
| NCC "giá gần nhất" | Chỉ iPOS có bảng giá theo NCC | Hiện giá lần nhập gần nhất trên dòng phiếu (đã có `last_unit_cost`), không làm bảng giá |

## Chủ dự án đã chốt (29/09/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| C1 | Hộ kinh doanh hay công ty; sổ S2c/S2e | **Công ty / chưa rõ — sổ để sau.** Phiếu vẫn ghi mục chi phí + chứng từ gốc để xuất sổ sau |
| C2 | Phiếu nhập | **Gộp "Nhập hôm nay" thành phiếu nhập** |
| C3 | Làm luôn trong P20 | **Để sau cả bốn:** chuyển hàng giữa chi nhánh, thu ngân chi tiền trong ca, trả hàng nhập, PO riêng |
| C4 | Mặc định | **Đồng ý:** không vai trò mới; bỏ tuổi nợ; lãi lỗ lấy giá vốn P10, không định lượng thì tiền mua kèm nhãn |
| C5 | Quyền | Quản lý nhập hàng, ghi phiếu thu/chi, trả nợ, xem sổ quỹ; **chỉ chủ quán xem "Kết quả kinh doanh"** |
| C6 | Quán không dùng kho | Khai mặt hàng như nguyên liệu ("Bia", "Gas"), không cần định lượng |
| C7 | Tiền bán hàng trong sổ quỹ | Một dòng mỗi ngày mỗi phương thức (khác KiotViet — đồng ý) |
| C8 | Ngân hàng | Một tài khoản (khác KiotViet — đồng ý) |
| C9 | Khai thuế | Cài đặt → **"Thuế nộp nhà nước"**: nhiều dòng (tên, %, trên doanh thu hoặc lợi nhuận); Kết quả kinh doanh ra **Lợi nhuận sau thuế** (plan 20-04) |

## Các plan

| Plan | Yêu cầu | Phụ thuộc | Giá trị khi dừng ở đây |
|---|---|---|---|
| [20-01](20-01-PLAN.md) Nhà cung cấp + phiếu nhập | PURCH-01..04, 06 | P10 | Mỗi lần nhập có chứng từ `PN…`, biết mua của ai bao nhiêu, trả ngay sinh phiếu chi |
| [20-02](20-02-PLAN.md) Sổ quỹ | CASH-01..04 | 20-01 | Chủ quán thấy tồn quỹ tiền mặt / ngân hàng, ghi được thuê nhà, lương, điện nước |
| [20-03](20-03-PLAN.md) Công nợ NCC | PURCH-05 | 20-01, 20-02 | Biết nợ mối nào bao nhiêu, ở phiếu nào; trả một phần; nhập nợ cũ |
| [20-04](20-04-PLAN.md) Kết quả kinh doanh | REPORT-20 | 20-02, P10 10-04 | **Lãi thật của quán**, nối được về KPI doanh thu |

Chạy tuần tự (mỗi plan dựng trên bảng của plan trước). 20-03 và 20-04 cùng chỉ cần 20-02, làm song song được.

| Plan | Migration | Bảng mới | Ma trận RLS |
|---|---|---|---|
| 20-01 | `0076_purchasing` | `doc_counters`, `suppliers`, `purchase_receipts`, `purchase_receipt_lines`, `cash_vouchers`; cột `stock_entries.purchase_receipt_id` | 23 → 28 |
| 20-02 | `0077_cashbook` | `cash_categories`; cột phân loại + chứng từ gốc trên `cash_vouchers` | → 29 |
| 20-03 | `0078_supplier_debt` | `cash_voucher_allocations`, `supplier_debt_adjustments` | → 31 |
| 20-04 | `0079_report_pnl` | — (RPC báo cáo) | 31 |

## Không nằm trong P20 (để sau)

| Việc | Vì sao / khi nào |
|---|---|
| Sổ S2b/S2c/S2d/S2e-HKD, bảng kê 02/TNDN | C1; khi có khách cần. Dữ liệu đã sẵn từ 20-02; khoản nào được trừ do quán tự cấu hình, không chờ kế toán xác nhận |
| Chuyển hàng giữa chi nhánh / bếp trung tâm · thu ngân chi tiền trong ca · trả hàng nhập · PO riêng, bếp báo hàng · nhiều tài khoản ngân hàng | C3, C8 ⇒ **P22** (`30-KeHoach/P22/00-TongQuan.md`) |
| Ví điện tử | Chưa có yêu cầu |
| Nhóm NCC, Excel NCC, bảng giá NCC, tuổi nợ, công nợ khách | Không phải số đông / C4 |

## Phát hiện khi rà code

Chi tiết + dòng code: `00-NghienCuu-NghiepVu.md` §4. Những điểm quyết định cách làm:

- **Ghi sổ vào ngày đã chốt bị mất im lặng**: `inventory_on_hand` bỏ dòng có `business_date` ≤ ngày chốt (`0047:137`), mà
  chốt tự chạy tới hôm qua mỗi khi mở khu Nguyên liệu ⇒ **ngày chứng từ** (công nợ, sổ quỹ) tách khỏi **ngày vào kho**
  (luôn ngày VN lúc hoàn thành, tính ở server) — QD-027 D4.
- Thêm `kind` mới vào `stock_entries` phải sửa 2 CHECK + 2 RPC + payload chốt + `loadPrices` + `report_waste` ⇒ dùng lại
  `receipt` + cột `purchase_receipt_id`; hủy sau chốt = dòng `receipt` âm không giá (QD-027 D5).
- `ingredients` giữa chi nhánh **không nối** (không `source_id`) — ghi lại cho lúc làm chuyển hàng.
- Chưa có ca, két, phiếu thu/chi; `payments.method` chỉ `cash`/`transfer` ⇒ tiền bán hàng vào sổ quỹ bằng phép tính.
- Doanh thu thật (BILL-05) theo `bills_revenue.business_at`, lãi gộp P10 theo `paid_at` ⇒ lãi lỗ chọn một mốc, đối soát KPI.
- Bảng tiền dùng RLS `manager_tenants()`; mã phiếu cấp trong RPC có khóa + unique (khác `nextBillNo`).

## Ràng buộc xuyên suốt

- **qt-food đang bán thật; kho vẫn tắt mặc định (QD-017 D10).** Quán không dùng P20 thì POS, nhập buổi sáng, báo cáo y hệt.
- **Không chạm luồng tạo đơn và đóng bill** (`lib/orders/create-order.ts`, `lib/billing/` diff = 0).
- Mọi bảng mới: `tenant_id` + RLS + ma trận TENANT-05 + `schema-snapshot.json` (OPS-07). Ngày theo giờ VN, test `TZ=UTC`.
- Tiền là int VND; không log số tài khoản đầy đủ. Căn cước người bán chỉ lưu khi làm bảng kê 02/TNDN (PII tối thiểu).
