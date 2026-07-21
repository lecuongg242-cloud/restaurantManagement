# Roadmap V1 — Hệ thống nhà hàng SaaS

**Ngày lập:** 20/07/2026 · **Cập nhật kỹ thuật:** 21/07/2026
**Nguồn:** `10-BanThietKe/00-TongThe.md` (DUYỆT) + `01/02/03-*.md` + `15-QuyetDinh/QD-005, QD-006` (CHỐT)
**Kế hoạch chi tiết P1:** `30-KeHoach/P1/` (4 plan, chia lát cắt dọc, mỗi plan test thủ công được trên trình duyệt)
**Cách đọc:** mỗi giai đoạn có mục tiêu, phụ thuộc, mã yêu cầu (`20-DanhSachYeuCau/00-Requirements.md`), tiêu chí quan sát được. Tick khi nghiệm thu (bằng chứng ở `40-KiemTra/`).

## Hành trình
Nền móng multi-tenant an toàn (P1) → dữ liệu nhà hàng (P2) → lõi order-đến-bếp realtime (P3) → dòng tiền & báo cáo (P4) → kênh khách online (P5) → đóng gói phát hành (P6). Mỗi giai đoạn kết thúc bằng demo chạy trên môi trường dev.

- [ ] **P1 — Nền tảng** (4 plan): Next.js + Supabase, auth+PIN, tenant, RLS, design system Mistral, pipeline 3 môi trường
- [ ] **P2 — Dữ liệu nhà hàng**: Menu + modifier, khu vực/bàn/QR, admin, onboarding ≤15'
- [ ] **P3 — Lõi order**: Gọi món QR mobile-first, duyệt order, POS, KDS realtime, PrintAdapter + phiếu bếp
- [ ] **P4 — Dòng tiền**: Bill gộp/tách, điều chỉnh (giảm giá/phí/VAT), thanh toán, in hóa đơn, dashboard
- [ ] **P5 — Kênh online**: Đặt bàn (duyệt tay), đặt món mang về/giao (trạng thái)
- [ ] **P6 — Phát hành**: PWA, E2E, 2 tenant demo prod, tài liệu V1.0

---

## P1 — Nền tảng
**Mục tiêu:** Khung chạy trên 3 môi trường; đăng nhập + phân quyền + cách ly tenant chứng minh bằng test.
**Phụ thuộc:** Không.
**Yêu cầu:** OPS-01, OPS-02, OPS-03, OPS-05, OPS-06, TENANT-01, TENANT-02, TENANT-04, AUTH-01..04.
**Kế hoạch (4 plan — lát cắt dọc, mỗi plan kết thúc bằng UI test thủ công; chi tiết ở `30-KeHoach/P1/`):**
- 01-01 Khung chạy (Next.js + Tailwind + shadcn + fonts) + middleware tenant (slug, chừa subdomain) + Supabase wiring + pipeline dev/prod + **trang `/style-guide` (design system Mistral, QD-006, 4 profile bề mặt)**. → *test:* mở `/style-guide` local + Vercel dev.
- 01-02 Schema lõi (tenants/profiles/memberships/super_admins) + RLS nền + `auth_tenant_ids()` + super-admin tạo tenant `/super` + owner đăng nhập email → admin shell. → *test:* tạo tenant, owner vào `/r/[slug]/admin`, chặn chéo tenant.
- 01-03 Tài khoản trạm + PIN nhân viên (PIN-only, `user_id` NULL) + RBAC + admin quản lý nhân viên. → *test:* đăng nhập trạm, chọn NV + PIN vào POS/KDS, vai trò sai bị chặn.
- 01-04 **Bộ test RLS tự động** (A ⊥ B) + 2 tenant demo + trang `/admin/data-scope` (bằng chứng cách ly bấm được) + CI. → *test:* `npm run test:rls` xanh + 2 owner thấy 2 phạm vi khác nhau.
**Nghiệm thu:** app chạy local/dev cùng codebase · super-admin tạo tenant, owner vào `/r/[slug]` · test RLS: A ⊥ B · `/style-guide` render design system + 4 profile.

