# 27-01 — Kết quả: tab nhóm món, gom cảnh báo, dấu trên thẻ bàn, bếp báo xong

> Làm 03/10/2026 theo `00-TongQuan.md` (chủ dự án chốt hướng cùng ngày). Yêu cầu: ORDER-04, ORDER-21..24. Quyết định: QD-032.
> Thử trên quán demo `pho-viet` quy mô lớn (`node scripts/seed-quan-lon.mjs`: 211 bàn, 111 món, 150 bàn đang phục vụ). Chưa deploy.

## File đã đổi

| File | Việc |
|---|---|
| `supabase/migrations/0083_order_item_delivered.sql`, `supabase/schema-snapshot.json` | Cột `order_items.delivered_at`, `delivered_by` (rỗng được). **Đã áp lên DB production** (dùng chung với dev) ngày 03/10 — chỉ thêm cột, code production cũ không đọc tới |
| `lib/orders/table-flags.ts` (mới) | Dấu "cần xử lý" theo bàn + lọc Tất cả / Đang phục vụ / Trống / Cần xử lý |
| `lib/orders/kds-columns.ts` (mới) | Tách vé thành hai cột Chờ chế biến / Đã xong – chờ mang ra |
| `lib/orders/status.ts` | `orderStatusFromItems`; `ITEM_FLOW` cho `ready → queued` ("Trả lại") |
| `lib/orders/kitchen-progress.ts` (mới) | `setItemsReady`, `undoItemReady`, `setItemsDelivered` + tự tính lại trạng thái đơn TẠI BÀN |
| `app/r/[slug]/kds/actions.ts` (mới), `app/r/[slug]/pos/actions.ts` | `markItemsReadyAction`, `undoItemReadyAction` (vai trò KDS); `markItemsDeliveredAction` (vai trò POS) |
| `lib/orders/kds.ts`, `lib/orders/pos.ts` | KDS bỏ món đã mang ra; POS đọc `delivered` |
| `components/kds/KdsBoard.tsx`, `KdsTicket.tsx` | Hai cột; nút Xong / Xong cả vé / Trả lại |
| `components/pos/MenuPanel.tsx` | Tab nhóm món ngang (lọc) |
| `components/pos/TableMap.tsx` | Tab khu một hàng; hàng lọc trạng thái có số; dấu trên thẻ; viền đỏ thẻ cần xử lý |
| `components/pos/PosBoard.tsx`, `PhoneAlertBar.tsx` | Bỏ ba băng cảnh báo; nút "Cần in phiếu N" / "Bàn gọi N" trên thanh trên cùng; tablet 1024: cột bàn 320px, khung đơn 384px (thực đơn không còn bị ép còn ~160px) |
| `components/pos/OrderPanel.tsx` | Nhãn Xong – chờ mang ra / Đã mang ra / **Đã thanh toán** (thay "Đã thu"); nút Mang ra, Mang ra tất cả; Escape khi đang mở ngăn kéo không bỏ chọn bàn |
| `scripts/seed-quan-lon.mjs` | Dữ liệu theo luồng mới (bếp đã bấm Xong, phục vụ đã Mang ra một phần) |
| `tests/orders/quan-lon.test.ts` (mới), `tests/orders/table-group-labels.test.ts` | 9 ca hàm thuần; fixture thêm `delivered` |
| `tests/e2e/p27-quan-lon.spec.ts` (mới) | 3 ca E2E |
| `tests/e2e/p3.spec.ts`, `ghep-ban.spec.ts`, `order15-mobile.spec.ts`, `pos-kho-man.spec.ts`, `inventory.spec.ts` | Theo giao diện mới (nút thay băng; KDS có nút Xong); `inventory.spec` không đè định lượng món thật nữa |
| `docs/15-QuyetDinh/QD-032-BepBaoXongVaMangRa.md`, `docs/20-DanhSachYeuCau/00-Requirements.md` | Quyết định + ORDER-21..24, ORDER-04 |

## Bằng chứng

### Trước / sau (1366×768, cùng dữ liệu 150 bàn)

| Đo | Trước | Sau |
|---|---|---|
| Chiều cao còn cho sơ đồ bàn | 197px (cuộn ~61 màn để thấy hết 211 bàn) | **630px** (~21 màn), và lọc "Cần xử lý" chỉ còn bàn có việc |
| Khung đơn khi mở bàn | thấy 1 dòng món | đủ chiều cao |
| Tablet 1024 | băng cảnh báo phủ gần hết màn; thực đơn ~160px | không băng; thanh trên cùng không tràn |
| Thực đơn 111 món | cuộn ~9 màn tới "Đồ uống" | 1 chạm vào tab nhóm |
| Màn bếp | 236 vé, tất cả TRỄ, cuộn 28 màn | Chờ chế biến ~37 vé · Đã xong – chờ mang ra ~89 món; vé rời bếp khi mang ra |

