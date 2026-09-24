# OPS-07 — Đối chứng âm cho chốt chặn lệch schema

> Chạy 24/09/2026. Plan: `30-KeHoach/P8/08-05-PLAN.md`. Quyết định: `QD-013` §3.
> **Trạng thái: ĐÃ chạy đối chứng âm hai chiều, cổng đang CHẶN.**

## Đổi cách làm so với plan — và vì sao

Plan viết dùng `supabase db diff`. Nó **cần Docker** để dựng shadow DB, mà máy dev không có Docker
(`docker --version` → không tìm thấy lệnh). Nghĩa là không ai chạy thử được trước khi đẩy lên CI.

Một cổng chặn chưa ai chạy thử thì không đáng tin: nó có thể xanh vì schema khớp, mà cũng có thể
xanh vì câu lệnh không chạy, thiếu secret, hay lỗi bị nuốt. Ba nguyên nhân đó trông giống hệt nhau
trên giao diện CI.

Nên đổi sang **snapshot schema** (`scripts/schema-snapshot.mjs`): chụp dấu vân tay schema
production vào `supabase/schema-snapshot.json`, commit, rồi CI so DB thật với snapshot đó. Chạy
được ở cả local lẫn CI, không cần Docker.

Nội dung chụp: cột của từng bảng · định nghĩa view · định nghĩa hàm (bỏ hàm của extension) ·
policy của **cả `public` lẫn `storage`** · index · trigger · ràng buộc check/unique/FK.

> Policy `storage` nằm trong đó là có lý do: sự cố `has_role` nằm ở `storage.objects`, và lần đầu
> rà tôi chỉ tra schema `public` nên suýt xoá một hàm đang được dùng.

## Đối chứng âm 1 — object THỪA trên DB

```sql
create view public.drift_canary as select 1 as x;
```

```
LỆCH SCHEMA — 2 khác biệt:
  [bang] THỪA trên DB, repo không mô tả: drift_canary
  [view] THỪA trên DB, repo không mô tả: drift_canary
MA_THOAT=1
```

## Đối chứng âm 2 — THÂN định nghĩa bị sửa (tên không đổi)

Đây mới là loại đã cắn thật: `report_summary` vẫn đúng tên, nhưng thân đọc `bills_revenue.business_at`
thay vì `bills.paid_at`. So-tên-object không bao giờ thấy loại này.

Ghi snapshot có canary, rồi đổi thân nó:

```sql
create or replace view public.drift_canary as select 2 as x;
```

```
LỆCH SCHEMA — 1 khác biệt:
  [view] ĐỊNH NGHĨA KHÁC snapshot: drift_canary
```

## Dọn sạch

```sql
drop view if exists public.drift_canary;
```

Snapshot ghi lại, kiểm: **`Schema khớp snapshot.`** — `grep drift_canary` trong snapshot = **0**.

## Test logic so sánh

`tests/schema/snapshot.test.ts` — 6/6, phủ: giống hệt · thừa · **thân khác** · thiếu · nhiều lệch
cùng lúc · import script không khởi động kết nối DB (đúng cái bẫy đã vấp với `print-bridge.mjs`).

## Cách dùng

```bash
npm run schema:check      # kiểm; lệch thì exit 1
npm run schema:snapshot   # ghi lại snapshot SAU KHI đã chép thay đổi thành migration
```

Khi CI đỏ: **đừng ghi đè snapshot cho hết đỏ.** Ghi đè là xoá dấu vết, không phải sửa lỗi. Thông
điệp lỗi của script nói rõ hai đường đi đúng.

## Điểm yếu còn lại — nói rõ để không ai tưởng là đủ

Snapshot so DB với **một bản chụp đã commit**, không so DB với **các file migration**. Nghĩa là ai
đó vẫn có thể sửa tay trên SQL editor rồi chạy `npm run schema:snapshot` mà không viết migration —
CI sẽ xanh, nhưng dựng môi trường mới từ repo vẫn ra schema khác.

Chốt chặn thật cho việc đó là `supabase db diff` (so với chính migration), cần Docker trên CI
runner. Đáng thêm về sau như một job **thứ hai**; snapshot không thay thế nó, chỉ là thứ chặn được
**ngay bây giờ** và đã chạy thử.

Trong lúc chưa có: quy tắc review là **snapshot đổi thì PR phải kèm migration tương ứng**. Snapshot
đổi một mình là dấu hiệu có người sửa tay.
