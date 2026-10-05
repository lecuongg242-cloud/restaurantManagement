# 35-01 — Tổng kết: khách không bàn chọn Tại quán / Mang về

> 05/10/2026. **Code xong; migration 0086 đã áp lên DB dùng chung (dev = production) lúc 13:50 giờ VN, chủ dự án cho phép.
> Chưa commit, chưa phát hành lên `main`.** Yêu cầu ORDER-27..30: ☑.

## Đã làm

| File | Việc |
|---|---|
| `supabase/migrations/0086_order_eat_in.sql` | Thêm cột `orders.eat_in boolean not null default false` (đơn cũ = false ⇒ vẫn "Mang về"). `report_by_channel` trả thêm `eat_in`, thân hàm giữ như bản 0040; thu quyền `anon` |
| `lib/orders/place-label.ts` | `orderPlaceLabel` / `orderPlaceGroup` nhận `eatIn`: đơn không bàn nhân viên gõ ở quán chế độ bàn → "Tại quán" khi `eatIn`, ngược lại "Mang về". Chế độ quầy, đơn online, đơn giao, đơn có bàn giữ nguyên |
| `lib/orders/create-order.ts`, `app/r/[slug]/pos/actions.ts` | `createTakeawayOrderAction(…, eatIn)` lưu `eat_in`. Lượt gọi thêm đọc `eat_in` của **đơn gốc** ở server, bỏ qua giá trị client gửi |
| `lib/orders/online.ts` | `OnlineOrderView.eatIn` (hàng chờ, lịch sử) |
| `lib/orders/kds.ts`, `components/kds/KdsTicket.tsx` | Vé bếp ghi "Tại quán" chữ thường như đơn tại bàn; chỉ "Mang về" / "Giao tận nơi" tô nổi |
| `lib/print/kitchen-ticket.ts`, `adapter.ts`, `components/print/KitchenTicketDoc.tsx` | Phiếu bếp có trường mới `place`. Đơn không bàn in **"Tại quán" / "Mang về"** thay cho "Bàn: —" (trước P35 phiếu bếp in của đơn không bàn **không hề ghi** mang về). `tableName` của đơn không bàn = `place`, để cầu in bản cũ in "Ban: Tai quan" |
| `scripts/print-bridge.mjs`, `android/…/EscPos.kt` | Cầu in Windows / Android bản mới: có `place` thì in thẳng "Tai quan" / "Mang ve". **Cần phát hành bản desktop / APK mới mới có hiệu lực**; trước đó bản cũ in "Ban: Tai quan" |
| `lib/print/customer-ticket.ts`, `lib/billing/receipt-view.ts` | Phiếu khách, tạm tính, hóa đơn đọc `eat_in` |
| `lib/billing/reports.ts`, `components/admin/reports/PlaceBreakdown.tsx` | "Theo nơi phục vụ" tách Tại quán / Mang về |
| `lib/reports/hoa-don.ts` | App Quản lý › Hóa đơn: cột nơi dùng chung `orderPlaceLabel` (trước: mọi đơn không bàn = "Mang về") |
| `components/pos/TableMap.tsx`, `TablePickerDrawer.tsx`, `PosBoard.tsx` | "Bán mang về" → **"Khách không bàn"** (dòng dưới "Tại quán · Mang về"); nút chọn bàn / tab "Thực đơn · **Không bàn**"; gợi ý ô tìm ghi nơi theo đơn |
| `components/pos/TakeawayPanel.tsx`, `TakeawayHistory.tsx`, `NoiTag.tsx` (mới) | Công tắc **Tại quán · Mang về** (mặc định Tại quán, quay lại sau mỗi đơn, ẩn khi gọi thêm, ẩn ở chế độ quầy). Nút "Tạo đơn · <tiền>". Nhãn nơi trên thẻ đơn ở "Đang chờ" và "Đã xong" |
| Test | Mới: `tests/e2e/p35-khach-khong-ban.spec.ts`. Thêm 4 ca vào `tests/orders/place-label.test.ts`. Sửa chữ trong `ghep-ban`, `pos-dien-thoai`, `pos-kho-lon`; thêm `eatIn` vào fixture `takeaway-group.test.ts` |

## Bằng chứng

- `npx tsc --noEmit` sạch; ESLint sạch trên file đã sửa; `npm test` **1.072/1.072**.
- `supabase db push --dry-run` chỉ có 0086 → áp thật. `npm run schema:snapshot` đã ghi lại.
- RPC `report_by_channel` trả `eat_in`; gọi bằng khóa `anon` bị chặn ("permission denied").
- E2E `p35-khach-khong-ban` **đạt** trên `pho-viet` (chế độ bàn):
  - Đơn mặc định Tại quán → DB `eat_in = true`, thẻ đơn ghi "Tại quán".
  - Đơn bấm Mang về → `eat_in = false`, sau đó công tắc tự về Tại quán.
  - Bấm Mang về rồi "Gọi thêm" vào đơn Tại quán → công tắc ẩn, lượt gọi thêm `eat_in = true`.
  - Màn bếp: hai vé Tại quán + một vé Mang về đúng chữ. Trang in phiếu bếp ghi "Tại quán", không có "Bàn:".
  - Thu tiền hai nhóm → RPC hôm nay: doanh thu Tại quán = tiền món tới từng đồng; báo cáo hiện **Tại quán 100.000₫ · Mang về
    50.000₫**; app Quản lý › Hóa đơn có dòng "Tại quán · #…" và "Mang về · #…".
- Hồi quy E2E: `pos-dien-thoai` 8/8, `p3` 1/1 (1 skip sẵn có), `ghep-ban` 3/3.
- Ảnh trong `anh/`: `01-don-moi-tai-quan`, `02-hang-cho-tai-quan-mang-ve`, `03a-ve-bep-tai-quan`, `03b-ve-bep-mang-ve`,
  `04-phieu-bep-tai-quan`, `05-bao-cao-noi-phuc-vu`.

## Cần biết

- **Chế độ quầy cũng đổi một chút trên màn bếp:** vé "Tại quán" trước đây tô khung kem như mang về, nay là chữ thường (đúng
  với giao diện đã chốt: Tại quán khung thường).
- `pos-kho-lon.spec.ts` so ảnh với ảnh gốc chụp trên máy (không commit). Ô "Khách không bàn" đổi chữ ⇒ phải chụp lại gốc;
  không chạy lại trong đợt này.
- `reports.spec.ts` cần `E2E_REPORT_EMAIL` / `E2E_REPORT_PASSWORD` — không chạy; phần báo cáo đã phủ trong `p35-khach-khong-ban`.
- Thứ tự phát hành: migration 0086 **đã** áp, code mới chạy được ngay khi deploy. Code `main` đang chạy vẫn đúng với DB mới
  (cột mới có mặc định; RPC trả thêm cột thì code cũ bỏ qua).
- Chưa làm (chủ dự án đồng ý): đổi Tại quán ↔ Mang về sau khi đã tạo đơn.
