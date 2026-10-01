# QD-030 — Ứng dụng Android "TechMenu Thu ngân": APK tự cài, tự cập nhật, in thẳng từ máy

> Ngày: 2026-10-01 · Trạng thái: **ĐÃ CHỐT 01/10/2026** (chủ dự án: giao diện như đề xuất, menu app bằng **nút ☰ nổi**, tên
> "TechMenu Thu ngân", mã gói `vn.techmenu.thungan`, cho cài công cụ build). Giao diện: `30-KeHoach/P24/00-TongQuan.md`.
> Liên quan: [[QD-018-ThietBiPosVaIn]] (app vỏ Android, Sunmi), [[QD-026-UngDungThuNganWindows]] (app Windows — khuôn để
> làm theo), QD-012 §1 (tài khoản `printer`), QD-020 D4 (hóa đơn dựng thành ảnh ở máy chủ).

## Bối cảnh

Chủ dự án (01/10/2026): "phát hành APK tự cài được ngay, làm như app Windows (link tải + tự cập nhật) — triển khai cái này
trước"; hỏi "tablet có thể tự in được mà không cần cầu in đúng không?".

- POS web đã chạy đủ trên điện thoại/tablet (P12, ORDER-20) và đã cài được lên màn hình chính như PWA (P17).
- Web **không** in thẳng được: không mở được cổng 9100 tới máy in LAN, không dùng Bluetooth thường, không gọi máy in liền
  thân Sunmi (QD-018). Hiện tablet chỉ in được nhờ một máy Windows chạy cầu in.
- App **gốc** Android làm được cả ba ⇒ tablet tự in, không cần laptop.

## Đối thủ (tra 01/10/2026 — chi tiết + nguồn ở `30-KeHoach/P24/00-TongQuan.md`)

- Cả 5 đối thủ đều có app Android; **phân phối qua Google Play**, máy POS thì kỹ thuật viên cài sẵn. Không ai công khai link
  APK. ⇒ APK tự cài là **khác đối thủ** — chủ dự án đã chọn (không qua Google Play).
- In: menu **"Thiết lập máy in"**, máy in hóa đơn + máy in bar/bếp, loại **LAN / Bluetooth / USB / Sunmi**, ô IP + khổ giấy
  58/80, nút **"In thử"**.
- Máy làm "trạm in" cho cả quán: KiotViet ("KiotViet Kết Nối" chạy ngầm trên máy tính, hoặc cho điện thoại in thẳng),
  CUKCUK (tick "Thực hiện in ở bếp/bar qua máy tính này" trên **một** máy). Sapo: mỗi máy tự in, không có máy chủ in.

## Quyết định

### D1. App Android gốc nhỏ: WebView mở POS + dịch vụ in chạy nền

Một màn WebView mở **chính trang POS hiện có** (như app Windows — không viết lại giao diện), cộng **dịch vụ in** chạy nền
(dịch vụ có thông báo thường trực để Android không tắt). Các màn riêng của app (đăng nhập, cài đặt máy in, mất mạng)
**dùng lại trang HTML của app Windows** (`desktop/trang/`) ⇒ hai app trông giống nhau.

Loại: Capacitor (thêm một lớp công cụ mà giao diện vẫn ở máy chủ — không được gì), app Google Play dạng TWA (không in thẳng
được), viết lại app gốc toàn bộ (QD-018 đã loại).

### D2. Phát hành APK tự cài + tự cập nhật (giống app Windows)

- Tệp `.apk` để ở GitHub Releases (như app Windows, `DESKTOP_RELEASE_BASE`); trang **Quản trị → Máy in** có nút **"Tải
  TechMenu Thu ngân cho Android"**; trang `/huong-dan-cai-dat` thêm các bước cho Android (bật "Cho phép cài ứng dụng không rõ
  nguồn gốc", qua cảnh báo Play Protect "Vẫn cài đặt").
- App tự kiểm bản mới mỗi giờ; tải xong hỏi **"Cập nhật"** khi máy để yên (Android **không cho tự cài âm thầm** — luôn phải
  bấm một lần). Giao diện POS nằm ở máy chủ nên đa số thay đổi **không cần** bản app mới.
- **Khóa ký app** tạo một lần, cất ngoài repo (2 bản sao). Mất khóa = máy đã cài không lên được bản mới.
- **Trước khi Google bắt xác minh nhà phát triển ở Việt Nam (dự kiến 2027):** đăng ký Android Developer Console + khai báo
  app (không phải lên Google Play). Từ 30/09/2026 mới áp ở Brazil, Indonesia, Singapore, Thái Lan.

### D3. Kích hoạt như app Windows

Email + mật khẩu chủ quán (hoặc quản lý chi nhánh, QD-028) → chọn chi nhánh nếu có nhiều → câu hỏi **"Máy này có nối máy in
không?"**. Dùng lại nguyên `/api/desktop/activate` (đổi tên nguồn gọi). Sapo dùng "mã thiết bị + PIN" — **không** làm theo,
để hai app của mình giống nhau (chủ quán chỉ học một cách).

### D4. Máy được chọn "có nối máy in" = trạm in của cả quán (như app Windows, như tick của CUKCUK)

Máy đó nhận **mọi** phiếu bếp + hóa đơn của quán (kể cả đơn gõ từ điện thoại khác, đơn QR) và in thẳng ra máy in. Chỉ **một**
máy làm trạm in mỗi lúc — kích hoạt máy mới thì máy cũ tự thôi (đang làm vậy với app Windows, chống in trùng).

Máy in hỗ trợ (theo thứ tự làm): **LAN (bếp + quầy)** → **Bluetooth (máy in quầy)** → **máy in liền thân Sunmi**.
Mỗi quán vẫn là **một máy in bếp + một máy in quầy** như app Windows. Gán bếp/bar theo nhóm món như KiotViet/CUKCUK là
việc **riêng, để sau**.

### D5. Giữ cho dịch vụ in sống

Thông báo thường trực "TechMenu đang in cho quán …"; xin bỏ tối ưu pin cho app; tùy chọn "Giữ màn hình sáng". Đối thủ không
công bố cách làm — phải đo trên máy thật (để máy yên 8 giờ, phiếu vẫn ra).

### D6. Thông số

Tên app **TechMenu Thu ngân** (như Windows). Mã gói **`vn.techmenu.thungan`** — **không đổi được sau khi phát hành**.
Android 8.0 trở lên.

## Đã chốt (01/10/2026)

Xem `30-KeHoach/P24/00-TongQuan.md` §Đã chốt.
