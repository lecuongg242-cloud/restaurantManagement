# 13-04 — SUMMARY: Gia hạn tay

> **ĐÃ ĐÓNG 28/09/2026** — chủ dự án kiểm tra quét QR thật và chốt đóng P13.

> **Trạng thái: CODE XONG, migration 0058 đã áp production** (27/09/2026). Còn chờ: QD-021 U3 — giá và tài khoản nhận của nền
> tảng (điền `PLATFORM_*` trên Vercel), sau đó quét QR thật + chạy vòng đầy đủ trên preview.

## Tệp đã đổi

- `supabase/migrations/0058_subscription_payments.sql` — bảng nhật ký (chỉ thêm). RLS đọc: super-admin + **owner** của quán;
  không ai chèn trực tiếp. RPC `record_subscription_payment(p_tenant, p_months, p_amount, p_note, p_start_limited)` — chỉ
  super-admin, khóa dòng tenant (`for update`), cộng từ `max(hôm nay VN, hạn cũ)`. `paid_until` rỗng thì từ chối, trừ khi
  `p_start_limited`.
- `lib/platform/config.ts` (mới) — `PLATFORM_BANK_*`, `PLATFORM_PRICE_MONTH/YEAR`, `PLATFORM_SUPPORT_PHONE`. Ghi vào
  `.env.local.example` (dự án không có `.env.example`).
- `lib/tenant/renewal.ts` (mới) — `ownerForRenewal` (dùng service-role **sau khi** kiểm phiên + owner active + quán không
  suspended), `renewalHistory`.
- `app/r/[slug]/admin/gia-han/page.tsx` (mới) — đặt **ngoài** nhóm `(protected)` vì guard của nhóm đó đọc qua RLS, mà quán
  bị khóa thì RLS đã loại quán. Trang hiện hạn + trạng thái, QR 1 tháng / 1 năm, nội dung `GH {slug}`, lịch sử.
- `app/r/[slug]/admin/actions.ts`, `app/r/[slug]/admin/login/page.tsx` — owner của quán hết hạn đăng nhập xong vào thẳng trang
  Gia hạn. `components/admin/AdminNav.tsx` — mục "Gia hạn" (chỉ owner).
- `/super` — "Ghi nhận gia hạn" (1/3/6/12 tháng, số tiền điền sẵn theo giá, ghi chú, ô xác nhận khi quán không giới hạn);
  5 lần gia hạn gần nhất mỗi quán; sắp theo hạn dùng (SUB-01).
- `lib/tenant/subscription.ts` — `congThang`, `hanSauGiaHan`, `noiDungGiaHan` (slug dài → cắt + 5 ký tự băm, ≤ 25 ký tự).
- Tests: `tests/rls/subscription-payments.test.ts` (mới, 15 test; tạo tài khoản super-admin/manager/cashier tạm với mật khẩu
  ngẫu nhiên, xóa ở `afterAll` — đã kiểm: 0 user tạm, 0 dòng nhật ký còn lại), `tests/tenant/subscription.test.ts`.
- Hướng dẫn: `docs/60-BanGiao/06-HuongDan-QuanLy.md` (cách gia hạn), `docs/50-PhienBan/TrucSuCo.md` §C (ghi nhận, sửa nhầm).

## Bằng chứng

- RPC: owner/manager/cashier gọi → `42501`, không đổi gì. Super-admin gọi → `paid_until` đổi + đúng 1 dòng nhật ký,
  `recorded_by` = super-admin. Quán không giới hạn → từ chối; bật cờ → hôm nay + 1 tháng. Còn 10 ngày + 3 tháng → cộng từ
  hạn cũ. Quá 20 ngày → cộng từ hôm nay. **Lỗi sau khi đã cập nhật hạn** (ghi chú 600 ký tự vi phạm ràng buộc) → hạn và nhật
  ký không đổi.
- RLS: owner B đọc được nhật ký của B, 0 dòng của A; manager/cashier đọc 0 dòng; super-admin đọc mọi quán.
- Vòng đầy đủ (test RLS): B quá ân hạn → owner B đọc orders = 0 → super-admin ghi nhận → owner B đọc lại được.
- Cộng tháng: 31/01 + 1 tháng = 28/02 (29/02 năm nhuận), khớp `date + interval` của Postgres.
- Chạy thật: quán bị khóa → `/admin/login` tự chuyển sang `/admin/gia-han`, có QR + "GH PHOVIET"
  (`anh/07-gia-han-khi-khoa.png`; cấu hình nền tảng là GIẢ, chỉ để chụp).

