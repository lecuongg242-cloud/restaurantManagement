# 03-02 SUMMARY — POS duyệt order QR + thêm món thay khách

> Thực thi 22/07/2026. Trạng thái: **CHỜ NGHIỆM THU** (checkpoint human-verify).
> Requirements: ORDER-02 (duyệt/từ chối realtime), ORDER-03 (thêm món thay khách → confirmed).

## File đã đổi / thêm
| File | Loại | Vai trò |
|---|---|---|
| `lib/orders/create-order.ts` | **refactor** | Tách `validateAndBuildLines` + `openOrJoinSession` + `insertOrderGraph` dùng chung; thêm `createStaffOrder` (source=staff, confirmed). `createQrOrder` giữ nguyên hành vi. |
| `lib/orders/pos.ts` | thêm | `getPosSnapshot(tenantId)` — khu vực + bàn + order chờ duyệt + phiên mở kèm món (phiên RLS). |
| `app/r/[slug]/pos/actions.ts` | thêm | `approveOrder/rejectOrder/serveItem/closeSession/createStaffOrderAction` — guard role + máy trạng thái + broadcast. |
| `app/r/[slug]/pos/page.tsx` | sửa | Guard canAccess('pos') + snapshot + menu → PosBoard (thay placeholder P1). |
| `components/staff/StationScreen.tsx` | sửa | Nhận `children` (chèn board); owner/manager thao tác như chính họ (không cần PIN). |
| `components/pos/PosBoard.tsx` | thêm | Orchestrator + realtime (postgres_changes orders/order_items/tables → `router.refresh()` debounce 400ms). |
| `components/pos/TableMap.tsx` | thêm | Tab khu vực + table-tile 4 màu status + badge món chưa phục vụ. |
| `components/pos/PendingOrdersDrawer.tsx` | thêm | Drawer chờ duyệt (vaul phải) + Duyệt / Từ chối (lý do bắt buộc). |
| `components/pos/OrderPanel.tsx` | thêm | Panel phiên bàn: món + trạng thái + phục vụ + đóng phiên. |
| `components/pos/AddItemsSheet.tsx` | thêm | Thêm món thay khách (tái dùng ModifierSheet/QtyStepper) → createStaffOrderAction. |

## Bằng chứng (tự động, chạy thật)
**Build/lint:** `tsc --noEmit` sạch; `next lint` 0 warning; `next build` OK (route `/pos` 8.97 kB).

**Regression 03-01 sau refactor create-order** (API thật, dev server):
```
valid  → 200 {orderId}      empty → 400 "Giỏ hàng đang trống."
badtok → 400 "Mã bàn không hợp lệ…"   track → 200 status=pending_confirm
```
→ Refactor KHÔNG phá luồng khách.

**POS guard:** GET `/r/pho-viet/pos` chưa đăng nhập → **307 redirect** login.

**Embedded query + máy trạng thái** (supabase-js REST + SQL thật trên remote):
```
EMBED  → order_items trả về dạng mảng lồng đúng (getPosSnapshot OK)
APPROVE → pending_confirm → confirmed + confirmed_at set
SERVE   → mọi item served ⇒ order roll-up = served
CLOSE   → guard chặn khi còn món; đóng xong: session=closed, table=available
```
Dữ liệu test đã dọn sạch (0 order, 0 phiên, 0 bàn occupied).

## Cam kết must_haves
- [x] Sơ đồ bàn theo khu vực, 4 màu status; badge món chưa phục vụ (realtime qua refresh).
- [x] Order QR pending_confirm ở drawer; Duyệt → confirmed (+confirmed_at, confirmed_by); Từ chối → cancelled + lý do bắt buộc.
- [x] Thêm món thay khách → source=staff, vào thẳng confirmed (bỏ duyệt); validate/snapshot **dùng chung** code với luồng khách.
- [x] Phục vụ mức món (ready→served); Đóng phiên thủ công (chỉ khi mọi món served/cancelled) → bàn available.
- [x] Mọi action đổi trạng thái gọi `broadcastOrderStatus` → khách thấy realtime.

## Sửa sau verify E2E (22/07/2026)
- **Bug**: order `served` bị loại khỏi `getPosSnapshot` (chỉ lấy pending/confirmed/preparing/ready) → sau khi phục vụ hết món, panel trống → **"Đóng phiên" disable, không đóng được phiên**. E2E Playwright phát hiện.
- **Fix** (`lib/orders/pos.ts`): thêm `served` vào `ACTIVE_STATUSES` — order đã phục vụ vẫn hiện trong panel tới khi đóng phiên (đúng luồng đóng bill P4). KDS/drawer không đổi.

## Chuyển P4 (ghi rõ theo plan)
- **Đóng phiên khi thanh toán** (phần còn lại của TABLE-02) → P4. P3 chỉ đóng phiên **thủ công** trên POS.

## Còn lại cho manual verify (checkpoint — cần 2 cửa sổ)
1. B (điện thoại) gửi order → A (POS) badge "Chờ duyệt" tăng + drawer hiện **≤3s không reload**; bàn → occupied.
2. Duyệt → khách thấy "Đã xác nhận" realtime (broadcast). Từ chối bỏ trống lý do → chặn; nhập lý do → khách thấy đơn hủy.
3. Bàn trống → "Thêm món" (món có Size) → order confirmed ngay, không qua chờ duyệt.
4. (Chờ 03-03 KDS để item ready) → "Đã phục vụ" → served → "Đóng phiên" → available.
5. RLS: owner Bún Bò không thấy bàn/order Phở Việt.
