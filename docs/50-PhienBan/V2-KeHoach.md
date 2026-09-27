# Kế hoạch V2 — Hệ thống nhà hàng SaaS

> **Trạng thái:** ĐỀ XUẤT (nháp) — chờ chốt. Lập 25/07/2026 · **Sửa 27/07/2026** (đổi trọng tâm V2 sang **đa chi nhánh**; hoãn BILLING + BRAND sang V3).
> **Nguồn:** các hạng mục đã chủ động hoãn khỏi V1 trong `15-QuyetDinh/QD-005` (D11–D14), `QD-006` (F2),
> `00-TongQuan/BanDoLienKet.md`, `10-BanThietKe/02-FrontendChiTiet.md`, và báo cáo P3.
> **Điều kiện tiên quyết:** V1.0 đã phát hành (Roadmap P6 xong).
> **Quy trình (VibeCode):** tài liệu này chỉ là *khung định hướng*. Mỗi giai đoạn V2 vẫn phải có
> **1 QĐ (`QD-0xx`) + danh sách yêu cầu đo được (`20-DanhSachYeuCau/`) + kế hoạch chi tiết (`30-KeHoach/`)**
> được duyệt **trước khi code** — không code thẳng từ file này.

> **Cập nhật 27/09/2026 — đã chuyển thành kế hoạch chính thức:** V2-A → **P15** (`QD-023`: **đổi hướng**, chi nhánh = tenant +
> tầng thương hiệu thay vì thêm `branch_id`), REPORT của V2-B → **P16** (mã mới REPORT-15..19 vì REPORT-04..14 đã dùng),
> V2-C → **P17** (`QD-024`). KDS bump-bar **không làm** (chủ dự án giữ KDS chỉ xem, `QD-021` C4). DELIV-* chưa xếp lịch.
> BILLING của V3-A được thay một phần bởi **P13** (`QD-021`: thuê bao gia hạn tay, một gói). File này giữ để tham khảo lịch sử.

## Thay đổi phạm vi V2 (27/07/2026)
- **Bổ sung — trọng tâm mới:** hỗ trợ **một nhà hàng có nhiều chi nhánh** (multi-branch). Đây là thay đổi
  nền tảng (chạm schema rộng), nên xếp **đầu V2**.
- **Hoãn sang V3:** **BILLING** (thương mại hóa: gói cước, subscription, thu phí) và **BRAND**
  (subdomain + màu/theme per-tenant). Lý do: (1) ưu tiên chiều sâu vận hành thực tế trước khi thu phí;
  (2) mô hình gói cước nên tính **theo số chi nhánh** — làm đa chi nhánh trước thì V3 định giá mới đúng.
  Phác thảo BILLING/BRAND giữ ở cuối file (§V3) để không mất công phân tích đã có.

## V2 là gì (một câu)
V1 chứng minh **một nhà hàng (một điểm bán) vận hành trọn vẹn** (order → bếp → tiền → báo cáo → kênh online).
**V2 mở rộng cho chuỗi nhiều chi nhánh** dưới cùng một chủ, cộng chiều sâu vận hành
(giao hàng đầy đủ, báo cáo sâu theo chi nhánh, bếp bump-bar) và độ tin cậy offline.

## Nguồn gốc từng hạng mục (truy vết V1 → V2)
| Mã V2 (đề xuất) | Hạng mục | V1 đã làm gì | Nguồn |
|---|---|---|---|
| BRANCH-* | Nhiều chi nhánh/tenant: dữ liệu + nhân sự + báo cáo tách theo chi nhánh | V1 giả định **1 tenant = 1 điểm bán**; mọi bảng chỉ có `tenant_id` | **Mới (yêu cầu chủ dự án 27/07/2026)** |
| DELIV-* | Giao/mang về đầy đủ: phí giao, vùng giao, tài xế | Tối thiểu — chỉ vòng đời trạng thái + liên hệ khách | QD-005 **D11** |
| REPORT-* (mở rộng) | Báo cáo theo nhân viên / khu vực / **chi nhánh** + hợp nhất chuỗi | Doanh thu ngày/tuần/tháng + món bán chạy + theo phương thức TT (1 điểm) | QD-005 **D12** + BRANCH |
| KDS-* | Bump-bar bếp (thao tác bắt đầu/xong) | KDS chỉ để xem; enum `preparing/ready` giữ sẵn | Báo cáo P3 (§KDS view-only) |
| PWA-* | PWA offline (đệm khi mất mạng) | Online-only; PWA chỉ cài được lên màn hình chính | QD-005 **D14** |

