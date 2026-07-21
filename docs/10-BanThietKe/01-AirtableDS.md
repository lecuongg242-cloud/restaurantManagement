# Airtable Design System — Admin Dashboard & Management Surfaces

**Phiên bản:** 1.0  
**Ngày cập nhật:** 21/07/2026  
**Trạng thái:** Đang triển khai (P1 foundation)  
**Tác giả:** v0 + Team

---

## I. Tổng quan

Hệ thống quản lý nhà hàng SaaS này áp dụng **Airtable Design System** cho các giao diện quản trị (admin dashboard, menu management, staff, reports). Triết lý này nhấn mạnh:

- **Editorial aesthetic** — thiết kế sạch, không nhiễu (white canvas, dark ink)
- **Professional tone** — tín hiệu "đây là công cụ quản lý nghiêm túc"
- **Signature cards** — visual hierarchy qua các khối màu (coral, forest, cream)
- **Information density** — dashboard phải cho thấy ≥30 metrics một lúc mà không bị overwhelm

### Lý do chọn Airtable cho Admin (thay vì QD-002 red/gold)

| Yêu cầu | QD-002 (Red/Gold) | Airtable (Dark/White) | Lý do |
|---|---|---|---|
| Tâm lý | Ấm, thân thiện (khách) | Lạnh, chuyên nghiệp (staff) | Admin ≠ customer |
| Bảng dữ liệu | Khó đọc ở độ phân giải cao | Tốt, contrast tự nhiên | KDS & POS cần tốc độ |
| Signature | Quá sáng, dễ lệch focus | Đủ sáng nhưng cân bằng | Callout không gây distraction |
| Font | Warm serif | Neutral sans (Haas/Inter) | Admin đọc nhiều chữ nhỏ |

**Kết quả:** 
- Admin/Staff surfaces → Airtable (đây là tài liệu này)
- Customer QR menu (P3) → QD-002 red/gold (riêng)
- KDS (P3) → Airtable + dark mode override

---

## II. Palette & Semantic Tokens

### Primary Colors

| Vai trò | Hex | CSS Var | Tailwind | Sử dụng |
|---|---|---|---|---|
| Ink đen (text & buttons) | `#181d26` | `--color-primary` | `bg-primary` | Nút CTA, text h1/h2 |
| Ink đen (active/hover) | `#0d1218` | `--color-primary-active` | `bg-primary-active` | Hover buttons |
| Body text | `#333840` | `--color-body` | `text-body` | Paragraph, list items |
| Muted (captions) | `#41454d` | `--color-muted` | `text-muted` | Hints, metadata, footer |
| Canvas (surface) | `#ffffff` | `--color-canvas` | `bg-canvas` | Pages, cards, modals |

### Light surfaces

| Vai trò | Hex | CSS Var | Tailwind | Sử dụng |
|---|---|---|---|---|
| Surface soft | `#f8fafc` | `--color-surface-soft` | `bg-surface-soft` | Tabbed cards, alt bg |
| Surface strong | `#e0e2e6` | `--color-surface-strong` | `bg-surface-strong` | CTA banners, dividers |
| Hairline (borders) | `#dddddd` | `--color-hairline` | `border-hairline` | Input borders, table lines |
| Border strong | `#9297a0` | `--color-border-strong` | `border-border-strong` | Disabled state, separator |

### Signature Colors (Full-bleed callouts)

| Tên | Hex | Tailwind | Sử dụng |
|---|---|---|---|
| Coral | `#aa2d00` | `bg-signature-coral` | Feature announcement, error alerts |
| Forest | `#0a2e0e` | `bg-signature-forest` | Secondary callout, demo areas |
| Cream | `#f5e9d4` | `bg-signature-cream` | Warm neutral, secondary badge |
| Peach | `#fcab79` | `bg-signature-peach` | Accent, status in-progress |
| Mint | `#a8d8c4` | `bg-signature-mint` | Success, positive state |

### Semantic Colors

| Vai trò | Hex | CSS Var | Tailwind | Sử dụng |
|---|---|---|---|---|
| Link (inline) | `#1b61c9` | `--color-link` | `text-link` | Hyperlinks |
| Success | `#006400` | `--color-success` | `bg-success` | Confirmation, ✓ status |
| Error | `#dc2626` | `--color-error` | `bg-signature-coral` | Destructive, ✗ status |
| Warning | `#f59e0b` | `--color-warning` | `bg-signature-peach` | Warnings, ⚠ state |

---

## III. Typography Scale

### Display Scales (Headlines)

| Tier | Size | Weight | Line-height | CSS Class | Sử dụng |
|---|---|---|---|---|---|
| XL | 48px | 500 | 1.1 | `.text-display-xl` | Article subtitles, major sections |
| LG | 40px | 400 | 1.2 | `.text-display-lg` | Dashboard main heading (h1) |
| MD | 32px | 400 | 1.2 | `.text-display-md` | Section heading (h2) |

