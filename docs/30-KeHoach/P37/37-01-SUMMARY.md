# P37-01 — Tổng kết: in theo bếp/bar, số liên, in riêng từng món, phiếu hủy món (10/10/2026)

Chủ dự án chốt phạm vi (4 phần) + giao diện A + B ngày 10/10/2026 (`00-TongQuan.md`). **Web + app Windows xong; app Android
CHƯA làm** (máy dev không có JDK/Android SDK — kế hoạch `37-02-PLAN.md`). Phát hành `dev` + `main` 10/10/2026 (`next build` xanh trước khi đẩy); app Windows 1.0.6 chưa build.

## File đã đổi

| Phần | File | Thay đổi |
|---|---|---|
| DB | `supabase/migrations/0087_kitchen_stations.sql` (mới) | Bảng `kitchen_stations` (tên, Bếp chính `is_default` ≤ 1/quán, số liên 1–3, in từng món) + RLS: đọc mọi thành viên, ghi chủ/quản lý. `menu_categories.station_id` (khóa ngoại đôi `(tenant_id, station_id)` — chỉ trỏ bếp/bar cùng quán; xóa nơi → `set null (station_id)`). `print_jobs.type` thêm `cancel_ticket`. **Đã áp DB dùng chung** 10/10 (chỉ thêm, không xóa dữ liệu) + ghi `schema_migrations` 0087 + `schema-snapshot.json` |
| Server | `lib/print/stations.ts` (mới) | Đọc bếp/bar (Bếp chính ngầm nếu quán chưa lưu), chia món theo nơi, `target_station` (Bếp chính = `"kitchen"` để cầu in cũ vẫn đúng) |
| | `lib/print/kitchen-ticket.ts` | Tách phần đọc đơn; `buildKitchenTickets` (một phiếu mỗi nơi có món, kèm `stationName` khi > 1 nơi, `copies`, `perItem`); `buildCancelTickets` |
| | `app/r/[slug]/print/actions.ts` | Phiếu bếp gửi cầu in → nhiều dòng `print_jobs` trong MỘT insert (cùng `created_at`); in trình duyệt vẫn một tờ gộp |
| | `lib/print/trang-thai.ts` | `toState` gộp các phiếu cùng lượt (cùng `created_at`) → chip "đã in" không đếm ×2 |
| | `lib/print/cancel-ticket.ts` (mới), `app/r/[slug]/pos/actions.ts` | Hủy món / hủy đơn đã gửi bếp → `cancel_ticket` ra đúng nơi. Chỉ khi quán in qua cầu in, cầu in sống **và cầu in ≥ bản 5** (bản cũ không lấy loại phiếu này) |
| | `lib/print/adapter.ts` | Kiểu `KitchenTicketView` + `stationName/copies/perItem`; `CancelTicketView` |
| Web | `app/r/[slug]/admin/(protected)/printers/page.tsx`, `StationManager.tsx` (mới), `actions.ts` (mới) | Tab **Tình trạng · Bếp / Bar**; bảng Tên · Nhóm món · Số liên · In từng món; hộp thoại Thêm/Sửa (nhóm đang ở nơi khác ghi "(đang ở …)"), Xóa (hỏi lại). Điện thoại: danh sách thẻ |
| | `components/ui/modal.tsx` (mới), `tables/TableDialogs.tsx` | Tách hộp thoại dùng chung (không đổi hành vi trang Bàn & QR) |
| Cầu in | `scripts/print-bridge.mjs` | **BRIDGE_VERSION 5**. Đọc `target_station`; `KITCHEN_STATIONS` (máy LAN từng bếp/bar) — nơi chưa cài → máy quầy → máy Bếp chính; tên nơi to đầu phiếu; số liên; in riêng từng món; phiếu **HUY MON**; `COUNTER_COPIES` (số liên hóa đơn); `TEST_STATION_NAME` cho In thử. Phiếu không có trường mới → **giống từng byte** bản cũ |
| App Windows | `desktop/lib/noi-in.mjs` (mới), `cau-hinh.mjs`, `moi-truong.mjs`, `main.mjs` | Đọc bếp/bar bằng tài khoản printer; lưu `mayIn.noi` + `mayIn.lienHoaDon` (tệp cũ đọc ra `{}`/1, không đổi phiên bản tệp); In thử từng nơi |
| | `desktop/trang/cai-dat-may-in.html/.js`, `chung.css` | Thẻ "Máy in bếp / bar": Bếp chính + từng bếp/bar (LAN / Không có — in ra máy in quầy, Dò máy in, In thử); "Số liên hóa đơn"; mất mạng → cảnh báo, giữ máy đã lưu; ô USB không cắt chữ. App Android (chưa trả danh sách) → màn y như cũ |
| Tài liệu | `docs/60-BanGiao/03-CaiDat.md`, `06-HuongDan-QuanLy.md` | Hướng dẫn tab Bếp / Bar |

