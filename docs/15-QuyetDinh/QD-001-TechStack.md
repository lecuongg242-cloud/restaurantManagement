===================================
QUYẾT ĐỊNH SỐ 001: Tech stack & môi trường triển khai
NGÀY: 20/07/2026
===================================

1. TÌNH HUỐNG
Cần chọn stack cho SaaS nhà hàng multi-tenant, deploy trên Vercel (dev + prod), yêu cầu realtime (order → bếp).

2. CÁC LỰA CHỌN ĐÃ CÂN NHẮC
- Lựa chọn A: Next.js + Supabase
  Ưu: Auth/Postgres/Realtime/Storage có sẵn, RLS hợp multi-tenant, free tier, ít hạ tầng phải tự vận hành.
  Nhược: Phụ thuộc dịch vụ Supabase; realtime có giới hạn kết nối theo gói.
- Lựa chọn B: Next.js + Postgres serverless (Neon) + Prisma
  Ưu: Chủ động schema/ORM.
  Nhược: Tự build auth + realtime (websocket trên Vercel phức tạp), chậm hơn nhiều cho MVP.

3. QUYẾT ĐỊNH
Chọn: A — Next.js (App Router) + Supabase. (Người quyết định: Chủ dự án, 20/07/2026)

4. MÔI TRƯỜNG
- local: máy dev (supabase local hoặc project dev)
- dev: branch `dev` → Vercel preview/dev + Supabase project dev
- main: branch `main` → Vercel production + Supabase project prod

5. HỆ QUẢ DỰ KIẾN
- Tích cực: MVP nhanh, realtime KDS có sẵn, RLS bảo vệ dữ liệu tenant.
- Tiêu cực: Cần theo dõi quota Supabase khi số tenant tăng; kế hoạch nâng gói khi vượt free tier.