### Title Scales (Sub-headings)

| Tier | Size | Weight | Line-height | CSS Class | Sử dụng |
|---|---|---|---|---|---|
| LG | 24px | 400 | 1.35 | `.text-title-lg` | Section headers, card titles |
| MD | 20px | 400 | 1.5 | `.text-title-md` | Subsection headers |
| SM | 18px | 500 | 1.4 | `.text-title-sm` | Card subtitles, form labels |

### Label & Body (Content)

| Tier | Size | Weight | Line-height | CSS Class | Sử dụng |
|---|---|---|---|---|---|
| Label MD | 16px | 500 | 1.4 | `.text-label-md` | Form labels, inline actions |
| Button | 16px | 500 | 1.4 | `.text-button` | CTA button text |
| Body MD | 14px | 400 | 1.25 | `.text-body-md` | Paragraph, list items, tables |
| Caption | 14px | 500 | 1.35 | `.text-caption` | Metadata, hints, captions |

### Font Stack

```css
font-family: 
  'Haas Grotesk',        /* Airtable's licensed typeface (if available) */
  -apple-system,          /* macOS/iOS */
  BlinkMacSystemFont,     /* Chrome/Safari */
  'Segoe UI',             /* Windows */
  Roboto,                 /* Android */
  'Helvetica Neue',       /* Fallback */
  sans-serif;
```

**Fallback:** Nếu không có Haas, Inter (Google Fonts) hoặc system sans-serif được sử dụng tự động.

---

## IV. Spacing & Layout Grid

### Base Unit: 4px

Tất cả spacing là bội số của 4px:

| Token | Value | CSS/Tailwind | Sử dụng |
|---|---|---|---|
| `xs` | 4px | `m-xs` `p-xs` `gap-xs` | Tight internal spacing |
| `sm` | 8px | `m-sm` `p-sm` `gap-sm` | Compact spacing (icons, badges) |
| `md` | 12px | `m-md` `p-md` `gap-md` | Default internal spacing |
| `lg` | 16px | `m-lg` `p-lg` `gap-lg` | Standard section padding |
| `xl` | 24px | `m-xl` `p-xl` `gap-xl` | Large section spacing |
| `2xl` | 32px | `m-2xl` `p-2xl` `gap-2xl` | Major section breaks |
| `3xl` | 48px | `m-3xl` `p-3xl` `gap-3xl` | Between major UI bands |
| **section** | **96px** | `my-section` `py-section` | Between page sections |

### Rounded Corners

| Tier | Radius | Token | Sử dụng |
|---|---|---|---|
| Tight | 2px | `rounded-xs` | Legal text, minimal UI |
| Subtle | 6px | `rounded-sm` | Form inputs, small components |
| Default | 10px | `rounded-md` | Content cards |
| Prominent | 12px | `rounded-lg` | Primary buttons, signature cards |
| Pill | 9999px | `rounded-full` | Icon buttons, badges |

---

## V. Component Patterns

### Buttons

#### Primary Button

```tsx
<Button variant="primary" size="md">
  Làm điều gì đó
</Button>
```

**Styles:**
- BG: `#181d26` (primary)
- Text: `#ffffff` (canvas)
- Hover: `#0d1218` (primary-active)
- Padding: `px-6 py-4` (16px/24px)
- Border-radius: `12px` (rounded-lg)
- Font: `16px / 500` (button scale)

#### Secondary Button

```tsx
<Button variant="secondary" size="md">
  Hủy bỏ
</Button>
```

**Styles:**
- BG: `#ffffff` (canvas)
- Border: `1px solid #dddddd` (hairline)
- Text: `#181d26` (primary)
- Hover: Light gray bg (`#f8fafc`)

#### Ghost Button

```tsx
<Button variant="ghost">
  Thêm tùy chọn
</Button>
```

**Styles:**
- BG: None (transparent)
- Text: `#181d26` (primary)
- Hover: Light gray bg (`#f8fafc`)

#### Size Variants

| Size | Padding | Font | Sử dụng |
|---|---|---|---|
| `sm` | `8px 12px` | `14px` | Inline actions, compact tables |
| `md` | `12px 16px` | `16px` | Standard buttons (default) |
| `lg` | `16px 24px` | `16px` | CTAs, hero buttons |

#### Disabled State

- Opacity: `60%`
- Cursor: `not-allowed`
- No hover effect

### Cards

#### Default Card

```tsx
<Card variant="default">
  <h3>Card Title</h3>
  <p>Content goes here...</p>
</Card>
```