> **Hoãn sang V3 (xem §V3 cuối file):** BILLING-* (thương mại hóa SaaS) và BRAND-* (thương hiệu riêng tenant).

> **Không nằm trong V2 (là V1.x — hậu phần cứng):** cầu in cục bộ để tự in ≤5s (PrintAdapter đã chừa sẵn,
> chờ máy in thật). Xem `00-TongQuan/Roadmap.md` §Rủi ro.

---

## Hành trình V2 (đề xuất — thứ tự ưu tiên có thể chỉnh)
Nền đa chi nhánh trước (thay đổi schema rộng nhất, mọi thứ sau xây trên nó) →
chiều sâu vận hành (giao hàng, báo cáo chuỗi, bump-bar) → độ tin cậy offline.

- **V2-A — Đa chi nhánh** (BRANCH): mô hình chi nhánh, tách dữ liệu/nhân sự theo chi nhánh, chọn chi nhánh ở POS/KDS, di trú dữ liệu V1.
- **V2-B — Vận hành nâng cao** (DELIV + REPORT + KDS): giao hàng đầy đủ, báo cáo sâu theo chi nhánh + hợp nhất, bump-bar bếp.
- **V2-C — Độ tin cậy** (PWA): đệm offline cho POS/KDS/khách.

Mỗi giai đoạn kết thúc bằng demo chạy trên môi trường `dev` + checkpoint human-verify (ràng buộc như V1).

---

## V2-A — Đa chi nhánh (multi-branch)
**Mục tiêu:** Một chủ (tenant) quản nhiều **chi nhánh** (điểm bán) — mỗi chi nhánh có khu vực/bàn/QR, nhân sự,
order, bill, báo cáo **riêng**; chủ/quản lý xem được từng chi nhánh và hợp nhất cả chuỗi.
**Phụ thuộc:** V1 (tenant + memberships + toàn bộ bảng vận hành + RLS).

### Nguyên tắc kiến trúc (quan trọng — chốt trước khi code)
- **Cách ly vẫn ở mức TENANT.** Chi nhánh là **phạm vi con** trong một tenant, KHÔNG phải ranh giới cách ly mới.
  RLS `auth_tenant_ids()` (0002) giữ nguyên vai trò "cách ly tenant"; lọc theo chi nhánh là **chiều thứ hai**,
  làm ở tầng app (+ tùy chọn siết thêm RLS theo chi nhánh cho vai trò trạm). ⟵ **quyết định kiến trúc lớn nhất.**
- **Thêm cột `branch_id`** vào các bảng vận hành, không tạo tenant mới cho mỗi chi nhánh (giữ chi phí RLS/quản trị thấp).
- **Tương thích ngược:** V1 = tenant 1 chi nhánh. Di trú tạo **1 chi nhánh mặc định/tenant** rồi backfill `branch_id`
  cho mọi dòng cũ → sau đó đặt `NOT NULL`. Nhà hàng 1 điểm bán không thấy khác biệt (ẩn bộ chọn chi nhánh khi chỉ có 1).

