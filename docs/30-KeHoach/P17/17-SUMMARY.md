# P17 — SUMMARY: bán khi quán mất mạng (17-01 → 17-03)

> **Trạng thái: CODE XONG 28/09/2026, migration 0072 đã áp production** (thêm 2 cột + thay thân hàm `printer_heartbeat`
> cùng chữ ký; cầu in qt-food vẫn báo sống bình thường sau khi áp). **Chưa làm phần thử trên máy thật**: rút dây mạng máy
> quầy, cài lên iPad/Android, PC tự nối hotspot, buổi diễn tập 20 phút (17-03) — cần người ở quán.
> Tra đối thủ trước khi làm: `00-TongQuan.md` §Đối thủ làm thế nào.

## Đã làm

| Plan | Nội dung | Tệp chính |
|---|---|---|
| 17-01 | **Cài lên màn hình chính**: manifest riêng cho POS / KDS / admin của từng quán (tên + biểu tượng quán, toàn màn); biểu tượng 192/512 dựng từ logo hoặc chữ cái đầu. Chrome: 0 lỗi cài đặt ở cả 3 màn | `app/r/[slug]/manifest.webmanifest/route.ts`, `favicon.png/route.tsx` (`?s=`), `lib/offline/manifest-meta.ts` |
| 17-01 | **Không trắng màn khi mất mạng**: service worker (`public/sw.js`) chỉ làm một việc — tải POS mà mất mạng thì chuyển sang **màn xem lúc mất mạng** `/r/{slug}/pos/offline` (nạp sẵn lúc có mạng). Không cache API / server action / HTML khi có mạng ⇒ không kẹt bản cũ. Kho theo bản build, bản mới xóa kho cũ | `public/sw.js`, `components/pos/OfflineView.tsx`, `app/r/[slug]/pos/offline/page.tsx` |
| 17-01 | **Bản chụp** bàn / đơn đang mở / đơn không bàn / thực đơn lưu IndexedDB mỗi lần POS nhận dữ liệu mới, tách theo slug. Dựng bằng danh sách trắng — **không** PIN, token, SĐT / tên khách, ngân hàng (test liệt kê mọi khóa) | `lib/offline/snapshot.ts`, `lib/offline/use-offline.ts` |
| 17-01 | **Chỉ báo mạng**: dòng chữ đỏ "Mất mạng từ HH:mm — máy này chỉ xem được. Dùng điện thoại (4G/5G)…" (như Sapo); nút gửi đơn (bàn + mang về) chặn kèm lý do khi biết chắc mất mạng | `components/pos/NetworkStatus.tsx`, `PosBoard.tsx`, `TakeawayPanel.tsx` |
| 17-02 | **Cảnh báo toàn quán** (POS mọi khổ + **KDS**): "Máy in quầy mất kết nối từ HH:mm — N phiếu đang chờ in. Bật phát wifi trên điện thoại quản lý." + **Xem phiếu chờ (N)** → danh sách (giờ, loại, số đơn, bàn, món), phiếu > 30 phút ghi **"Không in bù — đã quá 30 phút"** (như biểu tượng lỗi in + số lệnh của KiotViet). Quán chế độ trình duyệt không bao giờ thấy | `components/pos/CauInBanner.tsx`, `lib/print/phieu-cho.ts`, `print/actions.ts` |
| 17-02 | **Điện thoại vẫn gửi được phiếu bếp khi cầu in mất kết nối**: thiết bị không có máy in → server vẫn xếp phiếu `pending` (trước đây bị từ chối → mở hộp thoại in vô ích trên điện thoại) + báo "Đã xếp phiếu bếp, nhưng máy in quầy đang mất kết nối — phiếu sẽ in khi có mạng lại (trong 30 phút)". Máy có máy in giữ nguyên đường lui in trình duyệt (PRINT-08) | `lib/print/adapter.ts`, `print/actions.ts` |
| 17-02 | **Lần mất kết nối gần nhất**: database tự ghi khi nhịp tim tới sau khoảng hở > 90 giây (`last_gap_from`, `last_gap_seconds`) — **không cần cầu in bản mới** ở quán. Trang Máy in hiện "Mất kết nối gần nhất: HH:mm dd/mm · N phút" | `0072_printer_gap.sql`, `admin/printers/page.tsx` |
| 17-02 | **Bộ cài — bước 6b "Mạng dự phòng"** (tùy chọn): nhập tên + mật khẩu wifi phát từ điện thoại quản lý → lưu hồ sơ wifi Windows tự nối (xếp cuối danh sách ưu tiên ⇒ wifi quán luôn được chọn trước). Tìm card wifi theo loại (không đọc chữ netsh — Windows tiếng Việt dịch chữ). Tệp XML tạm chứa mật khẩu bị xóa ngay | `scripts/print-setup.ps1` |
| 17-03 | Tài liệu: mục **"Khi quán mất mạng"** (thu ngân + phục vụ, có ảnh), thiết bị chuẩn (điện thoại quản lý phát wifi; máy in **không** nối qua wifi; router 4G tùy chọn), trực sự cố ("không in được" → kiểm cầu in trước) | `60-BanGiao/04`, `07`, `02`, `50-PhienBan/TrucSuCo.md` |

