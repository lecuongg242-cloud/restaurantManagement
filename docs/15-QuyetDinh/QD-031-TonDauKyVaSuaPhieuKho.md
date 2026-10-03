# QD-031 — Tồn đầu kỳ, đơn vị khi kiểm kê, hủy phiếu hủy / mẻ ghi nhầm

**Ngày:** 03/10/2026 · **Trạng thái:** ĐÃ LÀM. Chủ dự án giao "tự triển khai hết" cho P1–P4 của P26 (03/10/2026).
**Kế hoạch:** `30-KeHoach/P26/` · **Yêu cầu:** INV-14..17 · **Liên quan:** QD-017 (kho, chốt sổ bất biến), QD-027 D5 (hủy
phiếu nhập)

## Bối cảnh

Khi thử luồng kho trên dữ liệu 7 ngày ở Phở Việt (P26), có bốn chỗ hở nghiệp vụ:

1. Không có chỗ khai hàng đang có sẵn lúc bắt đầu dùng kho. Kiểm kê từ sổ 0 thì thành "dư không giải thích", làm báo cáo bia ra −405.000₫ và che mất vụ mất 3 chai.
2. Bia khai "thùng = 24 chai" chỉ đếm được theo thùng, nên sổ ra chai lẻ (69,12).
3. Phiếu xuất hủy và mẻ chế biến ghi nhầm không sửa được.
4. Ô kiểm kê gõ số âm: màn hình coi như chưa đếm, nhưng server từ chối cả phiếu.

## Quyết định

| # | Việc | Chọn | Vì sao | Bị loại |
|---|---|---|---|---|
| D1 | Tồn đầu kỳ | Ô **"Tồn hiện có"** ở form nguyên liệu (thêm mới; sửa khi **chưa có dòng sổ nào**). Ghi **một dòng `receipt` không `purchase_receipt_id`**, `note = 'Tồn đầu kỳ'`, giá = "Giá gần nhất" ÷ hệ số, `business_date` hôm nay | Như Sapo ("Số lượng ban đầu"), KiotViet ("Tồn kho" khi tạo hàng) và CUKCUK (tách khỏi kiểm kê). `receipt` không vào hao hụt hay "% dùng được"; CHECK dấu đã cho dòng `receipt` dương không gắn phiếu (dòng nhập trước P20); `inventory_on_hand`, `inventory_day` và payload chốt không đổi | Thêm `kind = 'opening'` (phải sửa 2 CHECK, 2 RPC, payload chốt, `loadPrices`). Coi kiểm kê lần đầu là tồn đầu (đoán ý người dùng, khác đối thủ) |
| D2 | Đơn vị khi kiểm kê | Dòng nào có hệ số ≠ 1 thì có ô chọn **đơn vị nhập / đơn vị trừ kho**, mặc định đơn vị nhập. Server nhận `unit` từng dòng (`countToBase`) | KiotViet chọn đơn vị ngay trên dòng. Đếm theo đơn vị gốc thì không làm tròn | Chỉ đổi mặc định sang đơn vị gốc (quán quen đếm thịt theo kg) |
| D3 | Hủy phiếu hủy, mẻ | Nút **"Hủy"** (hỏi lại) ở "Phiếu hủy hôm nay" và "Mẻ hôm nay". Ngày chưa chốt thì **xóa** dòng sổ (mẻ: xóa `production_batches`, dòng sổ đi theo cascade). Ngày đã chốt thì từ chối | Như KiotViet Xuất hủy / Sản xuất → "Hủy". Cùng cách hủy phiếu nhập khi ngày chưa chốt (QD-027 D5). Màn chỉ hiện phiếu hôm nay nên không cần dòng ngược cho ngày đã chốt | Trạng thái "Đã hủy" giữ dòng (phải thêm cột, sửa mọi chỗ đọc sổ). Sửa số tại chỗ (KiotViet cũng không cho) |
| D4 | Ô kiểm kê gõ sai | Form và server dùng chung `parseCount`: trống = chưa đếm, sai = **không hợp lệ**. Dòng sai hiện "Số không hợp lệ" và chặn "Hoàn thành" | Không để mất số đếm của các dòng khác; người đếm biết đúng dòng sai | Lặng lẽ bỏ qua dòng sai (lệch sổ mà không ai biết) |

## Hệ quả

- Không có migration. RLS hiện có (`stock_entries`, `production_batches`: thành viên quán) đã cho phép xóa. Action kiểm thêm quyền owner/manager và ngày chưa chốt.
- "Lấy hàng lần trước" có thể gồm nguyên liệu vừa khai tồn đầu hôm qua, vì dòng tồn đầu là `receipt`. Chấp nhận được.
- Hủy phiếu hủy hay mẻ là xóa hẳn, không còn dấu vết. Muốn có lịch sử "Đã hủy" như KiotViet thì làm sau, cần cột trạng thái.