Ảnh: `anh/01-tab-nhom-mon.png`, `02-ngan-ban-goi.png`, `03-loc-can-xu-ly.png`, `04-tablet-1024.png`, `05-kds-hai-cot.png`,
`06-pos-mang-ra.png`.

### Kiểm thử

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | 0 lỗi |
| `npm test` | 97 file, **1.030/1.030** |
| `npm run schema:check` (sau khi chụp lại) | khớp — chỉ thêm 2 cột `order_items` |
| `playwright test p27-quan-lon.spec.ts` | **3/3**: tab nhóm món lọc + tìm mọi nhóm; tab khu 1 hàng, không băng, "Bàn gọi 7" mở danh sách, lọc "Cần xử lý" số thẻ = số trên nút, tablet không tràn; bếp Xong (DB `ready`, đơn → `preparing`) → POS "Mang ra" (DB `delivered_at`) → món rời bếp; "Trả lại" → `queued` |
| `playwright test p3 ghep-ban` | 4/4 |
| Hồi quy POS / kho (`p27`, `pos-kho-man`, `pos-dien-thoai`, `order15-mobile`, `in-tu-dien-thoai`, `cau-in`, `inventory`) | 31/32, rồi `inventory` chạy lại **6/6** sau khi sửa giả định "cả POS không còn nhãn còn ~N" (quán demo nay có kho thật) — tổng cộng xanh hết |

### Lỗi tìm ra trong lúc làm (đã sửa)

- **Escape đóng ngăn "Cần in / Bàn gọi" cũng bỏ chọn bàn đang mở** (`OrderPanel` nghe Escape trên cả cửa sổ). Trước đây ngăn này chỉ có trên điện thoại nên chưa lộ. Sửa: có ngăn vaul đang mở thì không đóng khung bàn.
- **Thanh trên cùng tràn ở tablet dọc 768–820px** khi thêm hai nút: nhãn "Chờ duyệt" chỉ hiện từ 1024px, nhãn "Cần in phiếu / Bàn gọi" từ 1280px.
- **`inventory.spec.ts` đè dòng định lượng đầu tiên của "món đầu tiên trên màn" rồi xóa** — làm Phở ngựa mất "Bánh phở 150 g" (đã khôi phục ở P26). Spec nay chỉ dùng món chưa có định lượng.

## Còn mở

- **Realtime màn bếp ở 150 bàn: vé mới hiện sau ~12 giây** (đo trên dev server, `p3`), mục tiêu ORDER-04 là ≤ 3 giây. Mỗi thay đổi `orders` / `order_items` của cả quán làm cả màn bếp và POS tải lại toàn bộ (`router.refresh`). Cần đo trên production (như PERF-04) trước khi tối ưu (ví dụ chỉ tải lại phần đổi).
- Ô "6750.3s" (đo độ trễ ORDER-04) vẫn hiện trên vé bếp — chưa thuộc phạm vi lần này.

## Trạng thái cam kết

| Mã | Trạng thái |
|---|---|
| ORDER-21, ORDER-22, ORDER-23, ORDER-24 | ☑ (chưa deploy) |
| ORDER-04 phần "bếp đổi trạng thái làm/xong" | ☑ (chưa deploy) · phần "≤ 3s" ở quy mô 150 bàn: ◐ chưa đạt trên dev |

## 27-02 — Khu bàn rộng, danh sách thả xuống, hàng chờ thanh toán (03/10/2026)

Chủ dự án chốt "Tab Sơ đồ bàn / Thực đơn" + "Hàng chờ thanh toán" (xem `00-TongQuan.md` mục 27-02).

| File | Việc |
|---|---|
| `components/pos/PhoneAlertBar.tsx` | Máy tính: danh sách **thả xuống dưới nút** (bấm ra ngoài / Escape đóng); nút + danh sách **"Thanh toán N"** |
| `components/ui/scroll-row.tsx` (mới), `TableMap.tsx`, `MenuPanel.tsx` | Hàng tab không còn thanh cuộn xám, lăn chuột dọc → cuộn ngang, mép phải mờ khi còn tab khuất |
| `components/pos/PosBoard.tsx` | Tab **Sơ đồ bàn / Thực đơn** (≥ 1024px): chọn bàn → Thực đơn, đóng bàn → Sơ đồ bàn; hàng chờ thanh toán; bấm dòng → chọn bàn + mở hóa đơn; ô tìm bàn 160px dưới 1024px |
| `components/pos/TableMap.tsx` | Lưới tự giãn (5 cột ở 1366, 8 ở 1920); lọc + dấu **"Chờ thanh toán"**; mốc `data-thoi-gian` |
| `lib/orders/payment-queue.ts` (mới), `lib/orders/table-flags.ts`, `lib/orders/pos.ts` | Hàng chờ thanh toán (gọi thanh toán QR hoặc đã Tính tiền), dấu `payment`, `openBill.created_at` |
| `lib/billing/bill.ts` | Thu đủ → phiên đóng → lượt "Gọi thanh toán" của bàn chính + bàn phụ tự `resolved` |
| `components/pos/OrderPanel.tsx` | Escape đã được danh sách xử lý (`defaultPrevented`) thì không bỏ chọn bàn |
| `scripts/seed-quan-lon.mjs` | Ghi chú gọi thanh toán đúng định dạng QR ("Thanh toán · Chuyển khoản") |
| `tests/orders/payment-queue.test.ts` (mới), `quan-lon.test.ts` | 4 + 2 ca |
| `tests/e2e/p27-quan-lon.spec.ts` | Thêm "ORDER-25", "ORDER-26" (thu chuyển khoản thật) |
| `tests/e2e/ghep-ban`, `pos-kho-man`, `print-mode`, `pos-kho-lon` | Theo bố cục tab và hàng chờ mới; `pos-kho-lon` che đồng hồ "thời gian ngồi" khi so ảnh (ảnh mẫu đã chụp lại, nằm trong `.gitignore`) |