## Quyết định trong lúc làm

- **Dò mạng thật, không tin `navigator.onLine`**: router quán còn điện mà nhà mạng đứt thì trình duyệt vẫn báo online. Mỗi
  20 giây tải đầu tệp tĩnh `/sw.js` (CDN, không chạy hàm server; đã loại khỏi middleware nên không tốn lượt kiểm phiên).
- **Offline chuyển hẳn sang địa chỉ `/pos/offline`** thay vì trả HTML cũ dưới địa chỉ `/pos`: HTML cũ mang dữ liệu cũ
  không ghi giờ, và bộ định tuyến Next hydrate sai cây trang.
- **Offline duration do database tính**, không phải cầu in gửi `offline_seconds` như plan viết — cùng kết quả, không phải
  cập nhật cầu in ở các quán (bản cầu in giữ 3).
- Đơn không bàn trong bản chụp **không** có tên khách — số đơn đủ để giao món (không lưu PII ngoài phạm vi cần).
- Không làm "Có bản mới — tải lại": service worker không bao giờ phục vụ HTML cũ khi có mạng nên không có gì để kẹt.

## Bằng chứng

```
npx vitest run tests/offline tests/print      → snapshot 5, phieu-cho 4, in-tu-thiet-bi +2 (P17) — xanh
npx vitest run tests/rls/printer-heartbeat    → 16 passed (+1: khoảng hở > 90 giây ghi đúng từ lúc / bao lâu)
playwright tests/e2e/mat-mang.spec.ts         → 1 passed: POS → offline → tải lại → /pos/offline có bàn, đơn, thực đơn;
                                                 nút khóa kèm lý do; có mạng lại → "Quay lại POS"
playwright tests/e2e/cau-in.spec.ts           → 7 passed, 2 bỏ qua có sẵn (pho-viet không có đơn "cần in"):
                                                 băng + số phiếu + danh sách + "Không in bù"; KDS thấy băng; chế độ
                                                 trình duyệt không thấy; điện thoại gửi phiếu khi cầu in chết → pending
Chrome Page.getInstallabilityErrors           → [] ở /pos, /kds, /admin
```

Ảnh: `anh/1-man-offline.png` (màn xem lúc mất mạng), `anh/2-bang-phieu-cho.png` (băng + danh sách phiếu chờ).

**Dữ liệu 4G khi cầu in chạy qua hotspot (ước tính, CHƯA đo):** poll 2–10 giây (giãn khi rảnh) + nhịp tim 30 giây ≈
1–3 MB/giờ; mỗi hóa đơn in qua cầu in thêm ~20–50 KB ảnh. Một buổi tối 4 giờ ≈ 5–15 MB. Đo thật trong buổi diễn tập.

## Còn mở (cần người ở quán)

