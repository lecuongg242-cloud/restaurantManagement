# V1.x — Cầu in bếp ESC/POS (tự in phiếu bếp)

Hiện thực nhánh Bridge của `PrintAdapter` (PRINT-01, quyết định D1 trong
[QD-005](../15-QuyetDinh/QD-005-KienTrucKyThuat.md)). POS/KDS **không đổi nghiệp vụ**.

---

## ĐỌC TRƯỚC: phần lớn quán KHÔNG cần cầu in

Cầu in chỉ cần khi nhân viên bấm in từ **điện thoại/tablet** (thiết bị không cài được máy in),
hoặc khi muốn phiếu tự xuống bếp lúc khách đặt qua QR.

Nếu nhân viên **chỉ bấm in trên laptop ở quầy** — trường hợp phổ biến nhất — thì bỏ hẳn cầu in,
cài máy in bếp vào Windows như máy in thường là xong. Không Node, không script, không token.

**1. Chọn chế độ trình duyệt cho quán** — owner vào `/r/<slug>/admin/settings` → **Cách in phiếu** →
"Trình duyệt" → Lưu. Chỉ quán đó đổi, không phải deploy lại (PRINT-10, từ 27/09/2026 — trước đây là
biến môi trường chung cho mọi quán).

**2. Cài máy in bếp vào laptop quầy.** Máy in ở bếp, laptop ở quầy, nối qua LAN:

- Cài **driver POS80** của Xprinter/Sapo trước (Chrome in HTML dạng đồ họa nên driver
  "Generic / Text Only" sẽ ra sai — phải dùng driver thật của máy in).
- Settings → Bluetooth & devices → Printers → **Add manually** →
  *Add a printer using a TCP/IP address* → Hostname `192.168.1.234`, Port `9100`.
- Printing preferences → khổ giấy **80mm**.
- Đặt làm **máy in mặc định**.

**3. Mở POS bằng Chrome ở chế độ in im lặng.** Tạo lối tắt Chrome, sửa Target thành:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="C:\pos-chrome" --app=https://<ten-mien>/r/qt-food/pos
```

`--kiosk-printing` = bấm in là ra giấy luôn, không hiện hộp thoại chọn máy in.

`--user-data-dir` **bắt buộc phải có**: Chrome dùng chung một tiến trình cho mỗi hồ sơ, nên nếu nhân
viên đang mở Chrome thường thì lối tắt chỉ mở thêm cửa sổ trong tiến trình cũ và `--kiosk-printing`
**bị bỏ qua** — hộp thoại in lại hiện ra. Hồ sơ riêng khiến POS luôn chạy tiến trình của nó.

**4. Thử**: bấm "Phiếu bếp" trên POS → giấy phải ra ở máy in bếp trong 1–2 giây.

### Giới hạn của cách này
- Chỉ in được khi bấm **trên chính laptop đó**. Bấm từ điện thoại/tablet sẽ không ra giấy.
- `--kiosk-printing` luôn in ra **máy in mặc định** — nên chỉ hợp quán có **đúng một máy in**.

### Quán có 2 máy in (bếp + quầy) → dùng cầu in, KHÔNG dùng cách trên
Đây là cấu hình phổ biến nhất khi quán đã chạy ổn. Bỏ `--kiosk-printing` để nhân viên tự chọn máy in
là sai hướng: giữa giờ cao điểm sẽ chọn nhầm, và mỗi phiếu mất thêm vài giây.

Cách đúng là **tách đường đi theo loại phiếu** — chính là việc `BridgePrintAdapter` làm sẵn:

| Loại phiếu | Đường đi | Ra máy in |
| --- | --- | --- |
| Phiếu bếp | cầu in → ESC/POS thẳng tới IP máy in bếp | bếp |
| Hóa đơn, phiếu khách | trình duyệt → máy in mặc định của Windows | quầy |

Cấu hình: quán chọn **Cách in phiếu = Cầu in** ở `/admin/settings` · máy in **quầy** đặt làm mặc định trong Windows ·
Chrome mở kèm `--kiosk-printing` · cầu in chạy nền với `PRINTER_HOST` = IP máy in **bếp**.
Kết quả: không ai phải chọn máy in bao giờ. Làm theo phần cài đặt bên dưới.

---

## Vì sao cần tiến trình chạy tại quán
App chạy trên Vercel nên server không với tới máy in trong mạng LAN của quán. Vì vậy có một
tiến trình nhỏ chạy trên máy tại quán làm cầu nối:

```
POS bấm "Phiếu bếp"
  → server action queueKitchenTicketPrint  → print_jobs (status=pending, target_station=kitchen)
  → scripts/print-bridge.mjs (chạy tại quán) poll mỗi 2s
  → gửi raw ESC/POS tới máy in bếp qua TCP 9100
  → print_jobs.status = printed | failed
