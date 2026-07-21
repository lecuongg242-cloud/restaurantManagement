---
phase: 01-nen-tang
plan: 01
type: summary
status: đạt
requirements: [OPS-01, OPS-02, OPS-03, OPS-05, TENANT-04]
---

# 01-01 — Scaffold + /style-guide — BÁO CÁO

Dựng "walking skeleton" P1: Next.js chạy local, design system Mistral render trên `/style-guide`,
routing tenant theo slug. Thực thi trong phiên: **Task 1–5 + phần local của Task 6**.

## Trạng thái từng cam kết (must_haves)

| Cam kết | Trạng thái | Bằng chứng |
|---|---|---|
| `/style-guide` hiển thị đủ token màu/chữ/spacing/radius + 4 profile | ✅ Local | `http 200`; grep thấy đủ `Customer/POS/KDS/Admin`, `bg-primary`, 3 font |
| Cùng trang mở được trên Vercel dev (preview branch `dev`) | ⏳ Chờ user | Cần user nối Vercel + đặt env (mục *Việc còn lại*) |
| `/r/<slug>` → middleware nhận diện slug, không 500 | ✅ Local | `/r/pho-viet` `http 200`; `data-tenant-slug="pho-viet"`; header `x-tenant-slug: pho-viet` |
| `app/style-guide/page.tsx` render component thật | ✅ | Dùng Button/Card/Input/Badge (shadcn map token), không placeholder |
| `lib/design/tokens.css` chứa biến CSS toàn bộ token Mistral | ✅ | `--color-primary:#fa520f`, `--status-ready:#1a7f4b`, `--tenant-primary`, spacing/radius |
| `middleware.ts` phân giải tenant theo slug, nhánh subdomain (tắt) | ✅ | `x-tenant-slug`; `ENABLE_SUBDOMAIN = false` |
| tailwind đọc biến từ tokens.css; shadcn dùng biến | ✅ | `tailwind.config.ts` → `var(--color-primary)`… |
| `lib/fonts.ts` nạp Fraunces/Inter/JetBrains Mono qua next/font | ✅ | `next/font/google`; layout gắn `fontVariables` |

## Verification (từ plan)
- ✅ `npm run build` exit 0, không warning mới (Next 15.5.20)
- ✅ `npm run lint` — No ESLint warnings or errors
- ✅ `/style-guide` render đủ token + 4 profile (local)
- ✅ `/r/[slug]` phân giải slug qua middleware, không 500
- ✅ Không commit secret — chỉ `.env.local.example` (giá trị placeholder)

## File đã đổi/tạo
- **Config**: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`, `components.json`, `.eslintrc.json`, `.gitignore` (thêm `!.env.local.example`)
- **Design**: `lib/design/tokens.css`, `lib/fonts.ts`, `app/globals.css`, `app/layout.tsx` (`lang="vi"`)
- **UI kit**: `components/ui/{button,card,input,badge}.tsx`, `components/design/swatch.tsx`, `lib/utils.ts`
- **Routes**: `app/(marketing)/page.tsx`, `app/style-guide/page.tsx`, `app/super/page.tsx`,
  `app/r/[slug]/layout.tsx`, `app/r/[slug]/(customer)/page.tsx`, `app/r/[slug]/{pos,kds,admin}/page.tsx`
- **Middleware**: `middleware.ts`
- **Supabase**: `lib/supabase/{client,server}.ts`, `.env.local.example`, `supabase/config.toml`
- **Docs**: `README.md` (mục Môi trường + biến env + pipeline)

## Bằng chứng (log)
```
npm run build → ✓ Compiled successfully; 6 routes + Middleware; exit 0
GET /style-guide      → 200   (Customer/POS/KDS/Admin, bg-primary, __variable fonts)
GET /                 → 200   (hero Fraunces + sunset stripe)
GET /r/pho-viet       → 200   (data-tenant-slug="pho-viet", middleware: pho-viet)
GET /r/pho-viet/pos   → 200
GET /super            → 200
npm run lint          → No ESLint warnings or errors
```
> Ảnh chụp `/style-guide`: chụp thủ công tại checkpoint (mục *how-to-verify* trong plan).

## Việc còn lại (user_setup — Task 2 & 6 cần hạ tầng)
1. **Supabase dev**: tạo project → lấy URL + anon + service_role → điền `.env.local` (theo `.env.local.example`).
2. **Vercel**: nối repo, đặt env cho *Preview* (branch `dev`) và *Production* (`main`); bật preview branch `dev`.
3. Push branch `dev` → xác nhận Vercel build xanh → mở URL dev `/style-guide` (đóng cam kết OPS-01/02).

## Checkpoint
Checkpoint `human-verify` (blocking) đang chờ. Xác minh theo plan §checkpoint rồi gõ **"approved"**
hoặc mô tả lỗi (màu/font/khối/route).
