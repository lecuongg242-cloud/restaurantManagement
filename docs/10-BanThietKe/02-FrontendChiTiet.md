# BẢN THIẾT KẾ FRONTEND CHI TIẾT — V1

> Phiên bản 1.0 — 21/07/2026. Nguồn: `DESIGN-mistral.ai.md`, `15-QuyetDinh/QD-006`, `01-KyThuatChiTiet.md`.
> Nguồn sự thật cho: token áp dụng, mô hình theme đa tenant, profile 4 bề mặt, shell/điều hướng, bộ component, responsive, a11y, cách hiện thực.

---

## 1. Bốn profile bề mặt (cùng 1 design system)

| Profile | Route group | Thiết bị | Đặc tính hình ảnh |
|---|---|---|---|
| **Customer** | `(customer)` `/r/[slug]` | Điện thoại (360px+) | Editorial ấm: Fraunces hero, thẻ kem, dải sunset ở landing, ảnh món. Mật độ thoáng, ≤6 chạm |
| **POS** | `(staff)` `/r/[slug]/pos` | Tablet ngang | Dày đặc: Inter, tương phản mạnh, nút to, sơ đồ bàn + giỏ. KHÔNG serif/sunset |
| **KDS** | `(staff)` `/r/[slug]/kds` | Màn lớn/TV | Rất dày đặc, chữ lớn đọc xa, cột theo trạng thái, màu status mạnh. KHÔNG trang trí |
| **Admin/Super** | `(admin)` `/r/[slug]/admin`, `(super)` `/super` | Desktop | Product theme: bảng, form, dashboard. Fraunces chỉ ở tiêu đề trang |
| *(Print)* | `/print/*` | Máy in nhiệt | Không theme: JetBrains Mono, đen trắng, khổ 58/80mm |

Nguyên tắc: **cùng token màu/spacing/radius; khác mật độ + thành phần trang trí + font hiển thị.**

---

## 2. Token áp dụng (từ Mistral + mở rộng)

### 2.1 Màu — dùng nguyên từ `DESIGN-mistral.ai.md`
- **Primary (CTA/active):** `#fa520f`; pressed `#cc3a05`; on-primary `#ffffff`.
- **Bề mặt:** canvas `#ffffff`, surface `#fafafa`, cream `#fff8e0` (thẻ/form/footer), cream-deeper `#fff0c2` (chip).
- **Mực/chữ:** ink `#1f1f1f`, slate `#4a4a4a`, steel `#6a6a6a`, muted `#a8a8a8`.
- **Đường kẻ:** hairline `#e5e5e5`, hairline-strong `#c7c7c7` (input), beige-deep `#e6d5a8` (viền kem).
- **Sunset (chỉ landing/khách):** dải `#fa520f → #ffa110 → #ffd900 → #fff8e0`.

### 2.2 Màu trạng thái — MỞ RỘNG (F5, Mistral không có sẵn)
> Dùng tiết chế, chỉ cho trạng thái vận hành. Giữ tông ấm, thêm xanh/đỏ tối thiểu.

| Token | Giá trị | Dùng |
|---|---|---|
| `status-new` | ink trên `cream-deeper` `#fff0c2` | Order chờ duyệt (POS), item mới vào KDS |
| `status-active` | `#fa520f` (primary) | Đang làm (preparing), bàn đang phục vụ |
| `status-ready` | `#1a7f4b` (green-600) trên `#e7f6ee` | Món/đơn sẵn sàng (ready) |
| `status-late` | `#c0341d` (red-700) | Quá hạn/cảnh báo, hủy |
| `status-done` | steel `#6a6a6a` | Đã phục vụ/hoàn tất |
| **Bàn:** available | viền hairline, nền canvas | Bàn trống |
| **Bàn:** occupied | nền `cream`, viền `beige-deep` | Bàn có khách |
| **Bàn:** reserved | viền `primary` 1px | Bàn đã đặt |
| **Bàn:** cleaning | nền `surface`, chữ muted | Dọn bàn |

