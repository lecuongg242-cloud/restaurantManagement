# 11-03 SUMMARY — Giới hạn tần suất đường ẩn danh

> Thực hiện 26–27/09/2026 (ngoài giờ bán qt-food). Yêu cầu: TENANT-07. Quyết định: QD-019 D4.
> **Trạng thái: code xong, migration 0050 đã áp database dùng chung, kiểm tại máy. Còn đo "quán B không
> chậm" trên bản preview Vercel và theo dõi 1 ngày bán sau deploy.**

## Ngưỡng — đặt từ số đo production (chỉ đọc, 26/09/2026)

| Số đo | Giá trị |
|---|---|
| Đơn theo nguồn | staff/takeaway 6.299 · qr/dine_in 282 · staff/dine_in 220 · staff/delivery 79 · **online của khách: 0** |
| Đơn / phiên bàn / phút (cao nhất, và p99) | **1** (cả QR lẫn nhân viên) |
| Gọi nhân viên / bàn / phút (cao nhất) | **1** |
| Đặt bàn / quán / phút (cao nhất) | 1 (tổng cộng 3 lượt đặt) |
| Trang khách hỏi trạng thái đơn | 15 giây/đơn, **chỉ khi realtime chết** (`MyOrdersSheet`, `OrderStatusStepper`) |

| Đường | Khóa | Ngưỡng | So với đỉnh thật |
|---|---|---|---|
| `POST api/order` | token bàn | 10 / phút | 10× |
| `POST api/call` | token bàn | 5 / phút | 5× |
| `GET api/order/[id]` | IP + mã đơn | 30 / phút | 7,5× (poll 4/phút) |
| `POST api/online-order` | IP + quán | 10 / phút | chưa có dữ liệu thật — đặt ngang đơn QR |
| `submitReservation` | IP + quán | 5 / phút | 5× |
| `submitLead` | IP | 5 / 10 phút | trang giới thiệu, không có số |

`GET api/order/[id]` **không** khóa theo IP trần: cả quán chung một wifi (một IP), khi realtime chết thì
30 khách × vài đơn × 4 lượt/phút vượt mọi ngưỡng IP hợp lý → chặn nhầm khách thật.

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `supabase/migrations/0050_rate_limit.sql` (mới) | Bảng `rate_limit_hits` (RLS bật, không policy) + RPC `rate_limit_hit` (cửa sổ cố định, `insert … on conflict`, dọn theo xác suất 1%); chỉ `service_role` gọi được |
| `lib/security/rate-limit.ts` (mới) | `RULES`, `hashKey` (HMAC — IP là dữ liệu cá nhân), `retryAfterS`, `clientIp`, `checkRateLimit` (**RPC lỗi → cho qua** + log), `tooManyResponse` |
| 4 route + 2 server action | Một lời gọi kiểm **trước** thao tác ghi; `lib/orders/create-order.ts`, `lib/billing/` **không đổi** |
| `supabase/schema-snapshot.json` | Cập nhật cùng migration (OPS-07) |

## Bằng chứng

```
tests/security/rate-limit.test.ts          10 passed (thuần)
tests/security/rate-limit-routes.test.ts    8 passed (vượt ngưỡng → 429/lỗi form, hàm ghi KHÔNG được gọi)
tests/rls/rate-limit.test.ts                6 passed — chạy 5 lần liên tiếp đều xanh
toàn bộ unit 605 passed · test:rls 253/254 (1 đỏ là test cửa sổ chập chờn — đã sửa, xem dưới)
tsc · lint · build · schema:check sạch
db push --dry-run: chỉ "0050_rate_limit.sql" → áp thật
```

Anon gọi RPC / ghi bảng → `42501 permission denied` (đúng lý do — trước migration hai test này xanh
vì *hàm chưa tồn tại*, đã kiểm lại lý do sau khi áp).

**Chạy thật tại máy** (`next start` + DB dùng chung), 50 request / cùng token giả vào `pho-viet`:
```
{"400":20, "429":30}   — 10 lượt qua mỗi cửa sổ 1 phút (dãy request vắt qua một biên phút)
429 mẫu: Retry-After: 30 · "Bạn thao tác quá nhanh. Vui lòng thử lại sau 30 giây."
lỗi bộ đếm trong log: 0
```
Token giả ⇒ lượt qua trả 400 "bàn không hợp lệ" — **không** ghi đơn thật nào.

Chi phí trong DB (`pg_stat_statements`): `rate_limit_hit` **0,85 ms trung bình**, 133 lượt, tối đa 26 ms.

## Test đỏ vì test sai (đã sửa)

"Sang cửa sổ mới" dùng cửa sổ 2 giây chia theo **đồng hồ DB**: hai lượt liên tiếp đôi khi rơi đúng biên
cửa sổ. Sửa test: gặp biên thì thử lại với khóa mới (tối đa 3 lần) — không canh theo đồng hồ máy vì
đồng hồ máy lệch DB (bài học P9).

## Chưa kiểm được

| Nghiệm thu | Vì sao / chờ |
|---|---|
| 2. Quán B không chậm khi quán A bị dội | Đo tại máy **không dùng được**: server local là một tiến trình gánh cả hai luồng, và `/r/bun-bo/menu` lúc **yên** còn đo ra p50 2.599 ms (lúc dội 181 ms). Phải đo trên bản preview Vercel. Phía DB đã có số: 0,85 ms/lượt |
| 3. Độ trễ thêm mỗi request ≤ 10 ms p95 cùng vùng | Máy dev ở VN → DB Singapore; phải đo trên Vercel `sin1` |
| 4. Một ngày bán qt-food: 0 lần 429 với khách thật | Sau deploy |
