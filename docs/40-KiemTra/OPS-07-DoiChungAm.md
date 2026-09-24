# OPS-07 — Đối chứng âm cho chốt chặn lệch schema

> Lập 24/09/2026. Plan: `30-KeHoach/P8/08-05-PLAN.md`. Quyết định: `QD-013` §3.
> **Trạng thái: job đang ở GIAI ĐOẠN 1 (chỉ báo cáo), CHƯA chặn merge, CHƯA chạy đối chứng âm.**

## Vì sao cần đối chứng âm

Một job CI chưa từng đỏ là một job chưa chứng minh được gì. Nó có thể xanh vì schema khớp, mà cũng
có thể xanh vì câu lệnh không chạy, secret thiếu, hoặc `|| true` nuốt mất lỗi. Ba nguyên nhân đó
trông giống hệt nhau trên giao diện CI.

## Chưa làm được ở máy dev

`supabase db diff` cần Docker để dựng shadow DB. Máy dev hiện tại **không có Docker**
(`docker --version` → không có), nên job chỉ xác thực được trên CI runner.

Đó là lý do job đang ở chế độ **chỉ báo cáo** (`::warning::`, không `exit 1`): bật chặn trước khi
xác thực là đẩy rủi ro sang người merge kế tiếp.

## Các bước phải chạy (theo đúng thứ tự)

### 1. Xem lần chạy đầu có bao nhiêu nhiễu

Đẩy lên nhánh `dev`, mở job `schema-drift`, đọc phần in ra.

Kỳ vọng sau `0040`/`0041`: **không có diff**. Nếu có, gần như chắc chắn là nhiễu quen thuộc —
quyền (`grant`/`revoke`), `search_path`, thứ tự cột, extension. Ghi lại **từng loại** vào đây và
xử lý: hoặc chụp vào migration, hoặc thu hẹp `--schema`.

Ghi kết quả:

```
(dán output lần chạy đầu vào đây)
```

### 2. Đối chứng âm — bắt buộc trước khi bật chặn

Trên **DB test**, không phải production:

```sql
create view public.drift_canary as select 1 as x;
```

Chạy lại CI → job phải in ra `drift_canary`. Nếu không → job không đo gì cả, dừng lại và sửa.

```sql
drop view public.drift_canary;
```

Chạy lại → không còn diff.

Ghi kết quả cả hai lần:

```
(dán output vào đây)
```

### 3. Kiểm nhánh thiếu secret

Chạy trên nhánh không có `SUPABASE_DB_URL` → bước phải **skip**, CI không đỏ.

### 4. Bật chặn merge

Chỉ sau khi bước 1–3 xong: đổi `::warning::` thành `::error::` và thêm `exit 1` trong nhánh
`if [ -s drift.sql ]`.

> Bật chặn khi còn nhiễu sẽ dạy cả đội cách bỏ qua CI đỏ. Lúc đó job còn tệ hơn là không có, vì nó
> tạo cảm giác được bảo vệ mà không bảo vệ gì.
