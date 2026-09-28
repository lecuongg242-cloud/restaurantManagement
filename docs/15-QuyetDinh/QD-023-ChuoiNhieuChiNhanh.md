# QD-023 — Chuỗi nhiều chi nhánh: chi nhánh = tenant, thêm tầng thương hiệu

**Ngày:** 27/09/2026 · **Trạng thái:** ĐÃ CHỐT 27/09/2026 — D1, D4, D7, U1 chủ dự án chọn sau khi xem bảng đối thủ
(`30-KeHoach/P15/00-TongQuan.md` §Đối thủ làm thế nào); U2, U3 theo đề xuất mặc định.
**Kế hoạch:** `30-KeHoach/P15/` · **Yêu cầu:** BRANCH-01..08
**Thay thế:** nguyên tắc kiến trúc ở `50-PhienBan/V2-KeHoach.md` §V2-A (dòng 57–63: thêm `branch_id` vào từng bảng).
**Liên quan:** QD-009 (email + PIN), QD-012 (cách ly tenant), QD-021 D6–D8 (hạn dùng theo tenant)

## Bối cảnh

Chủ dự án xếp chuỗi nhiều chi nhánh ngay sau P13/P14: một tài khoản quản nhiều quán, báo cáo gộp, thực đơn dùng
chung. V2-A (07/2026) đề xuất **thêm `branch_id`** vào các bảng vận hành, giữ cách ly ở mức tenant. Rà code
27/09/2026 cho thấy hệ thống đã lớn hơn lúc viết V2-A rất nhiều:

| Thứ đã gắn chặt với `tenant_id` | Số lượng / vị trí |
|---|---|
| Bảng mang `tenant_id` | **25** (kể cả kho P10, cầu in P11, `daily_closes`) |
| Policy RLS / chỗ gọi `auth_tenant_ids()` | 36 policy / 69 chỗ |
| Truy vấn `.eq("tenant_id")` ở tầng app | 241 chỗ trong 43 file |
| Hàm SQL báo cáo, kho nhận `p_tenant` | 29 |
| Bộ đếm theo ngày `bill_no`, `kitchen_no` | max + 1 theo tenant, 9 chỗ gọi |
| Một cầu in mỗi quán | `printer_heartbeats` có PK = `tenant_id` |
| Chốt sổ ngày | unique `(tenant_id, business_date)` |
| Khóa quán, hạn dùng | `auth_tenant_ids()` (0039), `tenants.paid_until` (QD-021) |

Thêm `branch_id` nghĩa là rà cả 241 truy vấn. **Quên một chỗ là rò dữ liệu chéo chi nhánh một cách âm thầm**,
vì RLS vẫn cho qua (cùng tenant).

## Quyết định (đề xuất)

