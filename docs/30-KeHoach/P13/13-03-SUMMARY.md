# 13-03 — SUMMARY: Hạn dùng, nhắc, khóa tự động

> **ĐÃ ĐÓNG 28/09/2026** — chủ dự án chốt đóng P13; đơn mới của qt-food sau khi áp 0057 đã có (28/09).

> **Trạng thái: XONG** — migration 0057 áp production 27/09/2026 khoảng 18:45 (giờ VN), chủ dự án cho phép. QD-021 U1/U2 chủ
> dự án chốt: nhắc trước 7 ngày, ân hạn 7 ngày. Còn chờ: xem đơn mới của qt-food sau khi áp (đơn gần nhất trước khi áp là
> 09:01 sáng cùng ngày).

## Quyết định trong lúc làm

- **Đổi ngày lúc 04:00 giờ VN** (theo cạm bẫy "khóa giữa ca"): SQL dùng
  `((now() at time zone 'Asia/Ho_Chi_Minh') - interval '4 hours')::date`, TS dùng `homNayHanDung()`. Quán mở bàn qua nửa đêm
  không bị khóa.
- `auth_tenant_ids()` dùng **`create or replace`**, không drop + create: mọi policy phụ thuộc hàm này nên không drop được.
  Giữ nguyên chữ ký ⇒ không sinh overload (đã kiểm: `pg_proc` có đúng 1 `auth_tenant_ids`).
- `tenant_usable_on(status, paid_until, today)` là lõi (immutable, không `set search_path`, không đọc bảng ⇒ inline được).
  `tenant_usable` gắn "hôm nay"; `usable(tenants)` là cột tính cho PostgREST ⇒ `activeTenantBySlug` lọc `.eq("usable", true)`,
  không chép điều kiện sang TS.
- Quán hết hạn: layout `/r/[slug]` **render** màn "Hết hạn sử dụng" (không redirect), trừ `/admin/login` và `/admin/gia-han`.
  Layout biết đường dẫn qua header `x-pathname` do middleware đặt.
- Ca quá hạn nằm trong `tests/rls/suspend.test.ts` (cùng khuôn với ca suspended), **không** thêm vào `matrix.test.ts`: ma trận
  đo cách ly A⊥B, còn việc khóa một quán đã có bộ test riêng.
- "Super-admin vẫn đọc được" nghĩa là đọc `tenants` + `memberships` (hai bảng có nhánh `is_super_admin()`). `orders`/`bills`
  xưa nay `/super` vẫn đọc bằng service-role.

## Tệp đã đổi

`supabase/migrations/0057_subscription.sql` · `supabase/schema-snapshot.json` · `lib/tenant/subscription.ts` (mới) ·
`lib/tenant/active.ts` (`tenantGate`) · `middleware.ts` · `app/r/[slug]/layout.tsx` · `components/tenant/TenantExpired.tsx`,
`components/tenant/SubscriptionBanner.tsx` (mới) · `components/admin/AdminShell.tsx`,
`app/r/[slug]/admin/(protected)/layout.tsx`, `components/staff/StationScreen.tsx` (banner POS) · `app/super/page.tsx`,
`app/super/actions.ts` (`setPaidUntil`), `app/super/tenant-actions.tsx`, `app/super/BridgeTable.tsx` ("quán đang khóa") ·
tests: `tests/tenant/subscription.test.ts`, `tests/tenant/ca-han.ts` (mới), `tests/tenant/active.test.ts`,
`tests/rls/suspend.test.ts`.

## Bằng chứng

```
supabase db push --dry-run  → chỉ 0057, 0058
supabase db push            → Applying 0057_subscription.sql, 0058_subscription_payments.sql … Finished
npm run test:rls            → Test Files 19 passed · Tests 304 passed
npm run test                → Test Files 71 passed · Tests 765 passed
npm run schema:snapshot && npm run schema:check → Schema khớp snapshot
```

| Kiểm production sau khi áp | Kết quả |
|---|---|
| `paid_until` của mọi quán | rỗng (bun-bo, pho-viet, qt-food), `usable = true` |
| Tập `(user_id, tenant_id)` của cổng cũ so với cổng mới | 11 và 11 — mất 0, thêm 0 |
| Số overload `auth_tenant_ids` | 1 |
| Một định nghĩa: bảng 7 ca qua `tenant_usable_on` (SQL) và `subscriptionState` (TS) | khớp cả 7 ca |

Chạy thật (quán demo pho-viet, đã khôi phục sau đó): còn 3 ngày → banner vàng. Quá 3 ngày → banner đỏ "còn 4 ngày nữa hệ
thống sẽ khóa", ở cả admin và POS 360px (một dòng, không che nút). Quá 8 ngày → trang khách và các trang admin khác hiện
"Hết hạn sử dụng". Đặt hạn +30 ngày → `/admin/menu` vào lại ngay. Ảnh `anh/03…06`.

Sự cố nhỏ khi làm: lần chạy `npm run test` đầu tiên (trước khi áp 0057) để quán demo `bun-bo` ở trạng thái `suspended`, vì
`afterAll` gọi bước dọn hạn dùng (bị lỗi) trước bước bật lại. Đã bật lại ngay, qt-food không bị đụng tới; đã đổi thứ tự dọn
(bật lại trước).

## Cam kết

| Nghiệm thu | Trạng thái |
|---|---|
| 1. test + test:rls + schema:check | ☑ |
| 2. Preview: vàng → đỏ → khóa → mở | ☑ trên `next start` ở máy dev nối DB thật (chưa deploy preview) |
| 3. Production: `paid_until` rỗng; qt-food bán bình thường 30 phút sau khi áp | ☑ qt-food bán bình thường ngày 28/09 (đơn 09:13, 09:46, 10:34 giờ VN) |
