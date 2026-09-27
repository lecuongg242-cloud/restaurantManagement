# 16-01 — SUMMARY: dữ liệu nguồn sạch (làm sớm 27/09/2026)

> Chủ dự án yêu cầu sửa ngay ba lỗi phát hiện khi rà code cho P16. **Trạng thái: XONG** — migration 0056 áp lên production
> 27/09/2026 17:20 (giờ VN), được chủ dự án cho phép; qt-food bán 6h–10h, 60 phút trước khi áp không có đơn nào.

## Ba lỗi và cách sửa

| # | Lỗi | Sửa |
|---|---|---|
| 1 | Xóa bàn → doanh thu cũ của bàn rơi vào "Không gắn bàn" (`table_sessions` CASCADE, `bills.table_session_id` SET NULL); xóa khu → "Chưa xếp khu" | `bills.table_label`, `bills.area_label` ghi bằng trigger lúc tạo bill; `report_by_area`: bàn còn thì tên hiện tại, bàn đã xóa thì snapshot |
| 2 | Chuyển món sang nhóm khác → doanh thu tháng trước đi theo; xóa nhóm → món cũ thành "Khác" | `order_items.category_name` ghi bằng trigger lúc gọi món; `report_by_category` ưu tiên snapshot |
| 3 | SĐT khách nhiều dạng; POS mang về không tên thì mất SĐT | `phoneForStorage` gọi ở server cho QR, online, POS mang về, đặt bàn; mang về lưu SĐT dù không có tên; migration chuẩn hóa dữ liệu cũ |

## Tệp đã đổi

- `lib/orders/guest-contact.ts` — thêm `phoneForStorage`.
- `lib/orders/create-order.ts` (QR + POS mang về), `lib/orders/online.ts`, `lib/reservations/reservations.ts` — dùng `phoneForStorage`.
- `supabase/migrations/0056_report_snapshots.sql` — cột snapshot, 2 trigger, backfill, 2 hàm báo cáo (thân lấy từ bản
  production ở 0040 — `bills_revenue.business_at`, **không** phải 0023), `normalize_vn_phone` + chuẩn hóa SĐT cũ.
- `tests/orders/phone-storage.test.ts` (mới, 5 test), `tests/rls/report-snapshots.test.ts` (mới, 4 test — chạy sau khi áp).

## Bằng chứng

```
npm run test            → Test Files 66 passed (66) · Tests 684 passed (684)
npx tsc --noEmit        → không lỗi
next lint (6 tệp đổi)   → No ESLint warnings or errors
```

## Áp production (27/09/2026)

```
supabase migration repair --status applied 0055   # 0055 đã áp tay trước đó (bucket + policy có sẵn), sổ chưa ghi
supabase db push --dry-run                         # → chỉ 0056_report_snapshots.sql
supabase db push                                   # → Applying migration 0056_report_snapshots.sql... Finished
npx vitest run tests/rls/report-snapshots.test.ts  # → 4 passed (4)
npm run test:rls                                   # → Test Files 18 passed (18) · Tests 278 passed (278)
npm run schema:snapshot && npm run schema:check    # → Schema khớp snapshot (trigger=3)
```

| Kiểm | Kết quả |
|---|---|
| Báo cáo "Khu vực & bàn" + "Nhóm món" qt-food, 01/08–27/09 và 20/09–27/09, trước vs sau | **Giống hệt** (so JSON từng dòng) — Phở ngựa 542.505.000đ, Món ngựa 50.185.000đ, Đồ uống 10.880.000đ, Món kèm 2.605.000đ |
| Bill có phiên bàn mà thiếu `table_label` | 0 |
| Món có `menu_item_id` mà thiếu `category_name` | 0 |
| SĐT trong đơn chưa ở dạng `0…` | 2 — `0000000`, `09741221`: không phải SĐT hợp lệ, giữ nguyên có chủ đích |
| SĐT đặt bàn chưa ở dạng `0…` | 3 — không hợp lệ, giữ nguyên |

qt-food hiện chỉ dùng chế độ quầy (mọi bill "Không gắn bàn") nên phần bàn/khu chỉ có tác dụng với quán có bàn.

## Chưa làm trong 16-01 (còn ở plan)

- Index biểu thức SĐT và `orders(tenant_id, created_at)` — để 16-05 (danh sách khách) khi có truy vấn dùng tới.
- Bàn/nhóm **đã** bị xóa trước ngày áp: không khôi phục được (dữ liệu gốc không còn).
- Xóa bàn đang có phiên **mở** vẫn cắt đơn đang ăn khỏi bàn — lỗi riêng, chưa sửa (cần chặn xóa bàn đang có khách).
