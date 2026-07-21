# Hệ thống nhà hàng (SaaS)

Nền tảng quản lý nhà hàng multi-tenant: gọi món QR, POS, màn hình bếp (KDS), đặt bàn, giao hàng, báo cáo doanh thu.

- **Stack**: Next.js (App Router) + Supabase (Postgres/Auth/Realtime/Storage), deploy Vercel
- **Tài liệu**: toàn bộ trong [docs/](docs/) theo cấu trúc VibeCode — bắt đầu từ [docs/10-BanThietKe/00-TongThe.md](docs/10-BanThietKe/00-TongThe.md)
- **Quy trình làm việc**: xem [CLAUDE.md](CLAUDE.md) và [docs/vibecode-summary.md](docs/vibecode-summary.md)

## Chạy local

```bash
npm install
cp .env.example .env.local   # điền key Supabase (xem docs/10-BanThietKe/10-P1-NenTang.md §4)
npm run dev                  # http://localhost:3000
```

Chưa có key Supabase vẫn xem được UI khung (middleware tự bỏ qua).

## Môi trường

| Môi trường | Git | Web | Database |
|---|---|---|---|
| local | working copy | `next dev` | Supabase project dev (hoặc CLI local nếu có Docker) |
| dev | branch `dev` | Vercel Preview | Supabase project **dev** |
| prod | branch `main` | Vercel Production | Supabase project **prod** |

**Quy định**: không sửa DB production thủ công; không tắt/bỏ qua RLS. Chi tiết: [docs/20-DanhSachYeuCau/P1-NenTang.md](docs/20-DanhSachYeuCau/P1-NenTang.md).