- BG: `#ffffff` (canvas)
- Border: `1px solid #dddddd` (hairline)
- Padding: `16px` (lg)
- Border-radius: `10px` (rounded-md)
- Shadow: None

#### Elevated Card

```tsx
<Card variant="elevated">
  Important content
</Card>
```

- BG, border, padding: Same as default
- Shadow: Subtle drop shadow (4px blur, 8% alpha)

#### Flat Card (Alternative)

```tsx
<Card variant="flat">
  Secondary information
</Card>
```

- BG: `#f8fafc` (surface-soft)
- Border: None
- Padding: `16px` (lg)
- Border-radius: `10px` (rounded-md)

#### Signature Cards (Callouts)

```tsx
<Card variant="coral">
  <h3>Important announcement</h3>
  <p>This is a coral callout.</p>
</Card>
```

**Variants:**
- `coral`: BG `#aa2d00`, text `#ffffff`
- `forest`: BG `#0a2e0e`, text `#ffffff`
- `dark`: BG `#181d26`, text `#ffffff`

- Padding: `24px` (xl) — more breathing room
- Border-radius: `12px` (rounded-lg) — slightly rounder than content cards

### Inputs

```tsx
<Input
  label="Tên nhà hàng"
  placeholder="Nhập tên..."
  error={validation ? "Tên không hợp lệ" : undefined}
/>
```

**Styles:**
- BG: `#ffffff` (canvas)
- Border: `1px solid #dddddd` (hairline) → focus `2px solid #181d26` (primary)
- Padding: `12px 16px` (md/lg)
- Font: `14px` (body-md)
- Border-radius: `6px` (rounded-sm)
- Placeholder: `#41454d` (muted)
- Focus ring: `2px solid #181d26` (primary)

**Error State:**
- Border: `1px solid #aa2d00` (coral)
- Error text: `#aa2d00` (coral)

**Disabled State:**
- BG: `#f8fafc` (surface-soft)
- Text: `#41454d` (muted)
- Opacity: `60%`
- Cursor: `not-allowed`

### Tables

```tsx
<table className="w-full">
  <thead>
    <tr>
      <th className="text-left py-md px-md font-medium">Header</th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-hairline hover:bg-surface-soft">
      <td className="py-md px-md">Data</td>
    </tr>
  </tbody>
</table>
```

**Styles:**
- Header: Bold (`font-medium`), text `#181d26`, bg `#ffffff`
- Rows: Border-bottom `1px solid #dddddd` (hairline)
- Hover: BG `#f8fafc` (surface-soft)
- Padding: `12px 16px` (md/lg)

---

## VI. Layout Patterns

### Dashboard Container

```tsx
<Container>
  {/* Content at max-width 7xl with padding */}
</Container>
```

- Max-width: `80rem` (7xl)
- Padding: `16px` (lg) horizontal, `96px` (section) vertical

### Section Bands

```tsx
<SectionBand>
  <h2>Section Title</h2>
  {/* Content */}
</SectionBand>
```

- Padding: `96px` (section) vertical
- Border-bottom: `1px solid #dddddd` (hairline)
- BG: `#ffffff` (canvas)

#### Dark Section Band

```tsx
<SectionBandDark>
  <h1>Dark header</h1>
</SectionBandDark>
```

- BG: `#181d26` (surface-dark)
- Text: `#ffffff` (canvas)
- No bottom border (optional divider)

### Grid Layouts

```tsx
<Grid columns="dashboard">
  {/* 3 columns on lg, 2 on md, 1 on sm */}
</Grid>

<Grid columns="dashboard-wide">
  {/* 4 columns on lg, 1 on sm */}
</Grid>
```

**Breakpoints:**
- Mobile (sm): 1 column
- Tablet (md): 2 columns (dashboard) or full-width (dashboard-wide)
- Desktop (lg): 3 columns (dashboard) or 4 columns (dashboard-wide)

**Gap:** `16px` (lg) between items

### Stack (Flex layouts)

```tsx
<Stack direction="vertical" gap="md">
  <div>Item 1</div>
  <div>Item 2</div>
</Stack>

<Stack direction="horizontal" gap="lg">
  <div>Left</div>
  <div>Right</div>
</Stack>
```

- `direction`: `"vertical"` (default) | `"horizontal"`
- `gap`: `"xs"` | `"sm"` | `"md"` | `"lg"` | `"xl"`

---

## VII. Admin-Specific Guidance

### Dashboard Information Density

**Challenge:** Dashboard phải hiển thị ≥30 KPIs mà không gây overwhelm.

**Solution:**
- Macro sections (96px) tách biệt các nhóm metric
- Trong mỗi nhóm: Grid 3–4 column, Gap 16px
- Cards không quá 180px height (tránh scroll)
- Signature cards (coral/forest) dùng sparse (1–2 per page) để highlight

### Menu Management (Table-heavy)

