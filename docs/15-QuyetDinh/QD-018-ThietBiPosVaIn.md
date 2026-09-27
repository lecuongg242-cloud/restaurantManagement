# QD-018 — Thiết bị POS chuẩn và đường in

**Ngày:** 26/09/2026 · **Trạng thái:** ĐỀ XUẤT — chủ dự án giao chọn "dòng máy phổ biến" (26/09/2026);
chưa có máy thật, **phải thử trên máy thật trước khi CHỐT**.
**Liên quan:** QD-005 D1 (`PrintAdapter`), QD-012 §1 (tài khoản `printer`), `50-PhienBan/V1x-CauInBep.md`.

## Bối cảnh

Để bán cho nhiều quán, không thể hỗ trợ "máy gì cũng được". Hiện tại in chỉ chạy qua hai đường:
trình duyệt trên PC Windows (`--kiosk-printing`) hoặc cầu in Node chạy trên laptop. Chủ dự án hỏi
thêm ba trường hợp: in hóa đơn từ điện thoại, quán dùng máy POS, nhân viên cầm máy đi order.

Giới hạn kỹ thuật quyết định mọi thứ bên dưới:

- Web **không** gọi được máy in liền thân của máy POS Android.
- Web **không** in Bluetooth được trên iOS; trên Android chỉ BLE, còn đa số máy in nhiệt dùng Bluetooth thường.
- Web **không** mở được socket thô tới máy in LAN (cổng 9100).
- ⇒ Web chỉ in được bằng: hộp thoại in của hệ điều hành (PC), hoặc **ghi `print_jobs` để một thiết bị
  trong quán in hộ** (đường đã có).

## Quyết định (đề xuất)

**Hãng chuẩn: Sunmi** — phổ biến nhất ở VN (các phần mềm POS lớn trong nước đều bán kèm), có SDK in
chính thức cho máy in liền thân. Phương án dự phòng: iMin (cùng kiểu, SDK tương tự).

| Vai trò | Máy | Ghi chú |
|---|---|---|
| Quầy thu ngân | **Sunmi T2s** (hoặc đời mới hơn cùng dòng) | Màn ngang lớn → dùng POS 3 cột hiện có; máy in 80mm liền thân |
| Cầm tay (order + in hóa đơn tại bàn) | **Sunmi V2s / V2 Pro** | Khổ điện thoại → dùng `/pos/m`; máy in 58mm liền thân |
| Bếp | Máy in LAN 80mm (Xprinter đang dùng) hoặc màn KDS | Không đổi |

**Hai bộ thiết bị bán cho khách:**

- **Bộ cơ bản — chạy ngay, không cần làm gì thêm:** PC/POS Windows + máy in LAN + điện thoại nhân viên (`/pos/m`).
- **Bộ chuẩn — cần app vỏ:** Sunmi T2s ở quầy + (tùy chọn) Sunmi V2s cầm tay + máy in LAN ở bếp.

**App vỏ Android (mới, một app cho cả T2s và V2s):**

1. WebView mở đúng trang web hiện tại — **không viết lại giao diện**.
2. Cầu nối JS → SDK in Sunmi: nút "In hóa đơn" in ra máy in liền thân của chính máy đó.
3. **Kiêm cầu in của quán**: thay laptop chạy `print-bridge.mjs` — đọc `print_jobs` bằng tài khoản
   `printer` (QD-012, không service-role), in phiếu bếp sang máy in LAN.
4. Nghiệp vụ không đổi: chỉ thêm một cách in sau `PrintAdapter` (QD-005 D1).

## Vì sao không chọn

| Phương án | Loại vì |
|---|---|
| Viết app gốc toàn bộ | Nhân đôi toàn bộ giao diện; mọi tính năng phải làm hai lần |
| Máy in đám mây tự lấy lệnh (Star CloudPRNT, Epson Server Direct Print) | Máy in đắt, ít phổ biến ở quán nhỏ VN. Giữ làm lựa chọn cho chuỗi lớn, không làm mặc định |
| Hỗ trợ mọi máy POS Android | Mỗi hãng một SDK in → chi phí hỗ trợ tăng theo số hãng |

## Việc phải làm trước khi CHỐT

1. Mua/mượn **1 Sunmi T2s + 1 Sunmi V2s**.
2. Thử trên máy thật: POS chạy mượt trong WebView, realtime nối lại sau khi máy ngủ, in liền thân ≤2 giây,
   in LAN sang bếp.
3. Xác nhận cách phát hành app (APK tự cài hay qua kho ứng dụng của Sunmi).
4. Sau đó mới lập danh sách yêu cầu đo được + kế hoạch trong `30-KeHoach/`.
