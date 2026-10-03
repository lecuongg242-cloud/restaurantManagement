# 29-01 — Tab Nguyên liệu: bảng + hộp thoại thêm / sửa (04/10/2026)

| File | Việc |
|---|---|
| `components/admin/inventory/IngredientTable.tsx` (mới) | Bảng 7 cột; tìm không dấu; lọc Đang dùng / Đã ẩn; "+ Thêm nguyên liệu"; bấm dòng → Sửa; "Công thức mẻ" (hộp thoại); "Hiện lại"; điện thoại thành danh sách gọn |
| `components/admin/inventory/IngredientForm.tsx` | Form luôn mở → `IngredientDialog`. Loại chọn bằng hai nút; "1 [thùng] = [24] cái"; Giá vốn ₫ / đơn vị nhập; Tồn kho ban đầu; nút Bỏ qua · Lưu & thêm mới · Lưu; Sửa có "Ẩn nguyên liệu"; lỗi giữ hộp thoại. Bỏ ô "% dùng được" (thành cột) và các chú thích dài |
| `admin/(protected)/inventory/page.tsx` | Dựng dòng bảng: giá vốn, tồn kho (`inventory_on_hand`), được khai tồn đầu không, công thức mẻ |
| `admin/(protected)/inventory/actions.ts` | `createIngredient` / `updateIngredient` / `setIngredientActive` trả `{ ok, error }` để hộp thoại biết lỗi; chữ "Tồn hiện có" → "Tồn kho ban đầu" |
| `tests/e2e/p29-nguyen-lieu.spec.ts` (mới), `inventory.spec.ts`, `kho-thuc-te.spec.ts` | Theo hộp thoại mới |

Ảnh: `anh/1-bang-nguyen-lieu-1366.png`, `anh/2-hop-thoai-them-1366.png`, `anh/3-nguyen-lieu-390.png`.

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | 0 lỗi |
| `playwright test p29-nguyen-lieu` | 1/1. Kiểm trong DB: "1 thùng = 24 cái", 360.000₫ / thùng, tồn đầu 2 thùng → `purchase_factor` 24, `last_unit_cost` 15.000, dòng sổ 48 cái "Tồn đầu kỳ" |
| `inventory`, `p25-nhap-kiem-ke`, `p20-giao-dien`, `kho-thuc-te` | Xanh, trừ `kho-thuc-te` ca 2: ca này cần dữ liệu seed của ngày 03/10, chạy ngày 04/10 thì không có (xem 28-01-SUMMARY) |

| Mã | Trạng thái |
|---|---|
| PURCH-09 | ☑ (chưa deploy) |
