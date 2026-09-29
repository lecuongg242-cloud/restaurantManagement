# 20-04 — Kết quả kinh doanh (lãi lỗ) + thuế nộp nhà nước: kết quả

> Làm 29/09/2026. Yêu cầu REPORT-20. Quyết định QD-027 D12, C5 (chỉ chủ), C9 (thuế). Plan: `20-04-PLAN.md`.

## Đã làm

| Phần | Tệp |
|---|---|
| Migration `0079_report_pnl` (áp production 29/09/2026 22:22 giờ VN; chỉ hàm): `owner_tenants`, `report_pnl`, `report_pnl_expenses` — **tự lọc CHỦ quán ở DB** | `supabase/migrations/0079_report_pnl.sql`, `supabase/schema-snapshot.json` |
| Dựng báo cáo (thuần): Doanh thu bán hàng − Giảm giá = DT món thuần + Phí phục vụ = **DT thuần** − Giá vốn = **LN gộp** − Chi phí (theo loại) + Thu nhập khác = **Lợi nhuận** − Thuế (ước tính) = **LN sau thuế**; gộp chi nhánh | `lib/reports/pnl.ts` |
| Tải số: doanh thu mốc KPI (`business_at`); giá vốn = khối lãi gộp REPORT-13 khi quán có định lượng, ngược lại = tiền mua theo phiếu nhập (ngày chứng từ) | `lib/reports/pnl-server.ts` |
| Khối **"Kết quả kinh doanh"** trên Báo cáo (một chi nhánh + "Tất cả chi nhánh"), dòng nối VAT → KPI, ghi chú món chưa đủ giá / tạm tính / phiếu chi nguyên liệu bị loại; **xuất Excel** (`export_logs.kind = pnl`) | `components/admin/reports/PnlPanel.tsx`, `reports/page.tsx`, `components/brand/BaoCaoChuoiView.tsx`, `reports/ket-qua-kinh-doanh/route.ts` |
| Quyền `finance` — **chỉ owner** | `lib/auth/rbac.ts` |
| Cài đặt → **"Thuế nộp nhà nước"**: tối đa 5 dòng (tên, %, trên doanh thu / lợi nhuận), chỉ owner | `lib/tenant/settings.ts` (`taxes`, `parseTaxes`), `settings/{page,actions}.tsx` |
| Test | `tests/reports/pnl.test.ts`, `tests/tenant/settings-taxes.test.ts`, `tests/rls/p20-pnl.test.ts`, `tests/auth/rbac.test.ts`, `tests/e2e/p20-lai-lo.spec.ts` |

## Bằng chứng

```
npx vitest run tests/reports/pnl.test.ts tests/tenant/settings-taxes.test.ts → 12 passed
npx vitest run tests/rls/p20-pnl.test.ts                    → 6 passed
npm test                                                    → 92 files · 957 passed
npm run test:rls                                            → 35 files · 543 passed   (toàn bộ, sau cả P20)
npx tsc --noEmit · npm run lint · npm run schema:check      → sạch · sạch · khớp
E2E p20-nhap, p20-so-quy, p20-cong-no, p20-lai-lo, inventory, goi-y-nhap → 11 passed
  (reports.spec: 7 skipped — cần E2E_REPORT_EMAIL, điều kiện có từ trước)
```

- **Đo trước khi chốt công thức** (chỉ đọc, 08/2026): Σ(tiền món − giảm giá + phí phục vụ + VAT) = Σ total — qt-food 3.009 HĐ,
  pho-viet 294 HĐ, lệch 0đ.
- **Nghiệm thu 2 — qt-food tháng 08/2026** (`report_pnl` đóng vai chủ qt-food trong giao dịch `read only`, ROLLBACK): 3.009 HĐ,
  Doanh thu thuần 327.290.000₫ + VAT 0₫ = KPI 327.290.000₫ = `report_summary`, **lệch 0đ**. qt-food chưa khai định lượng ⇒ giá vốn
  sẽ theo tiền mua.
- **Nghiệm thu 3 — `pho-viet` tháng 09** (ảnh `anh/20-04-1-ket-qua-kinh-doanh.png`): DT thuần 85.513.000₫; chi phí Thuê mặt bằng
  5.000.000₫ + Điện 850.000₫; lợi nhuận 79.663.000₫; GTGT 3% = 2.565.390₫, TNCN 1,5% = 1.282.695₫ (tính tay khớp); LN sau thuế
  75.814.915₫. Ảnh khai thuế: `anh/20-04-2-khai-thue.png`.

## Trạng thái cam kết

| Yêu cầu | Trạng thái |
|---|---|
| REPORT-20 Kết quả kinh doanh + thuế | ☑ dòng nối lệch 0đ (qt-food 08, pho-viet); không tính nguyên liệu hai lần; trả NCC / số dư / phiếu hủy không vào chi phí; thuế theo doanh thu / lợi nhuận, lỗ → 0; chỉ chủ (quản lý 0 dòng, xuất 403); chuỗi = Σ chi nhánh bạn là chủ |

## Khác plan (và vì sao)

- **Giá vốn tính ở TS bằng đúng đường REPORT-13** (`getInventoryReportBlock`) thay vì cột `cogs` trong `report_pnl` — không chép
  công thức lãi gộp sang SQL thứ hai; trang một chi nhánh dùng lại khối đã tính (không tính hai lần).
- **Chế độ giá vốn theo "quán có định lượng"** (`recipe_lines`), không theo "có bản chốt": quán chỉ nhập hàng mà không khai định
  lượng vẫn có bản chốt nhưng mọi món "chưa đủ giá" ⇒ lợi nhuận sai; nay dùng tiền mua.
- **Hai mốc thời gian** vẫn còn như plan cảnh báo: doanh thu theo `business_at` (KPI), giá vốn REPORT-13 theo `paid_at` — hóa đơn
  mở qua nửa đêm có thể lệch một ngày ở giá vốn. Dòng nối doanh thu không bị ảnh hưởng (cùng mốc KPI).
- Xuất Excel là **đường riêng** `reports/ket-qua-kinh-doanh` (quyền `finance`), không gộp vào file báo cáo chung mà quản lý tải được.
- Khối trên trang chuỗi ghi rõ "N chi nhánh bạn là chủ" — chủ chuỗi chỉ là quản lý ở chi nhánh khác sẽ không thấy số của chi nhánh đó.
