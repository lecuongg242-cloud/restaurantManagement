# 20-03 — Công nợ nhà cung cấp: kết quả

> Làm 29/09/2026. Yêu cầu PURCH-05. Quyết định QD-027 D11. Plan: `20-03-PLAN.md`.

## Đã làm

| Phần | Tệp |
|---|---|
| Migration `0078_supplier_debt` (áp production 29/09/2026 22:11 giờ VN; bảng mới + trigger trên bảng P20) | `supabase/migrations/0078_supplier_debt.sql`, `supabase/schema-snapshot.json` |
| Phân bổ tiền trả vào phiếu nhập: **phiếu cũ trước** hoặc theo phiếu tích chọn; trả dư = trả trước. Do **trigger** giữ: phiếu chi từ phiếu nhập → vào đúng phiếu; phiếu chi tay cho NCC ở sổ quỹ → phiếu cũ trước; hủy phiếu chi / phiếu nhập → gỡ phân bổ. Backfill phiếu chi đã có | 0078: `allocate_supplier_voucher`, `cash_vouchers_allocate`, `cash_allocations_on_cancel` |
| **"Thanh toán"** → phiếu chi nguồn "trả nợ" (`pay_supplier`, khóa dòng NCC); **"Điều chỉnh"** / hủy điều chỉnh (không qua quỹ); nợ có điều chỉnh (`supplier_summaries` thay bản 0076, cùng chữ ký); nợ từng phiếu (`supplier_receipt_balances`) | 0078 |
| Tab **"Nợ cần trả NCC"**: Mã phiếu · Ngày · Cần trả · Đã trả · Còn nợ, dòng điều chỉnh (hủy được), dòng "Trả trước", tổng "Nợ cần trả hiện tại"; form Thanh toán ("Chọn công nợ trả") và Điều chỉnh (Tăng / Giảm nợ, Mô tả) | `nha-cung-cap/[id]/page.tsx`, `nha-cung-cap/actions.ts` |
| Lọc **"Đang nợ"** ở danh sách NCC; lọc **Chưa thanh toán / Thanh toán một phần / Đã thanh toán** ở danh sách phiếu nhập | `nha-cung-cap/page.tsx`, `inventory/phieu-nhap/page.tsx` |
| "Đã trả" và "Lịch sử thanh toán" của phiếu nhập tính theo phân bổ (gồm cả lần trả nợ sau); phiếu không NCC tính theo phiếu chi đi kèm | `lib/purchasing/data.ts`, `inventory/phieu-nhap/[id]/page.tsx` |
| Test | `tests/rls/p20-debt.test.ts`, `tests/rls/{matrix-cases,fixtures,matrix.test}.ts`, `tests/e2e/p20-cong-no.spec.ts` |

## Bằng chứng

```
npx vitest run tests/rls/p20-debt.test.ts                          → 12 passed (12)   (bất biến kiểm sau MỖI kịch bản)
npx vitest run matrix + fixtures + p20-purchasing + p20-cashbook   → 245 passed (245)  (ma trận 30 bảng)
npm test · npx tsc --noEmit · npm run lint · npm run schema:check  → 939 passed · sạch · sạch · khớp
npx playwright test tests/e2e/p20-cong-no.spec.ts                  → 1 passed: phiếu 3tr + Điều chỉnh 5tr → nợ 8tr;
                                                                     Thanh toán 4tr → nợ 4tr, có dòng "Trả trước"; sổ quỹ
                                                                     tiền mặt có phiếu chi 4tr "Trả nợ nhà cung cấp"
npx playwright test tests/e2e/p20-nhap.spec.ts                     → 1 passed (hồi quy 20-01 sau khi đổi cách tính "Đã trả")
```

Kịch bản DB (`p20-debt`): 3 phiếu 1tr/2tr/3tr → trả 2,5tr = 0 / 0,5tr / 3tr · tích phiếu 3 trả 1tr = chỉ phiếu 3 giảm · trả 7tr =
hết cả ba, trả trước 4,5tr, nợ −4,5tr · hủy phiếu chi 7tr = nợ về 2,5tr · điều chỉnh ±5tr không sinh phiếu quỹ · hủy phiếu nhập
đã trả một phần (giữ phiếu chi) = tiền đã trả thành trả trước · trả ngay trên phiếu nhập vào đúng phiếu · phiếu chi tay ở sổ quỹ
phân bổ phiếu cũ trước · phiếu NCC khác / phiếu tạm / phiếu đã hủy → lỗi, không sinh phiếu · **hai lần trả đồng thời 800k + 800k
trên phiếu 1tr → đã trả đúng 1tr** · thu ngân 0 dòng, 42501.

Ảnh (`pho-viet`, dữ liệu tạm đã dọn): `anh/20-03-1-no-can-tra-ncc.png` (3 phiếu, điều chỉnh 2tr, trả 2,5tr phân bổ phiếu cũ
trước; nợ 5,5tr) · `anh/20-03-2-ncc-dang-no.png`.

## Trạng thái cam kết

| Yêu cầu | Trạng thái |
|---|---|
| PURCH-05 Công nợ nhà cung cấp | ☑ tab nợ, Thanh toán (phiếu cũ trước / tích chọn → phiếu chi), Điều chỉnh, Trả trước; bất biến đúng sau mọi kịch bản |

## Khác plan (và vì sao)

- **Phân bổ bằng trigger** thay vì sửa lại `save_purchase_receipt` (0076) và `create_cash_voucher` (0077): diff nhỏ hơn, và
  mọi đường sinh / hủy phiếu chi đều được giữ bất biến ở MỘT chỗ.
- **Không làm `lib/purchasing/debt.ts` (`allocateOldestFirst`)** — luật phân bổ nằm trong SQL và được test trực tiếp trên DB
  (kể cả đồng thời); một bản TS song song không có chỗ dùng.
- Phiếu chi tay cho NCC ở sổ quỹ cũng **tự phân bổ phiếu cũ trước** (plan chỉ nói về nút Thanh toán) — để "Đã trả" của phiếu
  nhập khớp với số nợ NCC.
