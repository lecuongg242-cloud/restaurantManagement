# P22 — Mở rộng mua hàng & quỹ: chuyển hàng chi nhánh, chi tiền trong ca, trả hàng nhập, đặt hàng nhập, nhiều tài khoản

> Lập 29/09/2026. **Trạng thái: ĐỂ SAU** — tách từ P20 theo chủ dự án (QD-027 C3, C8). Đây là khung phạm vi, **chưa** có plan
> chi tiết; khi xếp lịch: tra lại đối thủ nếu cần → viết QD + yêu cầu → plan 22-0x theo khuôn P20.
> Phụ thuộc: **P20** (phiếu nhập, sổ quỹ, công nợ NCC — mọi việc dưới đây dựng trên các bảng của P20), P15 (chuỗi).
> Nghiên cứu đối thủ đã có (tra 29/09/2026): `30-KeHoach/P20/00-NghienCuu-NghiepVu.md` §2.3, §2.5, §2.7.

## Phạm vi dự kiến

| Việc | Nội dung tối thiểu | Đối thủ làm thế nào (P20 NghienCuu) |
|---|---|---|
| Chuyển hàng giữa chi nhánh / bếp trung tâm | Nối nguyên liệu chi nhánh A ↔ B; phiếu **Phiếu tạm → Đang chuyển → Đã nhận / Đã hủy**; bên nhận bấm **"Nhận hàng"**, sửa "Số lượng nhận", thiếu thì hoàn về kho gửi; giá chuyển = giá vốn, sửa được | KiotViet (rõ nhất); Sapo, CUKCUK làm hai phiếu rời; iPOS có luồng yêu cầu → xuất (§2.7) |
| Thu ngân chi tiền trong ca | Mở ca ("Tiền mặt đầu ca"), **"Chi tiền mặt"** / **"Rút tiền mặt"** trên POS, kết ca ("Tiền mặt bàn giao thực tế"), khoản chi in lên phiếu bàn giao ca; phiếu chi vào sổ quỹ tiền mặt P20 | CUKCUK "Chi tiền mặt", Sapo "Rút tiền mặt" + quản lý ca, KiotViet mở/đóng ca (§2.5) |
| Trả hàng nhập (trả NCC) | "+ Trả hàng nhập": trả nhanh hoặc theo phiếu nhập; trừ tồn kho; "Tính vào công nợ" (giảm nợ) hoặc "Tiền NCC trả" (phiếu thu) | KiotViet, CUKCUK, POS365 (§2.3); Sapo FnB không có |
| Đặt hàng nhập (PO) riêng | "+ Đặt hàng nhập" → **"Tạo phiếu nhập"** (nhận một phần được) → **"Kết thúc"**; gợi ý số lượng từ P18 18-02 | KiotViet (bán lẻ), CUKCUK (+ bếp **"Báo hàng"**), iPOS (§2.3). P20 dùng phiếu tạm thay PO |
| Nhiều tài khoản ngân hàng | Danh mục tài khoản (ngân hàng, số TK, số dư đầu kỳ, **tài khoản mặc định**); sổ quỹ mỗi tài khoản một khối/tab; chuyển tiền giữa quỹ ("Chuyển/Rút" tự sinh phiếu đối ứng) | KiotViet (nhiều TK, TK mặc định, loại "Chuyển/Rút"), POS365 "Chuyển khoản" (§2.5) |

## Câu hỏi cần chốt khi xếp lịch

1. Thứ tự ưu tiên năm việc trên — có chuỗi nào đang dùng thật cần chuyển hàng không?
2. Chi tiền trong ca kéo theo **module ca** (mở/kết ca, bàn giao tiền) — làm đủ như đối thủ hay chỉ nút "Chi tiền mặt" không có ca?
3. Nhiều tài khoản: tiền chuyển khoản bán hàng vào tài khoản mặc định, hay theo tài khoản in trên QR của từng hóa đơn?

## Phát hiện khi rà code (29/09/2026, khi làm nghiên cứu P20)

- `ingredients` giữa chi nhánh **không nối** (không có `source_id`; `base_unit`, `purchase_factor` có thể khác) ⇒ chuyển hàng
  cần bước nối theo khuôn `sync_menu_from_root` (0063: `security definer`, kiểm cùng thương hiệu + quyền, cặp `p_pairs`).
- Chưa có RPC nào ghi **hai tenant ngang hàng** trong một giao dịch; `created_by` là membership id, khác nhau giữa A và B;
  chi nhánh B bị khóa/hết hạn thì `auth_tenant_ids()` loại B.
- Hàng chuyển đến B phải vào sổ bằng kind mà `loadPrices` đọc (`receipt`), có `unit_cost`, nếu không B rơi về "giá cũ" / "chưa
  đủ giá". Thêm kind mới vào `stock_entries` phải sửa 2 CHECK + `inventory_on_hand` + `inventory_day` + payload chốt +
  `loadPrices` + `report_waste`.
- **Không có ca, két tiền** trong hệ thống; `payments.method` chỉ `cash` / `transfer`.
- P20 chỉ có quỹ `cash` / `bank` (một tài khoản, `tenants.settings.bank` của P13) ⇒ nhiều tài khoản cần đổi `cash_vouchers.fund`
  thành tham chiếu tài khoản + chuyển dữ liệu cũ.