### 2.3 Typography (F4)
- **Display/Hero (khách+landing):** **Fraunces** — `hero` 40–84px (mobile→desktop), `display-lg` 40–64px, `heading-1` 32–52px. Line-height chặt 1.05–1.15, letter-spacing âm.
- **UI (mọi nơi):** **Inter** — heading-2..5 (36→18px, w500), body-md 16/1.55, body-sm 14, caption 13, micro 12, button-md 14/w500, micro-uppercase 11 (eyebrow).
- **Code + in:** **JetBrains Mono** 14.
- Nạp bằng `next/font/google` (Fraunces, Inter, JetBrains Mono) — không CDN ngoài.

### 2.4 Spacing & Radius (nguyên Mistral)
- Spacing 4px base: xxs4·xs8·sm12·md16·lg20·xl24·xxl32·xxxl40·section-sm48·section64·section-lg96·hero120.
- Radius: nút `md`8px, thẻ `lg`12px, panel lớn `xl`16px, badge/pill `full`. **Không nút bo tròn hoàn toàn** (giữ chất editorial).
- Elevation: mặc định phẳng + viền hairline; card `0 4px 12px rgba(0,0,0,.04)`; modal `0 16px 48px rgba(0,0,0,.12)`.

---

## 3. Mô hình theme đa tenant (F2)

- **Chrome cố định**: Tailwind config nạp token Mistral làm CSS variables gốc (`:root`). Không override theo tenant ở V1.
- **Phần tenant góp**: `tenants` có `logo_url`, `name`. Hiện ở:
  - Header app khách (`/r/[slug]`), header admin, đầu hóa đơn & phiếu bếp.
- **Chừa sẵn V2**: một lớp `--tenant-primary` (mặc định = `#fa520f`) đọc từ `tenants.settings.brand_color`; V1 luôn = mặc định. Bật per-tenant sau mà không sửa component (chỉ mở nguồn biến).

---

## 4. Shell & điều hướng theo app

### 4.1 Customer `(customer)` — mobile-first
- **Header mỏng**: logo tenant + tên bàn (nếu QR) + icon giỏ (badge số món).
- **Nội dung**: danh mục dạng chip cuộn ngang (`pill-tab`), danh sách món dạng `card` ảnh trái/phải + giá + nút "+".
- **Giỏ nổi (sticky bottom)**: thanh "Xem giỏ (N món · tổng)" → mở sheet giỏ.
- **Không** menu điều hướng phức tạp; mỗi trang 1 mục tiêu.
- Landing marketing (trang gốc `/`, đặt bàn, đặt món) mới dùng hero Fraunces + sunset stripe.

### 4.2 POS `(staff)` — tablet ngang
- **Trái**: sơ đồ bàn theo khu vực (tab khu vực trên cùng) — lưới `table-tile` màu theo trạng thái.
- **Phải (khi chọn bàn)**: panel order — danh sách món của phiên bàn, nút thêm món, ô ghi chú; dưới cùng: tổng + nút "Gửi bếp"/"Thanh toán".
- **Thanh trên**: tên trạm, nút "Order QR chờ duyệt (N)", nút chọn nhân viên (PIN).
- Thao tác nhạy cảm (hủy món, mở ngăn tách bill) yêu cầu PIN.

### 4.3 KDS `(staff)` — màn lớn
- **Cột trạng thái** ngang: "Chờ làm" · "Đang làm" · "Sẵn sàng". Mỗi vé = `kds-ticket`.
- Vé: bàn + giờ (đếm ngược/đếm lên), danh sách món + SL + tùy chọn + ghi chú; nút lớn "Bắt đầu"/"Xong".
- Chữ lớn, màu status mạnh; vé quá X phút chuyển `status-late`.

### 4.4 Admin `(admin)` — desktop
- **Sidebar trái**: Dashboard · Menu · Bàn & QR · Nhân viên · Đặt bàn · Đơn online · Cài đặt.
- **Nội dung**: bảng + form (shadcn Table/Form/Dialog), thẻ số liệu dashboard (`stat-cell` Fraunces).

### 4.5 Super `(super)` — desktop tối giản
- Danh sách tenant + nút "Tạo nhà hàng" (form tạo tenant + owner).

---

