# Kế hoạch P4 — Dòng tiền (chốt bill, thu tiền, hóa đơn, báo cáo)

> Lập ngày 22/07/2026. Nguồn: `00-TongQuan/Roadmap.md` (P4), `20-DanhSachYeuCau/00-Requirements.md`
> (BILL-01..05, PRINT-03, REPORT-01..03), `10-BanThietKe/01-KyThuatChiTiet.md` (§3.5 bill/payment + công thức,
> §7 in), `15-QuyetDinh/QD-005` (D5, D6, D9) + `QD-007` (4 quyết định P4).
> **Định dạng:** theo GSD PLAN.md như P3 (frontmatter + task XML + acceptance_criteria + must_haves).
> **Tiếp nối P3:** dùng `orders/order_items` (0008), `table_sessions` (0008, đóng thủ công ở P3), snapshot giá
> (`unit_price_snapshot`), `settings` (service_charge_pct/vat_pct/allow_discount/receipt_footer), PrintAdapter (0010),
> PIN gate manager/cashier (`verifyPinForRoles` từ 03-04), realtime POS `postgres_changes` + `setAuth`.

## Nguyên tắc chia P4
Giữ ràng buộc P1–P3: **mỗi plan xây đủ frontend để test thủ công qua luồng**, kết thúc bằng checkpoint
`human-verify` (`autonomous: false`). P4 là chuỗi **order đã phục vụ → chốt bill → (tách/gộp) → điều chỉnh →
thu tiền + in hóa đơn → báo cáo**. Tiền phải khớp 100% nên logic tính toán tách thành module thuần
(`lib/billing/compute.ts`) có test đơn vị, tách khỏi UI.

| Plan | Tên | Wave | Phụ thuộc | UI test được (bấm vào) | Yêu cầu phủ |
|---|---|---|---|---|---|
| 04-01 | Bill gộp cả bàn + công thức tổng | 1 | P3 | `/r/[slug]/pos` panel bàn → "Tính tiền" → màn bill (subtotal/phí/VAT/tổng) | BILL-01, BILL-03 (công thức) |
| 04-02 | Tách/gộp bill | 2 | 04-01 | Màn bill → "Tách" (theo món / chia đều N) + "Gộp bàn" | BILL-02 |
| 04-03 | Điều chỉnh: giảm giá + phí + VAT (PIN) | 2 | 04-01 | Màn bill → giảm giá (PIN manager) + sửa %phí/%VAT | BILL-03 |
| 04-04 | Thanh toán + đóng bill + in hóa đơn 80mm | 3 | 04-01, 04-02, 04-03 | Màn bill → "Thu tiền" (mặt/CK) → đóng → in hóa đơn | BILL-04, PRINT-03, TABLE-02 (đóng) |
| 04-05 | Dashboard báo cáo | 4 | 04-04 | `/r/[slug]/admin/reports` biểu đồ + bảng | REPORT-01..03, BILL-05 |

Wave 2 (04-02 tách/gộp, 04-03 điều chỉnh) độc lập nhau (khác bề mặt trên cùng màn bill), làm song song được
sau 04-01. 04-04 cần cả hai (thu tiền trên bill đã có thể tách + điều chỉnh). 04-05 cần dữ liệu `payments` từ 04-04.

## Quyết định P4 (CHỐT 22/07/2026 — chi tiết ở QD-007)
1. **Chuyển khoản = chỉ ghi nhận** (không sinh VietQR ở V1). `payments.method ∈ {cash, transfer}`, nhập số tiền + xác nhận. VietQR động → V1.x.
2. **Tách/gộp bill = đầy đủ** §3.5: tách theo món, chia đều N người, gộp nhiều bàn. Bất biến: `Σ qty_allocated per order_item = order_item.qty`.
3. **Giảm giá + void dòng bill = PIN manager/cashier** tại chỗ (D9), tôn trọng `settings.allow_discount`.
4. **Dashboard = recharts**, mốc thời gian **ngày Việt Nam (UTC+7)**; BILL-05 đối chiếu Σ bill `paid` = tổng dashboard.

## Mô hình dữ liệu (§3.5 — migration 0012, thuộc 04-01)
```
bills(id, tenant_id, bill_no int,               -- số hóa đơn/ngày (reset nửa đêm VN, giống kitchen_no)
      table_session_id uuid null,               -- null khi gộp nhiều bàn (suy ra bàn qua bill_items→order→session)
      status text check ('open','paid','void') default 'open',
      subtotal int default 0,
      discount_type text check ('none','amount','percent') default 'none', discount_value int default 0,
      service_charge_pct int default 0, service_charge_amount int default 0,
      vat_pct int default 0, vat_amount int default 0,
      discount_amount int default 0, total int default 0,
      note text, created_by uuid null, paid_at timestamptz null, closed_by uuid null,
      created_at, updated_at)
bill_items(id, tenant_id, bill_id fk on delete cascade, order_item_id fk order_items,
      qty_allocated int check >=1, unit_price_snapshot int, amount int)   -- amount = unit_price_snapshot*qty_allocated
payments(id, tenant_id, bill_id fk on delete cascade, method text check ('cash','transfer'),
      amount int, received_by uuid null, received_at default now(), note text)
```
- **Công thức tổng** (snapshot lên bill khi tính/chốt — `lib/billing/compute.ts`, thuần + test):
  `subtotal = Σ bill_items.amount`
  `discount_amount = discount_type='amount' ? min(discount_value, subtotal) : discount_type='percent' ? round(subtotal*discount_value/100) : 0`
  `service_charge_amount = round((subtotal - discount_amount) * service_charge_pct/100)`
  `vat_amount = round((subtotal - discount_amount + service_charge_amount) * vat_pct/100)`
  `total = subtotal - discount_amount + service_charge_amount + vat_amount`
  (tất cả số nguyên VND; `round` = làm tròn nửa lên; `total ≥ 0`).
