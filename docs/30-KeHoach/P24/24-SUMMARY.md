# P24 — Kết quả (cập nhật 01/10/2026)

> 24-01 + 24-02 + **24-03 (tablet tự in LAN)** code xong, **kiểm trên máy ảo tablet Android 14** (2560×1600, WHPX) với máy in
> giả trên máy dev. Chưa: khóa ký thật, bản phát hành trên GitHub, deploy, thử tablet + máy in LAN thật. 24-04 (Bluetooth,
> Sunmi) chưa làm. **Chưa commit.**

## File

| Phần | File |
|---|---|
| App Android (mới) | `android/` — Gradle riêng (AGP 8.7.3, Kotlin 2.0.21, compileSdk 35, minSdk 26). `MainActivity.kt` (WebView, nút ☰ nổi, menu, kênh lệnh cho trang của app, tự cập nhật), `TrangCuaApp.kt` (phục vụ trang của app + chèn tệp nối), `KichHoat.kt`, `CauHinh.kt`, `MaHoa.kt` (Android Keystore), `CapNhat.kt`; `assets/trang/cau-noi-android.js`; trang đăng nhập / cài máy in / mất mạng **chép từ `desktop/trang/` lúc build** |
| Kiểm trên máy | `android/scripts/kiem-may-ao.mjs` (24-01), `android/scripts/thu-cap-nhat.mjs` (24-02) |
| Phát hành | `android/scripts/phat-hanh.mjs` (build ký khóa thật → `dist/` + `android-latest.json` → bản phát hành nhãn `android`) |
| Máy chủ | `lib/android/phat-hanh.ts`, `app/api/android/latest/route.ts`, `app/api/android/update/[file]/route.ts` |
| Web | Quản trị → Máy in: khối "Cài TechMenu Thu ngân trên tablet / điện thoại Android" + nút tải; `/huong-dan-cai-dat#cai-app-android` — **ẩn tới khi có bản phát hành** |
| Test | `tests/android/phat-hanh.test.ts` (14 ca) |

## Bằng chứng

- Web: `tsc` sạch, `next lint` sạch, `npm test` **96 tệp / 1014 ca xanh**.
- 24-01 `node android/scripts/kiem-may-ao.mjs` — **9/9 ĐẠT**: vào POS sau đăng nhập; trang POS **không** có `window.techmenu`
  lẫn kênh `TechMenuAndroid`; POS nhận `techmenuDesktop = {phienBan, coCauIn:false, nenTang:"android"}`; tắt hẳn app mở lại vào
  thẳng POS; mất mạng ⇒ màn xem offline P17; địa chỉ ngoài service worker ⇒ màn "Chưa kết nối được" của app; trang của app có
  `window.techmenu`; có mạng lại tự vào lại (15 giây).
- Kích hoạt chủ quán demo: chọn "Có — máy quầy" ⇒ **bị chặn** với câu rõ ràng (bản này chưa in — tránh xoay mật khẩu máy in làm
  máy quầy đang in ngừng in); "Không — chỉ xem" ⇒ vào Màn bếp `pho-viet`.
- 24-02 `node android/scripts/thu-cap-nhat.mjs` — **8/8 ĐẠT**: máy để yên ⇒ "Có bản mới 1.0.1"; lần đầu mở màn cấp quyền cài;
  màn cài Android; **lên 1.0.1, giữ kích hoạt**; manifest sha256 sai ⇒ không hỏi, không giữ tệp.
- Ảnh: `anh/24-01-*.png`, `anh/24-02-*.png`.

## Sửa trong lúc thử

- Menu ☰ chỉ ló tên quán (tấm thu gọn, bị thanh tác vụ tablet che) ⇒ mở hết ngay.
- Mất đăng nhập nhân viên khi app bị tắt ngay sau đăng nhập (WebView ghi cookie theo chu kỳ) ⇒ ghi cookie sau mỗi trang và mỗi
  lần đổi địa chỉ (đăng nhập POS là chuyển trang phía trình duyệt).

## Trạng thái tiêu chí

| Plan | # | Trạng thái |
|---|---|---|
| 24-01 | 1 Build + cài | ✅ máy ảo |
| 24-01 | 2 Đăng nhập (đúng / sai / nhiều chi nhánh) | ◐ đúng ✅; sai mật khẩu + nhiều chi nhánh dùng nguyên API + trang của app Windows (đã có test), chưa bấm thử trên app Android |
| 24-01 | 3 Nhớ phiên | ✅ |
| 24-01 | 4 Menu ☰ | ✅ đủ mục; Màn bếp ↔ Thu ngân ✅; Đăng xuất máy chưa bấm thử |
| 24-01 | 5 Mất mạng | ✅ |
| 24-01 | 6 An toàn | ✅ trang POS không có lệnh của app; mật khẩu `printer` mã hóa Keystore (chưa có máy "có máy in" để soi — bị chặn tới 24-03) |
| 24-02 | 1 Cài mới từ nút tải | ☐ cần bản phát hành thật |
| 24-02 | 2 Cập nhật | ✅ máy ảo, nguồn cập nhật giả trên máy dev |
| 24-02 | 3 Chống tệp hỏng | ✅ |
| 24-02 | 4 Không lộ khóa | ✅ `.gitignore` chặn `*.jks`, `*.keystore`, `dist/`; script từ chối khóa nằm trong repo |
| 24-02 | 5 Trang tải | ◐ code xong; nút ẩn khi chưa có bản phát hành — chưa có bản để thấy nút hiện |