```

Hóa đơn và phiếu khách **vẫn in qua trình duyệt** (máy in ở quầy, ngay trước mặt thu ngân).

## Cài đặt

**1. Bật chế độ cầu in cho quán** — owner vào `/r/<slug>/admin/settings` → **Cách in phiếu** → "Cầu in"
→ Lưu. Chọn "Trình duyệt" = quay lại hộp thoại in của trình duyệt. Có hiệu lực từ lần tải POS kế tiếp,
không phải deploy (PRINT-10).

**2. Tìm IP máy in.** Trên laptop của quán (cùng mạng với máy in), chép sang
`scripts/print-scan.ps1` — một file, chạy bằng PowerShell có sẵn của Windows, không cài gì:

```
powershell -ExecutionPolicy Bypass -File print-scan.ps1                     # dò cổng 9100
powershell -ExecutionPolicy Bypass -File print-scan.ps1 -TestPrint 192.168.1.234   # in phiếu thử
```

Giấy ra và tự cắt = máy in nói đúng raw ESC/POS, cầu in chắc chắn in được.

Quét không ra: giữ **FEED** rồi bật nguồn máy in → tự in phiếu self-test có dòng `IP Address`.
Bẫy hay gặp với Xprinter/Sapo là máy in giữ IP tĩnh mặc định `192.168.1.87` trong khi router quán
phát dải khác — hai bên không thấy nhau dù dây cắm đúng. Sửa: cắm USB → `Printer Test Tool` của
Xprinter → tab Ethernet → chuyển **DHCP**.

> **Từ 27/09/2026 (P11 · 11-05 · PRINT-11): MỘT bộ cài chung cho mọi quán, KHÔNG mang mật khẩu.**
> Quy trình cũ (đóng gói riêng từng quán kèm `-BridgePassword`) đã bỏ.

**3a. Đóng gói bộ cài — trên máy dev, làm một lần cho mọi quán.** `powershell -ExecutionPolicy Bypass
-File scripts\print-pack.ps1`. Script tải Node LTS chính thức cho Windows (kiểm SHA-256 theo
`SHASUMS256.txt` của nodejs.org), ghép `cau-in\` + `cau-in.zip` ở gốc repo (bị `.gitignore` chặn), và
**tự chặn** nếu trong bộ cài lọt dòng mật khẩu/khóa bí mật nào. Bộ cài gửi qua Zalo/USB được.

**3b. Tạo mã kích hoạt — lúc người lắp đã ngồi trước laptop quán.** `/super` → hàng nhà hàng →
**Mã cài cầu in** → **Tạo mã kích hoạt**. Mã 8 ký tự (vd `ABCD-EFGH`), **dùng một lần**, hết hạn sau
30 phút, chỉ lưu bản băm. Đổi mã = xoay mật khẩu tài khoản `printer` của quán (máy cũ mất quyền ngay)
và đặt quán sang **Cách in phiếu = Cầu in**.

**3c. Cài lên laptop quán — một lần bấm.** Giải nén `cau-in.zip`, double-click `CAI-DAT.bat`, gõ mã.
Script tự xin quyền Administrator rồi làm hết: tắt cầu in cũ (nếu có) → chép file + `node
ode.exe`
vào `C:\cau-in` → **đổi mã lấy tài khoản** (hoặc dùng lại tài khoản của lần cài trước / bộ cài cũ
`C:\cau-in-<quán>` nếu còn đăng nhập được) → **dò và in thử máy in bếp** → ghi `PRINTER_HOST` →
đặt máy in quầy làm mặc định → tạo lối tắt POS kèm `--kiosk-printing` → đăng ký tác vụ `CauInBep`
chạy nền lúc khởi động → chỉnh nguồn điện chống ngủ.

Chỉ hỏi người cài: **mã kích hoạt**, giấy phiếu thử **ra ở bếp hay ở quầy**, và máy in quầy là cái nào.
Câu về giấy bắt buộc phải xuống bếp nhìn tận mắt — quán 2 máy in rất dễ cấu hình nhầm IP máy quầy
thành máy bếp, và triệu chứng là bếp không nhận được gì mà không ai hiểu vì sao.

**Tự cập nhật (P11 · 11-06 · PRINT-12).** Cầu in hỏi `GET /api/bridge/latest` lúc khởi động và mỗi
giờ. Server công bố đúng tệp `scripts/print-bridge.mjs` đang deploy (phiên bản đọc từ hằng
`BRIDGE_VERSION`, SHA-256 tính từ nội dung — không có bản sao nào để lệch). Có bản mới **và không đang
in** → tải, **kiểm SHA**, giữ bản đang chạy làm `print-bridge.old.mjs`, thay tệp, thoát mã 4 →
`print-bridge.bat` chạy lại ngay. SHA sai / tải hỏng → giữ bản cũ, vẫn in. Bản mới **chết 3 lần liên
tiếp** → bat tự quay về `print-bridge.old.mjs`. **Sửa cầu in = tăng `BRIDGE_VERSION`** rồi deploy; mọi
quán tự lên trong ≤ 1 giờ. `/super` → bảng **Cầu in các quán** cho biết quán nào còn bản cũ.
Cầu in cài bằng bộ cài trước 11-05 (không có `POS_URL`) **không** tự cập nhật — cài lại một lần.

**In hóa đơn từ điện thoại / tablet (P12 · 12-01→03 · PRINT-14/15/16).** Bộ cài hỏi "máy in quầy là số
mấy" và ghi `COUNTER_PRINTER=usb:<tên máy in Windows>` vào `.env.local` (máy quầy LAN: sửa tay thành
`lan:<ip>[:cổng]`). Từ đó, bấm "In hóa đơn" / "Phiếu khách" trên thiết bị **không có máy in** → server xếp
phiếu kèm bản chụp → cầu in tải **ảnh có dấu** (`/api/print/jobs/[id]/image`) → lệnh in ảnh `GS v 0` → máy
quầy (USB qua hàng đợi Windows, `print-raw.ps1`; LAN qua cổng 9100). **Máy quầy (≥1024 px) vẫn in trình
duyệt như cũ.** Laptop quầy tắt → điện thoại báo "Cầu in ở quầy không chạy", không in được. Màn `/admin/printers`
có thẻ "Máy in quầy". Không khai `COUNTER_PRINTER` → cầu in chạy y như trước (chỉ phiếu bếp).

**Gỡ:** `GO-CAI-DAT.bat` (xóa tác vụ, lối tắt, thư mục). Máy mất → `/super` → **Mã cài cầu in** →
**Thu hồi cầu in của quán** (cầu in mất quyền ngay, quán về in trình duyệt).

Bộ cài (`print-pack.ps1` sinh ra, không ghép tay) gồm:

| File | Vai trò |
| --- | --- |
| `CAI-DAT.bat` | **Cài đặt tự động** — chạy cái này. Nhúng sẵn `-ApiBase`, có `%*` để chạy lại kèm `-KitchenIp` / `-ActivationCode` |
| `KIEM-TRA-MAY-IN.bat` | **Dò máy in + in phiếu thử** — dùng khi không tìm thấy máy in |
| `GO-CAI-DAT.bat` · `go-cai-dat.ps1` | Gỡ cầu in khỏi máy (hỏi xác nhận) |
| `print-setup.ps1` | Ruột của bước cài, `CAI-DAT.bat` gọi vào đây |
| `print-activate.ps1` | Đổi mã kích hoạt → ghi `.env.local` (tách riêng để chạy thử được) |
| `print-bridge.mjs` | Cầu in (không phụ thuộc npm: chỉ `net`/`fs` + `fetch` sẵn của Node) |
| `print-bridge.bat` | Chạy cầu in bằng `node
ode.exe` đi kèm, tự khởi động lại khi chết |
| `print-scan.ps1` | Ruột của bước dò máy in |
| `node
ode.exe` | Node LTS chính thức (đã kiểm SHA-256) — máy quán không cần cài Node |
| `HUONG-DAN.txt` | Hướng dẫn cho người lắp, viết cho người không biết kỹ thuật |

`.env.local` **không** có trong bộ cài — bước kích hoạt sinh ra nó trong `C:\cau-in`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...          # khóa CÔNG KHAI, không phải service-role
PRINT_BRIDGE_EMAIL=print-qt-food@bridge.local
PRINT_BRIDGE_PASSWORD=...                  # do bước kích hoạt ghi (đổi mã → tài khoản)
POS_URL=https://<ten-mien>/r/<slug>/pos    # bộ cài dùng để tạo lối tắt POS
PRINTER_HOST=192.168.1.234       # IP máy in bếp
PRINTER_PORT=9100
PRINTER_CHARS=48                 # 80mm=48, 58mm=32
POLL_MS=2000
MAX_JOB_AGE_MIN=30               # bỏ qua phiếu tồn cũ hơn 30 phút
```

