# P33 — Chọn máy in USB đang cắm ở app Windows

> Lập 05/10/2026. **Trạng thái: CHỦ DỰ ÁN CHỐT 05/10/2026** ("ok chốt như bạn") + thêm bài hướng dẫn lỗi Windows đổi cổng
> USB001 ↔ USB002. **Code xong 05/10/2026, chưa phát hành app.** Yêu cầu: DESK-14. Chủ dự án (05/10): "nếu đang cắm máy in
> usb, lúc setup máy in có thể hiện máy in nào đang kết nối để chọn không?"

## Hiện trạng

- App Windows → ☰ → Cài đặt máy in → Máy in quầy → "Cắm USB vào máy này": ô **Máy in** liệt kê **mọi máy in Windows đã cài**
  (`getPrintersAsync`, `desktop/main.mjs`), ví dụ `OneNote · Microsoft XPS Document Writer · Microsoft Print to PDF · Fax ·
  Canon TS6300 series`.
- Máy in ảo lẫn vào danh sách; máy đã rút dây vẫn hiện như thường; cắm máy xong phải mở lại màn mới thấy.

## Đối thủ làm thế nào (tra 05/10/2026)

- **KiotViet** — cắm USB → cài driver (chọn "Printer Interface: USB", bấm **"Check USB Port"** trong bộ cài driver) → trong
  KiotViet chọn **tên máy in Windows** (ví dụ "BP-T3"). Lỗi hay gặp: Windows đổi cổng USB001 ↔ USB002 sau cập nhật → máy in
  không ra giấy, phải vào Properties → Port chọn lại cổng.
  [Máy in hóa đơn](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-thiet-bi-phan-cung/may-in-hoa-don/) ·
  [Chọn lại cổng máy in](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/chon-lai-cong-port-may-in/)
