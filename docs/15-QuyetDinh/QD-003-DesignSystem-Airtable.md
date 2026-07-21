# QD-003: Hệ thống thiết kế quản lý (Airtable Design System cho Admin)

**Ngày:** 21/07/2026  
**Trạng thái:** ✓ ĐÃ DUYỆT  
**Người đề xuất:** v0  
**Người phê duyệt:** Chủ dự án  
**Tham chiếu:** QD-002 (cũ, bị thay thế cho admin surfaces)

---

## I. Nền tảng

### Context
- **Dự án:** SaaS quản lý nhà hàng multi-tenant
- **Giai đoạn hiện tại:** P1 (nền tảng) hoàn thành; P2 (admin surfaces) bắt đầu
- **Vấn đề:** QD-002 chọn Red #DC2626 + Gold #A16207 cho toàn bộ app. Lý do thích hợp cho **customer-facing** (QR menu ấm cúng) nhưng **không phù hợp** cho admin (khó đọc bảng, signal "nghiêm túc" yếu)

### Giải pháp
Tách riêng design system theo vai trò giao diện:
1. **Admin/Staff Dashboard** → Airtable Design System (this decision)
2. **Customer QR Menu** (P3) → QD-002 red/gold (giữ nguyên)
3. **KDS (Kitchen Display)** (P3) → Airtable + dark mode override

---

## II. Quyết định

### Lựa chọn
Áp dụng **Airtable Design System** cho toàn bộ admin/staff surfaces (menu management, staff RBAC, dashboard, reports, POS checkout).

### Triết lý Airtable

| Tiêu chí | Airtable | QD-002 (Red/Gold) | Ưu điểm |
|---|---|---|---|
| **Aesthetic** | Editorial (white canvas, dark ink) | Warm (red, gold) | Admin = công cụ chuyên nghiệp, không "cửa hàng" |
| **Palette** | Neutral (gray + signature colors) | Specific (red/gold) | Mở rộng được cho nhiều tính năng |
| **Signature** | Coral, Forest (sparse use) | Red, Gold (hạn chế) | Highlight tính năng không bị overwhelm |
| **Typography** | Haas Grotesk (sans-serif, neutral) | Unspecified (có thể serif) | Dễ đọc bảng dữ liệu dài |
| **Contrast** | High (dark ink on white) | Medium (red on varied bg) | Staff đọc nhanh trên đơn hàng/POS |
| **Whitespace** | Generous (96px macro sections) | Compact | Trọng tâm rõ ràng trên KPIs |

### Palette Cụ thể

#### Primitives (raw colors)
- **Primary/Ink:** `#181d26` (near-black)
- **Body text:** `#333840` (dark gray)
- **Canvas:** `#ffffff` (white)
- **Surfaces:** `#f8fafc` (soft gray), `#e0e2e6` (strong gray)
- **Borders:** `#dddddd` (hairline)

#### Signature Colors
- **Coral:** `#aa2d00` (feature callouts, errors)
- **Forest:** `#0a2e0e` (secondary callouts)
- **Cream/Peach/Mint:** (status badges, accents)

#### Semantic
- Link: `#1b61c9` (blue)
- Success: `#006400` (green)
- Error: `#aa2d00` (coral, reused)

### Typography Scale

| Tier | Size | Weight | Use |
|---|---|---|---|
| Display XL | 48px | 500 | Article subtitles |
| Display LG | 40px | 400 | Dashboard h1 |
| Title LG | 24px | 400 | Section headers |
| Label | 16px | 500 | Form labels, CTAs |
| Body | 14px | 400 | Paragraph, tables |
| Caption | 14px | 500 | Metadata, hints |

**Font Stack:** Haas Grotesk (if licensed) → Inter (Google Fonts) → system sans-serif

### Spacing System

- **Base unit:** 4px
- **Tokens:** xs (4px), sm (8px), md (12px), lg (16px), xl (24px), 2xl (32px), 3xl (48px), **section (96px)**
- **Macro sections:** 96px vertical spacing (dashboard h1 → overview cards → tables → related content)
- **Card padding:** 16px (lg) default, 24px (xl) for callouts
- **Gap:** 16px (lg) between grid items

### Components

**Buttons:**
- Primary: Dark ink bg, white text, hover darker
- Secondary: White bg, dark text, border
- Ghost: Transparent, dark text, hover gray bg
- Sizes: sm (8px pad), md (12px pad), lg (16px pad)

**Cards:**
- Default: White bg, hairline border, no shadow
- Elevated: White bg, hairline border, soft shadow
- Flat: Gray soft bg, no border
- Signature: Full-bleed color (coral/forest), white text, padding xl

**Inputs:**
- Base: White bg, hairline border, focus blue ring
- Error state: Coral border, coral text
- Disabled: Gray bg, muted text, opacity 60%

---

## III. Phạm vi & Ràng buộc

### Áp dụng cho (Admin surfaces)
✓ Dashboard (overview, KPIs)
✓ Menu management (CRUD)
✓ Staff/roles management (RBAC)
✓ Reports (tables, charts)
✓ POS checkout (CTA buttons, order items)
✓ Super-admin tenant creation (forms, confirmation)
✓ Settings (profile, account, billing)

