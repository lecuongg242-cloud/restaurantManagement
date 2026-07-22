# 04-04 SUMMARY — Thanh toán + đóng bill + đóng phiên + in hóa đơn 80mm

**Ngày:** 22/07/2026 · **Trạng thái:** Code hoàn tất, chờ checkpoint human-verify (test trình duyệt).
**Yêu cầu:** BILL-04, PRINT-03, TABLE-02 (phần đóng khi thanh toán). Không migration mới (bảng `payments` ở 0012).

## File đã đổi
| File | Vai trò |
|---|---|
| `lib/billing/bill.ts` | `payBill` (thu = total, con chia đều → cha paid khi đủ) + `closeSessionIfSettled` (mọi order_item của phiên trong bill paid → đóng phiên + bàn available) |
| `lib/billing/receipt-view.ts` | **Mới** — `buildReceiptView` (tenant+logo, bàn/bill_no, dòng món, giảm/phí/VAT, tổng, payment, footer) |
| `lib/print/adapter.ts` | Implement `printReceipt` (mở `/print/receipt/[billId]`) + type `PrintReceiptArgs`; bỏ `BillView` stub (hết ném lỗi "P4") |
| `app/r/[slug]/print/receipt/[billId]/page.tsx` | **Mới** — route in, guard POS, dựng ReceiptDoc, ?w=58\|80 |
| `app/r/[slug]/print/receipt/actions.ts` | **Mới** — `logReceiptPrint` → print_jobs type=receipt |
| `components/print/ReceiptDoc.tsx` | **Mới** — hóa đơn 58/80mm JetBrains Mono đen trắng, auto-print + toolbar khổ |
| `components/pos/PaymentDialog.tsx` | **Mới** — chọn mặt/CK, tiền mặt nhập khách đưa + mệnh giá nhanh → tiền thối; xong → In hóa đơn + Xong |
| `app/r/[slug]/pos/actions.ts` | `payBillAction` (trả tiền thối + danh sách bill mới) |
| `components/pos/BillPanel.tsx` | Bật "Thu tiền" (bill thường/gộp/con); "In lại hóa đơn" khi paid; render PaymentDialog |
| `components/pos/PosBoard.tsx` | `doPay` (payBillAction) + `doPrintReceipt` (getPrintAdapter().printReceipt) |

## Logic then chốt
- **Thu tiền** = ghi `payments` (method cash/transfer, amount=total) + bill `paid` + `paid_at`/`closed_by`. Chuyển khoản chỉ ghi nhận (QD D-P4-1, không QR). Tiền trả lại (mặt) = khách đưa − total.
- **Con chia đều**: thu từng con; khi **mọi con paid → cha paid** (cha không thu trực tiếp). Doanh thu đếm con (04-05).
- **Đóng phiên (TABLE-02)**: sau paid → `closeSessionIfSettled` cho mọi phiên liên quan (kể cả gộp bàn): nếu **mọi order_item (≠cancelled) của phiên nằm trong bill 'paid'** → phiên `closed` + bàn `available`.
- **Bill paid khóa**: `loadOpenBill`/`payBill` chặn thu/tách/điều chỉnh lại; **in lại hóa đơn** vẫn được.
- **In hóa đơn 80mm** (PRINT-03): §7 đủ mục — tên+logo NH, bàn, bill_no, ngày giờ, món+đơn giá+thành tiền, giảm giá/phí/VAT, TỔNG, phương thức + tiền thối, footer. Con chia đều: in mô tả phần chia + tổng. Ghi `print_jobs` type=receipt.

## Bằng chứng (test logic)
- `npx tsc --noEmit` → **0 lỗi**. `npx next lint` → **✔ sạch**. `vitest tests/billing` → **15/15** (công thức nền).
- DB-orchestration (payBill/close) theo pattern đã kiểm 04-01/02; nghiệm thu đóng bill/đóng phiên/hóa đơn ở checkpoint frontend.

## Checkpoint (chờ human-verify)
`04-04-PLAN.md`: thu mặt (thối đúng) / CK; đóng bill ≤5s → bàn về available; in hóa đơn 80mm đủ mục không tràn (PDF); thu từng phần chia đều → khi đủ, phiên đóng; bill paid không tách/điều chỉnh, in lại được.
