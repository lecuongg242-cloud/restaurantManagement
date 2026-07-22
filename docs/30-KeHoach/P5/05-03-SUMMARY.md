# 05-03 SUMMARY — Vòng đời tới hoàn tất + thu tiền + hóa đơn + doanh thu online

**Ngày:** 22/07/2026 · **Trạng thái:** Code hoàn tất; `tsc`/`lint` xanh. Chờ checkpoint human-verify.
**Yêu cầu:** ONLINE-01 (phần cuối — thu tiền + hoàn tất + doanh thu). **Không migration mới** (dùng `bills.online_order_id` từ 0015).

## File đã đổi/thêm
| File | Vai trò |
|---|---|
| `lib/billing/bill.ts` | **Mới** `openBillForOrder` (1 đơn = 1 bill, `table_session_id=null`, `online_order_id`, idempotent, không tách); `payBill` mở rộng: bill có `online_order_id` → đơn `completed` + broadcast |
| `lib/billing/receipt-view.ts` | Đơn online: nhãn "Mang về/Giao tận nơi" + dòng `contactLine` (tên · SĐT · địa chỉ) thay "Bàn" |
| `components/print/ReceiptDoc.tsx` | Render `contactLine` dưới dòng bàn/giờ |
| `app/r/[slug]/admin/(protected)/online/actions.ts` | **Mới** `openOnlineBillAction` (mở bill → BillView) + `payOnlineBillAction` (thu tiền → đơn completed) |
| `components/admin/online/OnlineQueue.tsx` | Nút "Thu tiền & hoàn tất" (đơn ready) → mở **PaymentDialog** (tái dùng 04-04); in hóa đơn qua `getPrintAdapter().printReceipt` |
| `lib/billing/reports.ts` | **Không đổi** — doanh thu lọc `paid` + `split_count IS NULL`, KHÔNG lọc theo phiên → bill online (session null) tự vào |

## Logic then chốt
- **openBillForOrder**: gom trọn `order_items` (≠cancelled) của 1 đơn online → 1 bill; `%phí/%VAT` từ settings; idempotent theo `online_order_id` (mở lại trả bill cũ). Không tách/gộp/chia đều.
- **payBill (mở rộng)**: sau khi `paid` + ghi `payments` + roll-up món `served`, nếu bill có `online_order_id` → đặt đơn `completed` + `broadcastOrderStatus` (khách thấy "Hoàn tất"). Đơn online không gắn phiên bàn nên `closeSessionIfSettled` không chạy.
- **Vé KDS tự rời** khi thanh toán (đơn `completed` + món `served` → KDS lọc bỏ) — nhất quán dine-in.
- **Hóa đơn 80mm** (PRINT-03): dùng lại `ReceiptDoc`; đơn online hiện nhãn kênh + tên/SĐT/địa chỉ khách thay dòng "Bàn".
- **Doanh thu (BILL-05 mở rộng)**: bill online `paid` (session null, `split_count` null) tự vào doanh thu / món bán chạy / theo phương thức — không cần sửa `reports.ts`.

## Sai khác có chủ đích so với PLAN
- **Không tạo `OnlineBillPanel.tsx` riêng**: mở thẳng **PaymentDialog** (04-04) từ nút "Thu tiền & hoàn tất". Danh sách món + tổng tạm tính đã hiển thị ngay trên thẻ đơn trong hàng đợi, nên không cần panel trung gian — ít file, tái dùng tối đa. (PaymentDialog hiện "Tổng phải thu" = tổng bill gồm phí/VAT; thẻ đơn hiện tạm tính món.)

## Bằng chứng (test tĩnh)
- `npx tsc --noEmit` → **0 lỗi**. `npx next lint` → **✔ No ESLint warnings or errors**.
- Ghi DB (mở bill/thu tiền/hoàn tất) nghiệm thu ở checkpoint frontend.

## Việc còn lại trước checkpoint
- **Không cần migration mới** (0015 đã áp ở 05-02). Chỉ **build lại / `next dev`** rồi chạy checkpoint 8 bước ở `05-03-PLAN.md`.

## Checkpoint (chờ human-verify)
`05-03-PLAN.md`: đơn ready → "Thu tiền & hoàn tất" → PaymentDialog (tổng đúng phí/VAT) → thu mặt (thối đúng)/CK → đơn "Hoàn tất" rời hàng đợi + khách thấy "Hoàn tất" (realtime) → in hóa đơn 80mm (nhãn kênh + contact, giao hiện địa chỉ) → `/admin/reports` doanh thu GỒM đơn online, khớp tay → RLS cách ly tenant.