**Yêu cầu (đề xuất — chi tiết hóa ở `20-DanhSachYeuCau/`):**
- BRANCH-01 — **Bảng `branches`** + CRUD chi nhánh trong admin (tên, mã, địa chỉ, SĐT, giờ mở, `active`). Owner tạo/sửa/tắt chi nhánh.
- BRANCH-02 — **Gắn `branch_id`** vào các bảng vận hành: `areas`, `tables`, `table_sessions`, `orders`, `bills`, `reservations`, `print_jobs`, `staff_calls`. (Bảng con như `order_items`, `bill_items`, `payments` suy ra chi nhánh qua cha — **không** thêm cột để tránh trùng lắp.)
- BRANCH-03 — **Nhân sự theo chi nhánh**: `memberships.branch_id` (NULL = toàn tenant). `owner`/`manager` mặc định toàn chuỗi; `cashier`/`waiter`/`kitchen`/`station` gán 1 (hoặc nhiều) chi nhánh. Cần QĐ: một nhân viên trạm có thể thuộc **nhiều** chi nhánh không.
- BRANCH-04 — **Bộ chọn chi nhánh** ở POS/KDS/admin: chọn 1 lần sau đăng nhập (lưu vào session), lọc mọi màn theo chi nhánh đang chọn; ẩn khi tenant chỉ có 1 chi nhánh.
- BRANCH-05 — **QR bàn suy ra chi nhánh**: bàn đã thuộc chi nhánh (qua `tables.branch_id`) nên `qr_token` tự mang ngữ cảnh chi nhánh; order khách QR gắn đúng chi nhánh **không cần đổi UX khách**.
- BRANCH-06 — **Menu dùng chung + phủ theo chi nhánh**: catalog `menu_categories`/`menu_items` **chung toàn tenant**; mỗi chi nhánh có **trạng thái còn/hết** riêng (và tùy chọn ghi đè giá). Cần QĐ: mức phủ (chỉ hết-món, hay cả giá).
- BRANCH-07 — **Di trú + backfill** dữ liệu V1: tạo chi nhánh mặc định/tenant, backfill `branch_id`, đặt `NOT NULL`, cập nhật RLS/index. Kèm test A ⊥ B (tenant) **và** kiểm chéo chi nhánh trong cùng tenant.
- BRANCH-08 — **Onboarding**: wizard V1 mặc định tạo 1 chi nhánh; thêm bước "thêm chi nhánh" (tùy chọn) cho chuỗi.

**Mô hình dữ liệu (phác thảo — 1 migration mới, ví dụ `0021_branches.sql`):**
```
branches(id, tenant_id fk, name, code, address, phone, opening_hours jsonb,
         settings jsonb, active bool, sort_order, created_at, updated_at)
  unique(tenant_id, code)

-- alter thêm cột (nullable → backfill → NOT NULL):
areas.branch_id, tables.branch_id, table_sessions.branch_id,
orders.branch_id, bills.branch_id, reservations.branch_id,
print_jobs.branch_id, staff_calls.branch_id
memberships.branch_id  (NULL = toàn tenant)

-- phủ menu theo chi nhánh:
menu_item_branch(menu_item_id fk, branch_id fk, available bool,
                 price_override numeric null)   -- primary key (menu_item_id, branch_id)
```
- **RLS:** `branches` — thành viên tenant đọc chi nhánh của tenant mình; ghi = owner/manager (kiểm role ở app). Các bảng vận hành: **giữ policy tenant hiện có** (cách ly không đổi); nếu cần chặn trạm xem chi nhánh khác thì thêm điều kiện `branch_id in (select auth_branch_ids())` — helper mới song song `auth_tenant_ids()`.
- **Index:** đổi các index nóng sang tiền tố `(tenant_id, branch_id, …)` (ví dụ `idx_tables_tenant_area_sort` → thêm `branch_id`), tránh full-scan khi lọc chi nhánh.

**Quyết định cần chốt trước khi code (mở QĐ mới, ví dụ `QD-010`):**
1. **Siết RLS theo chi nhánh hay chỉ lọc app?** Đề xuất: RLS giữ mức tenant + lọc chi nhánh ở app cho owner/manager; **siết RLS** cho vai trò trạm nếu yêu cầu bảo mật giữa chi nhánh cao. ⟵ lớn nhất.
2. **Nhân viên trạm 1 hay nhiều chi nhánh?** (1 chi nhánh → cột `branch_id` đơn giản; nhiều → bảng nối `membership_branches`.)
3. **Mức phủ menu theo chi nhánh:** chỉ còn/hết, hay cả **giá** riêng theo chi nhánh? (Ảnh hưởng bill + báo cáo.)
4. **Routing khách:** giữ `/r/[slug]` (chi nhánh suy từ QR bàn) hay thêm `/r/[slug]/[branch]` cho trang khách chọn chi nhánh (mang về/giao online)? Đơn dine-in không cần; đơn online **cần** khách chọn chi nhánh.
5. **Đặt bàn/đơn online** gắn chi nhánh thế nào: khách chọn chi nhánh trước khi đặt (bắt buộc khi >1 chi nhánh).

