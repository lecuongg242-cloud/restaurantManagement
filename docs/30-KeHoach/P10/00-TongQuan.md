# P10 — Định lượng, tồn trong ngày, giá vốn & hao hụt

> Lập 24/09/2026. Plan là hợp đồng + nghiệm thu, không phải bản nháp code.
> Nghiên cứu nghiệp vụ: `00-NghienCuu-NghiepVu.md` · Quyết định: `15-QuyetDinh/QD-017`
> Yêu cầu: INV-01..10, REPORT-13, REPORT-14

## Vì sao P10 là việc này

V1 ghi "không quản lý kho nguyên liệu (chỉ bật/tắt hết món)" và báo cáo dòng tiền 12/08 ghi "không
làm được lợi nhuận/biên lãi — `menu_items` chưa có giá vốn". Chủ quán đang bán mà **không biết một
bát lãi bao nhiêu**, còn thu ngân chỉ biết món hết khi bếp chạy ra báo.

**P10 kết thúc bằng: chủ quán xem được lãi gộp từng món và số hụt mỗi ngày; thu ngân thấy cảnh báo
"có thể đã hết" trước khi gọi món cho khách.**

## Các plan

| Plan | Yêu cầu | Phụ thuộc | Giá trị khi dừng ở đây |
|---|---|---|---|
| 10-01 Nguyên liệu, định lượng, công thức bán thành phẩm | INV-01, 02, 03 | không | Chủ quán thấy **giá vốn/phần + food cost %** từng món |
| 10-02 Nhập buổi sáng, chế biến mẻ, số phần trên POS | INV-04, 05, 06, 07 | 10-01 | Thu ngân thấy **"còn ~N" / cảnh báo vàng** |
| 10-03 Kiểm kê, xuất hủy, chốt sổ ngày | INV-08, 09 | 10-02 | Tồn đầu ngày đúng, số quá khứ bất biến |
| 10-04 Báo cáo lãi gộp & hao hụt | REPORT-13, 14 | 10-03 | Chủ quán thấy **lãi từng món, hụt vì đâu** |

INV-10 (tắt mặc định, không hồi quy) là tiêu chí của **mọi** plan, không phải plan riêng.
Chạy tuần tự: mỗi plan dựng trên dữ liệu của plan trước.

| Plan | Migration | Bảng mới | Ma trận RLS |
|---|---|---|---|
| `10-01-PLAN.md` | `0045_ingredients` | `ingredients`, `recipe_lines` | 18 → 20 |
| `10-02-PLAN.md` | `0046_stock_ledger` | `stock_entries`, `production_batches` + RPC tồn/số phần | → 22 |
| `10-03-PLAN.md` | `0047_daily_close` | `daily_closes` (chỉ select + insert) | → 23 |
| `10-04-PLAN.md` | `0048_margin_waste_rpcs` | — (3 RPC báo cáo) | 23 |

## Phát hiện khi rà code (24/09/2026)

- `bill_items.amount` là giá niêm yết, **chưa trừ giảm giá**. Bản đầu của QD-017 D8 và REPORT-13 dùng
  thẳng con số này → đã sửa: phân bổ giảm giá về từng món, đối soát với `subtotal − discount_amount`.
- REPORT-14 bản đầu ghi "Σ 4 nguồn = chênh lệch kiểm kê" → sai về số học (hủy sau khi làm đã nằm
  trong lượng dùng lý thuyết, hụt mẻ không đi qua tồn). Đã sửa thành "Σ 4 nguồn = tổng hao hụt".
- Thực đơn POS lấy từ cache dùng chung với trang khách (PERF-02) → số phần phải đi đường riêng, không
  nhét vào `getCustomerMenu` (vừa cũ vừa lộ cho khách).
- `tests/rls/matrix.test.ts` khóa cứng `toHaveLength(18)` → mỗi plan có bảng mới phải tăng số này.

## Ràng buộc xuyên suốt

- **qt-food đang bán hàng thật.** Thử trên `pho-viet`, `bun-bo`. qt-food bật khi chủ quán đồng ý.
- **Không chạm luồng tạo đơn và đóng bill.** Lượng dùng được *tính* từ đơn (QD-017 D1), không có
  trigger trên `order_items`. Diff của P10 trong `lib/orders/create-order.ts` và `lib/billing/`
  phải bằng 0.
- Mọi bảng mới: `tenant_id` + RLS + vào ma trận TENANT-05; `schema-snapshot.json` cập nhật cùng
  migration (OPS-07).
- Mọi phép tính ngày theo giờ VN, test chạy dưới `TZ=UTC` (OPS-08).
- Mỗi plan kết thúc bằng `-SUMMARY.md` có **số đo**.

## Không nằm trong P10

| Việc | Vì sao |
|---|---|
| Tự khóa món khi hết | Chủ dự án chốt: chỉ cảnh báo vàng (QD-017 C2) |
| Khách QR thấy số phần | Chủ dự án chốt: chỉ nhân viên (C4) |
| Bếp nhập nguyên liệu trên KDS | Chủ dự án chốt: manager/owner nhập (C4) |
| Nhà cung cấp, công nợ, đơn đặt hàng | Nghiệp vụ mua hàng/kế toán, không phải vận hành ca |
| Nhiều kho, chuyển kho | Chờ V2-A đa chi nhánh |
| Dự báo lượng mua, menu engineering | Cần vài tuần dữ liệu thật sau P10 |
| Ngưỡng "còn ~N" cài theo quán | Hằng số 5 cho tới khi có quán thật yêu cầu |
