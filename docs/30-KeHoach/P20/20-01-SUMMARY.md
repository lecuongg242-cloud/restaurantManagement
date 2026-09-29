# 20-01 — Nhà cung cấp + phiếu nhập: kết quả

> Làm 29/09/2026. Yêu cầu PURCH-01..04, 06. Quyết định QD-027. Plan: `20-01-PLAN.md`.

## Đã làm

| Phần | Tệp |
|---|---|
| Migration `0076_purchasing` (áp production 29/09/2026) | `supabase/migrations/0076_purchasing.sql`, `supabase/schema-snapshot.json` |
| Tiền phiếu, form NCC (thuần) | `lib/purchasing/receipt.ts`, `lib/purchasing/supplier.ts`, `lib/purchasing/data.ts` |
| Quyền `purchasing` + menu "Nhà cung cấp" | `lib/auth/rbac.ts`, `components/admin/AdminNav.tsx` |
| Nhà cung cấp: danh sách, "+ Nhà cung cấp", chi tiết (Thông tin / Lịch sử nhập hàng), Ngừng hoạt động | `app/r/[slug]/admin/(protected)/nha-cung-cap/*`, `components/admin/purchasing/SupplierFields.tsx` |
| "Nhập hôm nay" thành phiếu nhập: NCC, giảm giá, Cần trả NCC, Tiền trả NCC, phương thức, **Lưu tạm / Hoàn thành** | `components/admin/inventory/ReceiptForm.tsx`, `inventory/actions.ts` (`recordReceipts`), `inventory/today/page.tsx` |
| Tab "Phiếu nhập": lọc; chi tiết; **Hủy bỏ**, **Sao chép**, sửa ngày chứng từ / ghi chú / gắn NCC; sửa tiếp phiếu tạm | `inventory/phieu-nhap/*`, `components/admin/purchasing/ReceiptTable.tsx`, `InventoryTabs.tsx` |
| Test | `tests/rls/p20-purchasing.test.ts`, `tests/rls/{matrix-cases,fixtures,matrix.test}.ts`, `tests/purchasing/*.test.ts`, `tests/auth/rbac.test.ts`, `tests/e2e/p20-nhap.spec.ts`, `tests/e2e/inventory.spec.ts` |

## Bằng chứng

```
npx vitest run tests/rls/p20-purchasing.test.ts            → 18 passed (18)
npx vitest run tests/rls/matrix.test.ts tests/rls/fixtures.test.ts → 193 passed (193)   (ma trận 27 bảng)
npm test                                                   → 89 files · 928 passed
npx tsc --noEmit                                           → sạch
npm run lint                                               → No ESLint warnings or errors
npm run schema:check                                       → Schema khớp snapshot
npx playwright test tests/e2e/p20-nhap.spec.ts             → 1 passed (360px: NCC + 2 dòng + trả một phần → Hoàn thành
                                                              → PN trong tab Phiếu nhập, nợ 375.000₫ → Hủy bỏ → sổ 0 dòng,
                                                              phiếu chi Đã hủy, nợ về 0)
npx playwright test tests/e2e/inventory.spec.ts tests/e2e/goi-y-nhap.spec.ts → 7 passed (sau khi dọn bản chốt rác, xem dưới)
```

Ảnh (quán demo `pho-viet`, dữ liệu tạm đã dọn): `anh/20-01-1-nhap-hom-nay-360.png` (form 360px, cần trả 660.000₫, trả
400.000₫, "Tính vào công nợ: 260.000₫") · `anh/20-01-2-chi-tiet-phieu-360.png` (phiếu PN, lịch sử thanh toán PC) ·
`anh/20-01-3-nha-cung-cap.png` (Tổng mua 660.000₫, Nợ cần trả hiện tại 260.000₫).

## Trạng thái cam kết