### Không áp dụng cho (Customer surfaces — giữ QD-002)
✗ QR menu (customer-facing, warm colors)
✗ Order confirmation email (branded, QD-002)
✗ Mobile app QR scanner (separate design)

### KDS (Kitchen Display System) — Special Case
- Base: Airtable (dark palette)
- Override: Dark mode on, high contrast, signature colors brighter
- Reasoning: Fast-paced environment, 6m+ viewing distance, real-time data

---

## IV. Trade-offs & Rationale

| Trade-off | Choice | Rationale |
|---|---|---|
| **Single design or split?** | Split (admin ≠ customer) | Admin staff ≠ restaurant guests; psychological difference aids cognitive load |
| **Airtable or custom?** | Airtable | Proven, reduces custom design decisions, faster implementation |
| **Font: Haas or Inter?** | Haas + Inter fallback | Airtable uses Haas; Inter is free alternative, nearly identical metrics |
| **Information density** | 96px macro + tight card grid | Balance whitespace (Airtable philosophy) with dashboard 30+ metrics requirement |
| **Dark mode approach** | Optional (prefers-color-scheme) | KDS uses it; admin staff can opt-in; no forced dark |

---

## V. Giá trị & Lợi ích

### Cho Users (staff)
1. **Professional signal** — "Đây là công cụ quản lý, không phải trò chơi"
2. **Clarity** — Dark ink on white canvas = easy reading for long hours
3. **Speed** — Signature cards highlight urgent items without distraction
4. **Accessibility** — High contrast, semantic HTML, screen reader friendly

### Cho Development
1. **Consistency** — Single design language for all admin features (P2–P4)
2. **Reusability** — Component library (Button, Card, Input, Grid) reusable across pages
3. **CSS-in-JS optional** — CSS variables + Tailwind = no runtime overhead
4. **Scalability** — Easy to extend for new surfaces (reports, analytics, etc.)

### Cho Business
1. **Multi-tenant ready** — Design supports N tenants without color collision
2. **Dark mode ready** — KDS dark mode future-proof
3. **Mobile responsive** — Dashboard works on tablets in kitchen/POS
4. **Brand agility** — Can customize signature colors per tenant (future roadmap)

---

## VI. Implementation Plan

### Phase 1: Foundation (THIS — P1 extend)
- CSS variable tokens (primitives + semantic)
- Tailwind config (colors, typography, spacing)
- Component library (Button, Card, Input, Typography, Layout)
- Design documentation (`docs/10-BanThietKe/01-AirtableDS.md`)
- Demo pages (homepage style guide, admin dashboard example)

### Phase 2: Admin Dashboard (P2)
- Dashboard skeleton (overview, KPIs, recent orders)
- Menu management (CRUD forms, table)
- Staff management (grid, quick actions)

### Phase 3: Customer & KDS (P3)
- QR menu (QD-002 colors)
- KDS dark mode implementation
- POS checkout screens

---

## VII. Tiêu chí Thành công

1. ✓ CSS tokens CSS-variable-accessible (dev + component library)
2. ✓ ≥10 reusable components built & tested
3. ✓ Tailwind integration conflict-free
4. ✓ Documentation complete (spec + usage guide + examples)
5. ✓ Admin dashboard renders with Airtable palette
6. ✓ QR menu (customer) still uses QD-002 (no bleed)
7. ✓ Dark mode theme toggle works on KDS
8. ✓ WCAG AA contrast minimum met

---

## VIII. Quy trình Phê duyệt

**Người đề xuất:** v0 (AI code agent)
**Tiêu chuẩn kiểm duyệt:**
- [ ] Design tokens đặc tả rõ ràng
- [ ] Component patterns đầy đủ (buttons, cards, forms)
- [ ] Typography scale cover h1–caption
- [ ] Spacing system 4px-based, macro sections defined
- [ ] Documentation examples + do/don't
- [ ] No color collisions with QD-002 (customer)
- [ ] Dark mode spec for KDS included
- [ ] Accessibility baseline (contrast, semantic HTML)

**Phê duyệt bởi:** [Chủ dự án] ✓
**Ngày phê duyệt:** 21/07/2026

---

## IX. Tham khảo & Liên kết

- **Airtable Design Reference:** `user_read_only_context/text_attachments/DESIGN-airtable-t6keb.md`
- **Design System Spec:** `docs/10-BanThietKe/01-AirtableDS.md`
- **Previous Decision (QD-002):** `docs/15-QuyetDinh/QD-002-DesignSystem.md` (archived)
- **Tailwind Config:** `tailwind.config.ts` (source of truth for tokens)
- **Component Library:** `components/` (Button.tsx, Card.tsx, Input.tsx, Typography.tsx, Layout.tsx)

---

## X. Ký xác nhận

| Vai trò | Tên | Chữ ký | Ngày |
|---|---|---|---|
| Đề xuất | v0 (AI) | ✓ | 21/07/2026 |
| Phê duyệt | [Chủ dự án] | — | — |
| Thực hiện | v0 (AI) | ✓ | 21/07/2026 |

---

**End of Decision**
