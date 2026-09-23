# Kế hoạch P7 — V1.1 Cứng hóa đa tenant

> Lập 23/09/2026. Nguồn: rà soát đa tenant 23/09/2026, quyết định `15-QuyetDinh/QD-012`,
> yêu cầu `20-DanhSachYeuCau/00-Requirements.md` (TENANT-05, TENANT-06, PRINT-05).
> **Định dạng:** như P6 — mỗi plan là một tệp `07-0X-PLAN.md`, kết thúc bằng `07-0X-SUMMARY.md`.

## P7 là gì (một câu)

V1.0 chứng minh **một nhà hàng** vận hành trọn vẹn; P7 đóng ba lỗ hổng khiến việc **mở nhà hàng
thứ hai, thứ mười** trở thành rủi ro thay vì chuyện thường ngày.

P7 **không** thêm tính năng nào cho người dùng cuối. Đây là phần móng phải xong trước khi V2
(đa chi nhánh) đụng vào schema.

## Đã có sẵn trong P7 (làm trước kế hoạch này)

REPORT-10, REPORT-11, REPORT-12 (thống kê hủy món + giảm giá) đã gắn nhãn P7 trong danh sách yêu
cầu và đã code xong (`0028`, `0029`, `0037`), nhưng làm trực tiếp không qua thư mục kế hoạch.
Ba plan dưới đây là **phần kế tiếp** của P7, đánh số bắt đầu từ `07-01`.

## Ba plan

| Plan | Tên | Wave | Phụ thuộc | Yêu cầu phủ | Trạng thái |
|---|---|---|---|---|---|
| 07-01 | Ma trận RLS phủ 18 bảng | 1 | — | TENANT-05 | Chưa làm |
| 07-02 | Cầu in bỏ service-role, tài khoản `printer` riêng quán | 2 | 07-01 | PRINT-05 | Chưa làm |
| 07-03 | Khóa nhà hàng (`suspended`) thực thi ở DB | 2 | 07-01 | TENANT-06 | Chưa làm |

`07-02` và `07-03` độc lập nhau → chạy song song được. Cả hai đều **phải** có `07-01` xong trước.

## Vì sao ma trận RLS đi đầu dù không phải lỗ hổng

`07-02` thêm vai trò vào `memberships.role`; `07-03` viết lại `auth_tenant_ids()`. Cả hai nằm
ngay trên đường đi của **mọi** policy tenant trong hệ thống. Làm thủng cách ly tenant ở đó là
kiểu hỏng không nhìn thấy bằng mắt và không có triệu chứng — cho tới khi một quán thấy doanh thu
của quán khác.

Ma trận RLS là thiết bị đo. Có nó trước thì mỗi thay đổi ở hai plan sau được chấm điểm trong vài
giây; không có thì phải kiểm thủ công 18 bảng, hai lần, và vẫn không chắc.

Nếu chủ dự án muốn bịt lỗ service-role (`07-02`) ngay lập tức vì lý do vận hành, đảo thứ tự vẫn
chạy được — nhưng khi đó `07-01` trở thành việc **bắt buộc làm ngay sau**, không phải "để sau".

## Không nằm trong P7

Rà soát 23/09/2026 còn nêu các mục sau. Chúng là thật, nhưng **đau dần** chứ không chặn đường,
nên để ngoài P7 (chủ dự án chốt 23/09/2026):

