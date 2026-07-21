# Kế hoạch P1 — Nền tảng (chia lát cắt dọc, mỗi plan test được trên trình duyệt)

> Lập ngày 21/07/2026. Nguồn: `00-TongQuan/Roadmap.md` (P1), `20-DanhSachYeuCau/00-Requirements.md`, `10-BanThietKe/01,02,03`, `15-QuyetDinh/QD-005, QD-006`.
> **Định dạng:** theo GSD PLAN.md (frontmatter + task XML + acceptance_criteria + must_haves). Đặt trong `docs/` để giữ 1 nguồn sự thật (không tạo `.planning/` song song).

## Nguyên tắc chia lại P1
Roadmap gốc chia P1 theo **lớp ngang** (scaffold / schema+RLS / auth / design). Ràng buộc của chủ dự án: **mỗi plan phải xây đủ frontend để test thủ công qua luồng**. Vì vậy P1 được chia lại thành **4 lát cắt dọc** — mỗi plan chạy tới một màn hình bấm được và kết thúc bằng **checkpoint kiểm thử thủ công** (`autonomous: false`).

| Plan | Tên | Wave | Phụ thuộc | UI test được (bấm vào) | Yêu cầu phủ |
|---|---|---|---|---|---|
| 01-01 | Khung chạy + Style-guide | 1 | — | `/style-guide` render token + 4 profile bề mặt; chạy local + dev | OPS-01, OPS-02, OPS-03, OPS-05, TENANT-04 (một phần) |
| 01-02 | Super-admin tạo tenant + Owner đăng nhập | 2 | 01-01 | `/super` tạo nhà hàng; `/r/[slug]/admin` sau đăng nhập owner | TENANT-01, TENANT-04, AUTH-01 |
| 01-03 | Trạm POS/KDS + PIN + RBAC | 3 | 01-02 | `/r/[slug]/pos/login` + pin-pad → shell POS/KDS; sai vai trò bị chặn | AUTH-02, AUTH-03, AUTH-04, OPS-06 |
| 01-04 | Chứng minh cách ly tenant (RLS) + 2 tenant demo | 3 | 01-02 | Trang "Phạm vi dữ liệu" chỉ hiện tenant hiện tại; test RLS tự động xanh | TENANT-02 |

Wave 3 có 2 plan (01-03, 01-04) song song được vì chỉ cùng phụ thuộc 01-02, không đụng nhau nhiều (01-03: auth trạm/PIN; 01-04: test RLS + seed).

## Nghiệm thu P1 (khớp Roadmap)
1. App chạy local + dev (Vercel) cùng codebase (01-01).
2. Super-admin tạo tenant; owner vào đúng `/r/[slug]` (01-02).
3. Test RLS tự động: tenant A ⊥ tenant B (01-04).
4. Style-guide render design system Mistral + 4 profile (01-01).

## Stack chốt cho P1
- **Next.js 15 App Router** + TypeScript; **Tailwind** + **shadcn/ui**; fonts qua `next/font/google` (Fraunces, Inter, JetBrains Mono).
- **Supabase**: `@supabase/ssr` (auth SSR), Postgres + RLS, CLI migrations (`supabase/migrations/*.sql`).
- **bcryptjs** cho PIN (băm phía server). **Vitest** cho test RLS.
- Deploy **Vercel** (branch `dev` → preview, `main` → prod); env qua Vercel + `.env.local`.

## Cách chạy manual test (chung)
Mỗi plan kết thúc bằng task `checkpoint:human-verify` mô tả URL + thao tác cần bấm. Chủ dự án mở trình duyệt, làm theo, gõ "approved" hoặc mô tả lỗi. Không có phần cứng in ở P1 (in ở P3+).
