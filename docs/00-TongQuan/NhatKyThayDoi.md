# Nhật ký thay đổi

## 21/07/2026
- **Chủ dự án XÁC NHẬN LƯU hồ sơ P2** (bản thiết kế chi tiết + danh sách cam kết 12 tiêu chí, sau vòng góp ý v0.2) → nâng lên v1.0, ĐÃ DUYỆT. Chờ "XÁC NHẬN LÀM" để bắt đầu build P2 (3 plan: 02-01 CRUD menu + trang menu khách; 02-02 khu vực/bàn + QR + in; 02-03 onboarding + đo nghiệm thu).

## 20/07/2026 (khuya — tiếp)
- Cập nhật hồ sơ P2 lên **v0.2** theo 4 góp ý của Chủ dự án + 2 bổ sung: (1) bỏ anon SELECT trực tiếp `tables`/`areas`, resolve QR qua RPC `resolve_table_by_qr` trả đúng 1 dòng; (2) giữ 2 cột riêng `is_active`/`is_sold_out` (đã đúng từ v0.1); (3) composite FK kèm `tenant_id` trên cả 4 quan hệ; (4) một bộ hồ sơ duy nhất, sửa tại chỗ (git giữ lịch sử, không tạo file archive) — wizard 4 bước khớp câu chữ TENANT-03, danh sách cam kết 12 tiêu chí; (5) CHECK giá ≥ 0 tại database; (6) chặn ảnh tại cấu hình bucket (`file_size_limit` 2MB + `allowed_mime_types`). Ghi chú: giữ ngưỡng 2MB theo MENU-01 đã duyệt; muốn nới ngưỡng phải đổi 00-Requirements.md + lập QD. Vẫn NHÁP, chờ "XÁC NHẬN LƯU".
- Soạn hồ sơ P2 — **NHÁP, chờ duyệt**: bản thiết kế chi tiết `10-BanThietKe/20-P2-DuLieuNhaHang.md` (schema migration 0002: menu/tùy chọn/khu vực/bàn + RLS anon hẹp, storage ảnh món, admin menu + bàn/QR, trang menu khách mobile-first, wizard onboarding) + danh sách cam kết `20-DanhSachYeuCau/P2-DuLieuNhaHang.md` (10 tiêu chí đo được, phủ MENU-01..03, TABLE-01, TENANT-03). Chờ "XÁC NHẬN LƯU".

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
