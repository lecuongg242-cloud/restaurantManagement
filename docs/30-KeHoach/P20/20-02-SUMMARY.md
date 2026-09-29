# 20-02 — Sổ quỹ: kết quả

> Làm 29/09/2026. Yêu cầu CASH-01..04. Quyết định QD-027 D7–D10, C5, C7, C8. Plan: `20-02-PLAN.md`.

## Đã làm

| Phần | Tệp |
|---|---|
| Migration `0077_cashbook` (áp production 29/09/2026 ~21:58 giờ VN; chỉ bảng mới + ràng buộc `export_logs`) | `supabase/migrations/0077_cashbook.sql`, `supabase/schema-snapshot.json` |
| Nhãn mục chi phí S2c (một chỗ, ghi số thông tư), giờ VN của ô `datetime-local`, tải sổ quỹ | `lib/cashbook/labels.ts`, `lib/cashbook/data.ts` |
| Quyền `cashbook` (owner + manager) + menu **"Sổ quỹ"** | `lib/auth/rbac.ts`, `components/admin/AdminNav.tsx` |
| Sổ quỹ: tab **Tiền mặt / Ngân hàng (tên NH ·4 số cuối) / Tổng quỹ**; Quỹ đầu kỳ · Tổng thu · Tổng chi · Tồn quỹ; chọn kỳ dùng lại `RangePicker`; nhập số dư đầu kỳ; **"+ Phiếu thu"**, **"+ Phiếu chi"**, **"Xuất file"** | `app/r/[slug]/admin/(protected)/so-quy/{page,layout}.tsx`, `so-quy/export/route.ts` |
| Lập phiếu: loại (mặc định hạch toán theo loại), giá trị, thời gian, quỹ, nhóm người nộp/nhận (NCC → chọn NCC, trừ nợ), ghi chú, "Hạch toán vào kết quả kinh doanh", chứng từ gốc (gập) | `so-quy/moi/page.tsx`, `components/admin/cashbook/VoucherForm.tsx` |
| Chi tiết phiếu: sửa ghi chú + thời gian; **"Hủy phiếu"** (vô hiệu); phiếu tự sinh từ phiếu nhập trỏ về phiếu nhập | `so-quy/[id]/page.tsx` |
| **Loại thu chi**: thêm, sửa tên / mục chi phí / mặc định hạch toán, ngừng dùng | `so-quy/loai/page.tsx`, `so-quy/actions.ts` |
| Test | `tests/rls/p20-cashbook.test.ts`, `tests/rls/{matrix-cases,fixtures,matrix.test}.ts`, `tests/cashbook/labels.test.ts`, `tests/auth/rbac.test.ts`, `tests/e2e/p20-so-quy.spec.ts` |

## Bằng chứng

```
npx vitest run tests/rls/p20-cashbook.test.ts                     → 13 passed (13)
npx vitest run tests/rls/matrix.test.ts tests/rls/fixtures.test.ts → 200 passed (200)   (ma trận 28 bảng)
npm test                                                          → 90 files · 939 passed
npx tsc --noEmit · npm run lint · npm run schema:check            → sạch · sạch · khớp
npx playwright test tests/e2e/p20-so-quy.spec.ts                  → 1 passed: số dư 2.000.000₫ → Tồn quỹ +2.000.000;
                                                                    phiếu chi "Điện" 850.000₫ (hạch toán tự bật) → +1.150.000;
                                                                    xuất file 200 .xlsx; hủy phiếu → +2.000.000; 360px không cuộn ngang
```

**Nghiệm thu 2 — qt-food, chỉ đọc** (giao dịch `read only`, đóng vai chủ quán qt-food, ROLLBACK): 30 ngày gần nhất, 33 dòng
"Thu tiền bán hàng", **0 dòng lệch** so với `report_payments` từng ngày; tổng 305.590.000₫ = tiền mặt 304.655.000₫ +
chuyển khoản 935.000₫ (bằng báo cáo 30 ngày).

Ảnh (`pho-viet`, dữ liệu tạm đã dọn): `anh/20-02-1-so-quy.png` (7 ngày, số dư + 2 phiếu chi + các dòng bán hàng theo ngày) ·
`anh/20-02-2-phieu-chi.png` · `anh/20-02-3-loai-thu-chi.png`.

## Trạng thái cam kết

| Yêu cầu | Trạng thái |
|---|---|
| CASH-01 Sổ quỹ ba tab | ☑ đầu kỳ + thu − chi = tồn; tồn cuối kỳ trước = đầu kỳ sau (test tháng giả 01/2001); Tổng quỹ = TM + NH |
| CASH-02 Phiếu thu, phiếu chi | ☑ mã PT/PC; hạch toán theo loại, ghi đè được; loại tự sửa được; chặn số tiền ≤ 0, loại sai chiều, ngày tương lai |
| CASH-03 Tiền bán hàng vào sổ quỹ | ☑ một dòng mỗi ngày mỗi phương thức; = `report_payments` (test DB pho-viet + qt-food 33 ngày, lệch 0đ) |
| CASH-04 Hủy, khóa phiếu tự sinh | ☑ hủy = vô hiệu; phiếu từ phiếu nhập không hủy ở sổ quỹ; cashier / quán khác 0 dòng, lập phiếu → 42501 |

## Khác plan (và vì sao)

- **Ghi phiếu qua hàm `security definer`** như 20-01 (phiếu không sửa được số qua API); **loại thu chi** ghi thẳng được (RLS
  chủ/quản lý) nhưng **không xóa được** — chỉ "Ngừng dùng", vì phiếu cũ trỏ tới loại.
- **Không có lời nhắc "chi tiền mặt từ 5 triệu"** — chủ dự án 29/09: khoản nào được trừ do quán tự cấu hình.
- Danh mục mặc định thêm **"Nộp thuế" (không tính)** — thuế ước tính ở Kết quả kinh doanh (QD-027 C9), tính nữa là hai lần.
- `export_logs.kind` thêm luôn `pnl` cho 20-04 (một lần đổi ràng buộc).
- Phiếu chi tay chọn nhóm "Nhà cung cấp" được **trừ vào nợ NCC** (theo QD-027 D11: nợ = phiếu nhập − phiếu chi gắn NCC).
  Phân bổ vào từng phiếu nhập làm ở 20-03.

## Ghi chú

- "Quỹ đầu kỳ" cộng dồn **mọi** tiền bán hàng trước kỳ (như KiotViet). Quán rút tiền két mà không lập phiếu thì tồn quỹ tiền
  mặt sẽ lớn hơn két thật — đúng hành vi đối thủ; cần phiếu chi "Rút tiền" (loại không tính) để khớp.
- Tên cột `at` đổi thành `occurred_at` trước khi áp (từ khóa của Postgres trong `AT TIME ZONE`).