- **CUKCUK (PC/POS)** — Thiết lập → **Máy in và mẫu in** → chọn máy in trong danh sách máy in đã cài trên Windows → **In thử**.
  Chưa thấy máy in thì "cài bằng file cài đặt của máy in hoặc Devices and Printers của Windows".
  [Nguồn](https://help.cukcuk.us/kb/thiet-lap-may-in-cho-bep-bar-va-thu-ngan-su-dung-may-pc-pos) ·
  [Hóa đơn](https://helpv2.cukcuk.vn/vi/kb/180105_thiet_lap_may_in_hoa_don)
- **Sapo FnB** — cắm USB → tải driver ở shop.sapo.vn → cài; tài liệu không tả màn chọn máy in trong phần mềm.
  [Nguồn](https://help.sapo.vn/cai-dat-may-in-hoa-don-bang-cong-ket-noi-usb)

Cả ba: **chọn theo tên máy in Windows** (cần driver), có **In thử**. Không tài liệu nào cho thấy trạng thái "đang kết nối"
trong danh sách. **Khác đối thủ** (giữ cách chọn theo tên + In thử như họ, chỉ thêm): ẩn máy in ảo, ghi trạng thái kết nối +
cổng, nút "Tải lại" — lý do: thu ngân chọn nhầm "Microsoft Print to PDF" / máy đã rút; ghi cổng USB giúp nhận ra lỗi đổi cổng
mà KiotViet phải viết hẳn bài hướng dẫn. Chủ dự án đồng ý 05/10/2026.

## Giao diện (đã chốt)

Màn **Cài đặt máy in** → mục **Máy in quầy (hóa đơn)** → chọn **"Cắm USB vào máy này"** (Máy in bếp không đổi — chỉ LAN):

```
Máy in
[ XP-80C — đang kết nối (USB001)        ▾ ]  [ Tải lại ]
```

- Danh sách, mỗi dòng `<tên máy in> — <trạng thái>`:
  1. Máy cắm cổng USB **đang kết nối** lên đầu: `XP-80C — đang kết nối (USB001)`.
  2. Máy in thật khác (USB đã rút / tắt, máy in mạng Windows): `XP-80C — chưa kết nối` · `Canon TS6300 series` — vẫn chọn được.
  3. **Ẩn** máy in ảo: Microsoft Print to PDF, XPS Document Writer, OneNote, Fax.
- Mở màn lần đầu (chưa lưu máy quầy) và có **đúng 1** máy USB đang kết nối → chọn sẵn máy đó.
- Đã lưu máy X nhưng giờ X chưa kết nối → vẫn chọn X, dưới ô hiện chữ vàng: "Máy in này đang chưa kết nối — kiểm tra dây USB
  và nguồn máy in."
- Nút **"Tải lại"**: đọc lại danh sách (cắm máy xong bấm là thấy), giữ máy đang chọn nếu còn.
- Không có máy in nào (sau khi ẩn máy ảo): ô trống ghi "(Không thấy máy in USB)", dưới ô: "Cắm dây USB và bật nguồn máy in rồi
  bấm Tải lại. Vẫn không thấy thì cần cài driver máy in (Xprinter, Epson…) cho Windows."
- Nút **In thử**, **Lưu**, cách lưu (theo tên máy in) không đổi.
- Chữ vàng "chưa kết nối" và câu "Không thấy máy in USB" có thêm link **"Đã cắm mà vẫn không in được? Xem hướng dẫn"** → mở
  trình duyệt tới `/huong-dan-cai-dat#loi-cong-usb` (bài bên dưới).

### Bài hướng dẫn "Máy in USB không ra giấy" (chủ dự án yêu cầu 05/10/2026)

Mục mới trên trang công khai `/huong-dan-cai-dat#loi-cong-usb` (luôn hiện), theo bài "Chọn lại cổng máy in" của KiotViet:
dấu hiệu → 6 bước: (1) rút cắm lại đúng lỗ cũ → app **Tải lại** → **In thử**; (2) `Windows + R` → `control printers`;
(3) chuột phải máy in → **Printer properties**; (4) tab **Ports** (ô mờ → tab General → **Change Properties**); (5) chọn dòng
USB khác, ưu tiên cột Printer trống → **Apply**; (6) app **Tải lại** → **In thử**, chưa ra giấy thì thử dòng USB tiếp theo.
Lưu ý: cắm máy in vào cùng một lỗ USB; thử hết vẫn không in → gọi TechMenu.

## Kiểm bằng

- Unit `desktop/lib` (hàm phân loại danh sách): máy ảo bị ẩn; USB đang kết nối lên đầu; USB offline ghi "chưa kết nối";
  máy đã lưu vắng mặt vẫn giữ.
- Thử trên máy Windows có máy in nhiệt USB thật: cắm → Tải lại → "đang kết nối"; rút → Tải lại → "chưa kết nối"; In thử ra giấy.
- Desktop e2e hiện có xanh.

## Kết quả (05/10/2026)

Cách dò "đang kết nối": giống cổng USB của Windows (usbmon) tìm máy — giao diện thiết bị máy in USB
`{28d78fad-…}` trong registry mang số cổng (→ USB00x); đang cắm khi `#\Control\Linked = 1` hoặc thiết bị USB còn trong
`Win32_PnPEntity`. Tên + cổng máy in lấy từ `Win32_Printer` (cùng tên `print-raw.ps1` dùng để in). PowerShell lỗi → danh sách
tên như cũ (đã ẩn máy ảo), không ghi trạng thái.

File: mới `desktop/lib/may-in-usb.mjs`; `desktop/main.mjs` (`may-in:doc` trả danh sách mới + link hướng dẫn, kênh mới
`may-in:ds-usb`), `desktop/preload.cjs` (`dsMayInUsb`), `desktop/trang/cai-dat-may-in.{html,js}` (nút Tải lại, chữ vàng, chọn
sẵn), `desktop/trang/chung.css` (màu cảnh báo), `app/(marketing)/huong-dan-cai-dat/page.tsx` (mục `#loi-cong-usb`). App Android
dùng chung trang: không đổi (Android gửi `usb: []`, ô USB ẩn).

- Unit `tests/desktop/lib.test.ts` 20/20 PASS (4 ca mới: ẩn máy ảo / đang kết nối lên đầu / không đọc được cổng / giữ máy đã lưu).
- Desktop e2e `playwright.desktop.config.ts` 8/8 PASS (2 bỏ qua — chỉ chạy với bản đã cài): bước mới chọn USB trên máy Windows
  thật → không có máy in ảo trong danh sách, "Tải lại" chạy xong bật lại.
- E2E `huong-dan-cai-dat.spec.ts` 3/3 PASS (localhost:3005; 1 bỏ qua cần `DESKTOP_RELEASE_BASE`): mục mới đủ 6 bước, cuộn tới
  khi mở `#loi-cong-usb`. `tsc --noEmit` sạch.
- Chạy thật trên máy dev (không có máy in USB): đọc ra 5 máy, sau lọc còn `Canon TS6300 series`.
- Ảnh (dữ liệu giả lập): `anh/1-dang-ket-noi.png`, `anh/2-chua-ket-noi.png`, `anh/3-khong-thay.png`; 390 px không tràn ngang.
- **Chưa kiểm:** cắm / rút máy in nhiệt USB thật (máy dev không có) — cần thử trên máy quầy trước khi phát hành bản app mới.
