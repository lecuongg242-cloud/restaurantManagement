# QD-012 — Cứng hóa đa tenant trước khi mở nhiều nhà hàng

> Lập 23/09/2026. Nguồn: rà soát P7 (39 migration, `lib/`, `middleware.ts`, luồng cấp tenant).
> Bối cảnh: V1.0 chạy tốt với 1–2 quán. Chủ dự án muốn mở nhiều nhà hàng.
> Phạm vi QĐ này: **chỉ 3 lỗ hổng chặn đường**. Tối ưu tải (realtime, rate limit) và mô hình gói
> cước KHÔNG nằm ở đây — gói cước đã hoãn sang V3 theo `50-PhienBan/V2-KeHoach.md`.

## Nền đã tốt (không sửa)

Rà soát xác nhận phần khó nhất đã làm đúng, QĐ này không đụng tới:

- 23/23 bảng bật RLS; 18 bảng có `tenant_id`; index đều là composite mở đầu bằng `tenant_id`.
- `auth_tenant_ids()` / `is_super_admin()` là `security definer`, tránh đệ quy policy (`0002`).
- Nhân viên là auth user thật (PIN suy dẫn mật khẩu — QD-009) nên POS/KDS chạy dưới RLS,
  không phải service-role.
- Hàm báo cáo `0023`/`0029`/`0037` đều `security invoker` + lọc `tenant_id` tường minh.
- Realtime `postgres_changes` đã lọc `tenant_id=eq.` ở cả POS lẫn KDS.

Service-role chỉ xuất hiện ở 17 chỗ trong `app/` + `lib/`, mỗi chỗ đều tự scope theo
`tenant_id`/`slug`. Đó là mức kỷ luật đủ để mở rộng — trừ 3 điểm dưới đây.

---

## §1. Cầu in KHÔNG được giữ service-role trên máy quán

**Vấn đề.** `scripts/print-bridge.mjs:245` đọc `SUPABASE_SERVICE_ROLE_KEY` từ `.env.local` đặt
trên máy tính **tại quán**. Service-role bỏ qua RLS ⇒ một máy quán bị mất, bị nhân viên copy
file, hay bị nhiễm mã độc là lộ **toàn bộ dữ liệu của mọi nhà hàng**. Việc script có lọc
`tenant_id=eq.${tenantId}` không phải ràng buộc bảo mật — đó chỉ là quy ước của chính script,
người cầm khóa sửa một dòng là bỏ được.

Với 1 quán do chính chúng ta vận hành thì rủi ro chấp nhận được. Với nhiều quán, mỗi quán mở
thêm là thêm một bản sao khóa chủ đặt ở nơi ta không kiểm soát — rủi ro cộng dồn tuyến tính,
và hậu quả là toàn hệ thống chứ không phải một quán.

**Quyết định.** Cầu in đăng nhập bằng **tài khoản thiết bị riêng của từng quán**, vai trò mới
`printer`, dùng **anon key + email/mật khẩu** như mọi client khác. Service-role bị loại hoàn
toàn khỏi máy quán.

- Vai trò `printer` thêm vào ràng buộc `memberships.role` (migration `0038`).
- `print_jobs` **không cần policy mới**: policy `print_jobs_tenant_all` (`0010`) đã dựa trên
  `auth_tenant_ids()`, nên tài khoản `printer` có membership ở tenant nào thì thấy đúng tenant đó.
- `canAccess(role, section)` trả `false` cho **mọi** section khi `role === 'printer'` ⇒ khóa cầu
  in bị lộ **không mở được** `/admin`, `/pos`, `/kds`.
- Bridge **không còn** biến `PRINT_TENANT_SLUG`/`PRINT_TENANT_ID`. Tenant suy ra từ chính token
  (`/memberships?select=tenant_id`). Cấu hình sai tenant trở thành chuyện không thể xảy ra.
- Token hết hạn: gặp HTTP 401 thì **đăng nhập lại một lần rồi thử lại**, không theo dõi hạn
  token. Đơn giản hơn refresh-token và bền hơn với tiến trình chạy nhiều ngày.

**Đánh đổi đã biết — rủi ro còn lại.** Tài khoản `printer` vẫn có membership ở tenant, nên
`auth_tenant_ids()` vẫn cho nó **đọc các bảng khác của CHÍNH quán đó** qua PostgREST thô (đơn,
bill của quán mình). Bịt nốt phần này đòi hỏi policy nhận biết vai trò trên cả 18 bảng — thay
đổi rộng, rủi ro cao, lợi ích nhỏ (kẻ cầm được máy ở quán đó vốn đã đứng trong quán đó).

Bán kính thiệt hại đi từ **“mọi nhà hàng, mọi bảng”** xuống **“một nhà hàng, chỉ đọc”**. Đó là
phần lớn giá trị với một phần nhỏ thay đổi. Nếu sau này cần siết tiếp, hướng đã rõ: helper
`auth_is_printer()` + loại trừ trong policy từng bảng.

**Phương án đã cân nhắc và loại.** Bridge gọi một endpoint `/api/print/poll` của app bằng device
token, app giữ service-role phía server. Bảo mật tốt tương đương và siết được đúng `print_jobs`,
nhưng thêm một bề mặt API phải tự lo xác thực/đánh số/nhịp gọi, và làm mất tính chất
“copy 1 file + `.env.local` sang laptop là chạy” của cầu in. Chọn phương án tài khoản riêng vì ít
bộ phận chuyển động hơn (`Simplicity first`).

---

