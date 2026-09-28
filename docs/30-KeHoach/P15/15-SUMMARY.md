# P15 — SUMMARY: Chuỗi nhiều chi nhánh (15-01 → 15-07)

> **Trạng thái: CODE XONG, migration 0062–0065 đã áp production 27/09/2026** (chủ dự án yêu cầu làm P15; mỗi lần áp
> đều đo tập `(user, quán)` của cổng khóa trước/sau: 11 = 11, mất 0, thêm 0; không quán nào có `brand_id`).
> Quyết định QD-023 chốt 27/09/2026 sau khi xem bảng đối thủ (`00-TongQuan.md` §Đối thủ làm thế nào): chi nhánh = quán
> riêng + thương hiệu (D1), chi nhánh gốc + nút Đồng bộ (D4), nhân viên một chi nhánh (D7), giá gói × số chi nhánh
> không giảm (U1); U2 = không ghi đè giá đã khóa, U3 = chưa đồng bộ định lượng.

## Theo plan

| Plan | Đã làm | Tệp chính |
|---|---|---|
| 15-01 | `brands`, `tenants.brand_id`, `brand_members` + RLS; RPC `create_brand`, `attach_tenant_to_brand`, `create_branch`, `set_brand_member`, `remove_brand_member` (đồng bộ membership mọi chi nhánh); `/super` → **Thương hiệu**; sửa lỗi tái dùng email chủ đặt lại mật khẩu | `0062_brands.sql`, `app/super/thuong-hieu/*`, `lib/tenant/provision-owner.ts` |
| 15-02 | Bộ chọn chi nhánh ở header admin + POS (chỉ hiện khi vào được ≥ 2 chi nhánh; POS hỏi trước vì món chưa gửi bếp; tải lại cả trang để bỏ kênh realtime cũ); khu `/b/{brand}/admin` (đăng nhập, sidebar) + **Tổng quan chuỗi** hôm nay | `components/brand/BranchSwitcher.tsx`, `lib/brand/branches.ts`, `app/b/[brand]/admin/*` |
| 15-03 | `source_id` trên 4 bảng thực đơn + `menu_items.price_locked`; RPC `sync_menu_from_root` (một giao dịch mỗi chi nhánh, không xóa, không đổi id, không đụng hết món, không ghi đè giá đã khóa, nối lần đầu theo tên), `unlock_item_price`, `set_brand_root`; màn **Đồng bộ thực đơn** (xem trước thêm/sửa/ẩn, tích cặp nối); admin chi nhánh: sửa giá món nối gốc → khóa giá, nút "Theo giá chuỗi" | `0063_menu_sync.sql`, `lib/brand/menu-sync.ts`, `app/b/[brand]/admin/(protected)/thuc-don/*` |
| 15-04 | RPC mảng chi nhánh: `report_summary_multi`, `_series_`, `_top_items_` (món cùng gốc cộng chung), `_by_category_`, `_payments_`, `report_by_branch`; màn **Báo cáo chuỗi** (lọc chi nhánh, kỳ, KPI, biểu đồ, so sánh chi nhánh). Bản một quán GIỮ NGUYÊN | `0064_report_multi.sql`, `lib/brand/reports.ts`, `app/b/[brand]/admin/(protected)/bao-cao/page.tsx` |
| 15-05 | Trang khách **`/b/{brand}`**: chi nhánh dùng được (cột `usable`), địa chỉ, SĐT, "Đang mở / Đã đóng" theo giờ VN, Đặt món / Đặt bàn; Cài đặt → **Thông tin quán** | `app/b/[brand]/page.tsx`, `lib/brand/open-hours.ts`, `lib/tenant/settings.ts` |
| 15-06 | Ma trận cách ly 23 bảng cho hai chi nhánh cùng thương hiệu (tách danh sách ca ra `matrix-cases.ts` dùng chung) | `tests/rls/brand-isolation.test.ts`, `tests/rls/matrix-cases.ts` |
| 15-07 | Gia hạn cả chuỗi: RPC `record_brand_subscription_payment` (mọi chi nhánh đang hoạt động cùng một ngày = max(hôm nay, hạn muộn nhất) + tháng, vĩnh viễn, bỏ qua chi nhánh tạm ngưng, một dòng nhật ký `brand_id`); `/b/{brand}/admin/gia-han` (giá gói × số chi nhánh, QR); `/super` ghi nhận theo thương hiệu; trang Gia hạn chi nhánh thuộc chuỗi → dẫn sang trang chuỗi | `0065_brand_root_and_billing.sql`, `lib/brand/billing.ts`, `components/tenant/KhoiChuyenKhoan.tsx` |

## Phát hiện và sửa trong lúc làm

- **Xóa ảnh làm mất ảnh chi nhánh khác:** đồng bộ thực đơn / tạo chi nhánh chép ĐƯỜNG DẪN ảnh (QD-014). Thay ảnh ở một
  chi nhánh trước đây xóa file cũ ⇒ chi nhánh kia mất ảnh. `deleteMenuImage` nay chỉ xóa khi không còn món / logo / ảnh
  bìa nào dùng đường dẫn đó, và `updateItem` xóa ảnh cũ SAU khi đã lưu đường dẫn mới.