| # | Việc | Chọn | Vì sao | Phương án bị loại |
|---|---|---|---|---|
| D1 | Chi nhánh là gì | **Mỗi chi nhánh là một tenant** như hiện nay (slug, bàn, nhân viên, máy in, kho, hạn dùng riêng). Thêm bảng **`brands`** + `tenants.brand_id` (rỗng = quán lẻ) | 25 bảng, 36 policy, 241 truy vấn, 29 RPC, bộ đếm, cầu in, chốt sổ **không đổi**. Cách ly giữa chi nhánh do **RLS** bảo đảm (trạm chi nhánh A không đọc được B), không dựa vào app | Thêm `branch_id` vào từng bảng (V2-A) — rủi ro rò âm thầm, diff rất rộng |
| D2 | Ai quản cả chuỗi | Bảng **`brand_members(brand_id, user_id, role: owner \| manager)`**. Tạo chi nhánh mới → tự thêm membership `owner`/`manager` ở tenant mới cho mọi người của thương hiệu. Vẫn **một** tài khoản đăng nhập | `auth_tenant_ids()` giữ nguyên (đọc `memberships`) | Hàm cổng mới `auth_brand_ids()` trong mọi policy |
| D3 | Chuyển chi nhánh | **Bộ chọn chi nhánh** ở header admin/POS cho người thuộc nhiều tenant cùng thương hiệu → đổi URL `/r/{slug}`. Không đổi mô hình phiên (URL quyết định tenant như hiện nay) | Không đụng `getSessionMembership` | Lưu "chi nhánh đang chọn" trong phiên |
| D4 | Thực đơn dùng chung | Một **chi nhánh gốc** giữ thực đơn chuẩn; nút **"Đồng bộ thực đơn"** chép danh mục, món, tùy chọn sang các chi nhánh khác, nối bằng cột `source_id`. Chi nhánh **giữ riêng** giá (nếu đã sửa) và trạng thái hết món | Không đổi 5 bảng menu, policy menu, cache menu, snapshot giá trong order | Chuyển menu lên cấp thương hiệu (`brand_id` trên 5 bảng + bảng phủ) — đụng policy, cache, luồng gọi món |
| D5 | Báo cáo gộp | RPC báo cáo mới nhận **mảng tenant** (`p_tenants uuid[]`), `security invoker` ⇒ RLS tự lọc còn các chi nhánh người xem thuộc về. Màn **Tổng quan chuỗi** + so sánh chi nhánh | Tái dùng công thức RPC cũ; không thể xem chi nhánh không có quyền | Gọi lặp từng chi nhánh rồi cộng ở JS — dễ lệch quy ước |
| D6 | Khách chọn chi nhánh | Trang thương hiệu **`/b/{brand}`** liệt kê chi nhánh (địa chỉ, giờ mở) → dẫn vào `/r/{slug}/online` hoặc đặt bàn. QR tại bàn không đổi | Không đổi luồng khách hiện có | Route `/r/{slug}/{branch}` |
| D7 | Nhân viên | **Mỗi nhân viên thuộc một chi nhánh** (giữ unique email của QD-009). Nhân viên làm nhiều chi nhánh → tài khoản riêng từng chi nhánh | Không đụng đăng nhập PIN | Nhân viên đa chi nhánh — khi có quán yêu cầu |

## Thuê bao của chuỗi (chủ dự án hỏi 27/09/2026: "tính theo thương hiệu được không?")

**Được, và nên làm vậy — nhưng số tiền vẫn nhân theo số chi nhánh.**

| # | Việc | Chọn (đề xuất) | Vì sao |
|---|---|---|---|
| D8 | Ai trả, trả mấy lần | **Thương hiệu là một tài khoản thanh toán:** một ngày hết hạn chung cho mọi chi nhánh, một lần chuyển khoản, một mã QR gia hạn (nội dung `GH {brand}`), một dòng nhật ký | Chủ chuỗi không phải nhớ nhiều ngày hết hạn; không có chuyện một chi nhánh bị khóa vì quên gia hạn riêng |
| D9 | Tính bao nhiêu | **Giá gói × số chi nhánh đang hoạt động, KHÔNG giảm** (chốt 27/09/2026, giống KiotViet/CUKCUK). Gói = các gói super-admin tự đặt (`platform_plans`, 0061) | Một giá cố định cho cả thương hiệu ⇒ chuỗi 10 quán trả như 1 quán, trong khi hỗ trợ, cài đặt, máy in, hạ tầng nhân 10. Mọi đối thủ đều tính theo chi nhánh (KiotViet +270–375k, CUKCUK +199–499k/chi nhánh) |
| D10 | Mở chi nhánh giữa kỳ | Chi nhánh mới dùng **ngay**, hết hạn cùng ngày chung, **không thu bù** kỳ đang chạy; kỳ gia hạn sau tính đủ số chi nhánh | Đơn giản, không phải tính tiền lẻ theo ngày; khuyến khích mở thêm |
| D11 | Đóng một chi nhánh | Owner tắt chi nhánh → không tính ở kỳ sau; dữ liệu giữ nguyên | Không phạt khách |
| D12 | Kỹ thuật | **Giữ `paid_until` trên từng tenant** (cổng khóa `auth_tenant_ids()` của QD-021 D7 không đổi). Ghi nhận gia hạn thương hiệu = RPC đặt `paid_until` của **mọi** chi nhánh về cùng một ngày trong **một** giao dịch | Không thêm join `brands` vào hàm nằm trong mọi policy |

