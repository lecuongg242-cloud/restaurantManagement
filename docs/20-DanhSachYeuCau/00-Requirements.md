# Danh sách yêu cầu V1 — Hệ thống nhà hàng SaaS

**Ngày lập:** 20/07/2026
**Giá trị cốt lõi:** Order từ bàn đến bếp không thất lạc, doanh thu chính xác tức thời.
**Quy ước:** Mỗi yêu cầu có mã `[NHÓM]-[SỐ]`, trạng thái tick khi ĐẠT (có bằng chứng trong `docs/40-KiemTra/`).

## Yêu cầu V1

### TENANT — Nền tảng SaaS multi-tenant

- [ ] **TENANT-01**: Super-admin tạo được tenant mới (tên, slug, logo); tenant có URL riêng `/r/[slug]`
- [ ] **TENANT-02**: Mọi bảng nghiệp vụ có `tenant_id` + RLS; user tenant A không đọc/ghi được dữ liệu tenant B (test tự động chứng minh)
- [ ] **TENANT-03**: Chủ nhà hàng hoàn thành onboarding (nhà hàng + 10 món + 5 bàn + in QR) trong ≤ 15 phút

### AUTH — Đăng nhập & phân quyền

- [ ] **AUTH-01**: Nhân viên đăng nhập bằng email + mật khẩu (Supabase Auth); phiên giữ sau khi refresh
- [ ] **AUTH-02**: 5 vai trò: owner, manager, cashier, waiter, kitchen — mỗi vai trò chỉ thấy đúng màn hình của mình
- [ ] **AUTH-03**: Owner mời/khóa tài khoản nhân viên; nhân viên bị khóa mất truy cập ngay
- [ ] **AUTH-04**: Khách KHÔNG cần đăng nhập (QR gọi món, đặt bàn, đặt món online)

### MENU — Thực đơn

- [ ] **MENU-01**: Quản lý danh mục + món: tên, giá VND, mô tả, ảnh (≤ 2MB), tùy chọn (size/topping đơn giản)
- [ ] **MENU-02**: Bật/tắt "hết món" — ẩn ngay khỏi app khách (realtime)
- [ ] **MENU-03**: Menu khách hiển thị mobile-first, tải lần đầu ≤ 3 giây trên 4G

### TABLE — Khu vực, bàn & QR

- [ ] **TABLE-01**: Quản lý khu vực + bàn; mỗi bàn có mã QR duy nhất, xuất được file in (PDF/PNG)
- [ ] **TABLE-02**: Sơ đồ bàn POS hiển thị trạng thái realtime: trống / đang phục vụ / chờ thanh toán

### ORDER — Gọi món QR + POS

- [ ] **ORDER-01**: Khách quét QR → menu đúng nhà hàng + đúng bàn, chọn món + số lượng + ghi chú, gửi order không cần đăng nhập
- [ ] **ORDER-02**: Order xuất hiện trên KDS + POS trong ≤ 3 giây (đo 10 lần liên tiếp)
- [ ] **ORDER-03**: Khách theo dõi trạng thái món của bàn mình (đã nhận → đang làm → xong)
- [ ] **ORDER-04**: Nhân viên order thay khách tại POS (chọn bàn → thêm món); order gộp chung vào bàn
- [ ] **ORDER-05**: Thao tác gọi món của khách hoàn tất ≤ 6 chạm; nút bấm ≥ 44px; không vỡ layout từ 360px
- [ ] **ORDER-06**: Mỗi order tối đa 50 món; chặn gửi order khi bàn đã đóng bill

### KDS — Màn hình bếp

- [ ] **KDS-01**: Hàng đợi món theo thứ tự thời gian, nhóm theo order; hiện bàn + món + số lượng + ghi chú
- [ ] **KDS-02**: Bếp bấm chuyển trạng thái: đang làm → xong; POS + khách thấy thay đổi ≤ 3 giây
- [ ] **KDS-03**: Món quá 15 phút chưa xong được tô đỏ cảnh báo

### PRINT — In ấn

- [ ] **PRINT-01**: Phiếu bếp tự in tại trạm bếp ≤ 5 giây sau khi order gửi (bàn, giờ, món, SL, ghi chú; khổ 58/80mm)
- [ ] **PRINT-02**: Hóa đơn in từ POS khổ 80mm: tên nhà hàng, bàn, món + giá, tổng — chữ rõ, không tràn khổ (test in thật)
- [ ] **PRINT-03**: In lại được hóa đơn/phiếu bếp bất kỳ từ lịch sử