Ảnh: `anh/07-so-do-ban-1920.png`, `anh/08-hang-cho-thanh-toan.png`, `anh/09-mo-hoa-don-tu-hang-cho.png`.

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | 0 lỗi |
| `npm test` | 98 file, **1.033/1.033** |
| `playwright test p27-quan-lon.spec.ts` | **5/5** |
| `ghep-ban`, `pos-kho-man`, `p3`, `pos-dien-thoai`, `order15-mobile`, `in-tu-dien-thoai`, `cau-in`, `inventory`, `print-mode`, `pos-kho-lon` | Xanh, trừ `pos-dien-thoai` ca 7: spec tạo lịch đặt bàn lúc "bây giờ + 2 giờ"; chạy lúc 22:46 giờ VN thì lịch rơi sang ngày mai, không hiện trong danh sách hôm nay. Lỗi của spec theo giờ chạy, không do thay đổi này |

**Lỗi tìm ra trong lúc làm (đã sửa):**
- Nút "Thanh toán" làm thanh trên cùng tràn lại ở 768–820px.
- Escape đóng danh sách thả xuống vẫn bỏ chọn bàn: React gỡ danh sách khỏi DOM giữa hai lượt nghe phím. Nay danh sách tự chặn Escape.

| Mã | Trạng thái |
|---|---|
| ORDER-25, ORDER-26 | ☑ (chưa deploy) |

### 27-02b — Bỏ nút đen, "Mang ra" thẳng cột, khách gọi thêm sau "Tính tiền" (03/10/2026)

| File | Việc |
|---|---|
| `PosBoard.tsx`, `TableMap.tsx`, `MenuPanel.tsx` | Nút đang chọn: không còn nền đen. Tab vùng làm việc nền cam; tab khu / nhóm món / bộ lọc nền kem, chữ cam |
| `OrderPanel.tsx` | "Mang ra" nằm cạnh nhãn trạng thái dưới tên món; cột phải chỉ còn "Hủy" (`w-12`) nên SL / thành tiền thẳng cột |
| `lib/orders/pos.ts` | `openBill.billedItemIds`: món đã lên hóa đơn open \| paid của phiên, cùng quy tắc với `openBillForSession` |
| `lib/orders/payment-queue.ts`, `PhoneAlertBar.tsx` | `newItems`: món đã duyệt, chưa hủy, chưa lên hóa đơn → dấu **"+N món gọi thêm"** trên dòng hàng chờ |
| `BillPanel.tsx` | Dòng hóa đơn theo bố cục mới **Tên món · SL · Thành tiền** (SL ≥ 2 thì đơn giá nhỏ dưới thành tiền), thay "2× Tên … /phần" |
| `OrderPanel.tsx`, `pos/actions.ts` (`cancelOrderItem`) | Món bếp đã làm xong (`ready`) không còn nút "Hủy"; server cũng từ chối. E2E ORDER-04 kiểm dòng món "Xong – chờ mang ra" không có nút "Hủy" |
| `tests/orders/payment-queue.test.ts` | +1 ca: đếm đúng, bỏ món hủy và đơn chờ duyệt; lên hết hóa đơn → 0 |
| `tests/e2e/p27-quan-lon.spec.ts` | +1 ca "ORDER-26 … khách gọi thêm" |

Ca E2E "ORDER-26 … khách gọi thêm":

1. Bấm "Tính tiền" thật trên POS.
2. Ghi một đơn QR thêm 2 phần vào DB.
3. Dòng hàng chờ hiện "+2 món gọi thêm".
4. Bấm dòng → `bill_items` có món mới → tải lại → dấu mất.

Ảnh: `anh/10-goi-them-sau-tinh-tien.png`, `anh/11-hoa-don-da-gom-mon-goi-them.png`. Trong lần chạy này hóa đơn bàn B16 tăng từ
475.000₫ lên 595.000₫ (+2 × Cơm sườn nướng 60.000₫).

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | 0 lỗi |
| `npm test` | 98 file, **1.034/1.034** |
| `playwright test p27-quan-lon.spec.ts ghep-ban.spec.ts` (sau `seed-quan-lon.mjs`) | **9/9** |
