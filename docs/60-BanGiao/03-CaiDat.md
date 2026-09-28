# Cài đặt một quán

> Người lắp làm cùng chủ quán. Địa chỉ app: `https://restaurant-management-zeta.vercel.app`
> (bên dưới gọi là `<app>`). `<slug>` = mã quán trong đường dẫn, vd `qt-food`.

## 1. Tạo quán (quản trị hệ thống)

`<app>/super` → **+ Nhà hàng mới** → điền "Tên nhà hàng", "Email owner", "Mật khẩu tạm (owner đổi sau)"
(slug để trống = tự sinh) → **Tạo nhà hàng**.

Hệ thống **không gửi email**. Tự đưa cho chủ quán: địa chỉ `<app>/r/<slug>/admin/login`, email, mật khẩu
tạm. Chủ quán quên mật khẩu → quản trị hệ thống đặt lại ở `/super` (chủ quán chưa tự đổi được).

### 1b. Chi nhánh mới của một chuỗi (P15)

Chủ quán **tự tạo** trong admin quán: **Chi nhánh → + Tạo chi nhánh** (tên + mã). Không cần quản trị hệ thống. Sau đó ở chi
nhánh mới: bàn, nhân viên, máy in làm như quán mới (mục 3–6); thực đơn dùng **Chi nhánh → Đồng bộ thực đơn**.

Quản trị hệ thống (`/super` → Thương hiệu) chỉ để hỗ trợ: gắn quán có sẵn vào chuỗi, thêm quản lý cho cả chuỗi, ghi nhận
gia hạn chuỗi, **Gỡ khỏi thương hiệu** / **Xóa thương hiệu…** khi làm nhầm.

Tạo quán lẻ bằng email của một chủ đang dùng ở quán khác: tài khoản được dùng lại và **giữ nguyên mật khẩu cũ**.

## 2. Thiết lập cơ bản (chủ quán đăng nhập)

Đăng nhập `<app>/r/<slug>/admin/login` → trang Tổng quan có thẻ "Hoàn tất thiết lập nhà hàng" →
**Bắt đầu thiết lập →**. Trình hướng dẫn có 4 bước: **Thông tin** (tên, logo) → **Menu mẫu** →
**Bàn + QR** (tạo nhanh N bàn) → **Xong** → **Hoàn tất thiết lập**. Bước nào cũng bỏ qua được.

Sau đó vào **Cài đặt** (chỉ chủ quán thấy):
- **Chế độ phục vụ**: "Theo bàn" hoặc "Gọi món tại quầy" (theo phiếu khảo sát §1).
- **Cách in phiếu**: "Trình duyệt" hoặc "Cầu in" (theo `02-ThietBiChuan.md`).
- Phí phục vụ %, VAT %, "Footer hóa đơn", "Tự động gửi order QR xuống bếp", "Cho phép giảm giá" → **Lưu cấu hình**.

## 3. Thực đơn và bàn

- **Thực đơn**: sửa tên/giá món mẫu, thêm danh mục, thêm **Nhóm tùy chọn** (size, topping…). Bấm
  "Xem thử thực đơn" để xem như khách thấy. **Đối chiếu giá với menu giấy của quán từng món.**
- **Bàn & QR**: khai báo khu vực + bàn đúng tên quán đang gọi → **Xuất QR** → **In (khổ A4)** → dán QR lên bàn.
  Quét thử 1 QR bằng điện thoại: phải ra đúng "Bàn X".

## 4. Nhân viên

**Nhân viên** → mỗi người một tài khoản: "Tên hiển thị", **Email** (tên đăng nhập — mỗi người một email
khác nhau; hệ thống không gửi thư nên không cần là hộp thư thật, vd `lan@<slug>.vn`), "Vai trò" (Thu ngân /
Phục vụ / Bếp / Quản lý), **PIN 4 số** (Quản lý dùng mật khẩu ≥ 8 ký tự) → **Thêm**. Đưa cho từng người
email + PIN của họ. Nhân viên nghỉ việc → **Tắt** (giữ lịch sử), không xóa.

## 5. In ấn

### 5a. Quán chọn "Trình duyệt"

