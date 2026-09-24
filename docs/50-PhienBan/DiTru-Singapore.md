# Di trú sang Singapore — runbook

> Lập 24/09/2026. Lý do: `15-QuyetDinh/QD-014` (chưa viết) · phân tích ở `40-KiemTra/BUG-ThanhToanCham.md`.
> **Trạng thái: ĐÃ DIỄN TẬP TRỌN VẸN trên project Singapore thật (24/09/2026).**
> Production cũ **chưa bị đụng** — vẫn đang chạy bình thường.

## Vì sao

Đo thật từ Việt Nam ngày 24/09/2026:

| | Thời gian |
|---|---|
| Tệp tĩnh (phục vụ ở biên, gần VN) | **123 ms** |
| Trang có truy vấn DB | **510–535 ms** |

`X-Vercel-Id: hkg1::iad1` — request vào qua Hồng Kông nhưng **hàm chạy ở Virginia**, database cũng
ở `us-east-1`. Chênh ~400ms là tiền vé khứ hồi Việt Nam ↔ Mỹ, và đó là **sàn**: không tối ưu truy
vấn nào hạ được nó.

## THỨ TỰ LÀ QUAN TRỌNG NHẤT

Ba kịch bản, tính cho một lần `payBill` (7 lượt khứ hồi DB sau khi đã tối ưu):

| Cấu hình | Mạng người dùng | Mạng tới DB | Tổng |
|---|---|---|---|
| Hiện nay — `iad1` + DB `us-east-1` | 430 ms | 7 × 5 ms | **~465 ms** |
| **Chỉ đổi compute sang `sin1`** | 40 ms | 7 × 230 ms | **~1.650 ms** ❌ |
| Đổi **cả hai** sang Singapore | 40 ms | 7 × 5 ms | **~75 ms** ✅ |

> **Đổi vùng compute một mình làm thanh toán CHẬM GẤP BA.** `regions: ["sin1"]` chỉ được thêm vào
> `vercel.json` ở **cùng bước** với việc đổi connection string sang database Singapore — không
> sớm hơn một phút nào. (Tôi đã từng commit nhầm nó vào repo rồi phải gỡ ra.)

## Quy mô — nhỏ, đó là tin tốt

| | |
|---|---|
| Kích thước database | **40 MB** |
| Tài khoản auth | 16 |
| Ảnh món trong storage | 19 |
| Dòng dữ liệu | 6.648 đơn · 6.071 hóa đơn · 6.067 thanh toán |

40MB dump/restore chỉ mất vài phút. Phần lâu nhất là kiểm tra, không phải chuyển.

## Diễn tập đã làm — kết quả

Project `wsbinfgagdanrfvrxxuz` (**ap-southeast-1 / Singapore**) đã được dựng đầy đủ từ đầu:

| Bước | Kết quả |
|---|---|
| Độ trễ từ VN tới DB mới | **68 ms** (us-east-1: ~240 ms) |
| Áp 41 migration | sạch, không lỗi |
| `npm run schema:check` | bắt được **1 lệch** — index `idx_bill_items_order_item_bill` chỉ có trên production, `0040` bỏ sót index. Đã chụp thành `0042`, áp lại → **khớp** |
| Nạp dữ liệu (27 bảng) | đủ, `verify` báo **mọi bảng khớp** |
| **Doanh thu** | **693.415.000đ** — khớp tới từng đồng với production |
| `auth.users` | 16 tài khoản, có hash mật khẩu (nhân viên đăng nhập lại được) |
| Toàn vẹn khóa ngoại | **42/42** ràng buộc hợp lệ |
| Ảnh món | **19/19** tệp |
| **Bộ test RLS** | **159/159 xanh** trên database mới |
| **`payBill` đo từ VN** | **638–783 ms** (khi DB ở Mỹ: 2.220 ms) |

> Cổng chặn lệch schema (OPS-07) bắt lỗi thật ngay lần dùng đầu tiên. Không có nó, môi trường mới
> sẽ thiếu một index mà `paidQtyMap` dùng mỗi lần thu tiền — chậm đi một cách khó hiểu, không ai
> biết vì sao.

### Hai cái bẫy đã vấp và đã xử lý

1. **Cột sinh tự động** — `auth.users.confirmed_at`, `auth.identities.email`,
   `storage.objects.path_tokens` không chèn thẳng được. Công cụ nay liệt kê cột tường minh, bỏ cột
   `is_generated = 'ALWAYS'`.
2. **Thứ tự khóa ngoại** — nạp `bill_items` trước `bills` là đổ. Nay tắt kiểm khóa ngoại trong
   phiên nạp (`session_replication_role = replica`) rồi **bật lại trong `finally`**, và kiểm lại
   toàn bộ ràng buộc sau khi nạp. Để sót chế độ replica là database im lặng bỏ qua mọi khóa ngoại
   về sau.

## Chuẩn bị (làm trước, không downtime)

1. **Chọn giờ**: ngoài giờ phục vụ của qt-food. Xem giờ đơn cuối trong ngày để chọn.
2. **Tạo project Supabase mới** vùng **Southeast Asia (Singapore)**. Ghi lại URL + các khóa.
3. **Áp toàn bộ migration lên project mới**:
   ```bash
   npx supabase db push --db-url "<POSTGRES_URL_NON_POOLING của project mới>"
   ```
   Repo đã mô tả đúng production sau `0040`/`0041` — nếu bước này lệch, dừng lại và tìm hiểu.
