# 10-01 — Summary: Nguyên liệu, định lượng, công thức bán thành phẩm

> Yêu cầu: INV-01, INV-02, INV-03 (+ INV-10). Làm 24/09/2026. TDD.

## Kết quả

| Cam kết | Trạng thái | Bằng chứng |
|---|---|---|
| INV-01 danh mục nguyên liệu | ◐ code + kiểm xong | `/admin/inventory`; RBAC 93/93 (owner/manager có `inventory`, 4 vai trò trạm + printer không); ma trận RLS **20 bảng**, 144/144 |
| INV-02 định lượng món & tùy chọn, giá vốn | ◐ | `cost.test.ts`: **Phở bò = 29.353đ** đúng tới đồng; E2E: khai 100 g bò 280.000đ/kg → màn hiện "Giá vốn 28.000₫" |
| INV-03 công thức lồng, chặn vòng / > 3 cấp | ◐ | `recipe-graph.test.ts` 8/8 (vòng trực tiếp, gián tiếp, 3 cấp lưu được, 4 cấp chặn, sửa con đẩy cha quá cấp); E2E: X→Y rồi Y→X → "Công thức bị vòng", DB có **0** dòng công thức của Y |
| INV-10 không hồi quy | ☑ cho 10-01 | `git diff -- lib/orders lib/billing` rỗng; không đổi cột bảng cũ |

## Số đo

| Lệnh | Kết quả |
|---|---|
| `npm run test` | **517/517**, 41 file (28 test mới ở `tests/inventory/`) |
| `vitest tests/rls/matrix.test.ts tests/rls/fixtures.test.ts` | 144/144, ma trận 20 bảng |
| `npm run schema:check` | khớp (27 bảng, 31 policy) |
| `tsc` · `lint` · `build` | sạch |
| `playwright tests/e2e/inventory.spec.ts` | 3/3, gồm 360px không cuộn ngang ở cả hai tab |

Migration **0045 đã áp** lên database dùng chung (chỉ thêm 2 bảng, không đổi bảng cũ).

## Lệch so với plan

- **Thêm `parseQty`** (đọc "0,5" kiểu Việt) vào `units.ts` + 4 test — plan không nêu, nhưng mọi form
  số lượng cần, và `Number("0,5")` ra `NaN`.
- **Lưu định lượng = xóa rồi chèn, chèn lỗi thì chèn lại bản cũ** — không dùng RPC giao dịch để khỏi
  thêm migration. Khe hở còn lại: mạng đứt đúng giữa hai lệnh thì món mất định lượng (người dùng thấy
  ngay trên màn và khai lại). Chấp nhận.
- Giá tay trên nguyên liệu (`last_unit_cost`) là nguồn giá duy nhất tới khi 10-02 có phiếu nhập.

## Cạm bẫy gặp thật

- `tests/rls/matrix.test.ts` bản đầu cho `recipe_lines` chèn chéo trỏ `B(ALT_GROUP)` làm món — đó là
  **nhóm tùy chọn**, nên lỗi khóa ngoại sẽ che mất RLS. Sửa thành option của B, cặp chưa tồn tại.
- `npm run build` chạy song song dev server dùng chung `.next` → phải khởi động lại dev server trước
  E2E kế tiếp.

## Còn chờ

Checkpoint người thật: chủ quán demo khai 3–5 món thật trên điện thoại, xác nhận giá vốn hợp lý.
