# 03-01 SUMMARY — Phiên bàn + gọi món QR (khách)

> Thực thi 22/07/2026. Trạng thái: **CHỜ NGHIỆM THU** (checkpoint human-verify).
> Requirements: TABLE-02 (mở/ghép), ORDER-01, MENU-02 (phần khách).

## File đã đổi / thêm
| File | Loại | Vai trò |
|---|---|---|
| `package.json` / `package-lock.json` | sửa | thêm `vaul@1.1.2` (bottom-sheet vuốt) + `motion@12.42` (animation) — CHỐT P3 |
| `supabase/migrations/0008_orders_core.sql` | thêm | table_sessions + orders + order_items + order_item_modifiers + RLS + index + realtime publication |
| `lib/orders/types.ts` | thêm | Order/OrderItem/TableSession/CartLine/OrderLineInput + status types |
| `lib/orders/status.ts` | thêm | ORDER_FLOW/ITEM_FLOW + canTransition + nhãn tiếng Việt + CUSTOMER_STEPPER |
| `lib/orders/customer-menu.ts` | thêm | getCustomerMenu(slug) + resolveTable(slug,token) — service role, cột công khai (D15) |
| `lib/orders/create-order.ts` | thêm | createQrOrder — validate server (available+min/max/required), snapshot, mở/ghép phiên, auto_send |
| `lib/orders/cart.ts` | thêm | formatVnd + unitPrice (client-safe) |
| `lib/orders/broadcast.ts` | thêm | broadcastOrderStatus + ORDER_CHANNEL (server đẩy pub/sub, không qua RLS) |
| `app/r/[slug]/api/order/route.ts` | thêm | POST tạo order (không cookie phiên) |
| `app/r/[slug]/api/order/[id]/route.ts` | thêm | GET theo dõi (scope slug→tenant, không rò dữ liệu) |
| `app/r/[slug]/(customer)/menu/page.tsx` | thêm | A1 — menu theo bàn / chế độ chỉ-xem |
| `app/r/[slug]/(customer)/order/[id]/page.tsx` | thêm | A5 — khung theo dõi |
| `components/customer/{MenuBrowser,ModifierSheet,CartSheet,QtyStepper,OrderStatusStepper}.tsx` | thêm | UI mobile-first + animation |

## Bằng chứng (tự động, đã chạy thật trên DB remote)
**Migration 0008** — áp lên Supabase remote + verify:
- 4 bảng tạo, **RLS bật cả 4**, realtime publication chứa `orders` + `order_items`.
- Partial-unique `uniq_table_session_open` present (1 phiên open/bàn).

**API e2e** (dev server thật, tenant `pho-viet`, bàn B1):
```
1) valid order  → 200 {orderId}
2) empty cart   → 400 "Giỏ hàng đang trống."
3) bad token    → 400 "Mã bàn không hợp lệ…"
4) bad qty      → 400 "Số lượng không hợp lệ cho món "phở ngựa"."
5) GET track    → 200 status=pending_confirm items=1 unit=50000
6) GET bad slug → 404
7) 2nd order    → 200 {orderId}
```
**DB sau e2e**:
- Bàn B1 → `occupied`; đúng **1 phiên open**.
- 2 order cùng bàn → **cùng `table_session_id`** (ghép phiên — TABLE-02).
- Snapshot đúng: `name_snapshot="phở ngựa"`, `unit_price_snapshot=50000`, `qty=2`.
- Dữ liệu test đã dọn sạch (0 order, 0 phiên, bàn về `available`).

**Build/lint**: `tsc --noEmit` sạch; `next lint` 0 warning; `next build` OK (route `/menu` 27.5kB, `/order/[id]` 67.4kB).

## Số chạm (ORDER-01 ≤6)
- Món có tùy chọn bắt buộc: chạm món (1) → chọn option (2) → Thêm vào giỏ (3) → Xem giỏ (4) → Gửi order (5) = **5 chạm**.
- Món không tùy chọn: chạm "+" (1) → Xem giỏ (2) → Gửi order (3) = **3 chạm**.

## Cam kết must_haves
- [x] Menu theo bàn + tên bàn; món hết mờ + "Hết" + không thêm được (MENU-02).
- [x] Sheet tùy chọn validate min/max/required (client) + SL + ghi chú; ≤6 chạm; token thiếu/sai → chỉ-xem.
- [x] Gửi order → orders `pending_confirm` (snapshot) + mở/ghép table_session; bàn `occupied`.
- [~] Trang theo dõi: GET ban đầu + subscribe Broadcast + fallback polling 15s — **cần verify realtime 2 cửa sổ** (broadcast do 03-02/03/04 gọi; ở plan này test bằng gọi thủ công `broadcastOrderStatus`).

## Quyết định P3 đã áp
- Design system bám QD-006 (Mistral cố định): token `bg-primary #fa520f`, Fraunces/Inter, KHÔNG override màu tenant.
- Broadcast (quyết định #1), giỏ = state client + sessionStorage, D15 anon qua service role, chỉ `dine_in`.

## Còn lại cho manual verify (checkpoint)
1. Cảm quan UI/animation trên mobile 360px (sheet vuốt, stagger, badge nảy, stepper pulse).
2. Realtime: mở trang theo dõi + gọi `broadcastOrderStatus(orderId)` từ server → stepper đổi ≤1s; ngắt mạng → fallback poll 15s.
3. `qr_order_auto_send=true` → order vào thẳng `confirmed` (hiện tenant pho-viet đang tắt = pending_confirm).
