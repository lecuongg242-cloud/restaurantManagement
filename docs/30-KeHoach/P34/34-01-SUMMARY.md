# 34-01 — Tổng kết: nhập phiếu muộn không làm sai kho

> 05/10/2026. **Code xong; migration 0085 đã áp lên DB production (dùng chung với dev) lúc ~11:15 giờ VN, chủ dự án cho phép.
> Chưa phát hành lên `main`.** Yêu cầu INV-18..24: ☑. Quyết định: QD-034.

## Đã làm

| File | Việc |
|---|---|
| `supabase/migrations/0085_late_receipts.sql` | Các việc trong migration: <br>• `stock_entries.occurred_at`, kèm trigger: `business_date` = ngày VN của `occurred_at`. <br>• `purchase_receipts.received_at`. <br>• Bảng `stock_counts` và `stock_count_lines` (mã KK…, chỉ đọc, ghi qua hàm). <br>• Hàm `inventory_lock_conflicts`, `assert_no_lock`, `inventory_day_closed`. <br>• `inventory_on_hand` / `inventory_day` tính theo `occurred_at`. <br>• `save_purchase_receipt`: nhận thời gian nhập; chặn giờ tương lai, chặn ngày lùi quá 7 ngày, chặn khi vướng kiểm kê; phiếu chi lấy cùng giờ; "Giá gần nhất" không bị phiếu cũ hơn ghi đè. <br>• `cancel_purchase_receipt` kiểm mốc khóa. <br>• `update_purchase_receipt_meta` bỏ qua ô ngày. <br>• Hàm mới `complete_stock_count` và `cancel_stock_count`. |
| `lib/inventory/close.ts`, `close-server.ts` | `OPEN_DAYS = 7`, `firstOpenDay`, `openDaysIn`. Tự chốt các ngày ≤ hôm nay − 7. Thêm `previewDays` (nhiều ngày) và `oldestOpenDay` |
| `lib/inventory/report-server.ts`, `margin.ts` | Báo cáo tính tại chỗ MỌI ngày chưa chốt trong kỳ: lãi gộp theo bản xem trước của đúng ngày đó, hao hụt cộng dòng của ngày chưa chốt |
| `lib/inventory/lock.ts` (mới) | Đọc lỗi `vuong_kiem_ke`, ghép câu thông báo, chuyển giờ nhập VN ↔ ISO |
| `components/admin/inventory/ReceiptForm.tsx`, `nhap-hang/*` | Ô "Thời gian nhập": "Lúc bấm Hoàn thành" hoặc "Chọn giờ khác". Vướng kiểm kê thì Lưu tạm và hiện khung đỏ (`LockBox`). Chi tiết phiếu ghi "Thời gian nhập …", thêm "ghi lúc … bởi …" khi nhập muộn. Bỏ ô ngày ở form sửa thông tin. Danh sách có cột "Thời gian nhập" |
| `components/admin/inventory/ReceiptForm.tsx` (bố cục) | Phiếu nhập hai cột như KiotViet (chủ dự án chọn 05/10): trái Hàng nhập, phải khung Thông tin phiếu dính khi cuộn; điện thoại xếp dọc, nút dính đáy màn. E2E dùng form (p20-nhap, p25 A, kho-thuc-te 3–4, inventory) 6/6 |
| `inventory/actions.ts`, `inventory/count/page.tsx`, `CountForm.tsx` | Kiểm kê ghi qua phiếu KK. Khối "Phiếu kiểm kê 7 ngày gần đây" có nút Hủy và Hoàn thành lại (`?lai=`). Dòng tồn âm hiện đỏ và hỏi lại. Danh sách phiếu hủy và mẻ hiện cả 7 ngày; nút Hủy kiểm mốc khóa |
| `components/admin/inventory/KhoSoStatus.tsx` (mới) | Đầu khu Kho hàng: "Sổ kho tự chốt sau 7 ngày. Đã chốt tới hết …". Khung vàng khi còn nguyên liệu âm ở ngày sẽ tự chốt trong ≤ 2 ngày |
| `components/admin/reports/*Panel.tsx` | Ghi rõ "N ngày chưa chốt (tạm tính …)" |
| `scripts/seed-kho-demo.mjs` | 7 ngày kết thúc hôm nay − 7. Lùi ngày bằng `occurred_at`. Dọn thêm `stock_counts` |
| Test | Mới: `tests/rls/p34-nhap-muon.test.ts` (15 ca), `tests/inventory/lock.test.ts`. <br>Thêm ca 9 vào `kho-thuc-te.spec.ts`. <br>Sửa cho hợp luật mới: `daily-close`, `inventory-usage`, `p20-purchasing`, `p20-pnl`, ma trận RLS (32 bảng), `inventory.spec`, `p25-nhap-kiem-ke`, `p20-cong-no` |