1. Cài driver máy in quầy của hãng; đặt làm **máy in mặc định** của Windows; khổ giấy 80 mm.
2. Tạo lối tắt Chrome trên Desktop, ô *Target*:
   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="C:\pos-chrome" --app=<app>/r/<slug>/pos`
3. Mở POS bằng lối tắt này → in thử 1 hóa đơn: **giấy ra, không hiện hộp thoại chọn máy in**.

### 5b. Quán chọn "Cầu in"

1. Trên **chính laptop quầy**: **chủ quán** đăng nhập admin → **Máy in** → **Tải bộ cài cầu in** (đợi vài giây).
   Bộ cài **kèm sẵn mã kích hoạt** (file `bo-cai\ma-kich-hoat.txt`, dùng một lần, trong 30 phút) — cài không phải gõ.
   **Cài bằng bộ cài mới trên máy khác thì cầu in đang chạy ở máy cũ ngừng in** — chỉ tải khi lắp mới / thay laptop.
2. Chuột phải `cau-in.zip` → **Extract All** → Extract.
   Tài khoản quản lý cũng tải được nhưng **không kèm mã** — lúc cài sẽ hỏi. Quản trị hệ thống vẫn tạo mã hộ ở
   `/super` → quán → "Mã cài cầu in".
3. Thư mục giải nén chỉ có `CAI-DAT.bat` và thư mục `bo-cai` → double-click `CAI-DAT.bat` → Yes → làm
   theo màn cài (xuống bếp xem giấy thử ra ở đâu, chọn máy in quầy). Hướng dẫn đầy đủ + công cụ sửa lỗi: `bo-cai\HUONG-DAN.txt`,
   sau khi cài có bản sao ở `C:\cau-in`.
4. Làm đủ **4 phép thử** in ở cuối màn cài. Chủ quán mở **Máy in** trong admin: "Cầu in bếp — Đang kết nối",
   "Máy in bếp — Phản hồi bình thường".

## 6. Thiết bị nhân viên

- **POS (máy quầy)**: mở lối tắt POS → đăng nhập bằng **email + PIN** của người đang trực ca.
- **Màn bếp**: mở `<app>/r/<slug>/kds` trên tablet/màn hình bếp → đăng nhập tài khoản vai trò Bếp.
- **Điện thoại / tablet phục vụ**: mở `<app>/r/<slug>/pos` — **cùng POS với máy quầy**, tự co theo màn
  hình (điện thoại có thanh tab dưới Bàn · Thực đơn · Đơn) → lưu thành lối tắt trên màn hình chính → đăng
  nhập email + PIN. Lối tắt cũ `…/pos/m` vẫn mở được (tự chuyển về `/pos`).
  Phục vụ trên điện thoại làm được **mọi** việc của máy quầy, kể cả thu tiền — muốn phục vụ không thu tiền
  thì dặn nhân viên, hệ thống chưa chặn theo vai trò.

### Máy nào in hóa đơn ra đâu (quán dùng cầu in)

Hệ thống tự quyết theo khổ màn hình, không phải cài gì: màn rộng ≥ 1024 px (laptop, máy POS quầy) **in thẳng**
ra máy in cắm vào nó; điện thoại, tablet dọc gửi hóa đơn ra **máy in quầy** qua cầu in.
**Tablet để ngang không cắm máy in** bị coi là có máy in → bấm in sẽ mở hộp thoại in vô ích: cho phục vụ dùng
tablet **dọc**, hoặc in ở máy quầy.

Chưa có chế độ "cài như ứng dụng" (PWA) — lối tắt trên màn hình chính sẽ mở bằng trình duyệt.

## 7. Thử trọn một vòng (bắt buộc trước khi hướng dẫn nhân viên)

1. Điện thoại quét QR bàn → gọi 2 món → **Gửi order**.
2. POS: "Chờ duyệt" → **Duyệt** → phiếu bếp ra (hoặc bấm "Phiếu bếp").
3. Màn bếp: vé hiện trong vài giây.
4. POS: **Tính tiền** → **Thu tiền** → Tiền mặt → **Xác nhận thu · đóng bill** → **In hóa đơn**.
5. Màn bếp: vé biến mất. **Báo cáo**: có đúng doanh thu vừa thu.

Ghi thời gian từ bước 1 tới 5 vào biên bản (`09-BienBanNghiemThu.md`).