| Yêu cầu | Trạng thái |
|---|---|
| PURCH-01 Danh mục NCC | ☑ mã NCC tự sinh, SĐT trùng → lỗi, ngừng hoạt động, cột Tổng mua / Nợ; cashier 0 dòng (RLS) |
| PURCH-02 Phiếu nhập từ "Nhập hôm nay" | ☑ Lưu tạm = 0 dòng sổ; Hoàn thành ghi `receipt` ngày VN của DB; hồi quy 10-02 khớp từng cột; hai lần lưu đồng thời hai mã khác nhau |
| PURCH-03 Hủy bỏ, sao chép, danh sách | ☑ chưa chốt → xóa dòng sổ; đã chốt → dòng âm hôm nay không giá, bản chốt không đổi; hủy hai lần → lỗi |
| PURCH-04 Tiền trả NCC | ☑ phiếu chi PC đúng quỹ; không NCC mà trả thiếu → lỗi, không ghi gì |
| PURCH-06 Không dùng thì không đổi | ◐ diff `lib/orders/create-order.ts`, `lib/billing/` = 0; E2E P10 xanh; kiểm qt-food sau khi deploy |

## Khác plan (và vì sao)

- **Ghi phiếu nhập, dòng phiếu, phiếu chi CHỈ qua hàm `security definer`**; người dùng chỉ đọc bảng. Plan viết `security
  invoker` + RLS — nhưng RLS cho chủ/quản lý ghi mọi cột, tức sửa được `total` của phiếu đã nhập qua API. Nay test khẳng
  định: chủ quán `update total` → không đổi; `insert cash_vouchers` thẳng → bị từ chối.
- **`doc_counters` không vào ma trận RLS** (không policy, không quyền bảng — chỉ hàm cấp mã chạm tới) ⇒ ma trận 23 → **27**
  (plan ghi 28).
- **Giá / đơn vị gốc = đơn giá ÷ hệ số × (cần trả ÷ tổng tiền hàng)** thay vì thành tiền ÷ lượng: không có giảm giá thì
  khớp tuyệt đối đường 10-02 (thành tiền đã làm tròn đồng sẽ lệch vài phần triệu); có giảm giá thì giá vốn phản ánh giá
  thật đã trả (KiotViet phân bổ giảm giá vào giá nhập).
- **Lưu xong chuyển sang trang chi tiết phiếu** — form client giữ số cũ sau khi lưu dễ bị bấm gửi lần hai.
- **Không tạo nhanh NCC từ form nhập** — chuyển trang làm mất các dòng đang gõ; tạo ở trang Nhà cung cấp trước.
- Hủy phiếu **không** trả lại `ingredients.last_unit_cost` về giá cũ (như Sapo: hủy không hoàn giá vốn).

## Phát hiện trong lúc làm

1. **Bản chốt sổ rác trên quán demo (lỗi có từ P10, không do P20).** Fixture ma trận RLS đặt một bản chốt năm 2000 cho
   `pho-viet`. Nếu trong lúc fixture còn đó có ai mở khu Nguyên liệu của `pho-viet`, `ensureClosedThrough` chốt nối tiếp từ
   năm 2000, mỗi lần mở trang thêm 60 ngày. Ngày 29/09/2026 đã sinh **2.460 bản chốt** (2000-01-02 → 2006-09-26) ⇒ tồn lý
   thuyết cộng mọi đơn từ 2006 ⇒ POS hiện "Có thể đã hết" sai, E2E P10 đỏ. Đã xóa (chỉ `pho-viet`, ngày < 2026, tạo hôm
   nay). **Đề xuất sửa riêng:** `ensureClosedThrough` bắt đầu từ `max(bản chốt gần nhất + 1, ngày sổ đầu tiên)`, hoặc đổi ngày
   fixture; và không chạy E2E khu Nguyên liệu song song với test RLS. qt-food không bị ảnh hưởng (chưa bật kho).
2. **Giờ áp migration:** 0076 áp lúc ~21:20 giờ VN (giờ bán tối), không phải 14:22 như đã báo — `date` trong Git Bash
   không hiểu múi giờ, in giờ UTC. Migration chỉ thêm bảng + khóa `stock_entries` vài ms; không lỗi nào ghi nhận. Từ nay
   lấy giờ VN bằng Node (`toLocaleString(..., { timeZone: "Asia/Ho_Chi_Minh" })`).
3. Trên điện thoại, nút ✕ bỏ dòng xuống hàng riêng — bố cục có từ 10-02, không đổi trong plan này.
