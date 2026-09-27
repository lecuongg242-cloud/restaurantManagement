# P12 — POS và in trên mọi thiết bị

> Lập 26/09/2026. Plan là hợp đồng + nghiệm thu, không phải bản nháp code.
> Quyết định: `15-QuyetDinh/QD-020` · Yêu cầu: PRINT-14, 15, 16, ORDER-19, 20

## Vì sao P12 là việc này

Chủ dự án muốn nhân viên dùng **điện thoại, iPad, tablet** như máy quầy, và **in được từ các thiết bị đó**.
Hôm nay:

- Màn POS vỡ dưới ~1024px (cột bàn 320px + cột đơn 416px cố định). iPad dọc không dùng được.
- Điện thoại chỉ có `/pos/m` — gọi món, không bill, không thu tiền.
- Cầu in chỉ in phiếu bếp, một máy in LAN, bỏ dấu. Hóa đơn chỉ in được từ máy có cài máy in.

**P12 kết thúc bằng: nhân viên cầm điện thoại hoặc iPad làm trọn một bàn — gọi món, thu tiền, bấm in —
và hóa đơn có dấu ra ở máy in quầy, dù máy in đó cắm USB hay dây mạng.**

## Các plan

| Plan | Yêu cầu | Phụ thuộc | Giá trị khi dừng ở đây |
|---|---|---|---|
| 12-01 Hóa đơn có dấu thành ảnh (server) + thử in thật | PRINT-14 | không | Biết chắc in ảnh có dấu chạy trên máy in thật, có số đo |
| 12-02 Cầu in hai máy in, LAN + USB | PRINT-15 | 12-01, P11 11-05/11-06 | Cầu in in được hóa đơn có dấu ra máy quầy |
| 12-03 In từ mọi thiết bị | PRINT-16 | 12-02, P11 11-04 | Bấm in trên điện thoại → giấy ra ở quầy |
| 12-04 POS co giãn: khung + tablet dọc | ORDER-19 | không | iPad/tablet dọc dùng POS được; máy ngủ dậy không hiện dữ liệu cũ |
| 12-05 POS trên điện thoại | ORDER-20 | 12-04 | Điện thoại làm trọn việc của máy quầy; `/pos/m` về hưu |

**Hai nhánh song song:** nhánh in (12-01 → 12-02 → 12-03) và nhánh màn hình (12-04 → 12-05). Nhánh màn
hình **không** chờ P11; nhánh in chờ P11 11-04..11-06 (không có tự cập nhật thì đổi cầu in = tới từng quán).

| Plan | Migration | Ghi chú |
|---|---|---|
| 12-01 | — | Route ảnh mới + font đóng kèm |
| 12-02 | `0054_printer_roles` | Nhịp tim báo thêm máy in quầy (sửa RPC của 11-06 — **thay** hàm, không overload) |
| 12-03 | — | Có thể cần mở `print_jobs.type` nếu thêm loại; hiện `receipt` + `customer_ticket` đã có trong ràng buộc |
| 12-04, 12-05 | — | Chỉ giao diện |

## Phát hiện khi rà code (26/09/2026)

- `print_jobs.type` đã cho phép `receipt` và `customer_ticket` (0010, 0022) nhưng cầu in chỉ lấy
  `type=eq.kitchen_ticket` (`print-bridge.mjs:569`). Hàng đợi sẵn sàng, chỉ cầu in chưa nhận.
- `BridgePrintAdapter.printReceipt` **luôn** gọi đường trình duyệt ([lib/print/adapter.ts:136](../../../lib/print/adapter.ts)).
- Hóa đơn có view model dùng chung: `lib/billing/receipt-view.ts` → `components/print/ReceiptDoc.tsx`.
  Ảnh PNG phải lấy số từ **cùng** view model — không tính lại tiền ở chỗ thứ hai.
- Cầu in bỏ dấu có chủ đích (`print-bridge.mjs:86`) vì máy in phổ thông không có CP1258 — lý do chọn in ảnh.
- Bộ cài đã hỏi "máy in quầy là số mấy" và đặt làm máy in **mặc định của người dùng** — nhưng tác vụ cầu
  in chạy dưới **SYSTEM**, không thấy máy in mặc định của người dùng ⇒ phải lưu **tên** máy in.
- `/pos/m` (`StaffMobileOrder`) **không** nghe realtime; POS đầy đủ thì có ⇒ điện thoại dùng POS đầy đủ làm
  tăng số lần tải lại (PERF-04). Đo lại là tiêu chí của ORDER-20.
- `PosBoard` không tải lại khi tab/máy thức dậy (chỉ `TuLamMoi` của admin có) — điện thoại/iPad ngủ liên
  tục, WebSocket chết trong lúc ngủ ⇒ dễ hiện dữ liệu cũ. Sửa ở 12-04.
- Chưa có web manifest (OPS-04 ☐) — iPad "Thêm vào màn hình chính" sẽ vẫn có thanh Safari.

## Ràng buộc xuyên suốt

- **qt-food dùng POS ở khổ ≥1024 hằng ngày** ⇒ khổ ≥1024 không được đổi một pixel nào ngoài chủ đích.
  Ảnh chụp trước/sau là cổng chặn của 12-04 và 12-05.
- Không chạm nghiệp vụ tiền (`lib/billing/`, `pay_bill`) — P12 chỉ đổi cách hiển thị và đường in.
- Cầu in giữ quy tắc **không thêm gói npm** (PERF-03): giải nén PNG bằng `zlib` có sẵn của Node.
- Test chạy dưới `TZ=UTC`; mỗi plan có `-SUMMARY.md` kèm số đo và ảnh (màn hình, giấy in).

## Không nằm trong P12

| Việc | Vì sao |
|---|---|
| Phiếu bếp có dấu | Đang chạy tốt không dấu; đổi khi quán yêu cầu (QD-020) |
| Định tuyến theo món (bếp / bar) | Chờ quán yêu cầu |
| KDS trên tablet dọc | Ngoài phạm vi câu hỏi |
| App vỏ Sunmi | Để sau (QD-018); PNG của 12-01 dùng lại được cho nó |
| PWA toàn màn hình (manifest) | OPS-04; thêm được sau, không chặn dùng POS |
| Viết lại realtime | Chỉ khi số đo sau 12-05 đòi hỏi (QD-019 C5) |
