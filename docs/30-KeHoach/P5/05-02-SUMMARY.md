# 05-02 SUMMARY — Đặt món online: tạo đơn + duyệt + bếp + theo dõi

**Ngày:** 22/07/2026 · **Trạng thái:** Code hoàn tất; `tsc`/`lint` xanh. Chờ **áp migration 0015** + checkpoint human-verify.
**Yêu cầu:** ONLINE-01 (phần tạo/duyệt/bếp/theo dõi; thu tiền + hoàn tất ở 05-03).

## File đã đổi/thêm
| File | Vai trò |
|---|---|
| `supabase/migrations/0015_online_orders.sql` | **Mới** — `orders.source` thêm `'online'`; index `orders(tenant_id,channel,status)`; cột `bills.online_order_id` + index (cho 05-03) |
| `lib/orders/create-order.ts` | `insertOrderGraph` tham số hóa `channel` + `sessionId` nullable + `source` (thêm 'online'); export `validateAndBuildLines`/`insertOrderGraph`; 2 caller cũ truyền `channel:'dine_in'` |
| `lib/orders/online.ts` | **Mới** — `createOnlineOrder` (service role, validate kênh/contact/địa chỉ), `listOnlineOrders`, `acceptOnlineOrder`/`rejectOnlineOrder`/`markOnlineReady` (+broadcast) |
| `app/r/[slug]/api/online-order/route.ts` | **Mới** — POST tạo đơn online cho khách ẩn danh |
| `components/customer/MenuBrowser.tsx` | Thêm prop `online`: đặt được không cần QR, gửi `/api/online-order`, chuyển `/order/[id]` không token |
| `components/customer/CartSheet.tsx` | Thêm props online: toggle **Mang về / Giao**, ô **địa chỉ** (bắt buộc khi giao), SĐT bắt buộc, nhãn nút "Đặt đơn" |
| `app/r/[slug]/(customer)/online/page.tsx` | **Mới** — bề mặt khách `/online` (MenuBrowser chế độ online) |
| `lib/orders/status.ts` | Thêm `ONLINE_STEPPER` + `ONLINE_STEP_LABEL` + `onlineStepIndex` (4 bước tới hoàn tất) |
| `lib/orders/broadcast.ts` | Payload thêm `channel` (để trang theo dõi chọn stepper đúng) |
| `app/r/[slug]/api/order/[id]/route.ts` | GET trả thêm `channel` |
| `components/customer/OrderStatusStepper.tsx` | Channel-aware: đơn online hiện 4 bước (Chờ xác nhận → Đang chuẩn bị → Sẵn sàng → Hoàn tất) |
| `lib/orders/kds.ts` | Query + type thêm `channel` (đơn online session null vẫn vào KDS) |
| `components/kds/KdsTicket.tsx` | Nhãn kênh (**Mang về** cam / **Giao** xanh) + `#kitchen_no` thay "Bàn" cho đơn online |
| `app/r/[slug]/admin/(protected)/online/page.tsx` | **Mới** — hàng đợi đơn online, guard owner/manager |
| `app/r/[slug]/admin/(protected)/online/actions.ts` | **Mới** — accept/reject/markReady (auth `canManage('online')`) |
| `components/admin/online/OnlineQueue.tsx` | **Mới** — 2 cột (Chờ xác nhận / Đang xử lý), realtime, nhận đơn/từ chối/sẵn sàng; "Thu tiền & hoàn tất" chừa 05-03 |
| `components/admin/AdminNav.tsx` | Mục "Đơn online" → Link `${base}/online` |

## Logic then chốt
- **Tạo đơn online** (D15, service role): `channel ∈ {takeaway,delivery}`, `table_session_id=null`, `source='online'`, luôn `pending_confirm` (bỏ qua `qr_order_auto_send` — D-P5-5). name+phone bắt buộc; **địa chỉ bắt buộc khi giao**. Tái dùng `validateAndBuildLines` + `insertOrderGraph` (đã tham số hóa — luồng dine-in KHÔNG đổi hành vi).
- **Vòng đời** (KDS chỉ để xem nên do `/admin/online` điều khiển): `pending_confirm →(Nhận đơn: +kitchen_no)→ confirmed →(Đánh dấu sẵn sàng)→ ready →(05-03 thu tiền)→ completed`; từ chối ở pending → `cancelled` (lý do). Mỗi bước `broadcastOrderStatus` cho khách.
- **Theo dõi khách**: tái dùng `/order/[id]` + Broadcast `order:{id}`; stepper online 4 bước dựa trên `channel` (GET + payload trả `channel`).
- **KDS**: đơn online `confirmed` (session null) tự vào vé, nhãn kênh + `#số` thay số bàn; không ảnh hưởng đơn dine-in.
- **RBAC**: `/admin/online` owner/manager (`canManage('online')`).

## Sai khác có chủ đích so với PLAN
- **Không tạo `OnlineOrderScreen`/`ContactForm` riêng**: tích hợp toggle kênh + địa chỉ vào `CartSheet` (tái dùng) và render `MenuBrowser` chế độ online trực tiếp ở trang `/online` — ít file, ít trùng lặp, luồng QR giữ nguyên. Toggle kênh nằm ở bước giỏ (checkout) thay vì "trên đầu" — menu 2 kênh giống hệt nhau nên khác biệt chỉ là địa chỉ + nhãn.

## Bằng chứng (test tĩnh)
- `npx tsc --noEmit` → **0 lỗi**. `npx next lint` → **✔ No ESLint warnings or errors**.
- Ghi DB (tạo/nhận/từ chối/sẵn sàng) nghiệm thu ở checkpoint frontend (cần migration 0015).

## Việc còn lại trước checkpoint
1. **Áp migration `0015_online_orders.sql`** vào Supabase dev (sau 0014).
2. **Build lại / `next dev`**.
3. Chạy checkpoint 7 bước ở `05-02-PLAN.md`.

## Checkpoint (chờ human-verify)
`05-02-PLAN.md`: khách đặt mang về/giao (chặn thiếu địa chỉ khi giao) → /admin/online nhận đơn (realtime) → KDS hiện nhãn kênh + #số → khách theo dõi realtime (Chờ xác nhận → Đang chuẩn bị → Sẵn sàng) → từ chối báo lý do → RLS cách ly tenant.