| Mục | Vì sao hoãn |
|---|---|
| Realtime `postgres_changes` → `router.refresh()` render lại toàn trang mỗi sự kiện | Là vấn đề **chi phí/tải**, bắt đầu đau quanh 20–50 quán. Sửa đúng cách là đổi sang cập nhật state cục bộ — chạm nhiều component, xứng đáng một plan riêng |
| Cầu in poll 2s/quán | Cùng nhóm với trên; chỉ đáng làm cùng lúc |
| `findAuthUserByEmail` quét tới 4000 auth user mỗi lần tạo tenant (`app/super/actions.ts:13`) | Chỉ chạy lúc tạo tenant, chưa đau ở quy mô hiện tại. Sửa nhanh khi chạm tới file đó |
| Không rate limit endpoint ẩn danh (`/api/order`, `/api/call`, đặt bàn, form lead) | Bề mặt lạm dụng có thật nhưng chưa bị khai thác; cần đo trước khi chọn ngưỡng |
| Không có log/metric gắn `tenant_id` | Đau khi hỗ trợ >10 quán; là việc vận hành, không phải việc code |
| Mô hình gói cước / self-serve onboarding | Đã hoãn sang **V3** theo `50-PhienBan/V2-KeHoach.md` (định giá theo số chi nhánh nên phải làm đa chi nhánh trước) |

## Việc ngoài kế hoạch đã xử lý — sổ cái migration (23/09/2026)

Phát hiện khi áp `0038`: bảng `supabase_migrations.schema_migrations` (sổ cái các migration đã
chạy) dừng ở `0028`, trong khi repo đã có tới `0037` và schema database thì đã đổi theo. Nguyên
nhân: từ `0027` trở đi migration được áp **bằng tay** (SQL editor / psql) thay vì
`supabase db push`, nên schema đổi mà sổ cái không biết. Dòng `0028` còn mang nhãn sai
(`cancel_report_rpcs` — tên của file `0029`).

**Vì sao phải sửa.** `supabase db push` chạy mọi file **không có trong sổ cái**. Với 12 file bị
sót (`0027`, `0029`–`0039`), bước `npx supabase db push` trong `.github/workflows/ci.yml` sẽ chạy
lại cả 12 trên database đang phục vụ khách. Rà từng file thì cả 12 đều viết theo lối chạy lại được
(`create index if not exists`, `create or replace function`, `drop constraint if exists` rồi mới
`add`; các câu `update`/`insert` ở `0031`/`0032`/`0035` nằm trong thân hàm, không phải lệnh chạy
ngay) — nên chạy lại *hôm nay* vô hại. Nhưng đó là **may**, không phải thiết kế:
`0028_cancel_tracking.sql` có hai câu `update` backfill chạy thẳng trên `orders` và `order_items`;
nó chỉ tình cờ nằm trong sổ cái nên thoát. Migration kiểu đó sẽ còn xuất hiện.

**Đã làm.** Sao lưu sổ cái, rồi `supabase migration repair --status applied` cho 12 số hiệu còn
thiếu, và sửa nhãn dòng `0028`. **Không chạy lại SQL nào** — chỉ ghi nhận sự thật là chúng đã áp.

**Kiểm chứng:**

```
supabase migration list    → 39/39 dòng local == remote
supabase db push --dry-run → {"upToDate":true,"migrations":[]}
```

Dữ liệu không đổi (6.528 đơn, 5.974 bill trước và sau), 3 quán vẫn `active`, cổng `suspended` của
`0039` còn nguyên.

**Quy tắc từ nay:** migration áp bằng `supabase db push`, không chạy tay trên SQL editor. Nếu buộc
phải chạy tay (sự cố, hotfix), **ngay sau đó** chạy
`supabase migration repair --status applied <version>` — sổ cái sai thì không ai còn biết database
đang ở đâu, và bước `db push` trong CI trở thành khẩu súng đã lên đạn chĩa vào production.

## Tiêu chí hoàn thành P7

1. `npm run test:rls` xanh, phủ đủ 18 bảng × 4 phép (TENANT-05).
2. `grep SERVICE_ROLE scripts/print-bridge.mjs` trả **0 kết quả**, cầu in vẫn in được phiếu thật
   trên phần cứng (PRINT-05).
3. Ngưng một quán ở `/super` → quán đó dừng hoạt động ở cả 4 bề mặt trong ≤1 lần tải trang; mở
   lại → hoạt động bình thường, không mất dữ liệu (TENANT-06).
4. `tsc` + `lint` + `build` sạch; toàn bộ unit test hiện có vẫn xanh.
