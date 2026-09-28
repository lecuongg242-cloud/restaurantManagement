# QD-025 — AI phân tích và dự báo

**Ngày:** 27/09/2026 · **Trạng thái:** ĐÃ TRIỂN KHAI (P18, 28/09/2026) theo các đề xuất D1–D10; U3 dùng mặc định 25%;
U1 để xem lại khi > 100 quán. Chỉnh trong lúc làm: xem "Bổ sung 28/09/2026" cuối tệp. **Kế hoạch:** `30-KeHoach/P18/` · **Yêu cầu:** AI-01..05
**Liên quan:** QD-017 (định lượng), P16 (báo cáo sâu), QD-019 (hạ tầng, trực sự cố)

## Bối cảnh (rà code 27/09/2026)

- Chưa có code, thư viện hay khóa API AI nào (`package.json`, env).
- Dữ liệu: qt-food từ 01/08/2026 (~5.200 hóa đơn/8 tuần). Kho P10 đã có code nhưng **qt-food chưa bật** ⇒ chưa có lịch sử
  tiêu hao nguyên liệu thật; tiêu hao có thể suy ra = số món bán × định lượng khi quán khai định lượng.
- Hạ tầng: Vercel Hobby (cron 1 lần/ngày), Supabase gói miễn phí. Đã có lịch GitHub Actions 02:00 VN (`.github/workflows/sao-luu.yml`).
- KiotViet quảng cáo "phân tích AI, dự báo doanh thu và tiêu thụ" ở gói Cao cấp (490k/tháng).

## Quyết định (đề xuất)

| # | Việc | Chọn | Vì sao | Phương án bị loại |
|---|---|---|---|---|
| D1 | Dự báo con số | **Thống kê thuần**, không dùng mô hình ngôn ngữ: theo thứ trong tuần × xu hướng gần (trung bình có trọng số các tuần gần nhất + điều chỉnh ngày lễ theo lịch), cho doanh thu ngày, số hóa đơn, số lượng từng món 7–14 ngày tới | Rẻ, kiểm được, chạy trong SQL/TS; đủ tốt với quán nhỏ; mô hình ngôn ngữ không giỏi và không ổn định ở phép tính | Gửi chuỗi số cho mô hình ngôn ngữ đoán; thư viện ML nặng |
| D2 | Dự báo nguyên liệu | = số món dự báo × định lượng (P10) → **gợi ý lượng nhập** trừ tồn lý thuyết | Tái dùng P10; không có lịch sử tiêu hao thì vẫn làm được | Mô hình tiêu hao riêng |
| D3 | Phần "phân tích" | Mô hình ngôn ngữ **viết nhận xét tiếng Việt** từ **số đã tổng hợp** (không gửi dữ liệu dòng): tóm tắt tuần, điểm bất thường (doanh thu giảm, hủy món tăng, món tụt hạng), gợi ý hành động | Đây là chỗ mô hình ngôn ngữ mạnh; con số vẫn do D1 tính | Để mô hình tự truy vấn DB |
| D4 | Chạy khi nào | **Job hằng đêm** (GitHub Actions như sao lưu) tính dự báo + nhận xét, lưu bảng; màn chỉ đọc bảng | Không phụ thuộc cron Vercel; chi phí AI cố định mỗi quán mỗi ngày | Gọi AI mỗi lần mở trang |
| D5 | Chất lượng | **Backtest** tự động: dự báo 7 ngày của 4 tuần gần nhất so với thực tế → MAPE. Chỉ hiện dự báo khi đủ **≥ 6 tuần** dữ liệu và MAPE ≤ ngưỡng (U3); luôn hiện khoảng sai số | Không cho số sai trông như chắc chắn | Hiện dự báo từ ngày đầu |
| D6 | Dữ liệu gửi ra ngoài | Chỉ số tổng hợp theo ngày/món/nhóm; **không** gửi SĐT, tên khách, tên nhân viên. Ghi rõ trong điều khoản | CLAUDE.md: không lưu/đẩy PII ngoài phạm vi cần | Gửi dữ liệu thô |

## Chi phí: miễn phí (chủ dự án chốt 27/09/2026 — "tạm thời kiếm AI miễn phí")

Dự báo con số (D1, D2) vốn **0đ** (thống kê tự tính). Chỉ phần nhận xét (D3) cần mô hình ngôn ngữ. Tải thực tế nhỏ: ~50 quán × 1
nhận xét/tuần + vài cảnh báo ≈ 60 lần gọi/tuần, mỗi lần ~4k token vào, ~300 token ra.

So sánh gói miễn phí (tra 27/09/2026 — các hạn mức miễn phí thay đổi thường xuyên, **kiểm lại khi bắt đầu 18-03**):