- Chủ thương hiệu tự tạo chi nhánh khi chuỗi đang không giới hạn → chi nhánh mới **có hạn từ hôm nay** (không tự mở
  chi nhánh miễn phí); super-admin tạo thì theo hạn chung.
- Bản mảng báo cáo KHÔNG thay bản một quán (qt-food đang bán): test so hai bản cho đúng cùng số trên dữ liệu thật
  của qt-food (service role) và quán demo, hai kỳ.

## Bằng chứng

```
npm run test      → Test Files 76 passed · Tests 802 passed
npm run test:rls  → Test Files 24 passed · Tests 391 passed
                    (brand 11, menu-sync 7, report-multi 5, brand-isolation 53 — mới)
npm run schema:check → Schema khớp snapshot · tsc + next lint sạch
```

Chạy thật trên dev server với **chuỗi demo tạm** (gộp pho-viet + bun-bo, tạo chi nhánh 3 — dọn sạch sau khi chụp,
kiểm lại: 0 thương hiệu, membership chéo đã xóa, cài đặt/hạn dùng trả nguyên): bộ chọn chi nhánh liệt kê 3 chi nhánh +
"Cả chuỗi", chọn chi nhánh 3 → đúng `/r/{cn3}/admin/menu`; Tổng quan 3 dòng, tổng = dòng pho-viet; Báo cáo so sánh 3
dòng; Đồng bộ chi nhánh 3 → "+41 · sửa 0 · ẩn 0", 12 món; Gia hạn chuỗi "350.000đ × 3 chi nhánh = 1.050.000đ"; POS
360px không tràn; trang khách 3 chi nhánh, "Đang mở · 06:00–22:00"; thương hiệu không tồn tại → 404; 0 lỗi trang.
Ảnh: `anh/1…9`.

## Chưa làm / còn mở

- Ảnh chụp qt-food trước/sau (cổng "quán lẻ không thấy gì khác"): không có mật khẩu chủ qt-food trong môi trường dev —
  đã kiểm bằng dữ liệu: qt-food `brand_id` rỗng ⇒ `boChonChiNhanh` trả null, không bộ chọn, không đổi màn nào.
- ~~E2E Playwright "tạo order ở B2 không hiện ở POS/KDS B1"~~ — xong 28/09 (xem cuối trang).
- Nghiệm thu preview thật (Vercel). ~~Quét QR gia hạn chuỗi~~ — chủ dự án bỏ qua 28/09 (đã quét được).

## Gỡ quán / xóa thương hiệu (0066, 27/09/2026 tối)

Chủ dự án gắn nhầm qt-food vào một thương hiệu; `/super` chưa có cách gỡ nên phải gỡ tay trong DB (chỉ 2 thay đổi: dòng
`brands` + `tenants.brand_id`, không dữ liệu nào khác). Sau đó phát hiện thêm: nút **"Bỏ"** người khỏi thương hiệu (bản
0062) tắt quyền owner/manager ở MỌI chi nhánh — kể cả quyền VỐN CÓ của chủ ở quán riêng ⇒ tài khoản chủ qt-food bị tắt.
Đã bật lại (tập `(user, quán)` về 11 như trước).

- `memberships.brand_id` đánh dấu quyền DO CHUỖI CẤP. `detach_tenant_from_brand` / `delete_brand` / `remove_brand_member` /
  `set_brand_member` chỉ đụng các dòng đó; quyền vốn có giữ nguyên. Chi nhánh do chuỗi tạo (không có chủ riêng) gỡ ra
  thì quyền CHỦ được giữ thành quyền thường để quán không bị bỏ trống.
- `/super` → Thương hiệu: **Gỡ khỏi thương hiệu** (hỏi xác nhận) từng chi nhánh, **Xóa thương hiệu…** (gõ đúng mã).
- Test: +3 ca trong `brand.test.ts` (chỉ super-admin; gỡ chi nhánh do chuỗi tạo giữ chủ; xóa thương hiệu → chủ quán giữ
  quyền, quản lý chuỗi mất quyền).
- Sửa test: `afterAll` của 3 file test chuỗi từng chạy dọn dẹp cả khi `beforeAll` từ chối vì quán demo đang thuộc thương
  hiệu của người dùng ⇒ đã gỡ nhầm pho-viet khỏi thương hiệu "phở việt" chủ dự án đang thử (đã gắn lại). Nay chỉ dọn khi
  chính test đã dựng dữ liệu.

```
npm run test → 802 passed · npm run test:rls → 341 passed, brand-isolation cố ý bỏ qua (pho-viet đang thuộc thương hiệu
thử của chủ dự án) · schema:check khớp
```