## 5. Bộ component

### 5.1 Tái dùng trực tiếp từ Mistral
`button-primary/-dark/-secondary/-cream/-link`, `card-base/-feature/-cream`, `text-input/-focused`, `text-area`, `pill-tab(-active)`, `segmented-tab(-active)`, `badge-orange/-cream/-dark`, `pricing-card`, `faq-accordion-item`, `footer-region`, `sunset-stripe-band`, `hero-band-sunset`, `stat-cell`, `cta-banner-cream`.

### 5.2 Component mới cần dựng (map lên token Mistral)
| Component | Dựa trên | Bề mặt |
|---|---|---|
| `menu-item-card` | card-base + ảnh + giá + nút "+" | Customer |
| `modifier-sheet` | bottom sheet + radio/checkbox (nhóm min/max/required) | Customer |
| `cart-sheet` | panel + dòng món + stepper SL + tổng | Customer |
| `qty-stepper` | 2 nút tròn ± + số | Customer/POS |
| `order-status-stepper` | các bước pending→…→served | Customer (theo dõi món) |
| `table-tile` | ô vuông màu theo status bàn | POS |
| `order-panel` | danh sách order_items + hành động | POS |
| `bill-split-panel` | 2 cột kéo món giữa các bill + phân bổ SL | POS |
| `payment-dialog` | chọn tiền mặt/CK + số tiền + đóng bill | POS |
| `pin-pad` | bàn phím số 4 ô + xác thực bcrypt | POS/KDS |
| `kds-ticket` | vé bếp + đồng hồ + nút trạng thái | KDS |
| `reservation-row` | dòng đặt bàn + duyệt/từ chối | Admin |
| `report-stat` + `top-items-list` + `revenue-chart` | dashboard | Admin |

### 5.3 Bề mặt in (không theme)
`receipt-print` (hóa đơn 80mm), `kitchen-ticket-print` (phiếu bếp 58/80mm) — JetBrains Mono, `@media print`, logo/tên tenant ở đầu.

---

## 6. Responsive

| Bề mặt | Chính | Ghi chú |
|---|---|---|
| Customer | 360–768px | 1 cột; hero Fraunces 40px mobile; nút ≥44px; giỏ sticky bottom |
| POS | 1024–1366px (tablet ngang) | 2 cột (bàn/order); không hỗ trợ dọc hẹp |
| KDS | ≥1280px (màn lớn/TV) | 3 cột trạng thái; chữ lớn |
| Admin | ≥1024px desktop | sidebar + nội dung; xuống tablet gộp sidebar thành drawer |

Landing marketing theo breakpoint Mistral (hero 84→64→52→40px, footer 5→3→1 cột).

---

## 7. Accessibility (a11y)
- Touch target **≥44px** mọi nút bấm chạm (tiêu chí #7).
- Tương phản chữ/nền đạt **WCAG AA**: primary `#fa520f` chỉ dùng cho mảng lớn/nút (chữ trắng trên cam đạt AA ở cỡ ≥18px/bold); chữ thân dùng ink trên trắng/kem.
- Nhãn tiếng Việt đầy đủ dấu; `lang="vi"`; không cắt chữ có dấu.
- Focus ring rõ (viền primary 2px như `text-input-focused`).
- KDS: dựa vào **màu + nhãn chữ** (không chỉ màu) cho trạng thái (mù màu).

---

## 8. Hiện thực (implementation)
- **Tailwind**: map token → CSS vars trong `globals.css` (`--color-primary`, `--radius-md`…); `tailwind.config` đọc vars.
- **shadcn/ui**: theme qua CSS vars; Button/Input/Dialog/Sheet/Table/Tabs/RadioGroup/Checkbox.
- **Fonts**: `next/font/google` — Fraunces (display), Inter (UI), JetBrains Mono (mono). Không tải font ngoài runtime.
- **Trang style-guide** `/r/[slug]/admin/style-guide` (hoặc `/style-guide`): render đủ 4 profile + token + component mới → **tiêu chí nghiệm thu OPS-03**.
- **Print**: route riêng, CSS in tách khỏi theme app (mục 5.3).
