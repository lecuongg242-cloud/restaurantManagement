# 04-03 SUMMARY — Điều chỉnh bill (giảm giá + phí + VAT, PIN)

**Ngày:** 22/07/2026 · **Trạng thái:** Code hoàn tất, chờ checkpoint human-verify (test trình duyệt).
**Yêu cầu:** BILL-03.

## Phạm vi (điều chỉnh so với plan)
- **Làm:** giảm giá (số tiền/%) + sửa %phí phục vụ + %VAT trên từng hóa đơn, xem trước tổng realtime; **giảm giá cần PIN manager/cashier** (D9), tôn trọng `settings.allow_discount`.
- **Bỏ "void dòng bill"** khỏi 04-03: không nằm trong BILL-03 và mâu thuẫn cơ chế đồng bộ bill (xóa `bill_items` → lần "Tính tiền" sau tự thêm lại vì order_item thành "chưa phân bổ"). Comp món dùng **hủy món của P3** (trước khi phục vụ) hoặc giảm giá. Tránh thêm migration.
- **Không migration mới** (dùng cột `discount_*`, `service_charge_pct`, `vat_pct` của 0012).

## File đã đổi
| File | Vai trò |
|---|---|
| `lib/billing/bill.ts` | `applyBillAdjustment` (giảm giá + pct, guard `allow_discount`) + `setBillCharges` (chỉ pct) + `clampPct` |
| `app/r/[slug]/pos/actions.ts` | `applyDiscountAction` (PIN manager/cashier khi giảm giá) + `setChargePctAction` (không PIN) |
| `components/pos/PinPrompt.tsx` | **Mới** — cổng PIN tái dùng `PinPad` + chọn người duyệt (như CancelItemDialog); owner/manager `canSkip` |
| `components/pos/AdjustBillDialog.tsx` | **Mới** — form giảm giá + %phí + %VAT + xem trước tổng (`computeBillTotals` client) |
| `components/pos/BillPanel.tsx` | Nút "Điều chỉnh" (bill thường mở) → AdjustBillDialog; nhận `allowDiscount/adjustStaff/canSkipPin` |
| `components/pos/PosBoard.tsx` | Handler `doApplyDiscount`/`doSetCharges`; truyền props điều chỉnh xuống BillPanel |
| `app/r/[slug]/pos/page.tsx` | Đọc `settings.allow_discount` → truyền `allowDiscount` cho PosBoard |

## Logic PIN (D9)
- **Áp giảm giá mới** (`discountType ≠ none` và có thay đổi): cần PIN vai trò **manager/cashier** — trừ khi phiên đăng nhập là **owner/manager** (bỏ qua PIN, thao tác như chính họ). PIN sai/sai quyền → thông báo chung `verifyPinForRoles`, **không áp**.
- **Gỡ giảm giá** (về none) / **chỉ đổi %phí/%VAT**: không cần PIN (`setChargePctAction`).
- **`allow_discount=false`**: AdjustBillDialog ẩn hẳn khối giảm giá; server cũng chặn (`applyBillAdjustment`).

## Bằng chứng (test logic)
- **`npx vitest run tests/billing` → 15/15 PASS** (công thức sau giảm giá đã phủ ở compute.test.ts: giảm 10% + VAT tính trên đã-giảm; giảm amount>subtotal→total tính đúng).
- **`npx tsc --noEmit` → 0 lỗi.**
- **`npx next lint` → ✔ No warnings or errors.**

## Trạng thái từng cam kết (must_haves)
| Cam kết | Trạng thái |
|---|---|
| Giảm giá số tiền/% → tổng tính lại đúng, cần PIN | ✅ code + `verifyPinForRoles(['manager','cashier'])` — chờ verify UI |
| Sửa %phí/%VAT trên bill (default settings) cập nhật tổng | ✅ `setBillCharges` (không PIN) |
| PIN sai/sai quyền → không áp, thông báo chung | ✅ tái dùng gate 03-04 |
| allow_discount=false → ẩn/chặn giảm giá | ✅ client ẩn + server chặn |

## Checkpoint (chờ human-verify)
Xem `04-03-PLAN.md`: giảm 10% (preview) → PIN waiter (sai quyền) → chặn; PIN manager → áp, VAT trên đã-giảm; đổi %VAT không cần PIN; tắt allow_discount → mất ô giảm giá.
