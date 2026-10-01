# 23-01 — Kết quả: ghép bàn khi mở cho khách đoàn

> Làm 01/10/2026, ngay sau khi chủ dự án chốt giao diện ("ok rồi"). Migration `0082_table_groups` **đã áp production
> 01/10/2026 20:12** (giờ VN), có chủ dự án đồng ý; chỉ thêm, không đổi dữ liệu cũ. **Chưa commit, chưa deploy.**

## File đã đổi

| Phần | File |
|---|---|
| DB | `supabase/migrations/0082_table_groups.sql` (cột `tables.group_session_id` không khóa ngoại, `orders.table_id`, RPC `set_table_group`, trigger chặn xóa bàn phụ) · `supabase/schema-snapshot.json` |
| Tra phiên / nhãn | `lib/orders/table-group.ts` (mới: `findOpenSessionForTable`, `releaseGroupTables`, `loadGroupRefs`, `sessionGroupName`) · `lib/orders/place-label.ts` (`kitchenTableName`, `groupTableName`) · `lib/orders/group-candidates.ts` (mới: trạng thái ô trong hộp ghép) |
| Server | `lib/orders/create-order.ts` (bàn phụ vào phiên nhóm, ghi bàn gọi) · `app/r/[slug]/pos/actions.ts` (`setTableGroupAction`, chốt chia đều tra theo nhóm, đóng phiên trả cả nhóm) · `lib/billing/bill.ts` (tự đóng phiên trả cả nhóm) · `lib/orders/pos.ts` · `lib/orders/kds.ts` · `lib/print/kitchen-ticket.ts` · `lib/print/customer-ticket.ts` · `lib/billing/receipt-view.ts` |
| Giao diện | `components/pos/GroupTablesDialog.tsx` (mới) · `OrderPanel.tsx` · `PosBoard.tsx` · `TableMap.tsx` · `BillPanel.tsx` · `SplitBillDialog.tsx` · `OfflineView.tsx` · `lib/offline/snapshot.ts` |
| Test | `tests/rls/table-group.test.ts` (mới, 13 ca) · `tests/orders/table-group-labels.test.ts` (mới, 16 ca) · `tests/e2e/ghep-ban.spec.ts` (mới) · `tests/e2e/don-ban.ts` (gỡ trỏ nhóm khi dọn) · `tests/offline/snapshot.test.ts` |

**Khác plan:** dùng một cột trên `tables` thay cho bảng nối (lý do ghi ở `23-01-PLAN.md`, mục "Đổi khi code").

## Bằng chứng

- Unit: `npm test` → **94 file, 989 ca xanh**. `tsc --noEmit` sạch, `next lint` sạch, `npm run schema:check` → "Schema khớp snapshot".
- DB thật (quán demo `bun-bo`): `tests/rls/table-group.test.ts` **13/13 xanh**. Toàn bộ `npm run test:rls` → **36 file, 556 ca xanh** (trước khi thêm ca xóa bàn phụ).
- **Đối chứng âm:** tắt bước tra "phiên được ghép" trong `findOpenSessionForTable` → **2 ca đỏ** (gọi món từ bàn phụ mở phiên thứ hai; chặn bỏ ghép không còn đúng). Bật lại → xanh.
- Sau khi áp 0082: các truy vấn nhúng `orders → table_sessions(tables(name))`, `table_sessions → tables`, `bill_items → … → tables` đều chạy (không PGRST201).
- E2E `tests/e2e/ghep-ban.spec.ts` trên quán demo `pho-viet` (bàn V1, V2, B2, B3, B4; tránh B1, T1): **3/3 xanh** ở 1280×800, 390×844, 360×800.
- Cổng ảnh P12 (`pos-kho-lon.spec.ts`, ảnh gốc chụp trên code chưa sửa): **4/6 khớp từng pixel**. 2 ảnh "đã chọn bàn B2" lệch **380 pixel**, đúng bằng nút "Ghép bàn" mới ở đầu panel (đã xem ảnh khác biệt). Đây là thay đổi đã chốt.
- Ảnh: `anh/23-01-hop-ghep-ban.png`, `anh/23-01-panel-nhom-b3.png`, `anh/23-01-man-bep.png`, `anh/23-01-hop-nhom-khoa-b3.png`,
  `anh/23-01-tach-theo-don.png`, `anh/23-01-dien-thoai-390.png`, `anh/23-01-dien-thoai-360.png`.

## Trạng thái từng tiêu chí nghiệm thu

| # | Tiêu chí | Trạng thái |
|---|---|---|
| 1 | Ghép 5 bàn trống | ✅ E2E + RLS. **Chưa đo** "máy POS thứ hai thấy trong ≤ 3s (5 lần)": RPC có chạm dòng `tables` để realtime bắn, nhưng chưa đo bằng hai máy |
| 2 | Gọi chung, chạm bàn phụ thấy cùng đơn và cùng tạm tính | ✅ E2E |
| 3 | Gọi lẻ từ B3 (POS) → "· B3", màn bếp "B3 (nhóm V1)" | ✅ E2E. Nhánh QR dùng chung `openOrJoinSession` và đã truyền bàn gọi, nhưng **chưa có test QR riêng** |
| 4 | Ghép bàn đang có món | ✅ RLS (món chuyển, phiên cũ đóng, đủ 2 món) |
| 5 | Chặn bàn nhóm khác / có hóa đơn; hai máy tranh một bàn | ✅ RLS (gồm hai lời gọi đồng thời → đúng một bên thắng) |
| 6 | Một hóa đơn "Bàn V1 +N" | ✅ E2E (tiêu đề khối hóa đơn). **Chưa xem tận mắt giấy in** hóa đơn / phiếu khách |
| 7 | B3 trả riêng rồi bỏ ghép | ◐ RLS: bỏ ghép khi đã thu hết ✅. E2E: kiểm nhãn "· B3" ở Tách bill → Theo đơn ✅; chưa chạy trọn "tách → thu riêng → bỏ ghép" trên trình duyệt |
| 8 | Chặn bỏ ghép khi còn món chưa thu; bàn chính khóa | ✅ RLS + E2E |
| 9 | Thu đủ → phiên đóng, mọi bàn trống | ✅ RLS + E2E |
| 10 | Không vỡ bàn thường | ◐ Cổng ảnh như trên; RLS cũ 556/556. **Không chạy** `p3.spec` và `pos-dien-thoai.spec`, vì hai spec này hủy đơn trên B1, T1 mà chủ dự án đang thử tay |
| 11 | Điện thoại 390 / 360 | ✅ E2E: không tràn ngang, nút ≥ 44px |

## Còn lại

- Chạy `p3.spec`, `pos-dien-thoai.spec` khi B1, T1 không còn dữ liệu thử tay.
- Đo realtime hai máy (#1). Thử QR từ bàn phụ (#3). In thật hóa đơn / phiếu khách / phiếu bếp (#6).
- Commit, push `dev`, deploy.
