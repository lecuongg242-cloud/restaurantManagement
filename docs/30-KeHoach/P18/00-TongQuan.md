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

## Đối thủ làm thế nào (tra 28/09/2026)

| | AI / dự báo | Gợi ý nhập | Nhận xét / cảnh báo tự động |
|---|---|---|---|
| **KiotViet** | Gói Cao cấp 490k: "Phân tích kinh doanh thông minh với AI" (Bán hàng / Hàng hóa / Khách hàng / Tài chính); có "Dự báo hết hàng", "dự đoán bán chậm" [1][2]. Biểu đồ dự báo doanh thu: không tìm thấy | "Định mức tồn" min/max từng hàng [3] | Thông báo app Quản lý "1 lần/ngày vào buổi sáng" (tồn kho, cận hạn), bật/tắt từng loại [4] |
| **Sapo FnB** | AI chỉ cho chat / mô tả sản phẩm [5]; Tổng quan có "DOANH THU TỔNG HỢP", "MẶT HÀNG BÁN CHẠY" [6] | không tìm thấy | không tìm thấy |
| **CUKCUK** | "Trợ thủ AI" (MISA AVA): ảnh, mô tả món, tự sinh định lượng [7]. Dự báo: không tìm thấy | Phiếu "Đề xuất mua nguyên vật liệu": **SL đề nghị = SL cần − SL tồn** [8] | Cảnh báo tồn tối thiểu |
| **iPOS** | "Trợ lý ảo FABi" trong app FABi Manager: **dự báo doanh thu 1 tuần kế tiếp**, so với hôm qua và cùng kỳ tuần trước theo % [9] | không tìm thấy | Thông báo đẩy mỗi ngày: doanh thu tăng/giảm bao nhiêu % [9] |
| **POS365** | Không có AI; báo cáo bán chạy/chậm theo giờ/ngày/tuần | Tồn kho tối thiểu | không tìm thấy |
| Toast (tham khảo) | Email tuần: "Net Sales Upcoming Week" so với tuần trước và cùng tuần năm ngoái; không hiện khoảng sai số [10] | Phải tích hợp bên thứ ba | Email chỉ có số, không lời bình |

**Ta làm theo:** dự báo **7 ngày tới** so với **tuần trước** (iPOS, Toast) · câu so sánh bằng **%** ("tăng X% so với cùng kỳ tuần
trước") · gợi ý nhập theo công thức CUKCUK **cần − tồn** (cần = món dự báo × định lượng) · hiện ở trang chủ admin mỗi sáng.
**Ta khác:** hiện thêm **khoảng sai số + độ chính xác đã kiểm** (không đối thủ nào hiện) — lý do: QD-025 D5, quán nhỏ dao động
mạnh, số dự báo không kèm độ tin cậy dễ bị hiểu là chắc chắn. **Nhận xét tuần bằng lời văn** chưa đối thủ Việt nào có — chỗ khác biệt.
Thông báo đẩy/Zalo để sau (chưa có app).

Nguồn: [1] kiotviet.vn/phi-dich-vu · [2] kiotviet.vn/phan-tich-kinh-doanh-thong-minh-tren-phan-mem-quan-ly-ban-hang ·
[3] kiotviet.vn/wiki-ki-ot-viet/hang-hoa-wiki/dinh-muc-ton · [4] kiotviet.vn/huong-dan-su-dung-kiotviet/ung-dung-tren-mobile-mobile-app/tinh-nang-thong-bao-cua-ung-dung-kiotviet-quan-ly-tren-ios ·
[5] sapo.vn/omniai.html · [6] help.sapo.vn/gioi-thieu-man-hinh-tong-quan-sapo-fnb · [7] helpv2.cukcuk.vn/vi/kb/tro-thu-ai-tren-misa-cukcuk ·
[8] help.cukcuk.de/vi/1020101.htm · [9] ipos.vn/tro-ly-ao-fabi · [10] support.toasttab.com/en/article/Weekly-Performance-Summary-Email-FAQs

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
