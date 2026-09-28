# P18 — SUMMARY: dự báo, gợi ý nhập, nhận xét tuần (18-01 → 18-03)

> **Trạng thái: CODE XONG 28/09/2026, migration 0073 đã áp production** (chỉ thêm 4 bảng mới, RLS chủ / quản lý).
> Job đêm đã chạy tay trên production: dự báo qt-food + pho-viet đã ghi; nhận xét tuần CHỈ ghi cho quán demo pho-viet
> (qt-food để dành cho lần đầu có khóa AI). **Workflow GitHub chưa chạy** vì chưa push; **chưa có khóa AI** nào
> (nhận xét đang dùng mẫu câu cố định — chi phí 0đ).
> Tra đối thủ trước khi làm: `00-TongQuan.md` §Đối thủ làm thế nào.

## Đã làm

| Plan | Nội dung | Tệp chính |
|---|---|---|
| 18-01 | **Dự báo thống kê thuần** (QD-025 D1): trung bình có trọng số theo thứ trong tuần (6 tuần) × xu hướng nhẹ (kẹp ±15%); loại ngày lễ và ngày không bán khỏi lịch sử; khoảng dao động ~80% theo hệ số biến thiên từng thứ (quá ít mẫu → khoảng rất rộng, không bao giờ khoảng 0). Doanh thu + hóa đơn 14 ngày, từng món 7 ngày (món bán chưa đủ 3 tuần gộp "Món khác") | `lib/forecast/model.mjs`, `holidays-vn.mjs` (Tết 29 → mùng 5, Giỗ Tổ, 30/4, 1/5, 2/9 — 2026–2028) |
| 18-01 | **Backtest 4 tuần** — sai lệch có trọng số theo doanh thu (xem Quyết định). Chỉ hiện khi ≥ 6 tuần có bán **và** sai lệch ≤ 25% | `model.mjs` `backtest` |
| 18-01 | **Job đêm** 02:30 VN (GitHub Actions, dùng lại secret sao lưu): mỗi quán đang dùng được — chuỗi ngày qua `report_series_multi` (cùng quy ước doanh thu với Báo cáo), backtest, dự báo, ghi bảng; một quán lỗi không chặn quán khác, có lỗi → workflow đỏ → email. Giữ 60 ngày lượt cũ để so dự báo vs thực tế | `scripts/du-bao-dem.mjs`, `.github/workflows/du-bao.yml`, `0073_forecast_insights.sql` |
| 18-01 | **Khối "Dự báo 7 ngày tới"** ở Tổng quan + đầu trang Báo cáo: tổng tuần + khoảng, so tuần trước (%), nhãn "Sai lệch trung bình ±X%", biểu đồ cột + vạch sai số + đường cùng thứ tuần trước, món dự kiến bán nhiều. Chưa tin được → "Chưa đủ dữ liệu để dự báo đáng tin" kèm lý do; job đêm qua lỗi → "bản cũ" | `lib/forecast/read.ts`, `components/admin/forecast/ForecastCard.tsx`, `ForecastChart.tsx` |
| 18-02 | **Nhu cầu nguyên liệu** = món dự báo × định lượng, bung bán thành phẩm bằng đúng `requiredQty` của P10 (test: Σ lượng × giá = giá vốn P10), dùng tồn bán thành phẩm trước. **Gợi ý nhập** = cần × 1,1 − tồn, làm tròn LÊN theo đơn vị nhập; tồn âm → gợi ý theo nhu cầu + "tồn âm — kiểm kê lại" (công thức CUKCUK: SL đề nghị = SL cần − SL tồn) | `lib/forecast/ingredients.ts` |
| 18-02 | Màn **Nguyên liệu → Nhập hôm nay**: bảng gợi ý (cần hôm nay, cần 3 ngày, tồn, gợi ý), bán thành phẩm cần nấu thêm, món chưa khai định lượng; ô số lượng hiện "gợi ý N"; nút **Điền theo gợi ý** | `inventory/today/page.tsx`, `ReceiptForm.tsx` |
| 18-03 | **Số liệu tuần** (không SĐT / tên khách / nhân viên), **4 luật bất thường** (doanh thu ngày > 2σ so cùng thứ 8 tuần; hủy món +3 điểm; giảm giá +3 điểm; món top 5 rơi khỏi top 10), **kiểm số** (mọi số trong văn bản phải khớp dữ liệu theo quy tắc làm tròn đã ghi), **mẫu câu cố định**, **chuỗi AI miễn phí** Gemini → Groq → Cloudflare → mẫu câu (429 / lỗi / quá dài / bịa số → bên sau), **lịch rải** (một nhận xét / quán / tuần, ≤ N lần gọi / đêm) | `lib/insights/*.mjs` |
| 18-03 | **Thẻ "Nhận xét tuần"** (đoạn văn + gợi ý + "Hữu ích / Không hữu ích" ghi `insight_feedback`) + **Bất thường gần đây** (bất thường của hôm qua, chạy mỗi đêm, mẫu câu) | `components/admin/forecast/InsightCard.tsx`, `forecast-actions.ts` |