## 24-03 — Tablet tự in LAN

**File:** `android/.../EscPos.kt` (phiếu bếp ESC/POS + lệnh in ảnh — chuyển nguyên từ print-bridge bản 4), `MayInLan.kt` (gửi /
thử / dò cổng 9100), `CauInDichVu.kt` (dịch vụ chạy nền: vòng in, nhịp tim 30 s, sổ "đã in chưa báo", thông báo thường trực,
giữ CPU + Wi-Fi), `KhoiDongMay.kt` (bật lại sau khởi động máy / sau cập nhật), `MainActivity.kt` (4 lệnh máy in của trang, bỏ chặn
"Có — máy quầy", xin quyền thông báo + bỏ tối ưu pin, "Giữ màn hình sáng"); `desktop/trang/cai-dat-may-in.{html,js}` (Android: ẩn
USB, thêm "Giữ màn hình sáng" — app Windows không đổi); `lib/print/nguon-cau-in.ts` (`android/x.y.z` ⇒ "TechMenu Thu ngân Android
x.y.z"); test `android/app/src/test/.../EscPosTest.kt` + mẫu vàng `phieu-bep-{48,32}.hex` dựng bằng chính `buildKitchenTicket`
của Node; kịch bản `android/scripts/thu-in-lan.mjs` + `thiet-bi.mjs`.

**Bằng chứng:**
- Kotlin `testDebugUnitTest` **7/7**: phiếu bếp **giống từng byte** cầu in Node ở khổ 80 và 58 mm; bỏ dấu; ngắt dòng; lệnh in ảnh
  (bit, alpha, cắt dòng trắng, chia dải 128). Web: `tsc`, `lint` sạch, `npm test` **1014/1014**. `assembleRelease` build được.
- `node android/scripts/thu-in-lan.mjs` (quán demo pho-viet, máy in giả 10.0.2.2:9101 / 9102) — **12/12 ĐẠT**: kích hoạt
  "Có — máy quầy" mở Cài đặt máy in; trang ẩn USB + có "Giữ màn hình sáng"; In thử bếp + quầy; nhịp tim `android/1.0.0`,
  máy in phản hồi; **"Phiếu bếp" bấm trên máy tính ⇒ tablet in sau 1,8–3,7 s**, `print_jobs` = `printed`; **"In tạm tính" trên
  tablet ⇒ máy in quầy nhận lệnh in ảnh 576 chấm** (1,8–3,6 s); tắt máy in bếp ⇒ phiếu `failed` sau 3 lần thử + thông báo đỏ;
  **tắt màn 90 s ⇒ phiếu vẫn ra** (8,5–9,8 s — nhịp poll lúc rảnh giãn tới 10 s, như cầu in Node).
- POS trên tablet hiện chip xanh "Máy in bếp sẵn sàng" (`anh/24-03-hoa-don-tablet.png`); hóa đơn dựng lại từ đúng byte máy in
  nhận đủ dấu (`anh/24-03-hoa-don-in-ra.png`); thông báo đỏ (`anh/24-03-thong-bao-loi.png`).
- Sau mỗi lượt thử, quán demo trả về như cũ: `print_mode = browser`, xóa nhịp tim, dọn bàn V2, đăng xuất app.

**Tiêu chí 24-03:** #1–#7 ✅ trên máy ảo + máy in giả. #8 (tablet + máy in LAN thật) ☐ cần thiết bị. #5 (mạng rớt ngay sau khi in
⇒ không in lần hai) chưa có ca thử riêng — cơ chế sổ "đã in chưa báo" chép nguyên từ bản Node.

## Phát hành 1.0.0 (02/10/2026)

- Khóa ký tạo 02/10/2026: RSA 4096, alias `techmenu`, chứng chỉ SHA-256
  `ae654a27540aefa3571f4f9ee6b4f880fe8ffb8f9042bf397dfd41e089972204`. Tệp + mật khẩu ở `C:\Users\lecuong\techmenu-khoa-ky\` trên máy
  dev (NGOÀI repo) — **chủ dự án cần chép bản sao thứ hai**.
- `node android/scripts/phat-hanh.mjs 1.0.0` (mã 10000) ⇒ `TechMenu-ThuNgan-1.0.0.apk` 4,4 MB lên bản phát hành GitHub nhãn
  `android` (không phải "latest" — bản Windows 1.0.3 vẫn là Latest). `gh` cài tại `C:\Users\lecuong\tools\gh`, đăng nhập
  `lecuongg242-cloud`.
- Production: `/api/android/latest?thongTin=1` trả đúng phiên bản + sha256; `/api/android/latest` tải đủ 4.663.982 byte;
  Quản trị → Máy in hiện khối Android + nút "Tải TechMenu Thu ngân cho Android (4 MB)". APK tải từ production cài lên máy ảo ⇒
  chạy 1.0.0, chữ ký đúng khóa trên. 24-02 #1 (cài từ nút tải) ✅ máy ảo; #5 (trang tải) ✅.

## Còn lại

1. ~~Khóa ký + phát hành 1.0.0 + deploy~~ — xong 02/10/2026. Còn: **chép bản sao thứ hai của khóa ký**.
2. Cài từ nút tải trên tablet thật.
3. Thử tablet + máy in LAN thật (24-03 #8); thử Android 8–10 (máy ảo mới thử Android 14).
4. Đăng ký Android Developer Console trước khi Google áp xác minh ở Việt Nam (ANDR-08).