```
npm run test:rls → 304 passed · npm run test → 765 passed · schema:check khớp
```

## Cam kết

| Nghiệm thu | Trạng thái |
|---|---|
| 1. test + test:rls + schema:check | ☑ |
| 2. Preview vòng đầy đủ + quét QR bằng app ngân hàng | ☑ vòng khóa → gia hạn → mở (test RLS + local; vòng chuỗi có E2E ở P15); quét thật — chủ dự án kiểm tra 28/09/2026 |
| 3. Hướng dẫn quản lý + trực sự cố | ☑ |

## Bổ sung sau nghiệm thu đầu (chủ dự án 27/09/2026)

- **Trang Gia hạn của quán:** thêm gói **2 năm** (1 tháng · 1 năm · 2 năm). Giá = số năm × giá năm + tháng lẻ × giá tháng
  (`giaChoThang`).
- **`/super` → Ghi nhận gia hạn** có ba kiểu:
  - **Theo số tháng:** 1–12, 24, 36 tháng (RPC cũ).
  - **Chọn ngày hết hạn** trên lịch: hạn mới = đúng ngày chọn (`record_subscription_until`). Chỉ được kéo dài: ngày chọn phải
    sau hôm nay và sau hạn hiện tại. Số tiền gợi ý = số tháng làm tròn lên × giá.
  - **Vĩnh viễn:** quán thành không giới hạn (`record_subscription_lifetime`); giá gợi ý lấy từ `PLATFORM_PRICE_LIFETIME`.
- Migration `0059_subscription_lifetime.sql`: thêm cột `lifetime`; `months` và `paid_until_after` được rỗng, có ràng buộc
  kiểu dòng; thêm 2 RPC (chỉ super-admin, một giao dịch). RPC cũ giữ nguyên chữ ký. Đã áp production 27/09/2026.
- Test: +6 test RLS (quyền, đúng ngày, từ chối rút ngắn / ngày đã qua, cờ không giới hạn, vĩnh viễn mở quán đang khóa,
  ràng buộc kiểu dòng), +3 test thuần.

```
npm run test:rls → 310 passed · npm run test → 768 passed · schema:check khớp · tsc + lint sạch
```

## Chỉnh giao diện + nội dung chuyển khoản (chủ dự án 27/09/2026)

Chủ dự án chốt: **tạm thời chỉ đến bước ra QR** — chưa tự xác nhận tiền về (SePay/payOS để QD sau). Super-admin vẫn ghi
nhận tay.

- **Chỗ đặt trang Gia hạn** (theo kiểu Settings → Billing của Shopify/Notion/Slack): bỏ mục "Gia hạn" khỏi menu vận hành;
  thay bằng ô **Gói dịch vụ** ở chân sidebar (chỉ owner; cả drawer điện thoại): "Còn N ngày · hết hạn …" + "Gia hạn →",
  quán không giới hạn chỉ ghi "Không giới hạn". **Cài đặt** có thẻ "Gói dịch vụ" ở đầu trang. Đường dẫn `/admin/gia-han` giữ
  nguyên (lối vào khi quán bị khóa). `components/tenant/GoiDichVuThe.tsx` (mới), `AdminShell`, `AdminMobileNav`, `AdminNav`.
- **Nội dung chuyển khoản** đổi từ `GH {slug}` thành `GIAHAN {MÃQUÁN} {n}T` (vd `GIAHAN QTFOOD 12T`): đọc là biết việc gì,
  quán nào, gói mấy tháng; ≤ 25 ký tự (mã quán > 14 ký tự → 8 ký tự + 5 ký tự băm).
- **Khối thông tin chuyển khoản**: ngân hàng (tên đầy đủ), số TK, chủ TK, số tiền, nội dung — nút **Chép** cho số TK, số tiền,
  nội dung (`components/ui/copy-button.tsx`, mới); nội dung đóng khung kèm giải thích "= Gia hạn quán X, gói Y. Giữ nguyên
  nội dung này…"; 3 bước sau khi chuyển + số hỗ trợ.
