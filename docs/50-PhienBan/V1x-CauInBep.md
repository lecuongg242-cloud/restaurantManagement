# V1.x — Cầu in bếp ESC/POS (tự in phiếu bếp)

Hiện thực nhánh Bridge của `PrintAdapter` (PRINT-01, quyết định D1 trong
[QD-005](../15-QuyetDinh/QD-005-KienTrucKyThuat.md)). POS/KDS **không đổi nghiệp vụ**.

---

## ĐỌC TRƯỚC: phần lớn quán KHÔNG cần cầu in

Cầu in chỉ cần khi nhân viên bấm in từ **điện thoại/tablet** (thiết bị không cài được máy in),
hoặc khi muốn phiếu tự xuống bếp lúc khách đặt qua QR.

Nếu nhân viên **chỉ bấm in trên laptop ở quầy** — trường hợp phổ biến nhất — thì bỏ hẳn cầu in,
cài máy in bếp vào Windows như máy in thường là xong. Không Node, không script, không token.

**1. Đưa web về chế độ trình duyệt** — Vercel → Settings → Environment Variables:

```
NEXT_PUBLIC_PRINT_MODE=browser
```

Rồi **Redeploy** (bắt buộc — biến `NEXT_PUBLIC_*` được nhúng lúc build, đổi không deploy lại thì
không ăn).

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

Cấu hình: `NEXT_PUBLIC_PRINT_MODE=bridge` · máy in **quầy** đặt làm mặc định trong Windows ·
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

**1. Bật chế độ bridge cho web** — Vercel env (hoặc `.env.local` khi chạy máy):

```
NEXT_PUBLIC_PRINT_MODE=bridge
```

Bỏ trống hoặc `browser` = quay lại cách cũ (hộp thoại in của trình duyệt). Đổi biến này phải
deploy lại vì là biến `NEXT_PUBLIC_*`.

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

**3a‑0. Cấp tài khoản cầu in — làm TRƯỚC khi đóng gói.** Vào `/super` → hàng nhà hàng →
**Tài khoản cầu in** → **Cấp tài khoản**. Khối kết quả hiện `PRINT_BRIDGE_EMAIL` và
`PRINT_BRIDGE_PASSWORD`; mật khẩu **chỉ hiện một lần**, mất thì cấp lại (mật khẩu cũ hết hiệu lực
ngay, chỉ ảnh hưởng quán đó).

**3a. Đóng gói bộ cài — trên máy dev.** Chạy `print-pack.bat -BridgePassword "<mật khẩu vừa cấp>"`.
Script đọc `.env.local` của repo, lấy đúng 2 khóa **công khai** (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`), ghép với tài khoản cầu in, rồi sinh thư mục `cau-in-<slug>/` +
file `.zip` cùng tên ở gốc repo. Cả hai bị `.gitignore` chặn.

Quán khác thì đổi tham số: `print-pack.bat -Slug bun-bo -Chars 32 -BridgePassword "…"` (58mm) —
mặc định là `qt-food`, khổ 80mm, POS `https://restaurant-management-zeta.vercel.app/r/<slug>/pos`.

**3b. Cài lên laptop quán — một lần bấm.** Chép thư mục (hoặc giải nén file zip) sang laptop
quán rồi double-click `CAI-DAT.bat`. URL POS và thư mục cài đã nhúng sẵn lúc đóng gói nên tại
quán không phải gõ gì. Muốn gõ tay thì vẫn chạy được:

```powershell
powershell -ExecutionPolicy Bypass -File print-setup.ps1 -AppUrl "https://<ten-mien>/r/qt-food/pos"
```

Script tự xin quyền Administrator rồi làm hết: cài Node → chép file → **dò và in thử máy in bếp** →
ghi `PRINTER_HOST` → đặt máy in quầy làm mặc định → tạo lối tắt POS kèm `--kiosk-printing` →
đăng ký tác vụ `CauInBep` chạy nền lúc khởi động → chỉnh nguồn điện chống ngủ.

Chỉ hỏi người cài 3 câu: giấy phiếu thử **ra ở bếp hay ở quầy**, máy in quầy là cái nào, và URL POS.
Câu đầu bắt buộc phải xuống bếp nhìn tận mắt — quán 2 máy in rất dễ cấu hình nhầm IP máy quầy
thành máy bếp, và triệu chứng là bếp không nhận được gì mà không ai hiểu vì sao.

Thư mục triển khai (`print-pack.bat` sinh ra, không ghép tay) gồm:

| File | Vai trò |
| --- | --- |
| `CAI-DAT.bat` | **Cài đặt tự động** — chạy cái này. Nhúng sẵn `-AppUrl` + `-InstallDir`, có `%*` để chạy lại kèm `-KitchenIp` |
| `KIEM-TRA-MAY-IN.bat` | **Dò máy in + in phiếu thử** — dùng khi bước 4 không tìm thấy máy in |
| `print-setup.ps1` | Ruột của bước cài (7 bước), `CAI-DAT.bat` gọi vào đây |
| `print-bridge.mjs` | Cầu in (không phụ thuộc npm: chỉ `net`/`fs` + `fetch` sẵn của Node) |
| `print-bridge.bat` | Chạy cầu in, tự khởi động lại khi chết |
| `print-scan.ps1` | Ruột của bước dò máy in (Windows mở `.ps1` bằng Notepad khi double-click, nên phải bọc qua `.bat`) |
| `.env.local` | Cấu hình (nội dung bên dưới; `PRINTER_HOST` do script tự ghi) |
| `HUONG-DAN.txt` | Hướng dẫn cho người lắp, viết cho người không biết kỹ thuật |

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...          # khóa CÔNG KHAI, không phải service-role
PRINT_BRIDGE_EMAIL=print-qt-food@bridge.local
PRINT_BRIDGE_PASSWORD=...                  # cấp ở /super, hiện một lần
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
| `lib/print/adapter.ts` | `BridgePrintAdapter` + chọn adapter theo `NEXT_PUBLIC_PRINT_MODE` |
| `app/r/[slug]/print/kitchen/actions.ts` | `queueKitchenTicketPrint` — ghi job pending (guard POS/KDS) |
| `scripts/print-pack.ps1` · `.bat` | **Đóng gói bộ cài** `cau-in-<slug>/` + `.zip` (chạy trên máy dev) |
| `scripts/print-huongdan.txt` | Bản mẫu `HUONG-DAN.txt` cho người lắp — `print-pack` chép vào bộ cài |
| `scripts/print-setup.ps1` · `.bat` | **Cài đặt tự động một lệnh** cho laptop quán |
| `scripts/print-bridge.mjs` | Cầu in: poll → ESC/POS → TCP 9100 → printed/failed (không cần npm) |
| `scripts/print-bridge.bat` | Chạy cầu in trên laptop quán, tự khởi động lại khi chết |
| `scripts/print-scan.ps1` | Dò IP máy in + in phiếu thử (không cần cài gì, dùng khi lắp máy) |
| `scripts/print-scan.mjs` | Bản Node của lệnh dò (`npm run print:scan`) — dùng trên máy dev |
| `supabase/migrations/0010_print_jobs.sql` | Bảng hàng đợi (đã có sẵn từ P3) |