> **Nợ kỹ thuật này ĐÃ TRẢ (07-02, QD-012 §1).** Trước đây laptop quán giữ
> `SUPABASE_SERVICE_ROLE_KEY` — khóa bỏ qua RLS toàn project, nên máy quán A đọc/ghi được dữ liệu
> mọi quán khác. Nay cầu in dùng tài khoản thiết bị vai trò `printer` chỉ thuộc đúng quán mình.
> Đo thực tế: token cầu in gọi `/rest/v1/tenants` trả về **1** nhà hàng; service-role trả về **tất
> cả**. `canAccess('printer', …)` là `false` ở mọi khu vực nên khóa lộ ra cũng không mở được
> `/admin`, `/pos`, `/kds`.
>
> **Rủi ro còn lại (đã cân nhắc, chấp nhận):** tài khoản `printer` vẫn đọc được các bảng khác **của
> chính quán đó** qua PostgREST thô. Bịt nốt phải sửa policy trên cả 18 bảng — thay đổi rộng, lợi
> ích nhỏ, vì người cầm được máy đặt tại quán đó vốn đã đứng trong quán đó.
>
> **Quán ĐANG CHẠY thì chưa tự khỏi.** Sửa mã nguồn không làm cái khóa nằm trên laptop ngoài kia
> biến mất. Xem §*Chuyển đổi quán đang chạy* bên dưới — có quy trình từng bước và cách quay lại.