## Bằng chứng

- `npm run test`: **1.069/1.069** đạt. `npx tsc --noEmit` sạch. `npm run schema:check`: "Schema khớp snapshot".
- DB thật:
  - `p34-nhap-muon` 15/15.
  - Ví dụ thịt bò: sổ −2 kg, đếm 1 kg → lệch +3 kg. Phiếu 3 kg giờ −30′ bị chặn. Hủy phiếu kiểm kê → nhập → Hoàn thành lại → lệch **0**, tồn **1 kg**.
  - `matrix` + `p20-*`: 264/264.
- `npm run test:rls`: 573 đạt sau khi sửa. Còn 2 file lỗi do tiền đề dữ liệu, có từ trước P34:
  - `daily-close` đòi pho-viet không có dòng sổ nào. Lưu ý: file này xóa hết bản chốt của pho-viet ở bước chuẩn bị.
  - `margin-report` chèn bản chốt "hôm qua", nên đụng bản chốt có sẵn của seed cũ. Với seed mới (chỉ chốt tới hôm nay − 7) thì không còn đụng.
- E2E:
  - `kho-thuc-te` **9/9**, gồm ca 9 nhập phiếu muộn trên giao diện.
  - `inventory` 6/6, `p25-nhap-kiem-ke` 2/2, `p20-nhap` 2/2, `p20-cong-no` 1/1.
  - Riêng ca POS "còn ~5" có hai lỗi test cũ, đã sửa: lệch đồng hồ máy test ~2 giây so với DB, và chọn món không có trên POS vì thực đơn cache.
- Đối chiếu bản chốt 22/09–28/09: **1.575/1.575 ô, lệch 0**. Báo cáo Hao hụt **3.981.291₫** = đáp án.
- Ảnh trong `anh/`: phiếu kiểm kê 7 ngày, form thời gian nhập, báo cáo tuần có ngày chưa chốt, báo cáo 7 ngày đã chốt. Màn 360px có `scrollWidth` 360, không cuộn ngang.

## Cần biết

- **DB dùng chung:** production (`main`) đang chạy code cũ trên schema mới. Tương thích ngược, nhưng có ba điểm khác:
  - Ô "Ngày chứng từ" của bản cũ không còn tác dụng.
  - Code cũ vẫn chốt sổ "sáng hôm sau". Vì vậy cửa sổ 7 ngày chỉ có tác dụng thật khi phát hành P34 lên `main`.
  - Kiểm kê ở bản cũ không tạo phiếu KK, nên không có mốc khóa.
- Báo cáo giờ dựng bản xem trước cho mọi ngày chưa chốt trong kỳ (tối đa 7 lần gọi `inventory_day`). Trang Báo cáo chậm hơn
  một chút khi kỳ gồm tuần hiện tại.
- Dữ liệu demo pho-viet đã được seed lại (22/09–28/09). Bản chốt cũ 28/09–04/10 đã bị `daily-close.test.ts` xóa trong lượt chạy test.