| Nguồn | Hạn mức miễn phí | Dữ liệu | Ghi chú |
|---|---|---|---|
| **Google Gemini API** (Flash-Lite) | Google không còn công bố số chính thức; bên thứ ba đo ~15 RPM / 500 RPD cho Flash-Lite (Flash chỉ ~20 RPD) | Gói miễn phí: **dữ liệu được dùng để cải thiện sản phẩm** | Tiếng Việt tốt nhất trong nhóm; Việt Nam nằm trong vùng hỗ trợ; hạn mức từng bị cắt (12/2025) |
| **Groq** | ~30 RPM, 1.000 RPD, 8K token/phút | **Không** dùng để huấn luyện | Tiếng Việt khá (chưa thử); phải giãn ~30 giây giữa các lần gọi |
| **Cloudflare Workers AI** | 10.000 neurons/ngày (~58 lần gọi mô hình 70B/ngày) | Hạn mức chính thức, dùng được cho production | Ổn định nhất; tiếng Việt trung bình |
| OpenRouter `:free` | 50 RPD nếu chưa nạp tiền | Tùy bên cung cấp phía sau | Danh sách mô hình đổi liên tục — **không dùng** |
| GitHub Models | — | — | **Đã ngừng** 30/07/2026 |

| # | Việc | Chọn (đề xuất) | Vì sao |
|---|---|---|---|
| D7 | Nguồn mô hình | Chuỗi dự phòng **Gemini Flash-Lite → Groq → Cloudflare Workers AI → mẫu câu cố định** | Cả ba miễn phí và đủ hạn mức; một bên cắt hạn mức thì bên sau chạy; tệ nhất vẫn có bản tóm tắt dựng từ mẫu (0 phụ thuộc) |
| D8 | Rải tải | Mỗi quán nhận xét vào một đêm cố định trong tuần (theo `tenant_id`), ~8 lần gọi/đêm | Nằm xa dưới mọi hạn mức theo ngày |
| D9 | Cấu hình | Tên nhà cung cấp + mã mô hình trong biến môi trường của job | Mô hình miễn phí bị rút thì đổi không cần sửa code |
| D10 | Dữ liệu gửi Gemini miễn phí | Chấp nhận: chỉ số tổng hợp, **không** PII (D6). Ghi vào điều khoản dịch vụ: "số liệu tổng hợp có thể được xử lý bởi nhà cung cấp AI bên thứ ba" | Gemini miễn phí được dùng dữ liệu để cải thiện sản phẩm |

## Chưa quyết

| # | Việc | Đề xuất mặc định |
|---|---|---|
| U1 | Khi số quán vượt hạn mức miễn phí | Xem lại khi > 100 quán hoặc khi một nguồn cắt hạn mức; lúc đó mới cân nhắc gói trả phí |
| U3 | Ngưỡng MAPE để hiện dự báo | 25% cho doanh thu ngày |

## Bổ sung 28/09/2026 (khi triển khai P18)

| # | Việc | Chọn | Vì sao |
|---|---|---|---|
| D5a | Thước đo độ chính xác | **Sai lệch có trọng số theo doanh thu** (Σ\|dự báo − thực tế\| ÷ Σ thực tế, còn gọi WAPE) thay cho MAPE thường; ngưỡng vẫn 25% | qt-food ngày 09/09/2026 chỉ bán 760.000đ (nghỉ sớm): MAPE thường của 4 tuần lên 67% chỉ vì một ngày, WAPE = 23,0%. Ngày bán đều thì hai cách bằng nhau |
| D2a | Gợi ý nhập tính khi nào | **Lúc mở màn "Nhập hôm nay"** (từ số món dự báo job đêm đã ghi × định lượng − tồn lúc đó), không ghi sẵn trong job | Dùng tồn MỚI NHẤT (sáng nay đã nhập thì gợi ý tự giảm) và dùng thẳng hàm TypeScript của P10 (`requiredQty`) |
| D8a | Lịch rải | Đêm thứ Hai làm tối đa `MAX_NHAN_XET_MOI_DEM` quán (xếp theo `tenant_id`), quán còn lại các đêm sau trong tuần; mỗi quán một nhận xét / tuần (index duy nhất) | Nhận xét luôn về tuần vừa hết; dưới 20 quán thì mọi quán nhận sáng thứ Hai |
| D11 | Bất thường hằng ngày | Luật "doanh thu hôm qua lệch > 2σ so với cùng thứ 8 tuần trước" chạy MỖI đêm, viết bằng mẫu câu (không gọi AI) | 0 chi phí; nhận xét tuần vẫn nhắc lại |

## Hệ quả

- Cần bảng lịch ngày lễ Việt Nam (Tết âm lịch, 30/4, 2/9…) — dữ liệu tĩnh, cập nhật hằng năm.
- Thêm một bí mật (khóa API) ở GitHub Actions secrets, không ở Vercel client.
- Dự báo nguyên liệu chỉ có ở quán bật kho P10.
