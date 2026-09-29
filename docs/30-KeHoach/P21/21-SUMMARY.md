# P21 — SUMMARY: app Windows "TechMenu Thu ngân" (21-01 → 21-03 code; 21-04 chờ quán)

> **Trạng thái 29/09/2026: CODE XONG 21-01 → 21-03, ĐÃ DEPLOY production (main `4c366e4`), migration 0075 ĐÃ ÁP production; CHƯA PHÁT HÀNH bộ cài.** App chạy được trên máy dev,
> bộ cài build + cài/gỡ thử được, 6/6 kịch bản E2E chạy trên chính bản đã cài. Phần cần người / hạ tầng thật còn lại ở §Chưa làm.
> Quyết định: QD-026 (D1–D8 + §Nơi đặt bản phát hành). Yêu cầu: DESK-01..12. Tra đối thủ: `00-TongQuan.md` §Đối thủ làm thế nào.

## Đã làm

| Plan | Nội dung | Tệp chính |
|---|---|---|
| 21-01 | **Vỏ app**: Electron 44 mở POS / Màn bếp trên web; sandbox + contextIsolation, chỉ điều hướng trong tên miền app, liên kết ngoài → trình duyệt; một bản duy nhất; ✕ → khay; tự khởi động (HKCU, không admin); menu ☰ Thu ngân · Màn bếp · Tải lại (F5) · Cài đặt máy in · Đổi chi nhánh · Đăng xuất máy quầy · Giới thiệu · Thoát; khay có tình trạng máy in; mất mạng → màn "đang thử lại" | `desktop/main.mjs`, `desktop/preload.cjs`, `desktop/trang/*`, `desktop/lib/cau-hinh.mjs` |
| 21-01 | **Kích hoạt bằng tài khoản chủ quán** (như KiotViet): email + mật khẩu → chọn chi nhánh → "Máy này có nối máy in không?". Server kiểm owner, dùng lại mã kích hoạt PRINT-11 trong cùng lượt (mã không rời server), thu hồi phiên chủ quán ngay; giới hạn tần suất theo IP **và** email. Máy chỉ xem không đụng tài khoản `printer`. Mật khẩu `printer` lưu mã hóa DPAPI (`safeStorage`), mật khẩu chủ quán không lưu | `app/api/desktop/activate/route.ts`, `lib/desktop/kich-hoat.ts`, `lib/security/rate-limit.ts` |
| 21-02 | **Cầu in trong app**: chạy CHÍNH `scripts/print-bridge.mjs` bằng Node của Electron (`ELECTRON_RUN_AS_NODE`), chết → chạy lại giãn dần, mã 3 (có cầu in khác) → hỏi gỡ; log 7 ngày. Cầu in sửa tối thiểu, cầu in cũ giữ nguyên hành vi: `p_agent` (máy chủ chưa 0075 → tự bỏ), `BRIDGE_TU_CAP_NHAT=0`, IPC "thoat" → thoát ở điểm an toàn + đánh thức vòng poll (thoát < 3 giây), app chết → cầu in tự thoát, `--test --vai=quay` | `desktop/lib/cau-in.mjs`, `desktop/lib/moi-truong.mjs`, `scripts/print-bridge.mjs` |
| 21-02 | **Cài đặt máy in trong app** (thay câu hỏi PowerShell): bếp LAN + Dò máy in; quầy USB (danh sách máy in Windows) / LAN / không; khổ 80/58; In thử từng máy; Lưu → khởi động lại cầu in | `desktop/trang/cai-dat-may-in.*` |
| 21-02 | **In không hộp thoại**: POS trong app có cầu in → hóa đơn / phiếu khách / phiếu bếp đi qua cầu in (ảnh có dấu), không iframe + `window.print()` | `lib/print/device.ts`, `lib/print/adapter.ts` |
| 21-02 | **Gỡ cầu in cũ**: phát hiện tác vụ `CauInBep` / tiến trình node cầu in → hỏi → `go-cai-dat.ps1 -KhongHoi` (một lần UAC); điền sẵn IP / máy in từ `.env.local` cũ (không đọc mật khẩu) | `desktop/lib/cau-in-cu.mjs`, `scripts/go-cai-dat.ps1` |
| 21-02 | **Nguồn cầu in**: migration 0075 (`printer_heartbeats.agent`, `printer_heartbeat(…, p_agent)`); Admin → Máy in + bảng /super hiện "TechMenu Thu ngân x.y.z" / "Cầu in cũ" — đọc riêng, nuốt lỗi khi chưa có cột | `supabase/migrations/0075_bridge_agent.sql`, `lib/print/nguon-cau-in.ts`, `printers/page.tsx`, `app/super/BridgeTable.tsx` |
| 21-03 | **Bộ cài**: electron-builder NSIS một chạm, cài theo người dùng (không UAC), chưa ký; `resources/cau-in/` chứa cầu in + `print-raw.ps1` + `print-scan.mjs` + `go-cai-dat.ps1`; gỡ app xóa luôn khóa tự khởi động (`build/installer.nsh`); biểu tượng TechMenu | `desktop/package.json` (build), `desktop/build/*`, `desktop/scripts/tao-bieu-tuong.mjs` |
| 21-03 | **Tự cập nhật + phát hành**: electron-updater → `/api/desktop/update/<tệp>` → `DESKTOP_RELEASE_BASE` (chỉ đúng tên tệp electron-builder sinh); kiểm mỗi giờ, cài khi máy rảnh ≥ 5 phút sau khi cầu in thoát an toàn. `npm run release` = build → quét bí mật → `gh release create` | `desktop/lib/cap-nhat.mjs`, `lib/desktop/phat-hanh.ts`, `app/api/desktop/update/[file]/route.ts`, `app/api/desktop/latest/route.ts`, `desktop/scripts/phat-hanh.mjs` |
| 21-03 | **Tải + hướng dẫn**: Admin → Máy in có thẻ "Cài TechMenu Thu ngân" (bộ cài cũ thành "Cách cũ"); `/huong-dan-cai-dat#cai-app` 5 bước kèm bước SmartScreen; cả hai **tự ẩn khi chưa có bản phát hành**. Đổi POSMenu → TechMenu. Bàn giao: `60-BanGiao/03-CaiDat.md` §5.0 | `printers/page.tsx`, `app/(marketing)/huong-dan-cai-dat/page.tsx` |

