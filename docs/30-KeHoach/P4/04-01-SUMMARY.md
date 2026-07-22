# 04-01 SUMMARY — Bill gộp cả bàn + công thức tổng

**Ngày:** 22/07/2026 · **Trạng thái:** Code hoàn tất, chờ checkpoint human-verify (test trình duyệt).
**Yêu cầu:** BILL-01, BILL-03 (phần công thức).

## File đã đổi
| File | Vai trò |
|---|---|
| `supabase/migrations/0012_bills_core.sql` | **Mới** — bills + bill_items + payments + RLS `auth_tenant_ids()` + index + publication `bills` |
| `lib/billing/types.ts` | **Mới** — Bill/BillItem/Payment/BillView/BillTotals/ComputeBillInput |
| `lib/billing/compute.ts` | **Mới** — `computeBillTotals()` THUẦN (subtotal→giảm→phí→VAT→tổng), integer VND |
| `tests/billing/compute.test.ts` | **Mới** — 7 ca (0%/VAT/phí+VAT/giảm>subtotal/làm tròn/subtotal=0/clamp) |
| `lib/billing/bill.ts` | **Mới** — `nextBillNo`, `openBillForSession` (idempotent), `recomputeBill`, `getBillView` |
| `lib/orders/pos.ts` | Thêm `openBill` (id/bill_no/total) vào `PosSession` (query bills status=open) |
| `app/r/[slug]/pos/actions.ts` | Thêm `openBillAction` + `getBillAction` (auth POS, trả `BillView`) |
| `components/pos/BillPanel.tsx` | **Mới** — modal hóa đơn: dòng món + khối tổng + nút "Thu tiền" (chừa 04-04) |
| `components/pos/OrderPanel.tsx` | Nút "Tính tiền" / "Xem hóa đơn #N" ở footer khi phiên có món |
| `components/pos/PosBoard.tsx` | State bill + `openBill()` handler + render BillPanel + realtime bảng `bills` |
| `vitest.config.ts` | Thêm alias `@/` để unit test dùng import như app (không ảnh hưởng RLS test) |

## Bằng chứng (test logic — theo yêu cầu chủ dự án tự test frontend)
- **`npx vitest run tests/billing` → 7/7 PASS.** Công thức khớp từng đồng, gồm ca giảm > subtotal (total=0), làm tròn lẻ 33.333×10%, clamp pct ngoài [0,100].
- **`npx tsc --noEmit` → 0 lỗi.**
- **`npx next lint` → ✔ No ESLint warnings or errors.**
- **Migration áp Supabase dev (pg trực tiếp, `POSTGRES_URL_NON_POOLING`)**: `bills trước: null` → `sau: {tables:3, pub:1, policies:3}` + ghi `schema_migrations` version `0012`. Bảng bills/bill_items/payments tạo, publication realtime có bills, 3 policy RLS bật.

## Trạng thái từng cam kết (must_haves)
| Cam kết | Trạng thái |
|---|---|
| POS "Tính tiền" → tạo/mở 1 bill gom order_item (≠cancelled) của phiên | ✅ code (`openBillForSession` + nút OrderPanel) — chờ verify UI |
| Màn bill: món + subtotal + phí + VAT + tổng theo settings | ✅ code (`BillPanel` + `getBillView`) — chờ verify UI |
| Công thức đúng từng đồng, khớp `compute.test.ts` | ✅ **7/7 test** |
| Gọi "Tính tiền" lần 2 sau khi gọi thêm → gom thêm, không nhân đôi | ✅ code idempotent (loại order_item đã phân bổ vào bill open/paid) — cần verify DB ở checkpoint |

## Quyết định triển khai (ghi lại)
- **Alias `@/` cho vitest**: unit test thuần cần import `@/lib/...`; thêm `resolve.alias` vào `vitest.config.ts` (glob include giữ nguyên `tests/**`). Test billing đặt ở `tests/billing/` (không phải `lib/billing/`) để khớp include hiện có.
- **Idempotent bằng "đã phân bổ"**: order_item nào đã có trong `bill_items` của bill status open|paid thì bỏ qua khi mở lại — không cần cột đánh dấu trên order_items.
- **`openBillForSession` chạy phiên station RLS** (không service role) — thao tác nội bộ nhân viên, cách ly tenant qua RLS.
- Nút "Thu tiền" trong BillPanel hiện **disabled** (nhãn "04-04") — hoàn thiện ở plan thu tiền.

## Checkpoint (chờ human-verify)
Xem `04-01-PLAN.md` mục checkpoint: duyệt 2 order phục vụ → "Tính tiền" → đối chiếu tổng với Phí 5%/VAT 8% → gọi thêm → mở lại kiểm không nhân đôi → kiểm DB 1 bill open + bill_no ngày.
