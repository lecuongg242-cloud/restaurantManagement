# P18 — AI phân tích và dự báo

> Lập 27/09/2026. Plan là hợp đồng + nghiệm thu, không phải bản nháp code.
> Quyết định: `15-QuyetDinh/QD-025` · Yêu cầu: AI-01..05
> Phụ thuộc: P16 (số liệu tổng hợp sạch, snapshot nhóm món), P15 (chiều chuỗi). 18-02 cần quán bật kho P10.

## Vì sao P18 là việc này

Chủ dự án muốn AI phân tích và dự báo doanh thu, lượng tiêu thụ. Đặt cuối lộ trình vì cần **vài tháng dữ liệu sạch** và các
báo cáo của P16 làm nền. Tới lúc bắt đầu P18, qt-food sẽ có ≥ 6 tháng lịch sử.

**P18 kết thúc bằng: sáng mỗi ngày chủ quán mở admin thấy dự báo doanh thu và số món 7 ngày tới (kèm khoảng sai số và độ chính
xác đã kiểm), gợi ý lượng nguyên liệu cần nhập, và một đoạn nhận xét tiếng Việt về tuần qua với các điểm bất thường.**

## Các plan

| Plan | Yêu cầu | Phụ thuộc | Giá trị khi dừng ở đây |
|---|---|---|---|
| 18-01 Dự báo doanh thu, hóa đơn, số lượng món + backtest | AI-01, AI-02 | P16 16-01 | Có dự báo con số kiểm được, 0 chi phí AI |
| 18-02 Dự báo nguyên liệu + gợi ý nhập | AI-03 | 18-01, P10 bật | Biết sáng mai nhập bao nhiêu |
| 18-03 Nhận xét tuần + phát hiện bất thường bằng mô hình ngôn ngữ (miễn phí) | AI-04, AI-05 | 18-01 | Chủ quán đọc hiểu số liệu trong 1 phút |

## Phát hiện khi rà code (27/09/2026)

- Không có code/dep/env AI. `recharts` có sẵn để vẽ.
- Dữ liệu nguồn: `bills` (`paid_at`), `bill_items`, `order_items` (snapshot tên/giá), RPC báo cáo 0023 (`report_series`,
  `report_top_items`, `report_hour_dow`); kho `recipe_lines`, `menu_portions`, `inventory_on_hand`, `inventory_usage` (0045–0047).
- `paid_at` ghi lùi được (P16 phát hiện) — dự báo dùng cùng quy ước doanh thu BILL-05 nên nhất quán với báo cáo.
- Lịch GitHub Actions 02:00 VN đã chạy ổn cho sao lưu — khuôn cho job đêm.

## Ràng buộc xuyên suốt

- Con số do thống kê tính (QD-025 D1); mô hình ngôn ngữ **không** được tạo số mới — mọi số trong nhận xét phải có trong dữ liệu
  đầu vào (test kiểm).
- Không gửi PII (QD-025 D6).
- Job đêm lỗi → màn hiện dữ liệu hôm trước kèm ngày, không trắng; lỗi báo về kênh trực sự cố (QD-019).
- **Miễn phí** (chủ dự án 27/09/2026): chỉ dùng gói miễn phí (QD-025 D7); tệ nhất rơi về mẫu câu cố định.

## Không nằm trong P18

| Việc | Vì sao |
|---|---|
| Hỏi đáp tự do bằng chat với dữ liệu | Rủi ro số sai, chi phí khó đoán; xem lại sau khi 18-03 chạy thật |
| Tự đặt hàng nhà cung cấp | Cần P20 (mua hàng) |
| Định giá món tự động | Chưa có yêu cầu |
