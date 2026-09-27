# P11 — Chuẩn bị lên 50 quán

> Lập 26/09/2026. Plan là hợp đồng + nghiệm thu, không phải bản nháp code.
> Quyết định: `15-QuyetDinh/QD-019` · Số đo nền: `40-KiemTra/PERF-04-DoRealtimeQtFood.md`
> Yêu cầu: OPS-09 (hoàn tất), OPS-10, OPS-11, TENANT-07, PRINT-10..13

## Vì sao P11 là việc này

Đo thật trên qt-food (26/09/2026): ~670 lần render POS/ngày, ~21ms DB mỗi lần. Ngoại suy 100 quán cỡ này
≈ 90 truy vấn/giây giờ đỉnh — **tải không phải thứ chặn đường**. Thứ chặn đường là vận hành:

- Mất database hôm nay vẫn là sự cố — sao lưu chỉ có khi ai đó chạy tay.
- Hệ thống lỗi thì người biết đầu tiên là chủ quán, không phải chúng ta.
- Một quán bị dội request thì mọi quán cùng chậm (chung một database).
- Chế độ in là công tắc build-time **chung cho mọi quán** — không thể có quán in trình duyệt cạnh quán dùng cầu in.
- Bộ cài cầu in đóng gói riêng từng quán, **kèm mật khẩu**, cần winget, và không tự cập nhật — 50 quán là 50 chuyến đi mỗi lần sửa.

**P11 kết thúc bằng: nhận quán mới mà không cần tới tận nơi để đóng gói riêng, có người được báo khi hệ
thống lỗi, dữ liệu có bản sao mỗi đêm nằm ngoài Supabase, và một quán không kéo chậm quán khác.**

## Các plan

| Plan | Yêu cầu | Phụ thuộc | Giá trị khi dừng ở đây |
|---|---|---|---|
| 11-01 Sao lưu tự động mỗi đêm | OPS-09 | không | Mất DB không còn là thảm họa |
| 11-02 Theo dõi lỗi + sống/chết | OPS-10 | không | Biết hệ thống lỗi trước chủ quán |
| 11-03 Giới hạn tần suất đường ẩn danh | TENANT-07 | không | Một quán bị dội không kéo chậm cả hệ thống |
| 11-04 Chế độ in theo từng quán | PRINT-10 | không | Quán mới dùng in trình duyệt, không cần cầu in |
| 11-05 Bộ cài chung + mã kích hoạt | PRINT-11 | 11-04, 11-03 | Một gói cài cho mọi quán, không mật khẩu trong gói |
| 11-06 Tự cập nhật + bảng cầu in `/super` | PRINT-12, 13 | 11-05 | Sửa cầu in không phải tới quán; thấy quán nào hỏng |
| 11-07 Bộ tài liệu bàn giao | OPS-11 | 11-04, 11-05 | Người ngoài nhóm dựng được quán mới |

**Thứ tự đề xuất:** 11-01 → 11-02 → 11-03 → 11-04 → 11-05 → 11-06 → 11-07.
11-01..11-04 độc lập nhau; làm theo thứ tự rủi ro giảm dần (mất dữ liệu > mù lỗi > spam > in).

| Plan | Migration | Bảng/RPC mới | Ma trận RLS |
|---|---|---|---|
| 11-01 | — | — (workflow CI) | — |
| 11-02 | — | — (`/api/health`, Sentry) | — |
| 11-03 | `0050_rate_limit` | `rate_limit_hits` + RPC `rate_limit_hit` | không có `tenant_id` — chỉ service-role chạm |
| 11-04 | `0051_print_mode` | — (dữ liệu `tenants.settings`) | — |
| 11-05 | `0052_bridge_activation` | `bridge_activation_codes` | có `tenant_id` → vào ma trận TENANT-05 |
| 11-06 | `0053_bridge_version` | cột `printer_heartbeats.version` + RPC nhịp tim thêm tham số | — |

## Phát hiện khi rà code (26/09/2026)

- **OPS-09 đã có** tiêu chí "sao lưu chạy theo lịch" (◐, hoãn ở QD-015) → 11-01 **hoàn tất OPS-09**, không mở mã mới.
- `getPrintAdapter()` ([lib/print/adapter.ts:148](../../../lib/print/adapter.ts)) giữ **singleton** theo env build-time;
  `CauInBanner` và `TicketPrintButtons` đọc thẳng `process.env.NEXT_PUBLIC_PRINT_MODE` ở cấp module → cả ba phải
  nhận chế độ từ props/server, không chỉ sửa một chỗ.
- `printer_heartbeat(p_printer_ok, p_printer_host)` đã có tham số mặc định (0044). Thêm `p_version` phải
  **thay** hàm 2 tham số, không tạo overload — nếu không PostgREST báo mơ hồ khi cầu in cũ gọi.
- Tác vụ nền `CauInBep` chạy `print-bridge.bat` dưới SYSTEM lúc khởi động; bat **tự chạy lại** node khi thoát
  với mã ≠ 3 → tự cập nhật chỉ cần thoát với mã khác 3 sau khi thay tệp.
- Bộ cài hiện mặc định `C:\cau-in-qt-food`; qt-food đang chạy ở đó → bộ cài mới phải **tìm và dừng** bản cũ
  (bài học P9: cài lại không tắt bản cũ = in trùng).
- Cầu in chỉ dùng thư viện có sẵn của Node (PERF-03: "không thêm gói npm nào") → kèm Node portable là đủ, không cần `npm install` ở quán.
- Đăng nhập nhân viên đã có throttle riêng (`staff_login_throttle`) → 11-03 không đụng.
- Không có `/api/health` nào hiện có.

## Ràng buộc xuyên suốt

- **qt-food đang bán hàng thật (5h–10h sáng).** Deploy ngoài giờ bán. Thử trên `pho-viet`, `bun-bo` trước.
- **Không chạm luồng tạo đơn và đóng bill** ngoài một lời gọi giới hạn tần suất ở đầu route (11-03).
- Bảng mới có `tenant_id` → RLS + ma trận TENANT-05; `schema-snapshot.json` cập nhật cùng migration (OPS-07).
- Test chạy dưới `TZ=UTC` (OPS-08).
- Mỗi plan kết thúc bằng `-SUMMARY.md` có **số đo** và bằng chứng.

## Không nằm trong P11

| Việc | Vì sao |
|---|---|
| Lên Supabase Pro | Chủ dự án làm khi mở rộng (QD-019 C1) |
| Tên miền riêng | Chưa cần (C2) |
| App vỏ Sunmi | Để sau (C3, QD-018) |
| Hóa đơn điện tử | Để sau (C4) |
| Viết lại `router.refresh()` | Số đo chưa đòi hỏi (C5); đo lại khi có quán ≥4 màn / ≥300 đơn/ngày |
| Đóng `.exe` + ký mã | Node portable giải quyết đúng vấn đề (winget) mà không phá tự cập nhật (QD-019 D7) |
| Hợp đồng/SLA, thu phí | Cần chủ dự án quyết giờ hỗ trợ; BILLING ở V3 |
| Thử tải giả lập 50 quán | Cổng 50 quán, sau P11 |