- **Bất biến tách/gộp:** với mỗi `order_item`, `Σ qty_allocated` trên mọi bill `open|paid` **= `qty` (trừ suất đã hủy)**. Tạo bill mặc định = phân bổ trọn `qty` mỗi order_item served/queued chưa nằm bill nào.

## Mặc định kỹ thuật P4
- **Nguồn bill = phiên bàn**: `openBillForSession(sessionId)` gom mọi `order_items` (status ≠ `cancelled`) của các `orders` thuộc phiên chưa được phân bổ vào bill `open|paid` → tạo `bill` (status open) + `bill_items` (qty_allocated = phần còn lại). Idempotent: gọi lại chỉ thêm phần chưa phân bổ (order gọi thêm sau khi mở bill).
- **Số hóa đơn** `bill_no`: max+1 của bill tạo trong ngày VN (giống `nextKitchenNo` 0011) — hiển thị trên hóa đơn cho dễ đối soát.
- **Điều chỉnh sống trên bill `open`**: đổi discount/pct → tính lại 4 dòng bằng `compute.ts`, `UPDATE bills`. Chốt (`paid`) khóa cứng (không sửa sau).
- **PIN gate (D9)**: giảm giá + void dòng bill → `verifyPinForRoles(['manager','cashier'])` (dùng lại từ 03-04). Thu tiền thường (không giảm giá) không cần PIN. Owner/manager đăng nhập email thao tác → tự qua.
- **Đóng phiên (TABLE-02 phần còn)**: khi mọi `bills` của `table_session` = `paid` → `table_sessions.status=closed` + `closed_at`, bàn về `available`. Gộp nhiều bàn: đóng mọi phiên góp order_items vào bill khi bill paid (nếu phiên không còn order_item chưa thu).
- **RLS + realtime**: 3 bảng RLS `auth_tenant_ids()` (mẫu 0008). Thêm `bills` vào publication `supabase_realtime` để 2 thu ngân cùng bàn thấy nhau (POS dùng `postgres_changes` + `setAuth` như P3). `payments/bill_items` không cần realtime.
- **In hóa đơn (§7, D1)**: implement `BrowserPrintAdapter.printReceipt(bill)` → mở `/r/[slug]/print/receipt/[billId]?w=80` (mặc định 80mm; dùng lại hạ tầng khổ giấy như phiếu bếp). Nội dung: tên+logo NH, bàn/bill_no, ngày giờ, danh sách món+đơn giá+thành tiền, dòng giảm giá/phí/VAT, tổng, footer (`receipt_footer`). Ghi `print_jobs` type=`receipt`.
- **Báo cáo (§ admin)**: `lib/billing/reports.ts` (server, RLS phiên admin) query tổng hợp theo mốc ngày VN. `/r/[slug]/admin/reports` — recharts chỉ import ở client component khu này.
- **RBAC**: chốt bill/thu tiền/tách-gộp = cashier/manager/owner (canAccess 'pos'); báo cáo = manager/owner (canAccess 'admin' hoặc canManage). Kiểm ở server action.

## Migration P4 (tiếp nối 0001–0011)
- `0012_bills_core.sql` (04-01) — `bills`, `bill_items`, `payments` + RLS tenant + index (`bills(tenant_id,status)`, `bills(tenant_id,table_session_id)`, `bill_items(tenant_id,bill_id)`, `bill_items(tenant_id,order_item_id)`, `payments(tenant_id,bill_id)`, `bills(tenant_id, paid_at)` cho báo cáo) + `alter publication supabase_realtime add table public.bills`.
- 04-02/03/04/05: KHÔNG migration mới.

## Nghiệm thu P4 (khớp Roadmap)
1. Bill gom mọi order của phiên bàn; công thức subtotal→giảm giá→phí→VAT→tổng đúng từng đồng (04-01, BILL-01/03).
2. Tách 1 bàn theo món + chia đều N; gộp nhiều bàn thành 1 bill; `Σ qty_allocated = qty` (04-02, BILL-02).
3. Giảm giá (số tiền/%) cần PIN manager/cashier; sửa %phí/%VAT theo tenant (04-03, BILL-03).
4. Thu tiền mặt/CK → đóng bill ≤5s → bàn về available; in hóa đơn 80mm đủ nội dung không tràn (04-04, BILL-04/PRINT-03/TABLE-02).
5. Dashboard doanh thu ngày/tuần/tháng + món bán chạy + theo phương thức TT; **doanh thu khớp 100%** đối chiếu 20 bill (04-05, REPORT-01..03/BILL-05).

## Stack thêm cho P4
- `recharts` (04-05, biểu đồ báo cáo — chỉ khu admin). In = CSS `@media print` dùng lại hạ tầng khổ giấy phiếu bếp (03-05). Không thêm lib khác.

## Cách chạy manual test (chung)
- POS thu ngân: đăng nhập station (`station@pho-viet.test`) hoặc owner (`ownerA@pho-viet.test / DemoPass123!`); cần vài order đã "Đã phục vụ" ở 1 bàn (chạy luồng P3 trước).
- PIN manager/cashier: chọn nhân viên vai trò manager/cashier + PIN (từ /admin/staff) khi giảm giá.
- In hóa đơn: xem PDF preview `window.print()` khổ 80mm (chưa cần phần cứng — theo rủi ro Roadmap).
- Báo cáo: `/r/pho-viet/admin/reports` (đăng nhập owner/manager).