**4. Nghiệm thu** — làm đủ 5 phép mới coi là xong:

0. `node print-bridge.mjs --test-auth` → in ra `Đăng nhập OK. Cầu in phục vụ tenant <uuid>.`
   Sai mật khẩu hay chưa gắn quán thì biết ngay ở bước này, không phải chờ tới phiếu đầu tiên.
1. Bấm "Phiếu bếp" trên POS → giấy ra ở **bếp**, chip POS xanh
2. In 1 hóa đơn → giấy ra ở **quầy**, không hiện hộp thoại
3. **Tắt hẳn laptop, bật lại, không bấm gì** → bấm "Phiếu bếp" vẫn ra giấy
4. **Rút dây mạng máy in bếp** → bấm in → chip đỏ "Bếp CHƯA in" → cắm lại, bấm chip in lại → ra giấy

Phép 3 chứng minh sáng hôm sau nhân viên không phải làm gì. Phép 4 chứng minh khi máy in hỏng thì
nhân viên **biết ngay** thay vì mất nhiều ngày mới phát hiện.

### Xử lý sự cố

> **Gửi hỏng thì cầu in tự thử lại 3 lần** (giãn 1s → 3s) trước khi báo đỏ. Một cú chớp mạng LAN
> không còn làm mất phiếu nữa. Máy in rút dây thật thì vẫn báo đỏ như cũ — chip "Bếp CHƯA in" ở POS
> vẫn là dấu hiệu phải đi xem máy in.

