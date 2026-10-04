# 30-02 — Báo cáo: màn "Quản lý" cho điện thoại (`/quan-ly`)

> 04/10/2026. Yêu cầu MGR-01..06. **Code xong, đã kiểm trên dev server với DB production (quán demo pho-viet); CHƯA deploy.**

## Đã làm

| Màn | File | Ghi chú |
|---|---|---|
| Đăng nhập (B2) | `app/quan-ly/page.tsx`, `DangNhapForm.tsx`, `actions.ts` | Email + Mật khẩu (nút hiện/ẩn). Không phải chủ / quản lý → "Tài khoản này không có quyền quản lý." + thu hồi phiên |
| Chọn quán (B3) | `app/quan-ly/chon-quan/page.tsx`, `lib/quan-ly/quan.ts` | 1 quán → vào thẳng. Chuỗi ≥ 2 chi nhánh → dòng đầu "Tất cả chi nhánh" |
| Khung + 5 tab (B4) | `app/r/[slug]/quan-ly/layout.tsx`, `components/quan-ly/ThanhTab.tsx`, `ChonKy.tsx` | Guard như admin. Tên quán ở đầu trang (chạm → đổi quán). Thanh tab đáy chừa vùng an toàn iPhone. Banner thuê bao như admin |
| Tổng quan (B5) | `app/r/[slug]/quan-ly/page.tsx`, `lib/quan-ly/dang-phuc-vu.ts` | Số liệu từ `getReportData` / `getComparison` / `getCancellationBlock` của báo cáo admin. "Đang phục vụ" cộng như sơ đồ bàn POS. `?pham=chuoi` → gộp chuỗi (`getBaoCaoChuoi`) + bảng "Theo chi nhánh" |
| Hóa đơn (B6) | `hoa-don/page.tsx`, `hoa-don/[id]/page.tsx`, `lib/reports/hoa-don.ts` | **Chỉ xem.** Lọc giống hệt RPC báo cáo (`bills_revenue`, paid, bỏ vỏ chia đều, `business_at`), đọc qua RLS. Chi tiết dùng `buildReceiptView` (cùng tờ in cho khách) |
| Báo cáo (B7) | `bao-cao/page.tsx` | Các khối mở/gập dùng lại component báo cáo admin; "Kết quả kinh doanh" chỉ chủ quán; "Xem báo cáo đầy đủ" → admin cùng kỳ |
| Thực đơn (B8) | `thuc-don/page.tsx`, `components/quan-ly/ThucDonDienThoai.tsx` | Công tắc Còn/Hết + hộp "Sửa món" (Tên, Giá bán, Nhóm) gọi **server action admin** `setItemAvailable` / `updateItem` (cùng quyền, cùng khóa giá chuỗi); mô tả món gửi kèm để không bị xóa |
| Thêm (B9) | `them/page.tsx`, `components/quan-ly/ThietBi.tsx` | Tài khoản; 8 lối "Quản trị đầy đủ" theo quyền; Đổi quán; hướng dẫn iPhone (chỉ Safari iOS chưa cài); Đăng xuất; "Phiên bản x.y.z" (APK) / "Bản web" |
| iPhone web app (MGR-06) | `app/quan-ly/manifest.webmanifest/route.ts`, `bieu-tuong.png/route.tsx`, `lib/quan-ly/metadata.ts` | Manifest riêng "TechMenu Quản lý" (`start_url` `/quan-ly`), biểu tượng chữ T cam nền tối |

Kỳ xem: `lib/quan-ly/ky.ts` — 5 kỳ ánh xạ thẳng vào `resolveRange` của báo cáo admin.

## Bằng chứng

| Kiểm | Kết quả |
|---|---|
| `npx vitest run tests/quan-ly` (mới) | 11/11 — kỳ (giờ VN), Đang phục vụ, định dạng giờ |
| `npx vitest run tests/rls/hoa-don.test.ts` (mới, DB production, phiên chủ demo) | 4/4 — **tổng hóa đơn = `report_summary` cùng kỳ**; mới nhất trước; tìm số HĐ; chủ A đọc quán B = 0 |
| `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/p30-quan-ly.spec.ts` (iPhone 390 px) | **13/13** — gồm "doanh thu + số HĐ **khớp** báo cáo admin (7 ngày)", tắt Còn → DB `is_available=false` ≤ 5 s rồi bật lại, đổi giá → lưu → trả giá cũ (mô tả giữ nguyên), tài khoản trạm bị từ chối, **không tràn ngang ở 360 px** mọi tab |
| `npx tsc --noEmit`, `npm run lint`, `npm run test` | sạch / xanh |

Ảnh: `anh/02-quan-ly-dang-nhap.png` … `anh/09-quan-ly-them.png`.

## Lệch so với plan / Giao diện đã chốt

- **B8 "Đang bán (ẩn/hiện)"** chưa làm: admin hiện không có thao tác ẩn món (chỉ xóa), làm mới là thêm tính năng ngoài admin.
  Công tắc Còn/Hết đáp ứng nhu cầu báo hết món. Cần chủ dự án quyết nếu vẫn muốn.
- **Hướng dẫn iPhone** là chữ 3 bước, chưa có ảnh (chưa có iPhone thật để chụp).
- Tổng quan chế độ chuỗi: thẻ thứ 3 hiện "Chi nhánh" thay "Món hủy" (RPC món hủy chưa có bản nhiều chi nhánh).
- Hóa đơn: cột "thu ngân" để trống với hóa đơn mà người thu không còn membership (đọc `display_name` theo `closed_by`).
- Báo "1 Issue" của Next dev trên ảnh chụp là do Playwright chèn `caret-color` khi chụp (lệch hydrate giả) — mở trang
  không chụp thì không có.

## Phát hiện an toàn (đã xử lý)

View `bills_revenue` cho phép **khóa anon đọc hóa đơn của mọi quán** (6.411 dòng). Vá bằng `0084_bills_revenue_security_invoker.sql`,
chạy thử trong giao dịch ROLLBACK trước, **áp production 04/10/2026 (chủ dự án đồng ý)**. Sau vá: anon → 401
`permission denied`; báo cáo chủ quán giữ nguyên số. Test `tests/rls/bills-revenue-view.test.ts` 2/2.
Bộ RLS đầy đủ: 35/37 tệp xanh; `daily-close` đỏ do pho-viet còn 217 dòng sổ kho từ dữ liệu demo P26 (có từ trước, không liên
quan); `margin-report` chạy riêng 10/10.