## Gộp quản lý chuỗi vào admin quán (27/09/2026 tối — QD-023 D2', D3')

- **Chủ quán tự tạo chi nhánh**: RPC `create_my_branch` (0067) — lần đầu tự lập chuỗi (tên/mã = quán, quán đang mở là gốc,
  chủ quán thành chủ chuỗi); chuỗi không giới hạn → chi nhánh mới có hạn từ hôm nay. Mục **Chi nhánh** trong admin
  (`app/r/[slug]/admin/(protected)/chi-nhanh/`): tổng quan hôm nay cả chuỗi (`components/brand/TongQuanChuoi.tsx`), + Tạo chi
  nhánh, lối vào Đồng bộ thực đơn (`chi-nhanh/thuc-don/`, dời từ `/b/…/admin`).
- **Báo cáo** của quán: phạm vi "Chi nhánh này / Tất cả chi nhánh" (`components/brand/BaoCaoChuoiView.tsx`) — hiện khi người
  xem vào được ≥ 2 chi nhánh. **Gia hạn** của quán thuộc chuỗi: tính cả chuỗi ngay tại trang (`components/brand/GiaHanChuoi.tsx`).
- **Bỏ** `/b/{brand}/admin` (đăng nhập, khung, 4 trang) và `lib/brand/session.ts`; ô chọn chi nhánh "— Tổng quan chuỗi —" mở
  mục Chi nhánh. Trang khách `/b/{brand}` giữ. RBAC: `branches` (chủ + quản lý xem; tạo / đồng bộ chỉ chủ).
- **Lỗi phát hiện khi chụp:** sau 0062, `tenants` ↔ `brands` có hai khóa ngoại ⇒ `brands(...)` trong `ownerForRenewal` bị
  PostgREST từ chối vì mơ hồ ⇒ trang Gia hạn (lối thoát khi quán khóa) đẩy mọi chủ quán về trang chủ. Chỉ có trên code
  chưa deploy. Sửa: `brands!tenants_brand_id_fkey` + test `tests/rls/renewal-query.test.ts` chạy đúng chuỗi cột trên DB.
- Test: `tests/rls/owner-branch.test.ts` (3: thu ngân bị từ chối; lần đầu tự lập chuỗi, hạn từ hôm nay, chủ thấy 2 chi
  nhánh; tạo tiếp cùng chuỗi, mã trùng lỗi).

```
npm run test → 802 passed · npm run test:rls → 345 passed (brand-isolation cố ý bỏ qua khi quán demo thuộc thương hiệu
thử) · schema:check khớp · tsc + lint sạch
```

## Nghiệm thu bổ sung 28/09/2026

Chủ dự án: bỏ qua bước quét QR chuyển khoản (đã tự quét được); yêu cầu test gia hạn, E2E cách ly, chạy lại brand-isolation.

- **E2E `tests/e2e/chuoi.spec.ts`** (mới) — chuỗi TẠM: B1 = pho-viet, B2 = chi nhánh do `create_branch` tạo; chủ đăng nhập
  là chủ chuỗi (vào được cả hai).
  - BRANCH-07: KDS + POS của B1 thấy đơn B1, **không** thấy đơn B2 — cả đơn tới SAU khi mở màn (qua realtime; test chờ
    kênh báo "Subscribed to PostgreSQL" rồi mới tạo đơn, đơn B1 tới được còn đơn B2 thì không). KDS B2 chỉ thấy đơn B2.
    Ảnh `anh/10-kds-b1-cach-ly.png`.
  - BRANCH-08: hai chi nhánh quá ân hạn (hạn khác nhau) → chủ đăng nhập bị đưa thẳng tới Gia hạn, "350.000đ × 2 chi nhánh
    = 700.000đ", nội dung `GIAHAN …` → super-admin bấm **Ghi nhận gia hạn chuỗi** ở `/super/thuong-hieu` → hai chi nhánh
    cùng một ngày hết hạn, đúng 1 dòng nhật ký → `/admin/menu` của cả hai mở lại. Ảnh `anh/11-gia-han-chuoi-khoa.png`.
  - afterAll trả nguyên trạng và **đo lại** số quyền (user, quán) đang bật = trước khi chạy.
- **`brand-isolation.test.ts` không còn tự dừng**: quán demo đang thuộc thương hiệu thử "phoviet" của chủ dự án → test
  TẠM gỡ `brand_id` rồi gắn lại ở afterAll (không đụng thương hiệu đó hay quyền của nó). **53/53 xanh**; kiểm sau khi chạy:
  pho-viet vẫn thuộc "phoviet", hạn 25/09 giữ nguyên.

```
npx vitest run tests/rls/brand-isolation.test.ts → 53 passed
npx playwright test tests/e2e/chuoi.spec.ts       → 2 passed
npm run test:rls                                   → Test Files 30 passed · Tests 422 passed
```

**Còn mở:** nghiệm thu trên preview Vercel — cần merge/deploy trước (code P13–P18 mới ở nhánh `dev`).