**Nghiệm thu:** owner tạo 2 chi nhánh → mỗi chi nhánh có bàn/QR/nhân sự riêng; đặt order ở chi nhánh A **không** hiện ở POS/KDS chi nhánh B; nhân viên trạm chỉ thấy chi nhánh được gán; menu chung nhưng "hết món" đặt riêng từng chi nhánh; báo cáo lọc theo chi nhánh **và** hợp nhất khớp tổng; di trú tenant V1 cũ chạy không mất dữ liệu (mọi dòng cũ về chi nhánh mặc định).

---

## V2-B — Vận hành nâng cao
**Mục tiêu:** Bổ sung chiều sâu cho nhà hàng có giao hàng thật, quản lý cần số liệu sâu (theo chi nhánh), bếp muốn thao tác.
**Phụ thuộc:** V1 (orders/channel, reports, KDS) + **V2-A** (mọi số liệu/đơn nay có chiều chi nhánh).
**Yêu cầu (đề xuất):**
- DELIV-01 — **Vùng giao + phí giao** (cấu hình theo chi nhánh): vùng (bán kính/khu vực) + phí theo vùng; cộng vào bill.
- DELIV-02 — **Tài xế**: gán đơn cho tài xế + trạng thái `assigned → picked → delivered`; màn hình tài xế tối giản. Tài xế thuộc chi nhánh.
- DELIV-03 — (tùy chọn) tích hợp bên thứ ba (Grab/ShopeeFood) — **cân nhắc, có thể để V3**.
- REPORT-04 — **Báo cáo theo nhân viên** (doanh thu/đơn/ca) — gắn `order`/`bill` với membership người thao tác.
- REPORT-05 — **Báo cáo theo khu vực/bàn** (công suất, doanh thu theo khu).
- REPORT-06 — **Báo cáo theo chi nhánh + hợp nhất chuỗi**: so sánh chi nhánh, tổng toàn chuỗi, lọc theo chi nhánh ở dashboard (mở rộng REPORT-01..03 của V1 thêm chiều `branch_id`).
- KDS-01 — **Bump-bar**: bật lại thao tác `preparing/ready` mức món ở KDS (enum đã giữ sẵn từ P3) — **cấu hình được** (mỗi chi nhánh chọn "chỉ xem" hay "bump-bar"), vì P3 đã chốt bếp thật tay bận.

**Ghi chú:** `orders.channel` (takeaway/delivery) + `customer_contact.address` đã có từ V1 (migration 0008/0015). DELIV chủ yếu thêm bảng `delivery_zones` (có `branch_id`), cột phí, và (nếu làm) `drivers` + gán đơn. KDS-01 tái dùng enum `preparing/ready` còn nguyên trong DB. REPORT mở rộng dựa trên chiều `branch_id` do V2-A thêm.

**Nghiệm thu:** đặt đơn giao → tính đúng phí theo vùng của chi nhánh → gán tài xế → giao xong; báo cáo lọc theo nhân viên/khu vực/chi nhánh khớp số + hợp nhất chuỗi đúng tổng; bật bump-bar → bếp đổi trạng thái món, khách stepper phản ánh đúng.

---

## V2-C — Độ tin cậy (offline)
**Mục tiêu:** POS/KDS/khách vẫn dùng được khi mạng chập chờn — không mất order.
**Phụ thuộc:** V1 (PWA installable đã có ở P6).
**Yêu cầu (đề xuất):**
- PWA-01 — **Đệm đọc offline**: menu/bàn/đơn đang mở cache được (service worker) để xem khi rớt mạng.
- PWA-02 — **Hàng đợi ghi offline**: order tạo lúc offline được xếp hàng + đồng bộ khi có mạng lại (idempotent, chống trùng).
- PWA-03 — Chỉ báo trạng thái mạng rõ ràng + xử lý xung đột khi đồng bộ.