## Bằng chứng (chạy trên máy dev Windows 11, 29/09/2026)

| Kiểm | Kết quả |
|---|---|
| `tests/desktop/*.test.ts` (vitest) | **42/42 xanh**: kích hoạt 12 · cầu in trong app 6 · thư viện app 16 · phát hành/nguồn 8. Thêm 4 test in trong app ở `tests/print/in-tu-thiet-bi.test.ts` (14/14 cả tệp) |
| Cầu in bằng Node của Electron | `BRIDGE_NODE=…/electron.exe npx vitest run tests/desktop/cau-in-app.test.ts` → 6/6 (bước 0) |
| E2E app (`npx playwright test -c playwright.desktop.config.ts`, bỏ `ELECTRON_RUN_AS_NODE`) | **6/6** chạy từ mã nguồn; **6/6** chạy trên bản ĐÃ CÀI (`TECHMENU_EXE=…\techmenu-thu-ngan\TechMenuThuNgan.exe`) |
| Bộ cài | `TechMenu-ThuNgan-Setup-1.0.0.exe` 111,6 MB · `Get-AuthenticodeSignature` = NotSigned (đúng D3) · `/S` xong 9 giây, không UAC, vào `%LOCALAPPDATA%\Programs\techmenu-thu-ngan` |
| Gỡ | `Uninstall … /S` → thư mục cài: không còn · khóa `Run\vn.techmenu.thungan`: có trước khi gỡ → trống sau khi gỡ · lối tắt Start Menu: không còn · tiến trình: 0 |
| Quét bí mật tệp cài + `resources/` | 5 giá trị thật từ `.env.local` + 3 mẫu khóa → **0 phát hiện** |
| RAM | App mở trang POS production (quán demo), 60 giây: 4 tiến trình, working set 343 MB, private 198 MB |
| `npx tsc --noEmit` | Sạch, trừ lỗi có sẵn `@sentry/nextjs` thiếu trong node_modules máy này |
| `npm run test` | 892 xanh (trước P21: 858); 3 tệp đỏ **có sẵn trước P21** (thiếu `@sentry/nextjs`; 2 tệp gọi DB — `.env.local` trỏ project cũ) |

Ảnh (chụp từ cửa sổ app trong E2E): `anh/1-dang-nhap.png`, `anh/2-chon-chi-nhanh.png`, `anh/3-cai-dat-may-in.png`, `anh/4-mat-mang.png`.

## Chưa làm — cần người / hạ tầng

1. `.env.local` đã trỏ project production (29/09/2026). **Chưa chạy** `tests/rls/desktop-activate.test.ts`, `cau-in-mat-mang` với
   Electron: các test này ghi vào quán demo trên DB production — chờ chủ dự án đồng ý.
2. ~~Áp migration 0075~~ — **đã áp production 29/09/2026** (`supabase db push`, chỉ 0075). Kiểm: hàm còn đúng một bản 6 tham số, cột
   `agent` có, anon không gọi được / authenticated gọi được; đóng vai tài khoản printer qt-food trong giao dịch ROLLBACK — kiểu gọi cầu
   in cũ (3 tham số) và kiểu app (`p_agent`) đều chạy. `schema-snapshot.json` cập nhật.
3. ~~Deploy web~~ — **đã deploy** (main `4c366e4`): `/api/desktop/activate` trả đúng câu lỗi chung với tài khoản sai; `/huong-dan-cai-dat` hiện TechMenu.
4. **Nơi đặt bản phát hành: đã chốt** — Releases của chính repo; bản `thu-ngan-v1.0.0` đã đăng 29/09/2026 (sha512 khớp). **Còn: thêm
   `DESKTOP_RELEASE_BASE` trên Vercel (Production) + redeploy**, rồi thử 1.0.0 → 1.0.1 (DESK-10).
5. **Máy thật**: bấm giờ cài trên Win10 + Win11 sạch kèm ảnh SmartScreen (DESK-09); in LAN + USB ra giấy thật (DESK-06/07); máy có
   cầu in cũ (DESK-08); khởi động lại máy → POS tự mở (DESK-03).
6. **21-04 qt-food** (DESK-12): làm theo `21-04-PLAN.md` sau khi 1–5 xong.

## Ghi chú kỹ thuật

- VS Code đặt `ELECTRON_RUN_AS_NODE=1` cho tiến trình con — chạy `electron`/Playwright/`npm run dist` từ terminal VS Code phải bỏ biến này
  (`env -u ELECTRON_RUN_AS_NODE …`); script phát hành tự bỏ. App tự dựng môi trường riêng cho cầu in nên không bị ảnh hưởng.
- `BRIDGE_VERSION` giữ 4: mọi thay đổi cầu in chỉ bật qua biến môi trường của app — không đẩy cầu in cũ ở quán tự cập nhật vô cớ.
- Biến `TECHMENU_API_BASE` / `TECHMENU_USER_DATA` chỉ để chạy dev/test; bản build trỏ production cố định.