> **Cầu in "im" lúc quán vắng là bình thường, không phải treo.** Từ P8 (PERF-03) nhịp hỏi giãn
> dần khi không có phiếu nào: 2 giây → 5 giây → 10 giây (trần). Có phiếu là về lại 2 giây ngay.
> Phiếu đầu tiên sau một kỳ vắng dài ra chậm nhất khoảng 10 giây — đo thật ngày 24/09/2026 là
> **4,5 giây**. Đừng khởi động lại cầu in vì thấy nó không gọi mạng liên tục.



```powershell
schtasks /query /tn "CauInBep"     # cầu in có đăng ký chạy nền không
schtasks /run   /tn "CauInBep"     # chạy lại
powershell -ExecutionPolicy Bypass -File print-scan.ps1                      # dò lại máy in
powershell -ExecutionPolicy Bypass -File print-scan.ps1 -TestPrint <IP>      # in phiếu thử
```

> **Cầu in tự tắt sau đúng 3 ngày (phát hiện 29/09/2026).** `schtasks /create` mặc định "dừng tác vụ nếu chạy quá
> 3 ngày" ⇒ Windows giết cả `print-bridge.bat` (vòng tự chạy lại chết theo) sau 72 giờ. Bộ cài từ 29/09/2026 tự bỏ giới
> hạn này (và cho chạy khi rút sạc). Máy cài trước đó: chạy lại `CAI-DAT.bat`, hoặc chạy lệnh sau bằng quyền Administrator
> rồi `schtasks /run /tn "CauInBep"`:
>
> ```
> powershell -NoProfile -Command "Set-ScheduledTask -TaskName CauInBep -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero))"
> ```
>
> Kiểm: `schtasks /query /tn "CauInBep" /xml` → `<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>`.

Muốn xem log thì double-click `print-bridge.bat` (có cửa sổ) — nhớ đóng lại sau khi xem, để hai cầu
in chạy cùng lúc sẽ **in trùng phiếu**.

## Chuyển đổi quán đang chạy sang tài khoản cầu in

Dành cho quán đã lắp cầu in theo cách cũ (laptop còn giữ `SUPABASE_SERVICE_ROLE_KEY`). Tính tới
23/09/2026: **qt-food chưa chuyển**.

**Làm ngoài giờ phục vụ.** Trong lúc đổi, phiếu bếp không tự in — bếp in tay ở POS hoặc chờ.

> **Đừng ghi đè cả `.env.local` bằng bản mới đóng gói.** File trên laptop quán có `PRINTER_HOST`
> mà lúc cài `print-setup.ps1` dò ra rồi ghi vào; bản trong repo không có. Mất dòng đó là cầu in
> gõ vào IP mặc định `192.168.1.234` — nhiều khả năng không phải máy in của quán. **Sửa tại chỗ.**

### Chuẩn bị trên máy dev

1. `/super` → hàng nhà hàng → **Tài khoản cầu in** → **Cấp tài khoản**. Chép 2 dòng hiện ra
   (`PRINT_BRIDGE_EMAIL`, `PRINT_BRIDGE_PASSWORD`). Mật khẩu **chỉ hiện một lần**; mất thì cấp
   lại, mật khẩu cũ hết hiệu lực ngay và chỉ ảnh hưởng quán đó.
2. Lấy `NEXT_PUBLIC_SUPABASE_ANON_KEY` từ `.env.local` của repo. Khóa này công khai (đã đi vào
   mọi trình duyệt khách), không phải bí mật.