4. **Đối chiếu schema hai bên** bằng chính công cụ của dự án:
   ```bash
   POSTGRES_URL_NON_POOLING="<project MỚI>" npm run schema:check
   ```
   Phải ra `Schema khớp snapshot.` **trước khi** chuyển dữ liệu. Lệch ở đây mà bỏ qua thì sau khi
   chuyển sẽ ra số doanh thu khác (đúng cái bẫy của QD-013).

## Thực hiện (có downtime, ~30 phút)

5. **Chặn ghi**: đặt `tenants.status = 'suspended'` cho **mọi** quán trên project cũ. Cổng
   `auth_tenant_ids()` (0039) chặn ở tầng DB, còn `activeTenantBySlug` chặn bề mặt khách — nên
   không ai ghi thêm được trong lúc chuyển. Đây chính là việc mà P7 sinh ra để làm.
6. **Dump dữ liệu** (không dump schema — đã áp ở bước 3):
   ```bash
   pg_dump --data-only --no-owner --no-privileges \
     --schema=public --schema=auth --schema=storage \
     "<project CŨ>" > du-lieu.sql
   ```
   `auth` và `storage` **bắt buộc** phải có: `auth.users` giữ `encrypted_password` — mật khẩu nhân
   viên suy dẫn từ PIN bằng pepper (QD-009), mất là toàn bộ nhân viên không đăng nhập được.
7. **Nạp vào project mới**, rồi **chuyển file ảnh** trong bucket `menu-images` (19 tệp).
8. **Đối chiếu dữ liệu** — xem phần kiểm bên dưới. Không khớp thì **dừng**, chưa chuyển gì cả.
9. **Đổi cấu hình, cùng một lúc**:
   - Vercel env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL_NON_POOLING` → project mới
   - `vercel.json`: thêm `"regions": ["sin1"]`
   - Deploy
10. **Mở lại**: `tenants.status = 'active'` trên project **mới**.
11. **Cầu in ở quán**: cấp lại tài khoản (`/super` → Tài khoản cầu in) trên project mới và cập nhật
    `.env.local` của laptop tại quán — tài khoản cũ nằm ở project cũ, không dùng được nữa.
    **Gộp luôn với ba thay đổi cầu in đang chờ** (bỏ service-role, nhịp thích ứng, thử lại) để chỉ
    phải ra quán một lần.

## Kiểm sau khi chuyển — không khớp thì quay lại

```bash
POSTGRES_URL_NON_POOLING="<project MỚI>" npm run schema:check     # phải: Schema khớp snapshot.
POSTGRES_URL_NON_POOLING="<project MỚI>" npm run test:rls          # ma trận cách ly tenant
```

Đối chiếu số đếm hai bên — mọi con số phải **bằng nhau**:

```sql
select
  (select count(*) from orders)       as don,
  (select count(*) from bills)        as hoa_don,
  (select count(*) from payments)     as thanh_toan,
  (select count(*) from auth.users)   as tai_khoan,
  (select coalesce(sum(total),0) from bills where status='paid') as tong_doanh_thu;
```

**Doanh thu phải khớp tới từng đồng.** Đây là phép kiểm quan trọng nhất — nếu lệch, dừng lại và
tìm hiểu, đừng "chắc do làm tròn".

Rồi đo lại độ trễ để biết việc này có đáng không:

```bash
curl -s -o /dev/null -w "%{time_starttransfer}s\n" https://<domain>/r/qt-food/menu
```

Trước: **510–535 ms**. Kỳ vọng sau: **~150–250 ms**.

### Chạy khói trên production — BẮT BUỘC, sau khi Vercel deploy xong

```bash
npm run smoke:prod -- --slug qt-food     # chỉ ĐỌC trang menu công khai, không ghi gì
```

Phải thấy **0 hỏng**. Bước này thêm vào sau lần di trú 24/09/2026, khi **toàn bộ ảnh món vỡ** vì
`image_url` còn trỏ project đã xóa — mọi phép kiểm phía trên đều xanh, vì chúng kiểm DATABASE, còn
lỗi nằm ở thứ KHÁCH NHÌN THẤY. Lệnh khói kiểm đúng chỗ đó: trang trả 200, compute đúng vùng, mọi
ảnh tải được, không còn host Supabase cũ trong trang.

Hai giới hạn phải biết khi đọc kết quả:

- Query ngẫu nhiên chỉ phá cache CDN, **không phá `unstable_cache`**. Trang menu có thể trả 200 với
  dữ liệu đúng trong khi database đã chết — 24/09 đã xảy ra đúng như vậy.
- Không kiểm được giờ hiển thị: không có trang công khai nào hiện giờ. Lớp lỗi đó chặn ở bộ test.

## Đường lui

Giữ project cũ **nguyên vẹn, không xóa, ít nhất một tuần**. Quay lại = đổi env về project cũ + bỏ
`regions` + deploy + bật lại `status='active'` bên cũ.

Đây là lý do bước 5 (chặn ghi) quan trọng: nếu không chặn, trong lúc chuyển có đơn mới ghi vào
project cũ, thì sau khi đã chuyển sang mới, những đơn đó **không có ở đâu cả** trong dữ liệu đang
dùng — và đường lui cũng không còn sạch.

## Việc tôi làm được / không làm được

| Việc | Ai |
|---|---|
| Áp migration lên project mới, đối chiếu schema, chạy test | **Tôi** — chỉ cần connection string |
| Dump/restore, đối chiếu số đếm, đo độ trễ sau | **Tôi** |
| Tạo project Supabase mới, đổi env trên Vercel, deploy | **Bạn** — cần tài khoản |
| Chép `.env.local` mới sang laptop tại quán | **Bạn** — cần ra quán |