## Quyết định trong lúc làm (ghi ở QD-025 "Bổ sung 28/09/2026")

- **Sai lệch có trọng số (WAPE) thay MAPE thường.** qt-food 09/09/2026 bán 760.000đ (nghỉ sớm) ⇒ MAPE thường 67% vì một
  ngày; WAPE **23,0%**. Ngưỡng 25% giữ nguyên.
- **Gợi ý nhập tính lúc mở màn**, không ghi sẵn trong job: dùng tồn mới nhất và dùng thẳng hàm TS của P10. Bảng
  `forecasts` vì vậy không có metric `ingredient_need`.
- **Logic dự báo / nhận xét viết bằng JavaScript (JSDoc)** (`.mjs`) để job Node trên GitHub nhập thẳng, không bước build;
  TypeScript vẫn kiểm kiểu qua JSDoc.
- **Khác đối thủ:** hiện khoảng sai số + độ chính xác (không đối thủ nào hiện) — QD-025 D5.

## Bằng chứng

```
npm run test      → 83 tệp, 858 test xanh (forecast 21, insights 16 — mới)
npm run test:rls  → 361 passed (p18-forecast 5 — mới: chủ đọc được; thu ngân / quán khác 0 dòng; không ai ghi được
                    dự báo / nhận xét qua API; phản hồi chỉ ghi cho chính mình). brand-isolation vẫn tự dừng vì quán demo
                    đang thuộc thương hiệu thử "phoviet" (như P16)
playwright goi-y-nhap.spec.ts → 1 passed (dựng định lượng tạm trên quán demo: 15,5 kg cần → gợi ý 18 kg; "Điền theo gợi ý")
schema:check khớp · tsc + next lint sạch
```

**Chạy job trên dữ liệu thật (28/09/2026, `node scripts/du-bao-dem.mjs`):**

| Quán | Tuần có bán | Ngày bán | Sai lệch backtest doanh thu | Hóa đơn | Hiện dự báo? |
|---|---|---|---|---|---|
| qt-food | 8 | 55 | **23,0%** | 21,1% | Có (≤ 25%) |
| pho-viet (demo, dữ liệu giả) | 8 | 45 | 65,6% | 89,3% | Không — "Chưa đủ dữ liệu để dự báo đáng tin" |

Dự báo qt-food tuần 28/09 → 04/10: T2 8,02tr · T3 9,22tr · T4 7,42tr · T5 8,97tr · T6 7,70tr · T7 12,51tr · CN 14,52tr
= **~68,4 triệu** (tuần 21 → 27/09 thực tế 70,93 triệu). Nhận xét tuần qt-food chạy thử (không ghi) bằng mẫu câu:
"Tuần 21/09–27/09: doanh thu 70.930.000đ, tăng 2,4% so với tuần trước (69.265.000đ), giảm 3,5% so với trung bình 4 tuần…"

Ảnh: `anh/1-chua-du-tin-cay.png`, `anh/2-du-bao-demo.png` (ảnh DỰNG: sửa tạm sai lệch của quán demo xuống 18% để thấy khối
khi đủ tin cậy — số trong ảnh là dữ liệu demo, không có nghĩa), `anh/3-goi-y-nhap.png`, `anh/4-nhan-xet-tuan.png`.

## Còn mở

- **Push + đặt secrets**: workflow cần `BACKUP_DB_URL` (đã có); khóa AI miễn phí (`GEMINI_API_KEY`, `GROQ_API_KEY`,
  `CF_ACCOUNT_ID` + `CF_API_TOKEN`) — hướng dẫn ở `50-PhienBan/TrucSuCo.md` §A.3. Kiểm lại hạn mức miễn phí lúc lấy khóa.
- **Nghiệm thu 18-01**: theo dõi 2 tuần thật — bảng dự báo vs thực tế từng ngày của qt-food (job giữ 60 ngày lượt cũ).
- **Nghiệm thu 18-02**: chưa quán nào khai định lượng / bật kho (qt-food có 1 nguyên liệu, 0 định lượng) — cần quán thử 2 tuần.
- **Nghiệm thu 18-03**: 4 tuần nhận xét qt-food cho chủ dự án chấm; kiểm tiếng Việt 10 bản mẫu **của từng nguồn** trước khi
  bật cho quán (QD-025).
- **Điều khoản dịch vụ** (QD-025 D10): thêm câu "số liệu tổng hợp có thể được xử lý bởi nhà cung cấp AI bên thứ ba" —
  dự án chưa có trang điều khoản.
- Dự báo **tổng chuỗi** (tổng các chi nhánh) chưa hiện ở phạm vi "Tất cả chi nhánh" của Báo cáo — mỗi chi nhánh xem ở
  trang của nó.
- Ngày bán bất thường thấp (vd 09/09 qt-food) vẫn nằm trong lịch sử dự báo → khoảng dao động thứ Tư rộng; cân nhắc loại
  ngày lệch > 2σ khỏi lịch sử khi có thêm dữ liệu.