3. Chép `scripts/print-bridge.mjs` bản mới ra USB hoặc qua TeamViewer/AnyDesk.

### Tại quán — PowerShell chạy bằng quyền Administrator

```powershell
# 4. Sao lưu TRƯỚC khi đụng gì
cd C:\cau-in-qt-food
copy .env.local .env.local.bak
copy print-bridge.mjs print-bridge.mjs.bak

# 5. Dừng cầu in (đóng luôn cửa sổ đen "CAU IN BEP DANG CHAY" nếu có mở tay)
schtasks /end /tn "CauInBep"
```

**6.** Chép đè `print-bridge.mjs` bản mới vào `C:\cau-in-qt-food`.

**7.** Mở `.env.local` bằng Notepad.

**Xóa** 2 dòng:

```
SUPABASE_SERVICE_ROLE_KEY=...
PRINT_TENANT_SLUG=qt-food
```

**Thêm** 3 dòng:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key bước 2>
PRINT_BRIDGE_EMAIL=print-qt-food@bridge.local
PRINT_BRIDGE_PASSWORD=<mật khẩu bước 1>
```

**Giữ nguyên** `NEXT_PUBLIC_SUPABASE_URL`, `PRINTER_HOST`, `PRINTER_PORT`, `PRINTER_CHARS`,
`POLL_MS`, `MAX_JOB_AGE_MIN`.

```powershell
# 8. Thử đăng nhập TRƯỚC khi bật lại
node print-bridge.mjs --test-auth
# Phải ra: Đăng nhập OK. Cầu in phục vụ tenant <uuid>.