### BILL — Thanh toán

- [ ] **BILL-01**: Bill gộp toàn bộ order của bàn; đóng bill ≤ 5 giây; hỗ trợ tiền mặt / chuyển khoản (QR tĩnh nếu cấu hình)
- [ ] **BILL-02**: Giảm giá theo % hoặc số tiền trên bill (ghi lý do)
- [ ] **BILL-03**: Đóng bill xong bàn tự về trạng thái trống; lịch sử bill tra cứu được

### RESV — Đặt bàn online

- [ ] **RESV-01**: Khách đặt bàn (ngày giờ, số người, SĐT, ghi chú) không cần đăng nhập; nhận mã xác nhận
- [ ] **RESV-02**: Quản lý xem danh sách đặt bàn theo ngày, duyệt/từ chối; trạng thái báo cho khách qua trang tra cứu mã
- [ ] **RESV-03**: Chặn đặt trùng: cùng khung giờ không vượt số bàn khả dụng đã cấu hình

### DELIV — Mang về / giao hàng

- [ ] **DELIV-01**: Khách đặt món online (mang về hoặc giao — nhập SĐT + địa chỉ nếu giao) không cần đăng nhập
- [ ] **DELIV-02**: Đơn online vào hàng đợi xác nhận của quản lý; xác nhận xong mới đẩy vào bếp (KDS + phiếu bếp)
- [ ] **DELIV-03**: Trạng thái đơn: chờ xác nhận → đang làm → sẵn sàng → hoàn tất/hủy; khách tra cứu bằng mã đơn

### RPT — Báo cáo

- [ ] **RPT-01**: Dashboard doanh thu ngày/tuần/tháng khớp 100% tổng bill đã đóng (đối chiếu 20 bill test)
- [ ] **RPT-02**: Top món bán chạy + số order theo khung giờ
- [ ] **RPT-03**: Xuất báo cáo CSV

### OPS — Vận hành

- [ ] **OPS-01**: 3 môi trường: local / dev (branch `dev` → Vercel dev + Supabase dev) / prod (branch `main` → Vercel prod + Supabase prod); migration bằng Supabase CLI theo pipeline
- [ ] **OPS-02**: Secrets chỉ nằm trong env vars; không có key nào trong code/log (kiểm bằng scan trước phát hành)
- [ ] **OPS-03**: Chạy prod với 2 tenant demo trên 3 loại thiết bị (điện thoại khách, tablet POS, màn hình bếp)

## Yêu cầu V2 (ghi nhận, KHÔNG làm ở V1)

- Cổng thanh toán online (VNPay/Momo), hóa đơn điện tử
- App native / thông báo đẩy
- Quản lý kho nguyên liệu, định lượng
- Tích hợp Grab/ShopeeFood
- Menu đa ngôn ngữ, khách hàng thân thiết/tích điểm

## Ngoài phạm vi

| Tính năng | Lý do |
|---|---|
| Kế toán/thuế | Ngoài giá trị cốt lõi, rủi ro pháp lý |
| Chấm công nhân viên | Không thuộc bài toán order/doanh thu |
| In LAN/Bluetooth từ server | V1 in qua trình duyệt tại trạm là đủ |

## Traceability (yêu cầu ↔ giai đoạn)

| Giai đoạn | Yêu cầu |
|---|---|
| P1 — Nền tảng | TENANT-01, TENANT-02, AUTH-01..04, OPS-01, OPS-02 |
| P2 — Menu + bàn/QR + quản trị | MENU-01..03, TABLE-01, TENANT-03 |
| P3 — QR + POS + KDS + phiếu bếp | ORDER-01..06, KDS-01..03, TABLE-02, PRINT-01 |
| P4 — Bill + in hóa đơn + báo cáo | BILL-01..03, PRINT-02, PRINT-03, RPT-01..03 |
| P5 — Đặt bàn + giao hàng | RESV-01..03, DELIV-01..03 |
| P6 — Hoàn thiện & phát hành | OPS-03 + toàn bộ tiêu chí V1 trong 00-TongThe.md |