- Minimize horizontal scrolling → Responsive table columns
- Sticky header on long tables
- Inline actions (edit, delete) as small buttons
- Color codes for item status (active/inactive)

### Staff Management

- Avatar + name + role grid
- Quick action buttons (edit, remove, suspend)
- Status indicators (online, idle, offline)

### Reports

- Full-width charts/graphs with light gray background (surface-soft)
- Tabbed interface for date ranges (day/week/month/year)
- Export buttons positioned top-right

---

## VIII. Dark Mode (KDS - Kitchen Display System)

### Why KDS Needs Override

Kitchen Display System (KDS) runs on walls in fast-paced environment:
- High-contrast needed for 6+ meter distance
- Accent colors must pop (coral, mint)
- No fine text; large, bold typography
- Full-screen real-time data (no pagination)

### Dark Mode Tokens

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-canvas: #0d1218;       /* Near-black surface */
    --color-primary: #ffffff;      /* White text */
    --color-body: #e0e2e6;         /* Light gray body text */
    --color-surface-soft: #181d26; /* Dark soft surface */
    --color-hairline: #41454d;     /* Muted border */
    
    /* Signature colors stay bright */
    --signature-coral: #ff6b4a;    /* Brighter coral */
    --signature-mint: #4ae8b9;     /* Brighter mint */
  }
}
```

### KDS Layout

- Full-screen, single-column
- Large typography (display-lg for titles, label-md for items)
- Signature cards for order status (new orders in coral, ready in mint)
- Minimal white space; pack items tight (gap-sm between rows)

---

## IX. Do's & Don'ts

### ✓ DO

- ✓ Use signature cards **sparingly** (1–2 per page max) for true highlights
- ✓ Keep button labels **short** (2–3 words)
- ✓ Align inputs & buttons in **vertical stacks** (easier mobile scanning)
- ✓ Use table `<th>` for headers, not bold `<td>`
- ✓ **Left-align** body text for readability
- ✓ Use **semantic HTML** (`<button>`, not `<div>` with onclick)
- ✓ Test on **mobile** (dashboard is responsive)
- ✓ Use `aria-label` for icon-only buttons
- ✓ Stack **form fields vertically** for touch devices

### ✗ DON'T

- ✗ Don't use **bold** in body copy (use `font-medium` for emphasis)
- ✗ Don't mix **signature colors** (use one per section)
- ✗ Don't use **more than 5 colors** on single page
- ✗ Don't use **white text on light gray** (fail WCAG)
- ✗ Don't use **decorative gradients** (stick to flat colors)
- ✗ Don't use **small caps** or other typography tricks
- ✗ Don't use **system fonts only** (use var(--font-sans))
- ✗ Don't disable **focus rings** on buttons (accessibility)
- ✗ Don't use **center-aligned body text** (hard to read)
- ✗ Don't use **multiple sidebar layouts** at once

---

## X. Implementation Checklist

### Design Foundation
- [x] CSS primitives (colors) defined in `:root`
- [x] Semantic tokens mapped to primitives
- [x] Component tokens documented

### Tailwind Config
- [x] Colors extended with Airtable palette
- [x] Font sizes mapped to typography scale
- [x] Spacing (4px base unit) configured
- [x] Border-radius tiers defined

### Component Library
- [x] Button (primary, secondary, ghost) + sizes
- [x] Card (default, elevated, flat, signature)
- [x] Input with label, error, hint support
- [x] Typography (H1–H4, Paragraph, Caption)
- [x] Layout (Container, SectionBand, Grid, Stack)

### Documentation
- [x] Design System spec (this file)
- [x] Style guide page (/).
- [x] Admin dashboard example (/admin/dashboard)
- [x] Component usage examples

### Testing & Validation
- [ ] Contrast check (WCAG AA minimum)
- [ ] Mobile responsiveness (viewport 375px–1920px)
- [ ] Dark mode KDS preview
- [ ] Accessibility audit (keyboard nav, screen readers)

---

## XI. Resources & References

### Figma
(Link to Figma design file — if created)

### Airtable Official
- [Airtable Design System](https://www.airtable.com/)
- Color palette: `#181d26` (primary), signature cards (coral, forest)

### Tailwind CSS
- [Official Docs](https://tailwindcss.com/)
- [Colors API](https://tailwindcss.com/docs/colors)
- [Spacing Scale](https://tailwindcss.com/docs/spacing)

### Web Standards
- [WCAG 2.1 Contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum)
- [Web Accessibility Initiative](https://www.w3.org/WAI/)

---

## XII. Support & Questions

**Contact:** Xem CLAUDE.md trong repo chính để liên hệ nhóm phát triển.

**Version Control:** Mọi thay đổi design system qua GitHub PR với review từ lead designer/product.

---

**End of Document**
