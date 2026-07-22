# QD-007 — Quyết định Dòng tiền (P4)

**Ngày:** 22/07/2026 · **Trạng thái:** CHỐT
**Nguồn:** Roadmap P4 · `10-BanThietKe/01-KyThuatChiTiet.md §3.5` (mô hình bill/payment + công thức tổng) · `20-DanhSachYeuCau` (BILL-01..05, PRINT-03, REPORT-01..03) · trao đổi với chủ dự án 22/07/2026.
**Bối cảnh:** Mô hình dữ liệu `bills / bill_items (phân bổ) / payments` + công thức tổng đã được thiết kế sẵn ở §3.5 — QD này KHÔNG thay đổi mô hình, chỉ chốt phạm vi và các điểm rẽ nhánh của P4.

## Các quyết định

### D-P4-1 — Thanh toán chuyển khoản = CHỈ ghi nhận (không sinh VietQR ở V1)
Thu ngân chọn phương thức (`cash` | `transfer`), nhập số tiền, xác nhận "đã nhận đủ" → đóng bill. **Không** sinh mã VietQR động, **không** cần cấu hình tài khoản ngân hàng ở V1.
- **Lý do:** đủ để đối soát chốt ca (REPORT-03 tách tiền mặt vs chuyển khoản); tránh thêm dependency sinh QR + cấu hình bank account + rủi ro sai số tài khoản khi chưa có nhu cầu xác nhận.
- **Chừa chỗ:** cột `payments.method` giữ enum mở rộng được; VietQR động là hạng mục V1.x (thêm `bank_account` vào settings + lib sinh EMVCo QR).

### D-P4-2 — Tách/gộp bill = LÀM ĐẦY ĐỦ theo §3.5 (không cắt MVP)
04-02 làm trọn: **tách theo món** (chọn order_items → bill A/B), **chia đều N người** (tạo N bill, phân bổ tự động), **gộp nhiều bàn** (1 bill gom order_items từ nhiều `table_session`).
- **Lý do:** chủ dự án cần đủ nghiệp vụ thật; mô hình `bill_items.qty_allocated` đã thiết kế sẵn để chịu tách/gộp — cắt bớt sẽ phải sửa lại luồng sau. Ràng buộc bất biến: `Σ qty_allocated per order_item = order_item.qty` (không thiếu/thừa suất khi đối chiếu).

### D-P4-3 — Giảm giá + void dòng bill = YÊU CẦU PIN manager/cashier tại chỗ (D9)
Áp giảm giá (số tiền/%) và xóa dòng khỏi bill cần PIN của membership vai trò **manager/cashier** ngay tại thao tác — nhất quán với hủy món ở P3 (QD-005 D9). Tôn trọng `settings.allow_discount`: tắt cờ này thì ẩn hẳn giảm giá.
- **Lý do:** giảm giá/void là điểm thất thoát tiền cao nhất; PIN gate + log `created_by`/`applied_by` cho đối chiếu. Không chặn thu ngân thao tác nhanh phần thu tiền thường (đóng bill không cần PIN riêng nếu không giảm giá).

### D-P4-4 — Dashboard báo cáo = thêm `recharts`
REPORT-01..03 trực quan bằng biểu đồ (`recharts`, ~90KB) cho doanh thu theo thời gian; bảng xếp hạng món + tách phương thức TT kèm số liệu.
- **Lý do:** chủ dự án chọn biểu đồ đẹp cho báo cáo. Đây là bề mặt **admin desktop** (không phải khách/POS tối ưu tải) nên chấp nhận dependency. Chỉ import trong khu `/admin/reports` (không ảnh hưởng bundle khách/POS).
- **Ràng buộc:** mốc thời gian theo **ngày Việt Nam (UTC+7)** để "doanh thu hôm nay" khớp ca; BILL-05 đối chiếu = Σ `bills` status=`paid` trong kỳ = tổng dashboard (test 20 bill).

### D-P4-5 — Bỏ "Đã phục vụ" mức từng món; vé KDS tự xóa khi thanh toán (sửa mô hình P3 QD-005/P3#7)
Người bấm POS không biết chắc món đã bưng ra bàn hay chưa → thao tác "Đã phục vụ" từng món là **bịa + thừa**. Bỏ hẳn nút "Đã phục vụ" (và action `serveItem`).
- **Tín hiệu hoàn tất thật = THANH TOÁN.** Khi thu đủ tiền một hóa đơn, `payBill` **tự đánh dấu** các `order_item` **đã thu đủ** (Σ `qty_allocated` trong bill 'paid' = `qty`, chịu cả tách theo món) sang `status='served'`.
- **Vé KDS tự rời** vì KDS vốn ẩn món `served`/`cancelled` — "vé tự xóa khi thanh toán" (lựa chọn của chủ dự án 22/07/2026). Vé nằm trên KDS suốt bữa (bếp đã nấu xong vẫn thấy) — chấp nhận ở V1.
- **Đóng phiên**: `served` giờ ⇔ "đã thu đủ", nên phiên **tự đóng** khi mọi món `served` (`closeSessionIfSettled`); nút "Đóng phiên" thủ công chỉ còn dùng cho phiên **toàn món đã hủy** (dọn bàn, không doanh thu). Không còn đóng phiên khi chưa thu tiền (vá thất thoát).
- **Thay P3 QD #7** ("vé tự ẩn khi POS bấm Đã phục vụ"): nay vé ẩn khi **thanh toán**. Enum `served` giữ nguyên (đổi nghĩa: "đã thu"). Badge POS đổi nhãn "Đã phục vụ" → "Đã thu".

## Ảnh hưởng
- **1 migration mới** `0012_bills_core.sql` (thuộc 04-01): `bills`, `bill_items`, `payments` + RLS `auth_tenant_ids()` + index. 04-02/03/04/05 KHÔNG thêm migration (dùng cột đã khai).
- **Không** cột settings mới (đã đủ `service_charge_pct/vat_pct/allow_discount/receipt_footer` từ 0001 + 02-04).
- Thêm dependency `recharts` (04-05).
- `PrintAdapter.printReceipt` (đang ném lỗi "P4") được implement ở 04-04 → route `/r/[slug]/print/receipt/[billId]` khổ 80mm.
- Đóng phiên bàn tự động khi mọi bill của phiên `paid` → đóng nốt phần còn lại của **TABLE-02** (P3 đã đóng phần mở/ghép, đóng thủ công).
