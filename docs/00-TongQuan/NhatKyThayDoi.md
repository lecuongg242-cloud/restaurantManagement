# Nhật ký thay đổi

## 20/07/2026 (khuya)
- **QD-003**: đổi design system sang ngôn ngữ MiniMax theo DESIGN-minimax.md của Chủ dự án — canvas trắng, nút pill đen, hairline, radius 8/16/32px, màu định danh 4 khu vực (coral/blue/purple/magenta). DM Sans không hỗ trợ tiếng Việt → thay bằng Be Vietnam Pro (một typeface duy nhất). Cập nhật token + toàn bộ UI P1 + style-guide. Thay thế palette đỏ/vàng của QD-002.
- Cài CodeGraph (MCP semantic code index) vào dự án.

## 20/07/2026 (đêm)
- **XÁC NHẬN LÀM P1** → build xong cả 4 plan (commits `d0516bc` → `1d40124` trên branch `dev`): scaffold Next.js 16, schema + RLS + test suite, auth + mời/khóa, design system + style-guide.
- QD-002: chốt design system (palette đỏ/vàng, font Be Vietnam Pro/Inter/JetBrains Mono).
- Báo cáo vòng 1 → `40-KiemTra/BaoCao-P1-20260720.md`: 2/10 tiêu chí ĐẠT có bằng chứng, 8/10 chờ hạ tầng Supabase/Vercel/GitHub (việc của Chủ dự án).

## 20/07/2026 (tối — muộn)
- **Chủ dự án XÁC NHẬN LƯU hồ sơ P1** (bản thiết kế chi tiết + danh sách cam kết, sau 4 điểm cập nhật) → nâng lên v1.0, ĐÃ DUYỆT. Chờ "XÁC NHẬN LÀM" để bắt đầu build.

## 20/07/2026 (tối)
- Cập nhật hồ sơ P1 theo 4 góp ý của Chủ dự án: (1) ma trận phân quyền kiểm thử 6 tài khoản (super-admin + 5 vai trò); (2) thêm bảng + luồng `tenant_invitations`, chỉ tạo membership khi chấp nhận hợp lệ; (3) làm rõ khóa nhân viên chặn 2 tầng middleware + RLS ngay request kế tiếp, chỉ tenant tương ứng; (4) thêm quy định cấm sửa DB production thủ công và cấm tắt/bỏ qua RLS. Đồng bộ AUTH-03 trong 00-Requirements.md.

## 20/07/2026 (chiều)
- **Chủ dự án XÁC NHẬN LƯU bản thiết kế tổng quát** → nâng lên v1.0, trạng thái ĐÃ DUYỆT.
- Sinh spec chi tiết: `20-DanhSachYeuCau/00-Requirements.md` (41 yêu cầu V1, traceability 6 giai đoạn), `00-TongQuan/Roadmap.md` (P1–P6 + tiêu chí thành công từng giai đoạn).
- Viết bản thiết kế chi tiết P1 (`10-BanThietKe/10-P1-NenTang.md`) + danh sách cam kết P1 (`20-DanhSachYeuCau/P1-NenTang.md`) — **NHÁP, chờ duyệt**.

## 20/07/2026
- Khởi tạo dự án, cài bộ skills (GSD + UI/UX Pro Max + ECC chọn lọc + Karpathy guidelines).
- Tóm tắt phương pháp VibeCode → `docs/vibecode-summary.md`.
- Chốt phạm vi V1 (4 phân hệ, SaaS multi-tenant, UI tiếng Việt) và stack (QD-001: Next.js + Supabase, Vercel dev/prod).
- Viết bản thiết kế tổng quát NHÁP → `docs/10-BanThietKe/00-TongThe.md` (chờ duyệt).
- Bổ sung theo phản hồi Chủ dự án: app khách mobile-first; in hóa đơn (POS) + in phiếu bếp tự động (KDS), máy in nhiệt 58/80mm.
