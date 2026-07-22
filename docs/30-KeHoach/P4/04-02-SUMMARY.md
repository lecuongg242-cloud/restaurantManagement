# 04-02 SUMMARY — Tách/gộp bill

**Ngày:** 22/07/2026 · **Trạng thái:** Code hoàn tất, chờ checkpoint human-verify (test trình duyệt).
**Yêu cầu:** BILL-02.

## Quyết định phát sinh (chốt với chủ dự án 22/07/2026)
**"Chia đều N người" = tạo N hóa đơn con riêng**, mỗi cái mang `total/N` (không gắn món cụ thể) —
theo lựa chọn của chủ dự án. Để không vỡ bất biến suất và không đếm trùng doanh thu:
- Thêm cột `bills.split_parent_id` (con) + `bills.split_count` (vỏ chứa) — **migration 0013**.
- Hóa đơn gốc sau khi chia thành "vỏ chứa" (`split_count=N`): **giữ `bill_items`** (order_items vẫn "đã phân bổ", không bị gom lại) nhưng **KHÔNG thu trực tiếp, KHÔNG tính doanh thu**.
- Doanh thu (04-05) = `bills.status='paid' AND split_count IS NULL` → loại vỏ chứa, đếm các phần con.
- Tách-theo-món + gộp-bàn vẫn **giữ bất biến `Σ qty_allocated per order_item = qty`** (chỉ di chuyển `bill_items`).

## File đã đổi
| File | Vai trò |
|---|---|
| `supabase/migrations/0013_bills_split.sql` | **Mới** — `split_parent_id` + `split_count` + index |
| `lib/billing/split.ts` | **Mới** — `planSplitByItems` (di chuyển suất) + `planSplitEvenly` (chia total, dư dồn cuối) THUẦN |
| `tests/billing/split.test.ts` | **Mới** — 8 ca (tách phần/hết suất/chặn vượt/chặn rỗng; chia đều chẵn/lẻ/n<2) |
| `lib/billing/types.ts` | `BillView` thêm `splitCount` + `splitParentId` |
| `lib/billing/bill.ts` | `getSessionBills`, `splitBillByItems`, `splitBillEvenly`, `mergeSessionsIntoBill` (giải phóng bill lẻ trước khi gộp) |
| `app/r/[slug]/pos/actions.ts` | `openBillAction` trả **danh sách** bill; thêm `splitByItemsAction`/`splitEvenlyAction`/`mergeTablesAction`/`refreshSessionBillsAction` |
| `components/pos/BillPanel.tsx` | Danh sách bill (thanh chọn) + chi tiết; nhãn vỏ/con; nút "Tách bill" + "Gộp bàn" |
| `components/pos/SplitBillDialog.tsx` | **Mới** — 2 tab: Theo món (stepper + xem trước 2 bill) / Chia đều (N 2..8 + xem trước mỗi phần) |
| `components/pos/MergeTablesDialog.tsx` | **Mới** — chọn bàn (bàn hiện tại luôn chọn) + xem trước tổng gộp |
| `components/pos/PosBoard.tsx` | State `bills[]` + handler tách/gộp + `mergeCandidates` (bàn khác đang mở có món) |

## Bằng chứng (test logic)
- **`npx vitest run tests/billing` → 15/15 PASS** (7 compute + 8 split). Gồm: tách chuyển hết suất→xóa dòng nguồn, chặn tách vượt/toàn bộ, chia đều lẻ 100.000/3 = [33.333, 33.333, **33.334**] (Σ=100.000).
- **`npx tsc --noEmit` → 0 lỗi.**
- **`npx next lint` → ✔ No warnings or errors.**
- **Migration 0013 áp Supabase dev**: `cột bills: {split_parent_id:1, split_count:1}` + ghi `schema_migrations` version `0013`.

## Trạng thái từng cam kết (must_haves)
| Cam kết | Trạng thái |
|---|---|
| Tách theo món → 2 bill, tổng suất giữ nguyên | ✅ code + `planSplitByItems` test — chờ verify UI/DB |
| Chia đều N → N hóa đơn con = total/N (dư dồn cuối) | ✅ code + `planSplitEvenly` test |
| Gộp nhiều bàn → 1 bill gom order_items các bàn | ✅ code (`mergeSessionsIntoBill` giải phóng bill lẻ rồi gom) |
| Bất biến Σ qty_allocated = qty (tách theo món/gộp) | ✅ đảm bảo bởi plan thuần + chỉ di chuyển bill_items |
| Chặn thao tác khi bill liên quan đã paid | ✅ `loadOpenBill` + guard merge (paid/split → từ chối) |

## Ghi chú kỹ thuật
- **getSessionBills**: gom bill trực thuộc phiên (gồm vỏ + con) + bill gộp chứa order_item của phiên; loại `void`.
- **DB-orchestration** (bill.ts) theo đúng pattern đã kiểm ở 04-01 (phiên station RLS, không service role). Phần toán học rủi ro nhất (phân bổ suất, chia phần) đã có unit test; luồng ghi DB nghiệm thu ở checkpoint frontend.
- **"Chia đều" hiện chỉ tạo cấu trúc + hiển thị**; thu tiền từng phần con làm ở 04-04.

## Checkpoint (chờ human-verify)
Xem `04-02-PLAN.md`: tách theo món → 2 bill (Σ suất giữ nguyên); chia đều 3 → 3 phần cộng lại = gốc; gộp 2 bàn → 1 bill; kiểm DB `Σ qty_allocated = qty`; thử thao tác trên bill đã paid → bị chặn.
