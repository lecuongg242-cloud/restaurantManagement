# Roadmap V1 — Hệ thống nhà hàng SaaS

**Ngày lập:** 20/07/2026 · **Nguồn:** Bản thiết kế tổng quát (ĐÃ DUYỆT 20/07/2026)
**Cách đọc:** mỗi giai đoạn có mục tiêu, phụ thuộc, yêu cầu (mã trong `20-DanhSachYeuCau/00-Requirements.md`), tiêu chí thành công quan sát được. Tick khi nghiệm thu (có bằng chứng trong `40-KiemTra/`).

## Tổng quan hành trình

Đi từ nền móng multi-tenant an toàn (P1) → dữ liệu nhà hàng (P2) → lõi giá trị order-đến-bếp realtime + in phiếu bếp (P3) → dòng tiền và báo cáo (P4) → kênh khách online (P5) → đóng gói phát hành V1 (P6). Mỗi giai đoạn kết thúc bằng demo chạy được trên môi trường dev.

- [ ] **P1: Nền tảng** — Monorepo Next.js + Supabase, auth, tenant, RLS, design system, pipeline 3 môi trường
- [ ] **P2: Dữ liệu nhà hàng** — Menu, khu vực/bàn, QR, trang quản trị, onboarding
- [ ] **P3: Lõi order** — Gọi món QR mobile-first, POS, KDS realtime, in phiếu bếp
- [ ] **P4: Dòng tiền** — Bill, thanh toán, in hóa đơn, dashboard doanh thu
- [ ] **P5: Kênh online** — Đặt bàn, đặt món mang về/giao
- [ ] **P6: Phát hành** — PWA, E2E, 2 tenant demo trên prod, tài liệu V1.0

## Chi tiết giai đoạn

### P1: Nền tảng
**Mục tiêu**: Khung dự án chạy trên cả 3 môi trường; đăng nhập, phân quyền, cách ly tenant đã được chứng minh bằng test.
**Phụ thuộc**: Không (giai đoạn đầu).
**Yêu cầu**: TENANT-01, TENANT-02, AUTH-01, AUTH-02, AUTH-03, AUTH-04, OPS-01, OPS-02
**Tiêu chí thành công**:
  1. Truy cập được app trên local, dev (Vercel), prod (Vercel) — cùng 1 codebase, branch `dev`/`main`.
  2. Super-admin tạo tenant; owner đăng nhập vào đúng tenant của mình tại `/r/[slug]`.
  3. Bộ test RLS tự động chứng minh tenant A không chạm được dữ liệu tenant B.
  4. Design system (token màu/chữ/khoảng cách + bộ component shadcn/ui tiếng Việt) render ở 1 trang style-guide.
**Kế hoạch**: 4 plan — 01-01 scaffold + môi trường; 01-02 schema lõi + RLS; 01-03 auth + vai trò; 01-04 design system.

### P2: Dữ liệu nhà hàng
**Mục tiêu**: Chủ nhà hàng tự cấu hình được toàn bộ dữ liệu để sẵn sàng phục vụ.
**Phụ thuộc**: P1.
**Yêu cầu**: MENU-01, MENU-02, MENU-03, TABLE-01, TENANT-03
**Tiêu chí thành công**:
  1. Owner tạo danh mục/món (ảnh, giá, tùy chọn), bật/tắt hết món.
  2. Tạo khu vực + bàn, xuất QR từng bàn ra file in được.
  3. Người mới onboard tenant hoàn chỉnh trong ≤ 15 phút (đo thật với 1 người không tham gia build).
**Kế hoạch**: 3 plan — 02-01 CRUD menu; 02-02 khu vực/bàn + QR; 02-03 luồng onboarding.

### P3: Lõi order (giá trị cốt lõi)
**Mục tiêu**: Vòng khép kín khách gọi món → bếp làm → phục vụ, realtime, có phiếu bếp in tự động.
**Phụ thuộc**: P2.
**Yêu cầu**: ORDER-01..06, KDS-01, KDS-02, KDS-03, TABLE-02, PRINT-01
**Tiêu chí thành công**:
  1. Quét QR trên điện thoại thật → gọi món ≤ 6 chạm → món hiện trên KDS ≤ 3 giây (10/10 lần).
  2. Phiếu bếp tự in ≤ 5 giây tại trạm bếp (trình duyệt kiosk + máy in nhiệt).
  3. Khách thấy trạng thái món; POS thấy sơ đồ bàn realtime.
**Kế hoạch**: 4 plan — 03-01 app khách QR; 03-02 realtime order pipeline; 03-03 KDS + trạng thái; 03-04 in phiếu bếp + POS order thay khách.

### P4: Dòng tiền
**Mục tiêu**: Đóng bill chính xác, in hóa đơn, chủ nhìn thấy doanh thu tức thời.
**Phụ thuộc**: P3.
**Yêu cầu**: BILL-01, BILL-02, BILL-03, PRINT-02, PRINT-03, RPT-01, RPT-02, RPT-03
**Tiêu chí thành công**:
  1. Đóng bill ≤ 5 giây, in hóa đơn 80mm đạt chuẩn (test in thật).
  2. Dashboard khớp 100% với 20 bill test.
  3. Xuất CSV mở được bằng Excel, số liệu khớp dashboard.
**Kế hoạch**: 3 plan — 04-01 bill + thanh toán + giảm giá; 04-02 in hóa đơn + lịch sử; 04-03 dashboard + CSV.

### P5: Kênh online
**Mục tiêu**: Khách đặt bàn và đặt món từ xa; quản lý kiểm soát hàng đợi xác nhận.
**Phụ thuộc**: P3 (dùng chung pipeline order/bếp), P4 (ghi nhận tiền đơn mang về).
**Yêu cầu**: RESV-01, RESV-02, RESV-03, DELIV-01, DELIV-02, DELIV-03
**Tiêu chí thành công**:
  1. Đặt bàn từ điện thoại, quản lý duyệt, khách tra cứu được trạng thái bằng mã.
  2. Đơn giao/mang về sau xác nhận chạy đúng vào KDS + in phiếu bếp như order tại bàn.
  3. Không thể đặt bàn vượt số bàn khả dụng của khung giờ.
**Kế hoạch**: 3 plan — 05-01 đặt bàn; 05-02 đặt món online; 05-03 hàng đợi xác nhận + tra cứu mã.

### P6: Phát hành V1
**Mục tiêu**: Sản phẩm chạy ổn định trên prod, sẵn sàng cho nhà hàng thật.
**Phụ thuộc**: P1–P5.
**Yêu cầu**: OPS-03 + toàn bộ 9 tiêu chí V1 trong `10-BanThietKe/00-TongThe.md`
**Tiêu chí thành công**:
  1. Bộ E2E pass trên dev + prod; PWA cài được lên màn hình chính điện thoại.
  2. 2 tenant demo vận hành thử 1 buổi (order thật từ 3 thiết bị) không mất order nào.
  3. Đủ hồ sơ phát hành: video demo ≤ 90s, ghi chú phát hành, hướng dẫn sử dụng 1 trang, backup (checklist VibeCode).
**Kế hoạch**: 3 plan — 06-01 PWA + polish UI; 06-02 E2E + vận hành thử; 06-03 hồ sơ phát hành V1.0.

## Quy tắc điều chỉnh

- Chèn việc gấp: dùng số thập phân (P3.1) và ghi rõ INSERTED + lý do vào NhatKyThayDoi.md.
- Đổi phạm vi: phải cập nhật 00-Requirements.md + ghi Quyết định (QD-00X) trước khi code.