# 9. Bật lại
schtasks /run /tn "CauInBep"
```

**10. Nghiệm thu:** bấm "Phiếu bếp" một đơn trên POS → giấy ra ở **bếp**, chip POS chuyển xanh.

### Đọc lỗi ở bước 8

| Thông báo | Nghĩa là |
|---|---|
| `Đăng nhập cầu in thất bại (HTTP 400)` | Sai email hoặc mật khẩu → cấp lại ở `/super` |
| `Thiếu NEXT_PUBLIC_SUPABASE_ANON_KEY / PRINT_BRIDGE_...` | Gõ thiếu dòng hoặc sai tên biến trong `.env.local` |
| `Đăng nhập được nhưng chưa gắn nhà hàng nào` | Cấp tài khoản nhầm quán, hoặc quán đang tạm ngưng |

### Quay lại nếu hỏng — 30 giây

```powershell
schtasks /end /tn "CauInBep"
cd C:\cau-in-qt-food
copy /y .env.local.bak .env.local
copy /y print-bridge.mjs.bak print-bridge.mjs
schtasks /run /tn "CauInBep"
```

Tài khoản `printer` vừa cấp cứ để đó, không ảnh hưởng gì.

### Dọn sau khi chạy ổn vài ngày

Xóa `.env.local.bak`, `print-bridge.mjs.bak` trên laptop quán, và mọi bản `.zip` / thư mục
`cau-in-<slug>` cũ còn sót trên máy dev, USB, Downloads — chúng vẫn chứa service-role key.

### Việc còn lại sau khi chuyển: XOAY KHÓA

Chuyển cầu in làm laptop **thôi không còn dùng** service-role key. Nhưng key đó **vẫn còn hiệu
lực**. Nó đã nằm trên một máy ngoài tầm kiểm soát nhiều tháng và có thể còn trong file zip bộ cài,
thư mục Downloads, hay lịch sử chat lúc gửi cho ai đó. Ai đã copy thì vẫn mở được dữ liệu của mọi
nhà hàng.

Đóng thật sự thì phải xoay khóa: **Supabase Dashboard → Project Settings → API**.

- Dự án có cả khóa kiểu cũ (JWT `eyJ...`) lẫn kiểu mới (`sb_secret_...`). Xoay **JWT secret** vô
  hiệu mọi phiên đăng nhập — toàn bộ nhân viên phải đăng nhập lại. Làm ngoài giờ.
- Xoay xong **phải** cập nhật `SUPABASE_SERVICE_ROLE_KEY` ở Vercel env và `.env.local` máy dev,
  nếu không app production chết.

Rủi ro của việc xoay khóa khác hẳn việc chuyển cầu in, nên làm tách ra: chuyển cầu in trước cho
sạch, xoay khóa hẹn sau — nhưng đừng bỏ.

## Nhân viên biết bếp đã nhận phiếu chưa
Cạnh nút "Phiếu bếp" trên POS có **chip trạng thái thường trực** (không dùng toast — toast bay mất
là bỏ sót). Trạng thái đọc từ `print_jobs` nên F5 hay đổi ca vẫn đúng:

| Chip | Nghĩa |
| --- | --- |
| `Chưa gửi bếp` (đỏ viền) | Đơn này chưa in phiếu bếp lần nào — món chưa xuống bếp |
| `Đang gửi bếp…` (vàng, quay) | Job đang chờ cầu in lấy — hỏi lại mỗi 2.5s |
| `Bếp đã in · 19:12` (xanh) | Máy in bếp đã nhận xong, kèm giờ in |
| `Bếp CHƯA in — in lại` (đỏ, bấm được) | Cầu in báo lỗi; bấm thẳng vào chip để in lại |

## Lưu ý vận hành
- **Chỉ chạy MỘT tiến trình cầu in cho mỗi quán** — hai tiến trình sẽ in trùng phiếu.
- **Phiếu in không dấu** (PHO BO TAI). Máy in nhiệt phổ thông không có bảng mã tiếng Việt sẵn;
  ép in có dấu dễ ra ký tự rác. Nếu sau này cần có dấu: chọn máy in hỗ trợ CP1258 rồi thêm lệnh
  `ESC t <n>` + bảng mã trong `ascii()` của `scripts/print-bridge.mjs`.
- **Máy in hỏng / mất mạng LAN**: job chuyển `status=failed`, cầu in ghi log và POS hiện chip đỏ
  "Bếp CHƯA in" — bấm vào chip để in lại sau khi sửa. Nếu hàng đợi ghi lỗi (mất mạng internet, hết
  phiên đăng nhập) thì POS **tự động rơi về in trình duyệt** để không mất phiếu.
- Máy in phải hỗ trợ **raw ESC/POS trên cổng 9100** (hầu hết máy in nhiệt LAN đều có). Nếu máy in
  chỉ nói giao thức khác (IPP/LPD) thì đổi `sendToPrinter()`.

## File liên quan
| File | Vai trò |
| --- | --- |
| `lib/print/adapter.ts` · `lib/print/print-mode.tsx` | `BridgePrintAdapter` + chọn adapter theo `tenants.settings.print_mode` của quán |
| `app/r/[slug]/print/kitchen/actions.ts` | `queueKitchenTicketPrint` — ghi job pending (guard POS/KDS) |
| `scripts/print-pack.ps1` | **Đóng gói bộ cài CHUNG** `cau-in/` + `cau-in.zip`, kèm Node đã kiểm SHA-256 (chạy trên máy dev) |
| `scripts/print-huongdan.txt` | Bản mẫu `HUONG-DAN.txt` cho người lắp — `print-pack` chép vào bộ cài |
| `scripts/print-setup.ps1` · `.bat` | **Cài đặt tự động một lệnh** cho laptop quán |
| `scripts/print-bridge.mjs` | Cầu in: poll → ESC/POS → TCP 9100 → printed/failed (không cần npm) |
| `scripts/print-bridge.bat` | Chạy cầu in trên laptop quán, tự khởi động lại khi chết |
| `scripts/print-scan.ps1` | Dò IP máy in + in phiếu thử (không cần cài gì, dùng khi lắp máy) |
| `scripts/print-scan.mjs` | Bản Node của lệnh dò (`npm run print:scan`) — dùng trên máy dev |
| `supabase/migrations/0010_print_jobs.sql` | Bảng hàng đợi (đã có sẵn từ P3) |
