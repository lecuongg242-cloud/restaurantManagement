# 28-01 — Mục "Kho hàng" có tab ngang (04/10/2026)

| File | Việc |
|---|---|
| `components/admin/inventory/KhoHangHeader.tsx` (đổi tên từ `InventoryTabs.tsx`) | Tiêu đề "Kho hàng" + 6 tab: Tồn kho · Nhập hàng · Kiểm kê & hủy · Nguyên liệu · Định lượng món · Nhà cung cấp; trang con giữ tab cha sáng |
| `components/admin/AdminNav.tsx` | Ba mục Nguyên liệu / Nhập hàng / Nhà cung cấp → một mục "Kho hàng" (→ Tồn kho), sáng ở mọi trang kho |
| `admin/(protected)/inventory/layout.tsx`, `nhap-hang/layout.tsx`, `nha-cung-cap/layout.tsx` | Dùng chung đầu trang "Kho hàng" |
| `nhap-hang/page.tsx`, `nha-cung-cap/page.tsx` | Bỏ tiêu đề lớn trùng tên tab |
| `nhap-hang/moi`, `nhap-hang/[id]`, `nha-cung-cap/[id]` | Tiêu đề trang con xuống h2 (h1 của trang là "Kho hàng") |
| `tests/e2e/p20-giao-dien.spec.ts`, `p25-nhap-kiem-ke.spec.ts` | Theo bố cục mới |

Đường dẫn giữ nguyên, quyền không đổi (chủ quán + quản lý).

Ảnh: `anh/1-kho-hang-ton-kho-1366.png`, `anh/2-kho-hang-nha-cung-cap-1366.png`, `anh/3-kho-hang-390.png`.

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | 0 lỗi |
| `playwright test p20-giao-dien p25-nhap-kiem-ke p20-nhap inventory kho-thuc-te` | 11/12. Trượt: `kho-thuc-te` ca 2. Ca này cần dữ liệu seed 26/09–02/10 và tìm phiếu "Nhập sáng" của hôm qua; chạy ngày 04/10 thì hôm qua (03/10) không có phiếu đó. Không do thay đổi này: ca 1 của cùng file vẫn qua trang Nhập hàng mới |

| Mã | Trạng thái |
|---|---|
| PURCH-08 | ☑ (chưa deploy) |
