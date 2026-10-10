# P36-01 — Tổng kết: Bàn & QR làm lại (10/10/2026)

Chủ dự án chốt giao diện 10/10/2026 (bố cục như mô tả trong `00-TongQuan.md` + chọn nhiều bàn + Nhập Excel; không làm
"Ngừng hoạt động"). Không có migration, không đổi schema. Chưa commit, chưa phát hành `dev` / `main`.

## File đã đổi

| File | Thay đổi |
|---|---|
| `app/r/[slug]/admin/(protected)/tables/AreaTableManager.tsx` | Viết lại: đầu trang 4 nút (**In QR · Nhập Excel · Thêm hàng loạt · + Thêm bàn**), cột khu vực trái (Tất cả / từng khu / Chưa xếp khu + số bàn, ⋯ Sửa tên · Chuyển lên · Chuyển xuống · Xóa khu), bảng bàn (☐ · Tên bàn · Khu vực · Số ghế · Mã QR "Xem / In" · Thứ tự · Sửa · Xóa), ô Tìm bàn, thanh "Đã chọn N bàn", trạng thái trống; điện thoại: chip khu cuộn ngang + danh sách có menu ⋯. Bỏ chuỗi `QR: xxxx…` |
| `app/r/[slug]/admin/(protected)/tables/TableDialogs.tsx` (mới) | Hộp thoại **Thêm bàn / Sửa bàn** (có "Lưu & thêm tiếp"), **Thêm hàng loạt** (xem trước tên), **Nhập bàn từ Excel** |
| `app/r/[slug]/admin/(protected)/tables/actions.ts` | + `createTablesBulk`, `importTables`, `moveTables`, `setTablesSeats`, `deleteTables`; tách `nextTableSort`. Mọi action qua `requireTableManager` + lọc `tenant_id` |
| `app/r/[slug]/admin/(protected)/tables/mau-nhap/route.ts` (mới) | Tải file mẫu `mau-nhap-ban.xlsx` (Tên bàn · Khu vực · Số ghế + 3 dòng ví dụ) — dùng `taoXlsx` có sẵn |
| `app/r/[slug]/admin/(protected)/tables/page.tsx` | Chỉ đọc dữ liệu, truyền danh sách bàn phẳng; đầu trang chuyển vào component |
| `app/r/[slug]/print/qr/page.tsx` | `?ids=a,b` → chỉ in các bàn đó (không có → mọi bàn như cũ) |
| `lib/tables/bulk.ts` (mới) | Đặt tên hàng loạt (`Bàn` → `Bàn 1`; `B` → `B1`; `A-` → `A-1`), `nextName`, lọc trùng tên, đọc dòng file nhập |
| `lib/tables/xlsx-doc.ts` (mới) | Đọc trang tính đầu của `.xlsx` (zip lưu thẳng / deflate qua `zlib`, sharedStrings, inlineStr) — không thêm thư viện |
| `tests/tables/bulk.test.ts`, `tests/e2e/p36-ban-qr.spec.ts` (mới) | Unit + E2E |
| `docs/60-BanGiao/03-CaiDat.md`, `06-HuongDan-QuanLy.md` | Chữ nút mới |

## Bằng chứng

- `npx vitest run tests/tables` → **15/15**; `npm test` → **104 file / 1093 test xanh**; `npx tsc --noEmit` sạch.
- `npx playwright test tests/e2e/p36-ban-qr.spec.ts` (dev server :3005, quán demo `pho-viet`, khu tạm tự xóa) → **2/2**:
  - Thêm hàng loạt 20 bàn 6 ghế → DB đúng 20 tên `Bàn 1…20`, 20 `qr_token` khác nhau; lần 2 (19→21) → thêm 1, báo
    "Bỏ qua 2 bàn trùng tên: Bàn 19, Bàn 20."
  - Nhập Excel 4 dòng → "Đã nhập 2 bàn, tạo khu mới: … VIP. Bỏ qua 2 dòng: dòng 3 thiếu tên bàn, dòng 4 trùng tên Bàn 1.";
    file mẫu tải về 200 `spreadsheetml`; file rác → "File không đọc được. Hãy dùng file mẫu."
  - Chọn tất cả 22 bàn → Đổi số ghế 8 (DB 22/22); chọn 2 → In QR `?ids=` ra đúng 2 thẻ; Chuyển khu → nối cuối khu đích;
    Xóa 2 (hỏi lại) → DB còn 18.
  - "Lưu & thêm tiếp": Bàn 30 → ô tên thành Bàn 31, lưu cả hai **đúng khu**. Tìm "bàn 3" → 3 dòng.
  - 360px: cột khu ẩn, chip hiện, `scrollWidth − innerWidth ≤ 0`, menu ⋯ có "Xem / In QR".
- Ảnh: `anh/p36-ban-qr-1440.png`, `anh/p36-them-hang-loat.png`, `anh/p36-chon-nhieu.png`, `anh/p36-ban-qr-360.png`.

## Lỗi gặp khi làm

- React 19 tự reset `<form action>` sau khi chạy xong → ô chọn khu (controlled) về "Chưa xếp khu" trong DOM, lượt "Lưu & thêm
  tiếp" thứ hai lưu **sai khu** (E2E bắt được). Sửa: hai hộp thoại có ô controlled dùng `onSubmit` + `useTransition`.
  Ba bàn "Bàn 31" sai khu do lượt chạy lỗi tạo ra trên quán demo đã xóa theo id.

## Trạng thái cam kết

| Mã | Trạng thái |
|---|---|
| TABLE-07 Thêm hàng loạt | ☑ E2E + unit |
| TABLE-08 Nhập Excel | ☑ E2E + unit (file `taoXlsx` và file kiểu Excel nén deflate + sharedStrings). Chưa thử file lưu từ Excel/Google Sheets thật |
| TABLE-09 Thao tác nhiều bàn | ☑ E2E |
| TABLE-10 Bố cục | ☑ E2E 1440 + 360 |

Quyền: mọi action mới qua `requireTableManager` (`canManage(role, "tables")` — thu ngân/phục vụ không có, `tests/auth/rbac.test.ts`).
