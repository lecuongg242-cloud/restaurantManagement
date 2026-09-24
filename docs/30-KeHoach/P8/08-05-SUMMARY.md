# 08-05 SUMMARY — Chốt chặn lệch schema

> Thực hiện 24/09/2026. Yêu cầu: OPS-07. Quyết định: `QD-013` §3.

## Đổi cách làm so với plan

Plan viết dùng `supabase db diff`. Nó cần **Docker** để dựng shadow DB, mà máy dev không có Docker
(`docker --version` → không tìm thấy lệnh). Nghĩa là không ai chạy thử được trước khi đẩy lên CI.

Một cổng chặn chưa ai chạy thử thì không đáng tin: nó có thể xanh vì schema khớp, mà cũng có thể
xanh vì câu lệnh không chạy, thiếu secret, hay lỗi bị nuốt — ba nguyên nhân đó trông giống hệt nhau
trên giao diện CI. Nên tôi đổi sang cách **chạy được ngay và kiểm được ngay**.

## Cách làm: snapshot schema

`scripts/schema-snapshot.mjs` chụp dấu vân tay schema production vào
`supabase/schema-snapshot.json` (60KB, đã commit). CI so DB thật với file đó.

Nội dung chụp: cột từng bảng · định nghĩa view · định nghĩa hàm (bỏ hàm của extension) · policy của
**cả `public` lẫn `storage`** · index · trigger · ràng buộc check/unique/FK.

Hiện tại: `bang=24 view=1 ham=22 policy=28 index=74 trigger=1 rangBuoc=82`.

> Policy `storage` nằm trong đó là có lý do: sự cố `has_role` nằm ở `storage.objects`, và lần đầu
> rà tôi chỉ tra schema `public` nên suýt xoá một hàm đang được dùng.

```bash
npm run schema:check      # kiểm; lệch thì exit 1
npm run schema:snapshot   # ghi lại SAU KHI đã chép thay đổi thành migration
```

## Đối chứng âm — đã chạy, hai chiều

**1. Object thừa trên DB**

```sql
create view public.drift_canary as select 1 as x;
```
```
LỆCH SCHEMA — 2 khác biệt:
  [bang] THỪA trên DB, repo không mô tả: drift_canary
  [view] THỪA trên DB, repo không mô tả: drift_canary
MA_THOAT=1
```

**2. Thân định nghĩa đổi, tên KHÔNG đổi** — loại đã cắn thật (`report_summary` vẫn đúng tên nhưng
đọc `bills_revenue.business_at` thay vì `bills.paid_at`; so-tên-object không bao giờ thấy):

```sql
create or replace view public.drift_canary as select 2 as x;
```
```
LỆCH SCHEMA — 1 khác biệt:
  [view] ĐỊNH NGHĨA KHÁC snapshot: drift_canary
```

Dọn sạch: canary đã `drop`, snapshot ghi lại, `grep drift_canary` = **0**, kiểm lại
`Schema khớp snapshot.`

`tests/schema/snapshot.test.ts` 6/6 — phủ giống hệt · thừa · **thân khác** · thiếu · nhiều lệch
cùng lúc · import script không khởi động kết nối DB (đúng cái bẫy đã vấp với `print-bridge.mjs`).

## Điểm yếu còn lại — nói rõ để không ai tưởng là đủ

Snapshot so DB với **một bản chụp đã commit**, không so DB với **các file migration**. Ai đó vẫn có
thể sửa tay trên SQL editor rồi chạy `npm run schema:snapshot` mà không viết migration — CI xanh,
nhưng dựng môi trường mới từ repo vẫn ra schema khác.

`supabase db diff` là chốt chặn mạnh hơn cho đúng chỗ đó và đáng thêm như một job **thứ hai** khi
chạy được trên CI runner (runner có Docker). Snapshot không thay thế nó.

Trong lúc chưa có, quy tắc review: **snapshot đổi thì PR phải kèm migration tương ứng.** Snapshot
đổi một mình là dấu hiệu có người sửa tay.