**Rủi ro:** đồng bộ offline + realtime + RLS + đa thiết bị (nay thêm đa chi nhánh) là phần **khó nhất V2** —
cần QĐ mô hình đồng bộ (last-write-wins vs hàng đợi lệnh) và có thể tách thành nhiều lát nhỏ.
Cân nhắc chỉ làm PWA-01 (đọc) ở V2, để PWA-02/03 (ghi) sang V2.1 nếu rủi ro cao.

**Nghiệm thu:** ngắt mạng → POS vẫn xem menu/bàn; tạo order offline → nối mạng → đồng bộ đúng, không trùng, không mất.

---

## Rủi ro & ghi chú xuyên suốt V2
| Rủi ro | Xử lý đề xuất |
|---|---|
| Thêm `branch_id` rộng làm rò/lộn dữ liệu chi nhánh | Di trú theo bước: nullable → backfill chi nhánh mặc định → NOT NULL; **test cách ly chi nhánh** (A ⊥ B trong cùng tenant) như bộ test RLS V1 |
| Di trú tenant V1 cũ làm mất/hỏng dữ liệu | Backfill trong 1 transaction + snapshot trước; chạy dev trước, kiểm tổng số dòng & doanh thu trước/sau bằng nhau |
| Chi phí thêm chiều `branch_id` cho realtime/broadcast/reports | Đổi index sang tiền tố `(tenant_id, branch_id, …)`; broadcast channel gắn chi nhánh nếu cần |
| Offline-sync xung đột dữ liệu (nay thêm đa chi nhánh) | Ưu tiên PWA-01 (đọc); PWA-02 (ghi) chỉ làm khi có mô hình idempotent rõ |
| Phình phạm vi V2 | Mỗi giai đoạn 1 QĐ + requirements đo được trước khi code; món "tùy chọn" (DELIV-03, PWA-02) tách sang V2.1 nếu cần |

## Bước tiếp theo (nếu chốt kế hoạch này)
1. Xác nhận **thứ tự ưu tiên** 3 giai đoạn (A→B→C) và phạm vi tối thiểu mỗi giai đoạn.
2. Mở **QĐ đầu tiên** cho V2-A (`15-QuyetDinh/QD-010-DaChiNhanh.md`) — trọng tâm: **cách ly chi nhánh (RLS vs app), phủ menu, nhân sự 1/nhiều chi nhánh, routing khách online**.
3. Viết `20-DanhSachYeuCau/` cho BRANCH-01..08 (tiêu chí đo được), rồi `30-KeHoach/V2-A/` theo GSD như P4/P5.

> Ghi chú: các mã yêu cầu (BRANCH-*, DELIV-*, REPORT-*, KDS-*, PWA-*) là **đề xuất**; chốt chính thức khi đưa vào `20-DanhSachYeuCau/00-Requirements.md`.

---

## V3 (hoãn từ V2) — Thương mại hóa + Thương hiệu riêng
> Chuyển từ V2 sang V3 ngày 27/07/2026. Giữ phác thảo để V3 kế thừa. Định giá gói cước nên **tính theo số chi nhánh** (V2-A đã có mô hình chi nhánh).

