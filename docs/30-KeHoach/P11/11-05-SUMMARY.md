# 11-05 SUMMARY — Bộ cài chung + mã kích hoạt

> Thực hiện 27/09/2026. Yêu cầu: PRINT-11. Quyết định: QD-019 D6, D7.
> **Trạng thái: server + migration 0052 xong, kiểm DB thật; kích hoạt + đóng gói chạy thật tại máy dev.
> Còn: cài trên một máy Windows SẠCH (và cài đè ở qt-food) — bộ cài đổi cấu hình máy nên không chạy trên máy dev.**

## Lệch khỏi plan — có chủ đích

| Plan ghi | Làm | Vì sao |
|---|---|---|
| Owner tạo mã ở `/admin/printers`, RLS cho owner/manager | Mã tạo ở **`/super`** (super-admin); bảng **chỉ server chạm** (RLS bật, không policy) | Giữ quyết định QD-012 đã ghi trong code: "cầu in do chúng ta lắp, đưa vào khu admin là biến khóa thiết bị thành thứ chủ quán tự phát". Không cần policy thì không có policy để viết sai |
| — | **Kích hoạt → `print_mode = bridge`; thu hồi → `browser`** | Người lắp tại quán thường không có tài khoản owner để tự đổi "Cách in phiếu" (11-04); quên đổi thì POS không bao giờ gửi phiếu qua cầu in vừa cài |
| — | Bộ cài **tự dùng lại** tài khoản của lần cài trước / bộ cài cũ `C:\cau-in-<quán>` nếu **đăng nhập thử được** | Cài lại qt-food không cần xin mã; tài khoản hỏng/bị thu hồi thì mới hỏi mã |

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `supabase/migrations/0052_bridge_activation.sql` (mới) | `bridge_activation_codes` (chỉ băm, hết hạn, `used_at`); RLS bật, không policy, revoke anon/authenticated |
| `lib/print/activation.ts` (mới) | Sinh mã 8 ký tự (bỏ `0 1 O I L`), chuẩn hóa (thường/hoa, gạch, cách), băm; đổi mã bằng **một** update có điều kiện (hai máy cùng mã → một máy thắng); thu hồi |
| `app/api/bridge/activate/route.ts` (mới) | Giới hạn tần suất 10 lượt/10 phút/IP → đổi mã → trả cấu hình **một lần**, `no-store`; không bao giờ trả service-role |
| `app/super/*` | Nút "Mã cài cầu in" → tạo mã / thu hồi cầu in |
| `scripts/print-activate.ps1` (mới) | Đổi mã → ghi `.env.local` (UTF-8 không BOM, CRLF), **giữ** `PRINTER_HOST`/`PRINTER_CHARS` đã có |
| `scripts/print-setup.ps1` | Node đi kèm; **tắt cầu in cũ TRƯỚC khi chép** (node.exe đang chạy bị khóa); dùng lại tài khoản nếu đăng nhập được, không thì hỏi mã; mặc định `C:\cau-in`; lối tắt POS lấy từ `POS_URL` |
| `scripts/print-pack.ps1` | Viết lại: một gói chung, Node LTS tải từ nodejs.org + kiểm SHA-256, `.bat` chuẩn hóa CRLF, **tự chặn** nếu lọt mật khẩu/khóa |
| `scripts/go-cai-dat.ps1` (mới) | Gỡ: hỏi xác nhận, xóa tác vụ, tiến trình, lối tắt, thư mục (cả `C:\cau-in-*` cũ) |
| `scripts/print-bridge.bat`, `.mjs`, `print-huongdan.txt`, `docs/50-PhienBan/V1x-CauInBep.md`, `.gitignore` | Node đi kèm; thông báo lỗi trỏ về mã kích hoạt; hướng dẫn tại quán; bỏ quy trình đóng gói từng quán |

## Bằng chứng

