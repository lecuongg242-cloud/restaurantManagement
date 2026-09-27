# 11-02 SUMMARY — Theo dõi lỗi + sống/chết

> Thực hiện 26/09/2026. Yêu cầu: OPS-10. Quyết định: QD-019 D2, D3.
> **Trạng thái: code xong + kiểm tại máy; chờ chủ dự án tạo tài khoản UptimeRobot + Sentry (nghiệm thu 2–4).**

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `app/api/health/route.ts` (mới) | Một lượt đọc thật qua PostgREST bằng anon key; 200 `{ok:true}` / 503 `{ok:false}`, hết giờ 3s, `no-store` |
| `lib/observability/health.ts` (mới) | `checkHealth(probe, timeoutMs)`, `healthBody` — hàm thuần |
| `lib/observability/scrub.ts` (mới) | `scrubEvent`: cắt query URL/breadcrumb, gỡ body/cookie/authorization, gắn `tenant_slug` |
| `lib/observability/sentry-options.ts` (mới) | Tùy chọn init chung; không DSN → tắt hẳn |
| `instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` (mới) | Nạp Sentry server/edge; `onRequestError` |
| `app/global-error.tsx` (mới) | Lưới lỗi cuối, tiếng Việt, nút ≥ 44px |
| `next.config.ts` | `withSentryConfig` (từ `@sentry/nextjs/config` — bản 11 dời chỗ); không token → không upload source map |
| `middleware.ts` | Matcher bỏ qua `api/health` |
| `package.json`, `pnpm-lock.yaml`, `package-lock.json` | `@sentry/nextjs` 11.0.0 — cập nhật **cả hai** lock (Vercel dùng pnpm, CI dùng `npm ci`); không gói nào khác đổi phiên bản (đã so) |
| `.env.local.example` | Biến Sentry |
| `docs/50-PhienBan/TrucSuCo.md` (mới) | Cài đặt UptimeRobot + Sentry; cảnh báo đến thì làm gì |

## Lệch khỏi plan — có chủ đích

**Bỏ Sentry phía trình duyệt.** Đo `next build`:

| | Trước | Sentry đầy đủ | Chỉ server (chọn) |
|---|---|---|---|
| JS dùng chung mọi trang | 102 kB | **169 kB** | 103 kB |
| `/r/[slug]/menu` (khách quét QR) | 198 kB | 265 kB | 199 kB |
| `/r/[slug]/pos` | 285 kB | 351 kB | 286 kB |

+67 kB cho **mọi** điện thoại khách chỉ để bắt lỗi trình duyệt — trong khi lỗi tiền/DB/server action nằm
ở server. Hệ quả chấp nhận: lỗi JS thuần phía trình duyệt **không** tới Sentry. Muốn bật lại: thêm
`instrumentation-client.ts` (xem tài liệu Sentry) — cân nhắc cùng P12 khi POS chạy trên điện thoại.

## Bằng chứng

```
unit: health 4 · scrub 6 · sentry-wiring 2 — toàn bộ 587 passed
tsc · lint · build sạch
```

Chạy thật tại máy (`next start`, DB production):
```
/api/health  {"ok":true}  http=200  t=0.091s / 0.081s / 0.160s   cache-control: no-store
dòng log middleware chứa /api/health: 0
```
Đối chứng âm (`next dev`, `NEXT_PUBLIC_SUPABASE_URL=http://10.255.255.1` — địa chỉ không trả lời):
```
{"ok":false}  http=503  t=3.04s      (lượt đầu 7.7s là thời gian biên dịch của dev)
```
Test nối SDK thật (transport giả bắt payload): token bàn, SĐT, `Bearer` **không** có trong payload.
Đối chứng âm: gỡ `scrubEvent` khỏi `beforeSend` → test **đỏ** ("expected … not to contain 'bimat123'").

## Chưa kiểm được (cần chủ dự án)

| Nghiệm thu | Chờ |
|---|---|
| 2. DB sai trên preview → cảnh báo tới ≤ 10 phút | Tài khoản UptimeRobot (`TrucSuCo.md` §A.1) |
| 3. Lỗi cố ý trên preview → lên Sentry có `tenant_slug` | DSN Sentry (§A.2) |
| 4. UptimeRobot xanh 24 giờ trên production | Sau mục 2 |
| 5. `smoke:prod` sau deploy | Deploy |
