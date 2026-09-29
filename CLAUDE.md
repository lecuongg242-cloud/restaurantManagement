# Restaurant SaaS — Hướng dẫn cho Claude Code

## Dự án
Hệ thống quản lý nhà hàng dạng **SaaS multi-tenant**: Gọi món + POS, Màn hình bếp (KDS), Đặt bàn + giao hàng, Quản trị & báo cáo.
- **Ngôn ngữ**: UI tiếng Việt, tài liệu tiếng Việt. Code (tên biến, hàm, commit) bằng tiếng Anh.
- **Stack**: Next.js (App Router) trên Vercel + Supabase (Postgres, Auth, Realtime, Storage).
- **Môi trường**: `local` (máy dev) → `dev` (Vercel preview, branch `dev`) → `main` (Vercel production, branch `main`).

## Quy trình (VibeCode — xem docs/vibecode-summary.md)
- Tài liệu là nguồn sự thật duy nhất, nằm trong `docs/` theo cấu trúc 00-TongQuan → 50-PhienBan.
- Mọi phần việc phải có **danh sách yêu cầu đo được** trong `docs/20-DanhSachYeuCau/` trước khi code.
- Báo cáo sau mỗi phần: file đã đổi, bằng chứng (ảnh/log/test output), trạng thái từng cam kết.
- Quyết định quan trọng ghi vào `docs/15-QuyetDinh/QD-00X-*.md`.
- Tối đa 3 vòng sửa cho một phần; kẹt thì đơn giản hóa hoặc đổi cách.
- **Tham khảo đối thủ TRƯỚC khi làm (chủ dự án yêu cầu 27/09/2026 — "cần giống theo").** Trước khi lập plan hoặc code bất kỳ
  tính năng nào, tra xem đối thủ (KiotViet, Sapo FnB, CUKCUK, iPOS, POS365 — xem `docs/00-TongQuan/PhanTichDoiThu.md`) làm
  tính năng đó thế nào: luồng thao tác, màn hình, giấy in, cài đặt, chữ trên nút. Nguồn: trang hướng dẫn sử dụng chính thức,
  video hướng dẫn, bài đánh giá. Ghi kết quả vào mục **"Đối thủ làm thế nào"** trong `00-TongQuan.md` của P đó (kèm link nguồn
  + ngày tra) và **làm theo cách của họ** — chủ quán đã quen. Khác đối thủ thì phải ghi lý do và được chủ dự án đồng ý.
- **Chốt giao diện với chủ dự án TRƯỚC khi code (chủ dự án yêu cầu 30/09/2026).** Mỗi plan có tính năng người dùng nhìn
  thấy phải có mục **"Giao diện"** mô tả từng màn: vị trí trong menu, **các tab**, bố cục, **cột** của bảng, ô của form, **chữ
  trên nút**, trạng thái trống / lỗi, trên điện thoại hiện thế nào — kèm đối thủ làm tương tự ra sao. Đưa bản mô tả này cho
  chủ dự án **chốt** (danh sách tab + màn) rồi mới code; không tự quyết màn hình. Thay đổi màn sau khi đã chốt cũng hỏi lại.

## Nguyên tắc code (Karpathy guidelines)
1. **Think before coding** — nêu giả định, hỏi khi mơ hồ, không đoán.
2. **Simplicity first** — giải pháp đơn giản nhất chạy được; không over-engineer, không thêm tính năng ngoài yêu cầu.
3. **Surgical changes** — diff tối thiểu, không đụng phần không liên quan, không tạo file trùng lặp phiên bản.
4. **Goal-driven execution** — mỗi task có tiêu chí thành công kiểm tra được; test trước khi báo xong.

## Skills có sẵn
- `/gsd-*` (get-shit-done): new-project, discuss-phase, plan-phase, execute-phase, verify-work… — dùng cho vòng đời spec → plan → build → verify.
- `ui-ux-pro-max`, `design-system`, `ui-styling` — thiết kế UI/UX, design tokens, shadcn/ui.
- `product-capability`, `product-lens`, `intent-driven-development` — biến yêu cầu thành spec/acceptance criteria.
- `architecture-decision-records` — viết ADR.
- `tdd-workflow`, `verification-loop`, `orch-build-mvp`, `orch-add-feature` — build & verify.
- `accessibility`, `frontend-design-direction`, `make-interfaces-feel-better` — chất lượng frontend.

## Bảo mật & vận hành
- Không hardcode/log API key; secrets qua env vars (Vercel env + `.env.local`, không commit).
- Multi-tenant: mọi bảng có `tenant_id`, bắt buộc Row Level Security trên Supabase.
- File tạm tự xóa; không lưu PII ngoài phạm vi cần thiết.
