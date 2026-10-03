# QD-032 — Bếp báo xong, phục vụ "Mang ra": vé rời màn bếp khi món đã mang ra

**Ngày:** 03/10/2026 · **Trạng thái:** ĐÃ CHỐT (chủ dự án 03/10/2026: "Ba vấn đề nặng nhất… xử lí luôn").
**Sửa:** QD-007 (đoạn "Vé KDS tự rời… khi thanh toán… chấp nhận ở V1"). **Kế hoạch:** `30-KeHoach/P27/` · **Yêu cầu:** ORDER-04

## Bối cảnh

QD-007 chọn cho vé bếp tự rời màn khi thanh toán, vì lúc đó KDS chỉ để xem. Ở 150 bàn cùng lúc, màn bếp có 236 vé, vé nào cũng
"TRỄ": vé của bàn đã ăn xong vẫn nằm trên cùng, còn đơn mới bị đẩy xuống cuối, cách 28 màn. KiotViet, Sapo và CUKCUK đều cho bếp
báo xong và để phục vụ xác nhận đã mang ra (KiotViet "Đã cung ứng", Sapo "Trả đồ", CUKCUK "Ẩn món đã trả").

## Quyết định

| # | Việc | Chọn | Vì sao | Bị loại |
|---|---|---|---|---|
| D1 | Bếp báo xong | Món chuyển `queued`/`preparing` → **`ready`** (trạng thái sẵn có, `ITEM_FLOW` đã cho phép). "Trả lại" đưa `ready` → `queued` khi chưa mang ra | Không thêm trạng thái mới | Thêm trạng thái mới (phải sửa CHECK, bill, báo cáo) |
| D2 | Đã mang ra | Cột mới **`order_items.delivered_at`** (+ `delivered_by`). **Không** dùng `served` | Cả hệ thống coi `served` = **đã thu tiền**: `payBill` đánh `served`; đóng phiên, chặn hủy món, gộp bàn, tìm bàn ghép, hóa đơn đều dựa vào đó. Đổi nghĩa `served` là rủi ro cho tiền | Đánh `served` khi mang ra |
| D3 | Vé rời màn bếp | Món hiện ở KDS khi chưa `served`/`cancelled` **và** `delivered_at` còn rỗng | Bếp chỉ thấy việc còn phải làm hoặc còn chờ mang | Giữ tới thanh toán (QD-007) |
| D4 | Trạng thái đơn | Đơn **tại bàn** tự tính lại sau khi bếp bấm: mọi món còn lại `ready` → đơn `ready`; có món `preparing`/`ready` → `preparing`; còn lại giữ `confirmed`. Đơn online / mang về **không** tự đổi trạng thái đơn | Đơn `preparing` trở đi thì không còn bị nhắc "Cần in" (đúng chú thích ORDER-16 trong `pos.ts`). "Sẵn sàng" của đơn online do `/pos/online` điều khiển, không để bếp đổi hộ | Đổi trạng thái mọi đơn |
| D5 | Ai bấm | "Xong", "Trả lại": vai trò vào được KDS (kitchen, station, owner, manager). "Mang ra": vai trò vào được POS | Theo `canAccess` hiện có, không thêm quyền | — |

## Hệ quả

- Migration `0083`: hai cột có thể rỗng, không đổi dữ liệu cũ. Code production cũ không đọc tới nên áp trước khi deploy vẫn an toàn.
- Quán không dùng KDS: không có món `ready`, POS không hiện nút "Mang ra"; mọi thứ như cũ.
- Nhãn món `served` ở POS đổi từ "Đã thu" thành **"Đã thanh toán"**, cho khỏi lẫn với "Đã mang ra".
- Hao hụt kho (QD-017 D2) không đổi: dùng theo đơn vẫn tính theo món chưa hủy hoặc hủy sau khi in, không phụ thuộc `ready` hay `delivered_at`.
