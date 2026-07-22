# 05-01 SUMMARY — Đặt bàn online + duyệt + danh sách theo ngày

**Ngày:** 22/07/2026 · **Trạng thái:** Code hoàn tất; `tsc`/`lint` xanh. Chờ **áp migration 0014** + checkpoint human-verify (test trình duyệt).
**Yêu cầu:** RESV-01 (khách gửi đặt bàn → pending), RESV-02 (duyệt + danh sách theo ngày).

## File đã đổi/thêm
| File | Vai trò |
|---|---|
| `supabase/migrations/0014_reservations.sql` | **Mới** — bảng `reservations` + RLS `auth_tenant_ids()` + 2 index (tenant+reserved_at, tenant+status) + publication realtime |
| `lib/reservations/types.ts` | **Mới** — `Reservation`, `ReservationView` (kèm area_name), `ReservationStatus`, `ReservationCounts` |
| `lib/reservations/reservations.ts` | **Mới** — `createReservation` (service role, scope slug, validate tương lai/partySize/area), `listReservationsByDay` (RLS admin, ngày VN + đếm status), `decideReservation` (pending→confirmed/rejected), helper `vnDayRangeUtc`/`todayVN` |
| `app/r/[slug]/(customer)/reserve/page.tsx` | **Mới** — trang khách (tên/logo tenant + areas công khai qua admin client); màn cảm ơn khi `?ok=1` |
| `app/r/[slug]/(customer)/reserve/actions.ts` | **Mới** — `submitReservation` (datetime-local giờ VN → ISO +07:00; redirect ok/error) |
| `components/reserve/ReservationForm.tsx` | **Mới** — form khách editorial mobile-first (tên/SĐT/số người/ngày giờ/khu vực tùy chọn/ghi chú), min ngày set sau mount |
| `app/r/[slug]/admin/(protected)/reservations/page.tsx` | **Mới** — guard owner/manager; ngày VN mặc định hôm nay; ◀▶ + label; gọi `listReservationsByDay` |
| `app/r/[slug]/admin/(protected)/reservations/actions.ts` | **Mới** — `confirmReservationAction` / `rejectReservationAction` (auth `canManage('reservations')` + revalidate) |
| `components/admin/reservations/ReservationList.tsx` | **Mới** — danh sách theo giờ VN, badge trạng thái, xác nhận/từ chối (ô lý do), realtime `postgres_changes` + `setAuth`, đếm trạng thái, điều hướng ngày |
| `lib/auth/rbac.ts` | Thêm `reservations`, `online` vào `ManageSection` |
| `components/admin/AdminNav.tsx` | Mục "Đặt bàn" từ placeholder "chờ" → Link `${base}/reservations` |

## Logic then chốt
- **Khách ẩn danh (D15)**: `createReservation` chạy **service role**, resolve tenant qua `slug`, validate ở server (tên/SĐT bắt buộc, số người 1–50, thời điểm **tương lai**, khu vực phải thuộc tenant). KHÔNG policy anon trên `reservations`.
- **Giờ VN (UTC+7)**: `reserved_at` lưu UTC; form gửi datetime-local (giờ VN) → action gắn offset `+07:00`; danh sách gom theo **ngày VN** (`vnDayRangeUtc`), hiển thị HH:MM VN.
- **Duyệt an toàn**: `decideReservation` chỉ đổi được từ `pending` (điều kiện `.eq('status','pending')` → chống double-decide); từ chối **bắt buộc lý do**.
- **Realtime**: `reservations` vào publication; `/admin/reservations` nghe `postgres_changes` (RLS lọc tenant) + `setAuth` → đơn mới pop, không reload.
- **RBAC**: khu admin owner/manager (`canManage('reservations')`); không đụng `table_sessions` (đặt bàn chỉ là bản ghi — QD-008 D-P5-2).

## Bằng chứng (test tĩnh)
- `npx tsc --noEmit` → **0 lỗi**.
- `npx next lint` (các file mới) → **✔ No ESLint warnings or errors**.
- Ghi DB (create/list/decide) nghiệm thu ở checkpoint frontend (cần migration 0014).

## Việc còn lại trước checkpoint
1. **Áp migration `0014_reservations.sql`** vào Supabase dev (như 0012/0013 các phase trước — `supabase db push` sau khi link, hoặc chạy SQL trên dashboard). Dự án hiện chưa link remote + Docker local không chạy nên chưa tự áp được.
2. **Build lại** (`npm run build`) hoặc chạy `next dev` (server :3000 đang là `next start` bản cũ).
3. Chạy checkpoint theo `05-01-PLAN.md` (mục checkpoint) — 7 bước.

## Checkpoint (chờ human-verify)
`05-01-PLAN.md`: khách gửi đặt bàn (chặn quá khứ/thiếu SĐT) → admin thấy đúng ngày (badge pending) → xác nhận/từ chối (lý do) → ◀▶ đổi ngày → realtime pop → RLS cách ly tenant.