- Test: `noiDungGiaHan` 3 ca (ngắn, dài phân biệt, đúng 25 ký tự). `npm run test` → 769 passed · tsc + lint sạch. Chụp thật
  (dev server riêng, cấu hình nền tảng GIẢ, `pho-viet` đặt hạn tạm rồi trả về rỗng): không tràn ngang ở 390px.

## Cài đặt nền tảng ở `/super` (chủ dự án 27/09/2026)

Tài khoản nhận tiền gia hạn, giá gói và số hỗ trợ trước đây chỉ đặt được bằng biến môi trường `PLATFORM_*` (phải sửa Vercel
rồi deploy lại). Giờ sửa được ở **`/super` → Cài đặt nền tảng**, có ô xem trước QR để quét thử.

- Migration `0060_platform_settings.sql` — bảng một dòng, chỉ super-admin đọc/ghi (RLS); ràng buộc định dạng BIN, số TK,
  tên, giá > 0. Đã áp production 27/09/2026; sau khi áp phải `notify pgrst, 'reload schema'` thì API mới thấy bảng.
- `lib/platform/merge.ts` (mới, thuần): DB là nguồn chính, env dự phòng TỪNG trường; tài khoản nhận lấy nguyên khối từ một
  nguồn. `lib/platform/config.ts`: `platformConfig()` thành async, đọc DB bằng service role, lỗi DB → dùng env.
- `app/super/cai-dat/` (mới), `savePlatformSettings` trong `app/super/actions.ts`, mục menu "Cài đặt nền tảng".
- Test: `tests/platform/merge.test.ts` (5), `tests/rls/platform-settings.test.ts` (3; chụp dòng hiện có và trả lại nguyên trạng).

```
npm run test → 774 passed · npm run test:rls → 313 passed · schema:check khớp · tsc + lint + build sạch
```

## Gói dịch vụ tự đặt (chủ dự án 27/09/2026)

Chủ dự án đặt giá vĩnh viễn 5.500.000đ nhưng tab "2 năm" ra 6.000.000đ (công thức 2 × giá năm). Yêu cầu: **tự đặt từng gói,
giá riêng, thêm/bớt tùy ý** — bỏ giá cố định tháng/năm/vĩnh viễn.

- Migration `0061_platform_plans.sql`: bảng `platform_plans` (tên, `months` 1–120 hoặc rỗng = vĩnh viễn, giá > 0, `visible`
  = hiện cho quán); RLS chỉ super-admin. Chuyển 3 giá đã lưu thành 3 gói (1 tháng 350.000 · 1 năm 3.000.000 · Vĩnh viễn
  5.500.000) rồi bỏ 3 cột giá của `platform_settings`. Đã áp production 27/09/2026 + `notify pgrst, 'reload schema'`.
- `/super` → Cài đặt nền tảng → **Gói dịch vụ**: mỗi gói một dòng sửa tại chỗ (tên, thời hạn / Vĩnh viễn, giá, Hiện cho quán,
  Lưu, Xóa) + dòng "Thêm gói". QR xem trước mang giá gói đầu tiên đang hiện.
- Trang Gia hạn của quán: tab = các gói đang hiện (tên + giá), QR đúng giá gói; gói vĩnh viễn nội dung `GIAHAN {MÃQUÁN} VV`.
- `/super` → Thuê bao → Ghi nhận gia hạn: chọn gói (điền sẵn thời hạn + giá), hoặc "Số tháng khác…" (1–36), hoặc "Chọn ngày
  hết hạn…"; giá gợi ý = gói đúng số tháng, không thì giá gói 1 tháng × số tháng.
- Bỏ `PLATFORM_PRICE_*` (env) và `giaChoThang` / `chonGoiGiaHan`. Mới: `lib/platform/plans.ts` (thuần), `plans-db.ts`,
  `app/super/cai-dat/PlanManager.tsx`, action `savePlan` / `deletePlan`.
- Test: `tests/platform/plans.test.ts` (5, gồm "2 năm dùng đúng giá gói 5.500.000"), +2 test RLS `platform_plans`.

```
npm run test → 776 passed · npm run test:rls → 315 passed · schema:check khớp · tsc + lint sạch
```
