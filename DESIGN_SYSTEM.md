# Airtable Design System — Quick Reference

**Status:** ✅ Live  
**Branch:** `airtable-design-system`  
**Commit:** 7f0c0ee

## Quick Start

### View the design system:
```bash
npm install
npm run dev
# Open http://localhost:3000
```

### Available pages:
- `/` — Style guide (colors, typography, components)
- `/admin/dashboard` — Admin dashboard example

---

## Core Design Tokens

### Colors

**Primary:**
- `#181d26` — Primary (ink, buttons, text)
- `#ffffff` — Canvas (backgrounds)

**Signature (callouts):**
- `#aa2d00` — Coral (error, feature)
- `#0a2e0e` — Forest (secondary)

### Typography

| Class | Size | Weight | Use |
|---|---|---|---|
| `text-display-lg` | 40px | 400 | Dashboard h1 |
| `text-title-lg` | 24px | 400 | Section headers |
| `text-body-md` | 14px | 400 | Body copy |
| `text-caption` | 14px | 500 | Metadata |

### Spacing

Base unit: **4px**

- `p-lg` = 16px
- `gap-md` = 12px
- `py-section` = 96px (vertical rhythm)

---

## Component Patterns

### Buttons

```tsx
import { Button } from '@/components/Button';

<Button variant="primary">Save</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost">Link</Button>
<Button variant="success">Confirm</Button>
<Button variant="danger" disabled>Disabled</Button>
```

### Cards

```tsx
import { Card } from '@/components/Card';

<Card variant="default">Content</Card>
<Card variant="elevated">With shadow</Card>
<Card variant="flat">Gray bg</Card>
<Card variant="coral">Feature callout</Card>
<Card variant="forest">Secondary</Card>
```

### Forms

```tsx
import { Input } from '@/components/Input';

<Input 
  label="Name"
  placeholder="Enter..."
  error={errors.name}
  hint="Required"
/>
```

### Typography

```tsx
import { H1, H3, Paragraph, Caption } from '@/components/Typography';

<H1>Heading</H1>
<H3>Subheading</H3>
<Paragraph>Body text</Paragraph>
<Caption>Metadata</Caption>
```

### Layouts

```tsx
import { Container, SectionBand, Grid, Stack } from '@/components/Layout';

<Container>
  <SectionBand>
    <H2>Section</H2>
    <Grid columns="dashboard">
      {/* 3 col lg, 2 md, 1 sm */}
    </Grid>
  </SectionBand>
</Container>
```

---

## CSS Tokens

All tokens available as CSS variables in `app/globals.css`:

```css
:root {
  --color-primary: #181d26;
  --color-canvas: #ffffff;
  --signature-coral: #aa2d00;
  --signature-forest: #0a2e0e;
  /* ... and more */
}
```

---

## Building New Admin Pages

1. **Create route:** `app/admin/my-feature/page.tsx`
2. **Use layout components:**
   ```tsx
   export default function MyFeature() {
     return (
       <Container>
         <SectionBand>
           <H2>Feature Title</H2>
           <Grid columns="dashboard">
             <Card>Card 1</Card>
             <Card>Card 2</Card>
           </Grid>
         </SectionBand>
       </Container>
     );
   }
   ```

3. **Reference:** See `app/admin/dashboard/page.tsx` for full example

---

## Next Steps (P2)

- [ ] Menu management CRUD
- [ ] Staff/roles management
- [ ] Reports & analytics
- [ ] POS checkout screens
- [ ] Settings pages

**Keep customer QR menu separate (P3) with QD-002 red/gold palette.**

---

## Documentation

- **Full Spec:** `docs/10-BanThietKe/01-AirtableDS.md`
- **Decision:** `docs/15-QuyetDinh/QD-003-DesignSystem-Airtable.md`
- **Report:** `docs/40-KiemTra/BaoCao-DesignSystem-AirtableDS-20260721.md`

---

## Support

Issues or questions? Check `CLAUDE.md` for contact info.