## P2 — Dữ liệu nhà hàng
**Mục tiêu:** Chủ nhà hàng tự cấu hình đủ dữ liệu để sẵn sàng phục vụ.
**Phụ thuộc:** P1.
**Yêu cầu:** MENU-01, MENU-02, MENU-03, TABLE-01, TENANT-03.
**Kế hoạch:**
- 02-01 CRUD menu (danh mục, món, ảnh Storage ≤2MB) + nút hết món.
- 02-02 Modifier groups/options + phụ thu, gắn vào món.
- 02-03 Khu vực/bàn + sinh `qr_token` + xuất QR in được.
- 02-04 Luồng onboarding hướng dẫn (đo ≤15').
**Nghiệm thu:** tạo danh mục/món/tùy chọn, bật hết món · tạo bàn + xuất QR · người ngoài onboard ≤15'.

## P3 — Lõi order (giá trị cốt lõi)
**Mục tiêu:** Order từ khách/nhân viên tới bếp realtime, có duyệt và in phiếu bếp.
**Phụ thuộc:** P2.
**Yêu cầu:** TABLE-02, ORDER-01..05, PRINT-01, PRINT-02.
**Kế hoạch:**
- 03-01 Phiên bàn + gọi món QR mobile-first (menu, tùy chọn, ghi chú, giỏ, gửi).
- 03-02 Duyệt order QR trên POS (pending_confirm → confirmed) + POS thêm món thay khách.
- 03-03 KDS realtime (cột trạng thái, đổi làm/xong mức món) + đo ≤3s.
- 03-04 Hủy/sửa món có kiểm soát (manager/cashier + lý do).
- 03-05 PrintAdapter + BrowserPrintAdapter + route in phiếu bếp 58/80mm.
**Nghiệm thu:** QR→POS duyệt→KDS ≤3s (10 lần) · phiếu bếp in đúng khổ (PDF preview) · hủy món cần quyền + lý do.

## P4 — Dòng tiền
**Mục tiêu:** Chốt bill (gộp/tách), thu tiền, in hóa đơn, thấy doanh thu khớp 100%.
**Phụ thuộc:** P3.
**Yêu cầu:** BILL-01..05, PRINT-03, REPORT-01..03.
**Kế hoạch:**
- 04-01 Bill gộp cả bàn + `bill_items` phân bổ.
- 04-02 Tách bill (theo món/chia đều N) + gộp nhiều bàn.
- 04-03 Điều chỉnh: giảm giá + phí phục vụ % + VAT % (cấu hình tenant) + công thức tổng.
- 04-04 Thanh toán tiền mặt/chuyển khoản + đóng bill + in hóa đơn 80mm.
- 04-05 Dashboard: doanh thu ngày/tuần/tháng + món bán chạy + theo phương thức TT.
**Nghiệm thu:** đóng bill ≤5s · doanh thu khớp 100% (20 bill) · hóa đơn 80mm đủ nội dung.

## P5 — Kênh online
**Mục tiêu:** Khách đặt bàn và đặt món online; quản lý duyệt.
**Phụ thuộc:** P2 (menu), P3 (order/bếp).
**Yêu cầu:** RESV-01, RESV-02, ONLINE-01.
**Kế hoạch:**
- 05-01 Đặt bàn online (form) + duyệt tay + danh sách theo ngày.
- 05-02 Đặt món mang về/giao (channel≠dine_in, customer_contact) + vòng đời trạng thái tới hoàn tất.
**Nghiệm thu:** đặt bàn pending→duyệt · đơn online chạy hết vòng đời trạng thái.

## P6 — Phát hành
**Mục tiêu:** Đóng gói, kiểm thử, phát hành V1.0 trên prod.
**Phụ thuộc:** P1–P5.
**Yêu cầu:** OPS-04 + toàn bộ tiêu chí V1.
**Kế hoạch:**
- 06-01 PWA (installable) cho khách/POS/KDS.
- 06-02 E2E (Playwright) các luồng chính + test RLS chạy CI.
- 06-03 Seed 2 tenant demo trên prod + smoke test 3 loại thiết bị (giả lập trình duyệt).
- 06-04 Tài liệu phát hành V1.0 + `50-PhienBan/`.
**Nghiệm thu:** 2 tenant demo chạy prod · E2E xanh · checklist 9 tiêu chí V1 đạt (in thật hoãn tới khi có phần cứng — ghi rõ ở báo cáo).

---

## Rủi ro đã biết & cách xử lý
| Rủi ro | Xử lý |
|---|---|
| In tự động qua trình duyệt không đạt "≤5s tự động" | V1 dùng bấm-in; PrintAdapter chừa sẵn cầu in cục bộ (V1.x). Nghiệm thu "tự in" hoãn tới khi có phần cứng |
| Chưa có phần cứng test (máy in/tablet/màn bếp) | V1 nghiệm thu bằng trình duyệt + PDF preview khổ 80mm; giữ mốc "in thật" làm hạng mục hậu-V1 |
| Ghi dữ liệu khách anon rò tenant | Mọi ghi của khách qua Route Handler service role đã scope tenant (D15), không ghi trực tiếp từ client |
| Tách/gộp bill phức tạp | Mô hình `bill_items` phân bổ theo `qty_allocated`; test đối chiếu tổng = doanh thu |