- **17-01 nghiệm thu 2–3**: rút dây mạng máy quầy thật → tải lại POS (ảnh/video); cài lên màn hình chính iPad + Android (ảnh).
  iOS Safari có thể xóa dữ liệu trang sau vài tuần không mở — máy quầy chính nên là Windows/Android.
- **17-02 bước 0 + nghiệm thu**: Windows tự nối hotspot ≤ 60 giây khi rút router; PC nối máy in bằng dây LAN + Internet bằng
  hotspot cùng lúc vẫn in được; rút router giữa lúc gửi 5 phiếu từ điện thoại 5G → 5 phiếu ra đủ, không trùng.
- **17-03 diễn tập 20 phút** (0 phiếu mất, 0 trùng, doanh thu khớp, đo dữ liệu 4G) ⇒ OFFLINE-04.
- Server action của Next chạy **nối tiếp** trên một trang: bàn nhiều đơn thì lệnh xếp phiếu có thể đứng sau hàng chục lượt
  hỏi trạng thái in (E2E thấy trễ ~10–20 giây trên bàn 19 đơn). Có từ trước P17, nên xem lại riêng.
- QD-024 C2 (hotspot điện thoại quản lý) đã làm theo đề xuất — chủ dự án xác nhận sau buổi diễn tập.

## Giả lập mất mạng với cầu in thật (28/09/2026)

Chủ dự án: thử thật ở quán để sau, trước mắt giả lập. Ngoài E2E đã có (`mat-mang.spec` — POS offline; `cau-in.spec` —
băng cảnh báo, điện thoại xếp phiếu khi cầu in chết), thêm **`tests/rls/cau-in-mat-mang.test.ts`**: chạy **`print-bridge.mjs`
thật** (bản chép ở thư mục tạm, không `POS_URL` ⇒ không tự cập nhật) nối Supabase qua **proxy cục bộ có công tắc mạng**, máy
in là **máy in giả TCP** đếm từng tờ. Tắt công tắc = quán mất Internet nhưng cầu in vẫn sống, máy in LAN vẫn nối.

| Ca | Kết quả |
|---|---|
| Có mạng: 1 phiếu | 1 tờ, `printed` |
| Mất mạng → xếp 5 phiếu + 1 phiếu 40 phút trước → có mạng lại | 5 tờ, mỗi phiếu đúng 1 tờ; phiếu 40 phút **không** in bù, vẫn `pending` |
| Mạng rớt **ngay sau** khi máy in ra giấy, trước khi báo "đã in" | **Lỗi thật — in 2 tờ** (phiếu vẫn `pending` → lượt poll sau in lại). Đã sửa → 1 tờ, `printed` sau khi có mạng |

**Sửa cầu in (bản 4):** phiếu đã ra giấy mà chưa báo được lên máy chủ được ghi vào sổ trong bộ nhớ, **không bao giờ in
lại**, đầu mỗi lượt poll báo bù; lỗi báo không còn bị ghi nhầm thành "IN LỖI" / `failed`. Áp cho cả máy in bếp và máy
quầy. `BRIDGE_VERSION` 3 → 4 ⇒ cầu in ở quán (qt-food) tự tải bản mới trong ≤ 1 giờ **sau khi deploy** (PRINT-12).
Giới hạn: sổ nằm trong bộ nhớ — cầu in khởi động lại ĐÚNG lúc đang mất mạng mà còn phiếu chưa báo thì phiếu đó có thể in lại.

```
npx vitest run tests/rls/cau-in-mat-mang.test.ts → trước khi sửa: 2 passed, 1 failed ("phiếu 821 bị in hai lần: [821, 821]")
                                                  → sau khi sửa: 3 passed
npx playwright test mat-mang.spec cau-in.spec     → 10 passed
```

Chưa giả lập được (cần phần cứng): Windows tự nối hotspot ≤ 60 giây; PC nối máy in bằng LAN + Internet qua hotspot cùng lúc;
lượng dữ liệu 4G thật.