### V3-A — Thương mại hóa SaaS (BILLING)
**Mục tiêu:** Chủ nhà hàng tự đăng ký, chọn gói, thanh toán định kỳ; hệ thống tự cấp/khóa quyền theo gói.
**Phụ thuộc:** V1 (tenant + super-admin + auth) + **V2-A** (hạn mức theo số chi nhánh).
**Yêu cầu (phác thảo):**
- BILLING-01 — Danh mục **gói cước** (Free / Pro / Chain) + hạn mức (số **chi nhánh**, số bàn, số nhân viên, tính năng bật/tắt).
- BILLING-02 — **Đăng ký tự phục vụ**: tạo tenant + chọn gói không cần super-admin thao tác tay.
- BILLING-03 — **Subscription định kỳ** (tháng/năm) + trạng thái `active/past_due/canceled` + hết hạn dùng thử.
- BILLING-04 — **Thu phí**: tích hợp cổng thanh toán (QĐ chọn nhà cung cấp: Stripe vs VNPay/MoMo/Casso). Webhook cập nhật trạng thái.
- BILLING-05 — **Enforcement hạn mức**: chặn vượt gói (ví dụ tạo **chi nhánh** thứ N+1 khi gói giới hạn N) + trang nâng cấp.
- BILLING-06 — **Trang quản trị super-admin**: xem MRR, subscription, gia hạn/hủy thủ công (fallback).

**Mô hình dữ liệu (phác thảo):**
```
plans(id, code, name, price_month, price_year, limits jsonb, features jsonb, active)
subscriptions(id, tenant_id fk, plan_id fk, status, current_period_end,
              trial_ends_at, external_customer_id, external_sub_id, created_at)
usage_counters(tenant_id, metric, value)   -- hoặc đếm động qua count()
billing_events(id, tenant_id, type, payload jsonb, created_at)  -- audit webhook
```
- RLS: `subscriptions` — owner đọc gói của tenant mình; super-admin đọc tất cả. `plans` public-read.
- Enforcement đặt ở **server action + middleware** (không tin client); nguồn sự thật = `subscriptions.status` + `plans.limits`.

**Quyết định cần chốt (mở QĐ khi tới V3):**
1. **Cổng thanh toán:** nội địa (VNPay/MoMo/Casso — hợp thị trường VN, hóa đơn VND) **vs** Stripe. ⟵ lớn nhất.
2. Mô hình gói: theo **số chi nhánh** (khuyến nghị, khớp V2-A) hay số bàn/doanh thu? Có gói Free vĩnh viễn không?
3. Xử lý khi `past_due`: khóa mềm (chỉ đọc) hay khóa cứng? Ân hạn bao lâu?

**Nghiệm thu:** chủ mới đăng ký → dùng thử → hết hạn/thanh toán → gói `active`; vượt hạn mức bị chặn có thông báo nâng cấp; super-admin thấy danh sách subscription + trạng thái đúng.

### V3-B — Thương hiệu riêng cho tenant (BRAND)
**Mục tiêu:** Mỗi nhà hàng có địa chỉ + màu sắc riêng, cảm giác "app của chính họ".
**Phụ thuộc:** V1 (routing slug, design system CSS vars), nên gắn gói (BRAND thường là quyền của gói trả phí).
**Yêu cầu (phác thảo):**
- BRAND-01 — **Subdomain per-tenant**: bật cờ `ENABLE_SUBDOMAIN` (đã chừa sẵn ở middleware V1); `pho-viet.<domain>` ⇄ `/r/pho-viet`. Cấu hình wildcard DNS + Vercel domains.
- BRAND-02 — **Màu thương hiệu**: mở nguồn biến `--tenant-primary` từ `tenants.settings.brand_color` (cơ chế CSS var đã chừa ở V1); admin đổi màu trong Cài đặt, xem trước.
- BRAND-03 — (tùy chọn) **Domain riêng của khách** (`order.nhahang.com`) — cần QĐ về xác minh domain + SSL; có thể hoãn tiếp.

**Ghi chú kỹ thuật:** V1 đã cố ý chừa 2 điểm mở này (subdomain code sẵn nhưng TẮT; CSS var `--tenant-primary` mặc định `#fa520f`). BRAND-01/02 **không cần refactor component**, chỉ mở nguồn biến + bật cờ + kiểm tương phản (accessibility: màu tenant phải đạt contrast tối thiểu — cần guard).

**Nghiệm thu:** truy cập `pho-viet.<domain>` ra đúng tenant; đổi màu trong admin → toàn bộ bề mặt khách/POS đổi màu, vẫn đạt tương phản AA; tenant khác không ảnh hưởng.
