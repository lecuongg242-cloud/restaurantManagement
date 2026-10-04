# 30-01 — Báo cáo: ☰ → "Quản trị" trong app Thu ngân (Windows + Android)

> 04/10/2026. Yêu cầu DESK-13, ANDR-09. **Code xong, đã kiểm; CHƯA phát hành bản app mới, CHƯA deploy web.**

## Đã làm

| Phần | File | Nội dung |
|---|---|---|
| Windows | `desktop/main.mjs` | Mục ☰ **"Quản trị"** (dưới "Màn bếp", có vạch ngăn) → cửa sổ "Quản trị — {quán}", phân vùng `persist:quan-tri` (phiên riêng, nhớ đăng nhập). Hàng rào điều hướng tách thành `ganBaoVe()` dùng chung cho mọi cửa sổ; tab mới cùng tên miền (In mã QR, Xem thực đơn) mở cửa sổ con **cùng phiên**. Tải tệp → hộp "Lưu tệp" (mặc định Tải xuống). "Đăng xuất máy quầy" đóng cửa sổ + xóa phân vùng. Màn "mất mạng" thử lại đúng cửa sổ đã gọi |
| Android | `QuanTriActivity.kt` (mới), `MainActivity.kt`, `AndroidManifest.xml` | Màn Quản trị phủ lên POS, WebView **hồ sơ riêng "quan-tri"** (`androidx.webkit` Profile); thanh "← Về Thu ngân" + "Quản trị — {quán}"; Back lùi trang rồi về POS; Xuất Excel → `DownloadManager` vào Tải xuống (Android 8–9 xin quyền ghi). WebView cũ không có hồ sơ riêng → mở trình duyệt + thông báo. "Đăng xuất máy" xóa cả hồ sơ quản trị |
| Web | `app/r/[slug]/admin/actions.ts`, `login/page.tsx`, `login/OwnerLoginForm.tsx` | Cờ `?chi-quan-tri=1`: nhân viên không có quyền đăng nhập ở cửa sổ Quản trị nhận **"Tài khoản này không có quyền quản trị."** (thu hồi phiên) thay vì bị đưa sang POS. Web thường (không cờ) giữ nguyên hành vi cũ |

## Bằng chứng

| Kiểm | Kết quả |
|---|---|
| `npx vitest run tests/auth/owner-sign-in.test.ts` (mới) | 4/4 — đỏ trước khi sửa, xanh sau |
| `npm run test` | 99 tệp, 1038 test xanh |
| `npx playwright test -c playwright.desktop.config.ts` | 8 xanh, 2 bỏ qua (chỉ chạy trên bản đã đóng gói). Test mới "☰ Quản trị → cửa sổ riêng…" chạy 10 lần liên tiếp xanh; **1 lần đỏ** khi chạy song song với ESLint (máy bận) — chưa tái hiện được |
| `node android/scripts/thu-quan-tri.mjs` (mới) — máy ảo **Android 15, WebView 124**, production, quán demo pho-viet | **15/15 ĐẠT**: thu ngân vào POS; Quản trị mở trong app; chủ vào admin (phiên = `ownera@pho-viet.test`); Xuất Excel ra `pho-viet_bao-cao_….xlsx`; về POS **phiên vẫn là thu ngân**; mở lại nhớ đăng nhập; đăng xuất máy xóa phiên quản trị |
| Máy ảo **Android 14, WebView 113** | Không có hồ sơ riêng → app mở **Chrome** (nhánh dự phòng chạy đúng thiết kế) |
| `npx tsc --noEmit`, `npm run lint` | sạch |

Ảnh: `anh/01-windows-quan-tri.png`, `anh/p30-and-quan-tri-dang-nhap.png`, `anh/p30-and-quan-tri-tong-quan.png`,
`anh/p30-and-pos-van-thu-ngan.png`.

## Lệch so với plan / phát hiện

- **Thêm sửa web** (không có trong 30-01-PLAN): cờ `chi-quan-tri` cho trang đăng nhập quản trị — cần để đạt A3 ("thu ngân → báo
  không có quyền"). Trên Android chưa kiểm được A3 với production vì web chưa deploy (đã kiểm ở test Windows + unit test).
- Test desktop cũ ghi cứng phiên bản `1.0.2` trong khi app đã là `1.0.3` (2 test đỏ **từ trước**) → đổi sang đọc từ `desktop/package.json`.
- Email thu ngân demo `lan@pho-viet.test` trên production đã thành `lan@pho-viet.staff.local` và PIN không còn là `1234`. Không
  dò PIN (sẽ khóa tài khoản); tạo **thu ngân thử riêng** `thu-ngan-p30@pho-viet.staff.local` (quán demo pho-viet) cho kịch bản.
- `android/scripts/thiet-bi.mjs`: thêm `cdp()` + tham số chọn trang (app giờ có 2 WebView); cookie phiên Supabase là HttpOnly
  nên kịch bản đọc qua DevTools `Network.getCookies`.
- Máy ảo mới `techmenu-35` (Android 15) đã tạo — cần `-dns-server 8.8.8.8` mới ra mạng.
- **Máy POS Android giá rẻ không có Google Play** thường giữ WebView cũ ⇒ Quản trị sẽ mở bằng trình duyệt (vẫn an toàn, thu ngân
  không bị đăng xuất).

## Còn lại để phát hành

Deploy web (cờ `chi-quan-tri`) → tăng phiên bản + phát hành app Windows và APK Android qua script sẵn có. Chờ chủ dự án cho phép.
