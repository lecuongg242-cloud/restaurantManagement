# 30-03 — Báo cáo: APK "TechMenu Quản lý" + tải app

> 04/10/2026. Yêu cầu MGR-07, MGR-08. **Web đã deploy production 04/10/2026 (main 7a3b3c1)** — e2e `p30-quan-ly.spec.ts` 13/13 chạy thẳng trên production. Đã phát hành 04/10/2026: Thu ngân Windows 1.0.4, Thu ngân Android 1.0.1, Quản lý Android 1.0.0 (cùng chứng chỉ ký `ae654a27…`).

## Đã làm

| Phần | File | Nội dung |
|---|---|---|
| Gradle | `android/app/build.gradle.kts` | 2 flavor: `thuNgan` (giữ `vn.techmenu.thungan`) và `quanLy` (`vn.techmenu.quanly`); `BuildConfig.APP_CAP_NHAT` / `TIEN_TO_TEP` theo app |
| Manifest | `src/main` (chung: mạng, cập nhật, tải tệp) · `src/thuNgan` (POS, cầu in, Quản trị, quyền chạy nền) · `src/quanLy` (một màn) | APK Quản lý **không** có dịch vụ in / quyền chạy nền / khởi động cùng máy (kiểm bằng `aapt2 dump`) |
| App Quản lý | `src/quanLy/java/…/QuanLyActivity.kt`, `src/quanLy/res` | WebView mở `/quan-ly`, nhớ đăng nhập, UA `TechMenuQuanLy/x.y.z`, mất mạng → màn của app, Back lùi trang rồi thoát; tên "TechMenu Quản lý", biểu tượng T cam nền tối |
| Dùng chung | `TuCapNhat.kt` (tách khỏi `MainActivity`), `TaiTep.kt` (tách khỏi `QuanTriActivity`), `CapNhat.kt` | Tự cập nhật đọc `?app=` + chỉ nhận tên tệp có tiền tố của app mình; tải tệp vào Tải xuống |
| Web | `lib/android/phat-hanh.ts`, `app/api/android/latest/route.ts` | `?app=quan-ly` → `android-quan-ly-latest.json`, `TechMenu-QuanLy-x.y.z.apk`; không tham số = Thu ngân như cũ |
| Tải app (B1) | `components/quan-ly/TheAppQuanLy.tsx` (thẻ ở Tổng quan admin, chỉ chủ / quản lý), `app/(marketing)/tai-app-quan-ly/page.tsx` | Mã QR → trang tải công khai: nút "Tải cho Android (… MB)" (ẩn thành "Bản Android sắp có" khi chưa phát hành) + 3 bước Android + 3 bước iPhone |
| Script | `android/scripts/phat-hanh.mjs` (`--app quan-ly`), `thu-cap-nhat.mjs`, `thu-in-lan.mjs` (task/đường dẫn APK mới), `thiet-bi.mjs` (`chonGoi`, `cdp`, `bam`), `thu-quan-ly.mjs` (mới) |

## Bằng chứng

| Kiểm | Kết quả |
|---|---|
| `npx vitest run tests/android` | 18/18 (thêm 4 test `?app=quan-ly`; manifest app này không nhận tệp app kia) |
| `./gradlew assembleThuNganDebug assembleQuanLyDebug` + `aapt2 dump` | 2 APK; Quản lý chỉ có `QuanLyActivity`; Thu ngân giữ nguyên mã gói, quyền, dịch vụ in |
| `node android/scripts/thu-cap-nhat.mjs` — **app Thu ngân sau khi tách flavor** | **8/8**: lên 1.0.1 qua hộp "Có bản mới", **giữ kích hoạt**, tệp hỏng không cài |
| `node android/scripts/thu-quan-tri.mjs` (30-01) trên bản Thu ngân mới | 15/15 |
| `node android/scripts/thu-quan-ly.mjs` — Android 15, bản debug trỏ dev server (`adb reverse`) | **10/10**: cài cạnh app Thu ngân; mở `/quan-ly`; đăng nhập → Tổng quan; tắt hẳn mở lại vẫn đăng nhập; "Phiên bản" của APK; "Kho hàng" mở trong app, Back về tab Thêm; Xuất Excel ra Tải xuống; Đăng xuất |
| `./gradlew test…UnitTest` | 7/7 mỗi flavor |
| e2e `p30-quan-ly.spec.ts` (phần tải app) | 2/2 — trang tải công khai, thẻ QR ở admin |

Ảnh: `anh/10-tai-app-quan-ly.png`, `anh/11-admin-the-app-quan-ly.png`, `anh/p30-ql-apk-*.png`.

## Phát hiện

- Kịch bản điều khiển WebView bằng `el.click()` qua DevTools tạo các bước điều hướng **không có cử chỉ người dùng** ⇒ Chromium
  cho "bỏ qua khi Back" ⇒ `canGoBack()` = false, phím Back đóng app. App đúng (kiểm bằng cú bấm tin cậy: Back về đúng trang);
  kịch bản đổi sang `bam()` (sự kiện chuột tin cậy của DevTools).
- `assembleDebug` / `assembleRelease` giờ build cả hai app; đường dẫn APK đổi sang `apk/{thuNgan|quanLy}/{debug|release}/`.

## Còn lại để phát hành (chờ chủ dự án)

1. Deploy web (30-01 cờ `chi-quan-tri`, 30-02 `/quan-ly`, 30-03 `?app=`, trang tải).
2. `phat-hanh.mjs 1.0.0 --app quan-ly` (khóa ký như app Thu ngân) + tăng bản app Thu ngân Windows / Android có mục Quản trị.
