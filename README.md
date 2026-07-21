# Hệ thống nhà hàng (SaaS)

Nền tảng quản lý nhà hàng multi-tenant: gọi món QR, POS, màn hình bếp (KDS), đặt bàn, giao hàng, báo cáo doanh thu.

- **Stack**: Next.js (App Router) + Supabase (Postgres/Auth/Realtime/Storage), deploy Vercel
- **Tài liệu**: toàn bộ trong [docs/](docs/) theo cấu trúc VibeCode — bắt đầu từ [docs/10-BanThietKe/00-TongThe.md](docs/10-BanThietKe/00-TongThe.md)
- **Quy trình làm việc**: xem [CLAUDE.md](CLAUDE.md) và [docs/vibecode-summary.md](docs/vibecode-summary.md)

## Chạy local

```bash
npm install
cp .env.local.example .env.local   # điền key Supabase (Dashboard → Project Settings → API)
npm run dev                        # http://localhost:3000
```

Trang kiểm chứng nhanh:
- `/style-guide` — design system Mistral + 4 profile bề mặt
- `/r/<slug>` (vd `/r/pho-viet`) — routing tenant theo slug qua middleware

Chưa có key Supabase vẫn xem được UI khung (chưa gọi DB ở P1).

## Môi trường

| Môi trường | Git | Web | Database |
|---|---|---|---|
| local | working copy | `next dev` | Supabase project dev (hoặc CLI local nếu có Docker) |
| dev | branch `dev` | Vercel Preview | Supabase project **dev** |
| prod | branch `main` | Vercel Production | Supabase project **prod** |

### Biến môi trường (đặt trên Vercel cho từng branch)

| Biến | Phạm vi | Nguồn |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase → Settings → API → anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Supabase → Settings → API → service_role key |

Trên Vercel: **Settings → Environment Variables** — đặt biến cho *Preview* (branch `dev`) và *Production* (branch `main`) riêng biệt, trỏ về 2 project Supabase khác nhau. `service_role` KHÔNG bao giờ để lộ ra client.

### Pipeline

- Push branch `dev` → Vercel Preview build → mở URL dev `/style-guide`.
- Merge `dev` → `main` → Vercel Production. Migration DB chạy bằng `supabase db push` (từ plan 01-02 trở đi).

**Quy định**: không sửa DB production thủ công; không tắt/bỏ qua RLS. Chi tiết: [docs/20-DanhSachYeuCau/P1-NenTang.md](docs/20-DanhSachYeuCau/P1-NenTang.md).
