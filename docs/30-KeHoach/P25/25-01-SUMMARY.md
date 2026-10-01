# 25-01 — Kết quả: một chỗ nhập hàng, kiểm kê thấy lệch

> Làm 01/10/2026, ngay sau khi chủ dự án chốt "A + B". Không có migration, không đổi RPC hay dữ liệu.
> **Đã deploy production 02/10/2026** (dev c58aa9f → main 04c889d). Trước khi push, commit đã được kiểm trên một worktree sạch,
> không có file chưa commit của phiên P24: `tsc` sạch, unit 1000/1000, `next build` xanh. Sau deploy: `smoke:prod` 3 đạt ·
> 0 hỏng · 2 không kiểm được, và `p25-nhap-kiem-ke.spec.ts` chạy trên production **2/2 xanh**. Ảnh trong `anh/` chụp từ
> production.

## File đã đổi

| Phần | File |
|---|---|
| Tính lệch | `lib/inventory/count.ts` (mới: `countDiff`, `isBigDiff`, `countSummary`, `BIG_DIFF_RATIO`) · `lib/inventory/types.ts` (thêm `qtyLabel` dùng chung) |
| Kiểm kê | `components/admin/inventory/CountForm.tsx` (viết lại: cột KiotViet, tổng, lệch lớn, xác nhận) · `inventory/count/page.tsx` (truyền tồn và giá theo đơn vị nhập) |
| Tab Tồn kho | `inventory/stock/page.tsx` (mới) · `InventoryTabs.tsx` · `inventory/today/page.tsx` (chỉ còn chuyển hướng sang `/nhap-hang/moi`) |
| Nhập hàng | `nhap-hang/moi/page.tsx` (danh sách lần trước + gợi ý P18) · `ReceiptForm.tsx` (`prefill` → `lastIngredients`, nút "Lấy hàng lần trước") · `nhap-hang/[id]/page.tsx` · `nhap-hang/page.tsx`, `nha-cung-cap/page.tsx` (câu dẫn cũ còn trỏ "Nhập hôm nay") |
| Test | `tests/inventory/count.test.ts` (mới) · `tests/e2e/p25-nhap-kiem-ke.spec.ts` (mới) · `inventory.spec.ts`, `p20-nhap.spec.ts`, `p20-giao-dien.spec.ts`, `goi-y-nhap.spec.ts` (sửa đường dẫn và chữ mới) |
| Tài liệu | `P25/00-TongQuan.md` · QD-027 (dòng C2') · P20 `00-GiaoDien.md` (G1) · Requirements INV-11, INV-12 |

## Bằng chứng

- Unit: `npm test` → **96 file, 1014 ca xanh** (tính cả ca của phiên P24 đang làm song song). Trong đó `count.test.ts` 8/8,
  và ca này đã chạy đỏ trước khi viết hàm. `tsc --noEmit` sạch; `next lint` trên các thư mục đã đổi → không cảnh báo.
- E2E trên dev server, quán demo `pho-viet`:
  - `p25-nhap-kiem-ke.spec.ts` **2/2 xanh**.
  - `p20-nhap.spec.ts` 2/2, `p20-giao-dien.spec.ts` 2/2, `goi-y-nhap.spec.ts` 1/1, `inventory.spec.ts` ca kiểm kê (229) và
    ca 360px đều xanh.
- **Hai ca đỏ có sẵn, không do P25, đã sửa** (chủ dự án yêu cầu 01/10/2026). Trên code gốc (cất tạm P25) cả hai vẫn đỏ.
  Cả hai đỏ vì test dựa vào trạng thái của quán demo dùng chung, không phải vì code sai:
  - `inventory.spec.ts` "nhập 1 kg → POS": test viết khi `pho-viet` bán tại quầy, nay quán ở chế độ `table` nên phải chọn
    bàn mới thêm được món. Sửa: test tự đặt `service_mode = counter` rồi trả lại trong `finally` (helper `tenant-mode.ts`,
    cùng cách với `522963b`).
  - `inventory.spec.ts` "báo cáo" có hai giả định sai:
    - "Quán chưa khai nguyên liệu": `pho-viet` đang có "Thịt ngựa". Sửa: phần này kiểm trên `bun-bo` (0 nguyên liệu); test
      báo rõ nếu `bun-bo` cũng có.
    - "Hóa đơn của test là lượt bán duy nhất hôm nay của món đầu thực đơn": thực tế lãi/phần ra 35.000₫ thay vì 30.000₫.
      Sửa: test tự tạo món riêng (ẩn khỏi thực đơn) rồi xóa.
  - Sau sửa: `inventory.spec.ts` **6/6 xanh**; quán demo trả về đúng trạng thái (`pho-viet` `table`, chỉ còn "Thịt ngựa";
    không còn món E2E).
- Ảnh:
  - `anh/kiem-ke-lech-lon.png`: sổ 10 kg, đếm 82 kg → +72 kg, +5.040.000₫, "Lệch lớn".
  - `anh/kiem-ke-360.png`
  - `anh/tab-ton-kho.png`
  - `anh/nhap-hang-lay-hang-lan-truoc.png`

## Trạng thái từng cam kết

| Cam kết | Trạng thái |
|---|---|
| A: Nguyên liệu có 4 tab, "Tồn kho" đứng đầu, không còn "Nhập hôm nay" | ☑ E2E "A" |
| A: Đường cũ `/inventory/today` → "+ Nhập hàng" | ☑ E2E "A" |
| A: "Lấy hàng lần trước" điền danh sách, bấm lại không nhân đôi | ☑ E2E "A" |
| A: Gợi ý nhập P18 chuyển sang "+ Nhập hàng" | ☑ `goi-y-nhap.spec.ts` |
| B: Cột Tồn kho / Thực tế / SL lệch / Giá trị lệch, tổng lệch tăng / giảm / chênh lệch | ☑ E2E "B" + ảnh |
| B: Lệch lớn bôi vàng; "Hoàn thành" hỏi lại; Hủy thì không ghi; Đồng ý thì ghi +72.000 g | ☑ E2E "B" (kiểm cả DB) |
| B: Lệch nhỏ (đếm 0,8 trên sổ 1 kg) không hỏi lại | ☑ `inventory.spec.ts:229` |
| 360px không cuộn ngang (tồn kho, kiểm kê, + Nhập hàng) | ☑ E2E "B" + `inventory.spec.ts` ca 360px |