Quán lẻ (không thương hiệu) gia hạn như QD-021 D8. Plan: `30-KeHoach/P15/15-07-PLAN.md`, yêu cầu BRANCH-08.

## Chưa quyết

| # | Việc | Đề xuất mặc định |
|---|---|---|
| U1 | Mức giảm từ chi nhánh thứ 2 | **Chốt: không giảm** — giá gói × số chi nhánh |
| U2 | Đồng bộ thực đơn có ghi đè giá chi nhánh đã sửa không | **Chốt: không** — giá chỉ chép khi chi nhánh chưa sửa (`price_locked`) |
| U3 | Đồng bộ luôn định lượng/nguyên liệu (P10) không | **Chốt: chưa** — mỗi chi nhánh tự khai |

## Hệ quả

- Quán lẻ hiện có không thay đổi gì (`brand_id` rỗng, không thấy bộ chọn chi nhánh).
- Super-admin cần thao tác "gộp quán vào thương hiệu" và "tạo chi nhánh mới" (chép cài đặt, không chép dữ liệu bán).
- Sửa `app/super/actions.ts:109-122`: tái dùng tài khoản owner **không** được đặt lại mật khẩu.
- Khách hàng (P16), voucher (P19) sau này cần phạm vi "toàn thương hiệu" ⇒ đọc qua mảng tenant như D5.
- V2-KeHoach §V2-A giữ để tham khảo lịch sử; BRANCH-* chính thức nằm trong `00-Requirements.md`.

## Sửa 27/09/2026 (chủ dự án, sau khi dùng thử)

| # | Trước | Nay | Vì sao |
|---|---|---|---|
| D2' | Super-admin tạo thương hiệu / chi nhánh | **Chủ quán tự tạo chi nhánh** trong admin quán (mục **Chi nhánh** → + Tạo chi nhánh). Lần đầu tự lập chuỗi, quán đang mở là chi nhánh gốc. Không giới hạn số lượng; chi nhánh mới dùng ngay tới hạn chung, **tính vào lần gia hạn sau**; chuỗi đang không giới hạn → chi nhánh mới có hạn từ hôm nay (RPC `create_my_branch`, 0067). `/super` → Thương hiệu giữ để hỗ trợ / sửa | KiotViet ("Tạo chi nhánh"), CUKCUK ("Thêm nhà hàng"), POS365 ("Thêm mới chi nhánh") đều để chủ quán tự làm |
| D3' | Khu quản trị chuỗi riêng `/b/{brand}/admin` | **Bỏ.** Mọi thứ trong admin quán: mục **Chi nhánh** (tổng quan hôm nay cả chuỗi, tạo chi nhánh, đồng bộ thực đơn), **Báo cáo** có phạm vi "Chi nhánh này / Tất cả chi nhánh", **Gia hạn** tính cả chuỗi. Ô chọn chi nhánh ở góc trên giữ nguyên. Trang khách `/b/{brand}` giữ | Không đối thủ nào có trang quản trị chuỗi riêng; thêm một địa chỉ phải nhớ gây khó cho chủ quán |
| — | Gỡ nhầm phải sửa tay trong DB | `/super` → Thương hiệu: **Gỡ khỏi thương hiệu**, **Xóa thương hiệu…**; `memberships.brand_id` tách quyền do chuỗi cấp khỏi quyền vốn có (0066) | Gắn nhầm qt-food 27/09/2026 |