## Bằng chứng

- `npm test` → **106 file / 1113 test xanh**; `npx tsc --noEmit` sạch.
  - `tests/print/p37-bep-bar.test.ts` 14/14: phiếu không tên nơi **giống từng byte** file mẫu Android `phieu-bep-48.hex`; số liên N → N lệnh cắt; in từng
    món → mỗi tờ đúng một món; phiếu hủy đủ trường; chọn máy theo nơi; chia món theo nhóm; `toState` gộp lượt.
  - `tests/desktop/cau-in-app.test.ts` (+2): **cầu in thật** + Supabase/máy in giả: Bếp chính → máy bếp, bar → máy bar (2 liên), nơi chưa cài →
    máy quầy, HỦY MÓN → máy bar; In thử ghi tên nơi.
  - `tests/desktop/p37-noi.test.ts` 4/4: đọc bếp/bar bằng tài khoản printer; cấu hình; biến môi trường.
- `tests/rls/matrix.test.ts` → **232/232** trên DB thật (thêm `kitchen_stations` vào ma trận cách ly TENANT-05, 33 bảng).
- E2E `tests/e2e/p37-bep-bar.spec.ts` → **2/2** (quán demo, dọn sạch): thêm bếp/bar + tích "Đồ uống" + 2 liên → DB đúng; đơn có món 2 nhóm →
  "Phiếu bếp" → 2 phiếu `pending` đúng nơi/món/số liên, chip không ×2; hủy món đồ uống → 1 `cancel_ticket` ra quầy pha chế; cầu in bản 4
  → hủy món không xếp phiếu; 360px không tràn ngang.
- Ảnh: `anh/01-them-bep-bar.png`, `02-tab-bep-bar.png`, `03-bep-bar-360.png`, `04-app-cai-dat-may-in.png` (trang thật của app, dữ liệu
  giả), `05-app-mat-mang.png`.
- E2E in ấn cũ chạy lại: `cau-in` 7/7 (+2 bỏ qua vì quán demo không có đơn cần in), `print-mode` 2/2, `in-trung` B xanh. **Đỏ có sẵn,
  không do P37**: `p35` (giả định "hôm nay không có đơn Tại quán khác" sai sau nhiều lượt chạy), `in-tu-dien-thoai` test "cầu in CHẾT"
  (chạy trên code **trước** P37 bằng `git stash` cũng đỏ, còn đỏ thêm 1 test). `tests/rls/print-dedupe` đỏ vì **đồng hồ máy dev chạy
  nhanh 7 giờ** (Node 11:22Z, DB 04:22Z) — test so giờ máy với giờ DB.

## Còn lại

| Việc | Ghi chú |
|---|---|
| **App Android** (PRINT-21/22/23 trên Android) — kế hoạch `37-02-PLAN.md` (chủ dự án 10/10: đưa vào plan) | Cầu in Kotlin (`CauInDichVu.kt`, `EscPos.kt`, `MainActivity.kt`, `cau-noi-android.js`) cần: đọc `target_station` + `cancel_ticket`, máy theo nơi, số liên, in từng món, phiếu hủy, đọc danh sách bếp/bar. Máy dev không có JDK/Android SDK → không build/test được. Trong lúc chờ: app Android bản hiện tại in MỌI phiếu bếp ra máy của nó như trước (bỏ qua `target_station`), không nhận phiếu hủy (server không xếp cho cầu in < 5) |
| Phát hành app Windows 1.0.6 | Cầu in đóng gói trong app — chưa có bản mới thì máy quầy dùng app 1.0.5 vẫn in như cũ (mọi phiếu ra một máy). Cầu in cài kiểu cũ (zip) tự cập nhật lên bản 5 khi web lên production |
| Thử máy in thật | Chưa in ra giấy thật trên 2 máy in LAN |

## Trạng thái cam kết

| Mã | Trạng thái |
|---|---|
| PRINT-19 Bếp/bar trên web | ☑ E2E + RLS |
| PRINT-20 Phiếu tách theo nơi | ☑ E2E + unit + cầu in thật (giả lập) |
| PRINT-21 Chọn máy theo nơi trên app | ◐ Windows ☑ (unit + cầu in thật + ảnh trang); Android ☐ |
| PRINT-22 Số liên + in từng món | ◐ Windows ☑; Android ☐ |
| PRINT-23 Phiếu hủy món | ◐ server + Windows ☑; Android ☐ (server không xếp cho cầu in cũ) |
