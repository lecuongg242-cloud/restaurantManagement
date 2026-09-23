# QD-013 — Lệch schema production và cách xử lý

> Lập 23/09/2026. Phát hiện khi đối chiếu số liệu REPORT-04 trong lúc rà nghiệm thu P7.
> Liên quan: `QD-012` (P7), `30-KeHoach/P7/00-TongQuan.md` §sổ cái migration.

## Phát hiện

Production có những đối tượng **không hề tồn tại trong repo**. Chúng được tạo bằng tay trên SQL
editor, nên `supabase db push` báo "up to date" trong khi repo mô tả một schema khác hẳn.

| Đối tượng | Production | Repo |
|---|---|---|
| View `bills_revenue` (tính `business_at`) | Có | Không |
| 9 hàm báo cáo (`report_summary`, `report_series`, `report_top_items`, `report_by_category`, `report_by_channel`, `report_by_area`, `report_payments`, `report_hour_dow`, `takeaway_paid_total`) | Đọc `bills_revenue.business_at` | Đọc `bills.paid_at` (0023/0027) |
| `handle_new_user` + trigger `on_auth_user_created` | Có, đang chạy | Không |
| `has_role` | Có, **đang hỏng** | Không |
| `current_tenant_ids`, `accept_invitation`, `resolve_table_by_qr` | Có, không ai dùng | Không |
| Policy `menu_images_insert/_update/_delete` trên `storage.objects` | Có, gọi `has_role` | `0005` định nghĩa `menu_images_public_read` + `_service_write` — tên khác |

`business_at` = giờ của đơn **đầu tiên** trong hóa đơn. Đây là logic **ngày kinh doanh**: hóa đơn
thu lúc 1h sáng vẫn tính vào ngày hôm trước. Nghiệp vụ đúng, và nó chỉ tồn tại trên production.

## Vì sao phải xử lý

Không phải vì sạch sẽ. Vì hai hậu quả cụ thể:

1. **Dựng môi trường mới từ repo sẽ ra số doanh thu KHÁC** — báo cáo cắt theo `paid_at` (nửa đêm
   lịch) thay vì `business_at` (ngày kinh doanh) — mà không ai được cảnh báo. Với một sản phẩm mà
   cam kết cốt lõi là "doanh thu khớp 100%" (BILL-05, REPORT-04), đây là kiểu sai tệ nhất: im lặng
   và có vẻ đúng.
2. **Chạy lại `0023`/`0027` là production mất logic ngày kinh doanh.** Sổ cái migration sau khi sửa
   (23/09/2026) đã chặn `db push` khỏi việc đó, nhưng không chặn được ai chạy tay.

> **Đính chính.** Ngày 23/09/2026 tôi báo "sửa sổ cái xong, `db push` là no-op, an toàn". Vế sổ cái
> đúng, nhưng kết luận rộng hơn mức đã kiểm: repo vẫn không mô tả đúng production, và
> `db push --dry-run` báo "up to date" khiến lệch này **khó thấy hơn** trước.

## §1. Chụp hiện trạng vào migration — ĐÃ LÀM (`0040`)

`0040_capture_prod_drift.sql` chứa view, 9 hàm báo cáo, `handle_new_user` + trigger, chụp **tự
động** bằng `pg_get_viewdef` / `pg_get_functiondef` / `pg_get_triggerdef` — không gõ tay để không
sai một dấu.

Không đổi hành vi production: mọi lệnh là create-or-replace với đúng thân đang chạy. Bằng chứng —
`report_summary(qt-food, 01/08 → 23/09)` trước và sau đều trả **554.910.000đ / 5.211 hóa đơn**.

Dọn kèm 3 hàm chết: `current_tenant_ids`, `accept_invitation`, `resolve_table_by_qr`. Đã rà
**mọi schema** (không chỉ `public`), không policy nào, không hàm nào, không lời gọi `.rpc(` nào
trong app. Chữ ký lấy từ `pg_get_function_identity_arguments` chứ không đoán — cả ba nhận `uuid`
chứ không phải `text`, đoán sai thì `drop if exists` im lặng bỏ qua và lệch vẫn còn.

## §2. `has_role` đang hỏng — CHƯA xử lý, cần quyết

`has_role(p_tenant_id uuid, p_roles text[])` đọc `memberships.status`. Bảng `memberships` **không
có** cột đó (chỉ có `active`). Gọi hàm là lỗi ngay:

```
select public.has_role('…'::uuid, array['owner'])
→ column "status" does not exist
```

Ba policy `menu_images_insert` / `_update` / `_delete` trên `storage.objects` đều gọi hàm này, nên
chúng cũng chết theo — **lỗi**, không phải "từ chối có kiểm soát". Chưa ai thấy vì
`lib/storage/images.ts` dùng service-role, bỏ qua RLS hoàn toàn.

Hàm này **không chụp lại được**: Postgres kiểm thân hàm SQL lúc tạo, nên `create or replace` báo
lỗi. Nó sống sót được là vì được tạo từ thời schema còn khác. Đó cũng là lý do `0040` cố ý bỏ nó
ra — một migration chụp-hiện-trạng không được phép đổi hành vi.

Ba hướng, chưa chốt:

| Hướng | Được | Mất |
|---|---|---|
| **Sửa** `status` → `active` | 3 policy hoạt động thật; upload ảnh chuyển sang phiên người dùng được | Là đổi hành vi; phải kiểm lại luồng upload |
| **Bỏ hẳn** hàm + 3 policy, giữ mô hình service-role như `0005` | Repo và production về đúng một mô hình; bớt thứ gây hiểu nhầm | Mất đường mở cho upload bằng phiên người dùng sau này |
| **Để nguyên** | Không rủi ro tức thời | Để lại một quả mìn: ai chuyển upload sang phiên người dùng sẽ gặp lỗi khó hiểu |

Khuyến nghị: **bỏ hẳn**. V1 đã chọn mô hình upload qua service-role (`0005`), ba policy kia là tàn
dư của một thiết kế không đi tiếp. Giữ một hàm hỏng và ba policy chết chỉ để "phòng khi cần" là
giữ đúng thứ sẽ làm người sau mất buổi chiều.

## §3. Quy tắc từ nay

Đã ghi ở `30-KeHoach/P7/00-TongQuan.md`: migration áp bằng `supabase db push`; chạy tay thì
**ngay sau đó** `supabase migration repair --status applied <version>`.

Bổ sung: **thay đổi schema bằng SQL editor phải được chép lại thành file migration trong cùng
ngày.** Sổ cái đúng mà repo sai thì còn nguy hiểm hơn cả hai cùng sai — vì lúc đó công cụ sẽ báo
"mọi thứ ổn".

Đề xuất chốt chặn cho CI (chưa làm, thuộc P8): một bước chạy `supabase db diff` trên môi trường
dựng từ repo và so với production; khác nhau thì CI đỏ. Không có chốt này thì quy tắc trên chỉ là
lời hứa.