```
tests/print/activation.test.ts              5 passed
tests/rls/bridge-activation.test.ts         8 passed — mã đúng → printer đúng quán + print_mode=bridge; dùng lại /
                                             hết hạn / sai → CÙNG một thông báo; mã quán B không trả quán A;
                                             kích hoạt lần 2 → mật khẩu cũ không đăng nhập được; quán tạm ngưng
                                             → từ chối; thu hồi → nhịp tim bị từ chối + print_mode=browser;
                                             chủ quán không đọc/ghi được bảng
tests/security/rate-limit-routes.test.ts    route kích hoạt: 429 trước khi đổi mã; mã sai 400; đúng → không lộ service-role
toàn bộ unit 619 · test:rls 262 · tsc · lint · schema:check sạch
```

**Chạy thật tại máy dev** (server local + DB dùng chung, quán demo `pho-viet`):
```
print-activate.ps1 -Code he6r-VYXS (gõ chữ thường có gạch)  → "Da kich hoat cau in cho quan pho-viet", mã thoát 0
.env.local: ASCII, CRLF, không BOM; PRINTER_HOST=192.168.1.99 và PRINTER_CHARS=32 có sẵn được GIỮ
dùng lại cùng mã → "Ma khong hop le hoac da het han", không ghi tệp
mã sai → mã thoát 1, không tạo tệp
node print-bridge.mjs --test-auth với .env.local vừa sinh:
  "Đăng nhập OK. Cầu in phục vụ tenant 9d04e994-…" · "Nhịp tim OK" · máy in 192.168.1.99 KHÔNG phản hồi (IP giả — đúng)
```
Dọn xong: `pho-viet` không còn tài khoản cầu in, nhịp tim, mã (đúng như trước khi thử).

```
print-pack.ps1 -NoPause
  Node v24.21.0 — SHA-256 khớp nodejs.org · 7 file + 3 .bat (CRLF) · "Không có mật khẩu / khóa bí mật nào"
  cau-in.zip 33,4 MB · cau-in/ và cau-in.zip bị .gitignore chặn
cau-in/node/node.exe --version → v24.21.0; chạy được print-bridge.mjs
Trình phân tích cú pháp PowerShell: print-setup, print-activate, go-cai-dat, print-pack, print-scan — 0 lỗi
```

## Lỗi của tôi, bắt được trước khi commit

| Lỗi | Bắt bằng |
|---|---|
| Sửa `print-bridge.bat` bằng Python làm gãy `node\node.exe` thành hai dòng và đổi CRLF → LF | Đọc lại tệp. Sửa bằng Edit; `print-pack` nay tự chuẩn hóa `.bat` về CRLF, không phụ thuộc checkout |
| `& $node … *> $null` trong PowerShell 5.1 + `Stop` → stderr của Node làm dừng cả bộ cài | Đọc lại theo đúng bài học đã ghi trong chính bộ cài; hạ mức lỗi trong lúc gọi |
| Chép `node.exe` đè lên bản đang chạy khi cài lại → bị khóa | Rà luồng cài lại; chuyển bước tắt cầu in lên trước bước chép |
| Chốt chặn bí mật báo nhầm vì chính `print-setup.ps1` chứa mẫu regex `PRINT_BRIDGE_PASSWORD=.+` | Chạy thật `print-pack`; neo mẫu vào đầu dòng |
| Dùng `toLocaleTimeString` ở `/super` | Test canh gác `tests/time/vn.test.ts` (BUG lệch múi giờ) — đổi sang `gioVn` |

## Chưa kiểm được

| Nghiệm thu | Chờ |
|---|---|
| 2. Máy Windows **sạch** (không Node, không winget): cài gói chung + mã → "CAI DAT XONG", in thử, `/admin/printers` báo sống | Một máy/VM Windows không phải máy dev |
| 3. Cài đè trên máy có bản cũ → một tiến trình, 3 phiếu ra đúng 3 tờ | Tại qt-food (chủ dự án) — bộ cài sẽ tự dùng lại tài khoản trong `C:\cau-in-qt-food` |
| 4. `GO-CAI-DAT.bat` trên máy thật | Cùng máy ở mục 2 |
| Giao diện `/super` (nút tạo mã / thu hồi) | Chưa mở bằng trình duyệt — cần tài khoản super-admin |
