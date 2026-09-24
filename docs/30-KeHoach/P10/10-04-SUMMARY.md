# 10-04 — Summary: Báo cáo lãi gộp theo món & hao hụt

> Yêu cầu: REPORT-13, REPORT-14 (+ INV-10). Làm 24/09/2026. TDD.

## Kết quả

| Cam kết | Trạng thái | Bằng chứng |
|---|---|---|
| REPORT-13 lãi gộp theo món | ◐ code + kiểm xong | `margin-report.test.ts` 10/10 trên DB thật: SQL phân bổ giảm giá **= `allocateDiscount`** (giảm 10% và giảm 20.000đ → [14.285, 35.715]); **Σ doanh thu thuần = Σ (subtotal − discount)** đối chiếu truy vấn thẳng, có cả bill **chia đều** và bill gộp; món thuần + phí + VAT = KPI; giá vốn đúng ngày chốt, option cộng vào dòng; món đã xóa vào "chưa có giá vốn"; quán B → 0 dòng; anon bị chặn. E2E: dựng hóa đơn hôm nay → dòng món hiện giá vốn 20.000₫, lãi/phần 30.000₫, "tạm tính"; **dòng nối bắt đầu bằng đúng số KPI trên cùng trang** |
| REPORT-14 hao hụt | ◐ | `waste.test.ts`: Σ 4 nguồn = tổng; chưa kiểm → không có nguồn "không giải thích" (hiện "chưa kiểm", không hiện 0); đếm dư giữ số âm; thiếu giá đếm riêng; 5 ngày cùng dấu → "có thể định lượng khai sai", 4 ngày hoặc đổi dấu → không |
| INV-10 | ☑ | E2E: quán chưa khai nguyên liệu → **không có** hai khối trong trang; khai rồi → có |

## Đối soát trên dữ liệu thật (chỉ đọc, transaction `read only`)

qt-food, 01/08 → 24/09/2026:

| | Số |
|---|---|
| KPI doanh thu (`report_summary`) | **571.755.000đ**, 5.392 hóa đơn |
| Món thuần + phí phục vụ + VAT | 571.755.000 + 0 + 0 |
| **Lệch** | **0đ** |
| Σ doanh thu thuần 7.101 dòng món | 571.755.000đ |
| Bill có Σ `bill_items.amount` ≠ `subtotal` | 0 |

**Giới hạn phải nói rõ:** qt-food **chưa từng** giảm giá hay chia đều bill trong kỳ (0 bill giảm giá,
0 vỏ chia đều). Hai nhánh đó chỉ được kiểm bằng dữ liệu dựng sẵn trong `margin-report.test.ts`.
Lần đầu quán thật giảm giá hoặc chia bill, nên mở báo cáo xem dòng "chênh lệch làm tròn khi chia bill".

## Số đo

| | Kết quả |
|---|---|
| `npm run test` | **568/568**, 48 file |
| `npm run test:rls` | **248/248**, 14 file; ma trận 23 bảng |
| E2E `inventory.spec.ts` | **6/6**; hồi quy POS `p3` + `order15-mobile` + `in-trung` 3/3 (2 skip có sẵn từ trước: một `fixme`, một cần đơn đang mở) |
| `schema:check` · `tsc` · `lint` · `build` | sạch (30 bảng, 33 hàm) |
| `report_gross_margin` qt-food, kỳ **400 ngày**, 7.101 dòng | **196 ms** DB (ngưỡng plan: 1 s) |
| `report_margin_reconcile` / `report_waste` | 15 ms / 0,5 ms |

Migration **0048 + 0049 đã áp**.

## Lệch so với plan

- **Thêm migration 0049** (plan dự kiến chỉ 0048): lãi gộp phải tính trên **doanh thu của đúng các
  dòng có giá vốn**. Chia theo tỷ lệ số phần là sai vì mỗi dòng mang mức giảm giá khác nhau. 0048 đã
  áp nên không sửa được tại chỗ; 0049 drop + create hai hàm và cấp lại quyền.
- Thêm `report_margin_lines` (hàm dùng chung) và `report_margin_open_lines` (dòng hôm nay để server
  "tạm tính") — plan chỉ nêu 3 hàm.
- Mẫu số % hao hụt = **doanh thu món thuần** (cùng mẫu số khối lãi gộp), không phải KPI có phí + VAT.

## Cạm bẫy gặp thật

- E2E báo cáo bản đầu **xanh mà không kiểm gì**: quán demo không có hóa đơn nào trong 30 ngày nên
  khẳng định "dòng nối khớp KPI" nằm trong `if` và bị bỏ qua. Đã sửa: test tự dựng hóa đơn hôm nay
  rồi khẳng định vô điều kiện.
- E2E INV-10 đỏ vì nguyên liệu của test trước chỉ dọn ở `afterAll` → test tự dọn trước khi kiểm.

## Còn chờ

Checkpoint người thật: chủ quán đọc khối lãi gộp sau một tuần có dữ liệu thật và xác nhận thứ tự món
"đáng tiền" khớp cảm nhận của họ — hoặc chỉ ra chỗ định lượng khai sai.