## §2. `tenants.status = 'suspended'` phải thực thi được

**Vấn đề.** `/super` cho bật/tắt `status`, `app/super/actions.ts:209` ghi giá trị, nhưng **không
có chỗ nào trong app hay RLS đọc nó**. Quán bị tạm ngưng vẫn gọi món, in bếp, đóng bill, xem báo
cáo bình thường. Không khóa được quán = không có đòn bẩy nào khi khách không trả tiền, và không
có cách cô lập một quán đang gây sự cố.

**Quyết định.** Thực thi ở **một điểm trong DB**: `auth_tenant_ids()` chỉ trả tenant có
`status = 'active'` (migration `0039`).

Một hàm đổi, 18 bảng khóa theo — vì mọi policy tenant đều đi qua hàm này. Đây là lý do chọn nó
thay vì rải điều kiện ở tầng app: tầng app quên một chỗ là thủng, DB thì không.

Hệ quả phải xử lý kèm:

- Owner/nhân viên của quán bị ngưng sẽ thấy **rỗng** ở mọi nơi, kể cả `tenants` (policy
  `tenants_member_read` cũng gọi hàm này) ⇒ `getSessionMembership` trả `null` ⇒ guard đá về
  `/admin/login` ⇒ đăng nhập lại thành công ⇒ **vòng lặp chuyển hướng**. Chốt chặn đặt ở
  `app/r/[slug]/layout.tsx`: layout này bao **mọi** bề mặt `/r/[slug]/*` (khách, POS, KDS, admin,
  in), nên kiểm một chỗ là phủ hết, và nó **render thẳng** màn "tạm ngưng" thay vì chuyển hướng —
  không chuyển hướng thì không có vòng lặp nào để mà sai.
- Route handler (`/api/order`, `/api/call`, `/api/online-order`, `/api/order/[id]`) **không** đi
  qua layout. Bốn đường này chạy bằng service-role và đều đã có sẵn nhánh "không tìm thấy nhà
  hàng", nên chỉ cần tra tenant qua helper chung `activeTenantBySlug()` — quán bị ngưng rơi đúng
  vào nhánh sẵn có, không phải viết thêm lối xử lý lỗi nào.
- Super-admin **không** bị ảnh hưởng (`is_super_admin()` là nhánh riêng) — vẫn mở khóa lại được.

**Đánh đổi.** Khóa là **tức thì và toàn phần**: quán đang phục vụ khách mà bị ngưng nhầm thì POS
đứng ngay giữa ca. Chấp nhận, vì đây đúng là hành vi mong muốn của một công tắc khóa, và thao
tác ngưng nằm sau `/super` chỉ super-admin vào được. Không làm cơ chế “ngưng có ân hạn” ở V1.1 —
chưa có mô hình gói cước thì chưa có khái niệm quá hạn (`YAGNI`).

---

## §3. Test RLS phải phủ 18 bảng, không phải 2

**Vấn đề.** `tests/rls/tenant-isolation.test.ts` chỉ chạm `tenants` và `memberships`. 16 bảng
mang `tenant_id` còn lại có policy nhưng **chưa từng được kiểm chéo tenant**. Với 1 quán, một
policy viết sai là vô hình. Với 30 quán, đó là doanh thu quán này lọt sang quán kia.

QĐ này còn sửa đúng hai thứ ở §1 và §2 (`memberships.role`, `auth_tenant_ids`) — cả hai đều nằm
ngay trên đường đi của mọi policy. Sửa chúng mà không có lưới an toàn là đánh cược.

**Quyết định.** Dựng **ma trận RLS tự động** phủ toàn bộ 18 bảng có `tenant_id`, mỗi bảng 4 phép:
đối chứng dương (A đọc của A ≥ 1 dòng) · đọc chéo (A đọc của B = 0 dòng) · ghi chéo (A insert
mang `tenant_id` của B → bị từ chối) · sửa chéo (A update/delete dòng của B → 0 dòng đổi, đối
chiếu lại bằng service-role thấy dữ liệu B nguyên vẹn).

**Cách dựng dữ liệu.** Fixture **tự tạo trong `beforeAll` bằng service-role**, UUID cố định, dọn
sạch ở `afterAll`. Không dựa vào `seed-demo-data.mjs`: bộ đó chỉ phủ 6 bảng, chỉ chạy cho slug
demo, và gắn test vào trạng thái dữ liệu bên ngoài.

Service-role **chỉ** dùng để dựng/dọn fixture và để đối chiếu ở phép “sửa chéo”. Mọi khẳng định
về quyền đều chạy bằng **anon key + phiên đăng nhập thật**, đúng như client production. Dùng
service-role để assert sẽ luôn xanh và không chứng minh gì cả.

---

## Thứ tự thực hiện

`07-01` (ma trận RLS) làm **trước**, rồi `07-02` (cầu in) và `07-03` (khóa tenant) — hai việc sau
chạy song song được.

Lý do ma trận đi đầu dù không phải lỗ hổng: nó là thiết bị đo cho hai việc còn lại. `07-02` thêm
vai trò vào `memberships`, `07-03` viết lại `auth_tenant_ids()` — cả hai đều có thể làm thủng
cách ly tenant theo cách không ai nhìn thấy bằng mắt. Có ma trận trước thì mỗi thay đổi được
chấm điểm ngay; không có thì phải kiểm thủ công 18 bảng × 2 lần.

Chi tiết từng phần: `30-KeHoach/P7/07-01-PLAN.md` … `07-03-PLAN.md`.
