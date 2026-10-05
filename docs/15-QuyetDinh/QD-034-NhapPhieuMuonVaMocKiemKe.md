# QD-034 — Nhập phiếu muộn: thời gian nhập, kiểm kê là mốc khóa, tự chốt sau 7 ngày

**Ngày:** 05/10/2026 · **Trạng thái:** ĐÃ LÀM (chủ dự án chốt nguyên tắc + giao diện 05/10/2026) · `30-KeHoach/P34/34-01-SUMMARY.md`.
**Yêu cầu:** INV-18..24 · **Sửa:** QD-027 D4 (ngày vào kho), QD-017 D7 / INV-09 (lúc tự chốt), QD-031 D3 (hủy phiếu hủy, mẻ)

## Bối cảnh

Quán nhập thêm hàng giữa ngày nhưng cuối ngày hoặc hôm sau mới ghi phiếu. Hiện nay:

- Phiếu vào kho ngày bấm Hoàn thành.
- Kiểm kê lưu độ lệch tại lúc đếm.
- Sáng hôm sau, ngày hôm qua tự chốt.

Hậu quả: phiếu ghi sau kiểm kê bị **tính hai lần** (dư hôm nay, thiếu lần kiểm sau), và phiếu ghi hôm sau làm sai cả hai ngày.
Chủ dự án yêu cầu: "không muốn có sai số". Phân tích, nguồn đối thủ và nghiệp vụ chuẩn: `30-KeHoach/P34/00-TongQuan.md`.

## Quyết định

| # | Việc | Chọn | Vì sao | Bị loại |
|---|---|---|---|---|
| D1 | Ngày giờ của phiếu nhập | Một ô **"Thời gian nhập"** (ngày + giờ hàng về), thay "Ngày chứng từ". Sổ kho, công nợ, phiếu chi đi kèm theo nó. Không ở tương lai, không vào ngày đã chốt. Mặc định "Lúc bấm Hoàn thành". Không sửa sau khi Hoàn thành (sai thì Hủy bỏ + Sao chép) | Chủ dự án chọn như KiotViet ("Ngày/giờ nhập hàng") và iPOS ("Thời gian nhập"). Luật Kế toán Đ.26 và mẫu 01-VT: ghi theo ngày nhập kho thật. Khóa sửa giờ như mặc định KiotViet | Giữ "Ngày chứng từ" và thêm ô ngày vào kho riêng. Sapo: không có ô ngày |
| D2 | Phiếu ghi muộn so với kiểm kê | **Kiểm kê đã hoàn thành là mốc khóa** theo từng nguyên liệu. Thay đổi có thời gian ≤ lúc kiểm kê bị chặn: Hoàn thành / Hủy bỏ phiếu nhập, Hủy phiếu hủy, Hủy mẻ, Hoàn thành phiếu kiểm khác. Muốn ghi: **Hủy phiếu kiểm kê → ghi → Hoàn thành lại** | Chủ dự án chốt theo iPOS, bên duy nhất có quy tắc bảo đảm không sai. Hợp nguyên tắc cut-off kiểm kê (ISA 501 A8) | Tự tính lại độ lệch khi có phiếu muộn (khác mọi đối thủ, người dùng không thấy chuyện gì xảy ra). Cảnh báo rồi cho ghi (CUKCUK; vẫn sai) |
| D3 | Hoàn thành lại phiếu kiểm kê | Giữ **số đếm, đơn vị, thời gian kiểm kê cũ**; độ lệch = số đếm − tồn sổ **tại thời gian kiểm kê**. Phiếu kiểm kê có mã KK…, ghi "phiếu nhập cuối trước lúc đếm" | Số đếm vẫn đúng tại lúc đếm, chỉ sổ là sai. iPOS: "Hủy → Sao chép lại", kiểm kê lùi ngày ghi theo ngày đó. Ghi phiếu nhập cuối là bằng chứng cut-off | Bắt đếm lại (hàng đã bán, không đếm lại được) |
| D4 | Lúc tự chốt sổ | Ngày D tự chốt khi hôm nay ≥ **D + 7**. Ngày chưa chốt tính tại chỗ, báo cáo ghi "chưa chốt". Ngày đã chốt vẫn bất biến (QD-017 D7) | Chủ dự án chọn 1 tuần. iPOS "khoá sau x ngày"; nhà hàng khóa tháng thường mất 5–7 ngày | Chốt sáng hôm sau (nay). Chủ quán tự bấm (quên thì sổ không bao giờ chốt). 2 ngày |
| D5 | Tồn âm | Không chặn bán (giữ QD-017 C2). Kiểm kê nguyên liệu đang âm thì hỏi lại. Ngày sắp tự chốt mà còn âm thì nhắc ở đầu Kho hàng | Kế toán: âm giữa kỳ được, cuối kỳ không; nguyên nhân thường là sót phiếu nhập | Chặn chốt khi còn âm (sổ không chốt được). Chặn bán (khác QD-017 C2) |

## Hệ quả

- **Có migration**, theo hướng ở `30-KeHoach/P34/00-TongQuan.md` §Phạm vi kỹ thuật:
  - `stock_entries.occurred_at`; sổ tính theo nó thay vì `created_at`.
  - `purchase_receipts.received_at`.
  - Bảng phiếu kiểm kê, phải vào ma trận RLS TENANT-05.
  - Một hàm kiểm mốc khóa dùng chung.
- QD-027 D4 đổi: `business_date` của phiếu nhập = ngày VN của Thời gian nhập, không còn là ngày Hoàn thành.
- QD-031 D3 đổi: Hủy phiếu hủy và Hủy mẻ áp dụng cho các ngày chưa chốt (7 ngày), có kiểm mốc khóa.
- Sửa định lượng đổi số của cả 7 ngày chưa chốt. "% dùng được" chậm 7 ngày.
- Quán không kiểm kê thì không có mốc khóa. Lùi giờ trong 7 ngày luôn được.
