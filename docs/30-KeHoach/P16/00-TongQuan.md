# P16 — Báo cáo sâu và danh sách khách hàng

> Lập 27/09/2026. Plan là hợp đồng + nghiệm thu, không phải bản nháp code.
> Yêu cầu: REPORT-15..19, CUST-01..03 · Phụ thuộc: P15 (chiều chi nhánh qua RPC mảng tenant, QD-023 D5).
> Không cần QD riêng — các quy ước quy người/quy bàn ghi ở mục "Quy ước" dưới đây; đổi quy ước thì mở QD.

## Vì sao P16 là việc này

Báo cáo hiện có khá rộng (KPI, biểu đồ, nhóm món, kênh, món, TT, khu vực/bàn, heatmap giờ×thứ, hủy, giảm giá, lãi
gộp) nhưng **chưa trả lời "ai"**: nhân viên nào nhận bao nhiêu đơn, thu bao nhiêu tiền; chưa xuất được file; chưa
có danh sách khách. Đối thủ quảng cáo 48 mẫu báo cáo (CUKCUK Pro) và quản lý khách từ gói thấp.

**P16 kết thúc bằng: chủ quán biết từng nhân viên làm ra bao nhiêu (nhận đơn, thu tiền, hủy, giảm giá), bàn/khu
nào hiệu quả, xuất mọi khối ra Excel; có danh sách khách theo số điện thoại với số lần đến, tổng chi, lần gần nhất
— cho từng chi nhánh và cả chuỗi.**

## Đối thủ làm thế nào (tra 27/09/2026)

Nguồn: trang hướng dẫn chính thức (đọc qua công cụ tóm tắt; (?) = chưa xác minh).

| Việc | Đối thủ | Mình làm theo |
|---|---|---|
| Báo cáo nhân viên | **Sapo FnB** tách hai tab trong Báo cáo doanh thu: **"Doanh thu theo phục vụ"** (Nhân viên, SL mặt hàng, Tiền hàng, Doanh thu) và **"Doanh thu theo thu ngân"** (Nhân viên, Tổng số hóa đơn, Số hóa đơn hủy, SL mặt hàng, Doanh thu) [1]. KiotViet "Báo cáo nhân viên" (SL đơn, tiền hàng, giảm giá, doanh thu) [2]; CUKCUK "Doanh thu theo nhân viên" lọc bộ phận thu ngân / phục vụ [3] | Hai bảng **Theo phục vụ** (người nhận đơn) / **Theo thu ngân** (người thu tiền, theo phương thức), thêm cột hủy món + giảm giá đã duyệt |
| Bàn / khu vực | KiotViet "Báo cáo phân tích phòng bàn": tỷ lệ lấp đầy, **thời gian TB/bàn**, doanh thu mỗi bàn, hệ số quay vòng [4]; CUKCUK "Doanh thu theo khu vực khách ngồi" [3]; Sapo không có | Bảng bàn: lượt, phút ngồi TB, doanh thu, doanh thu/lượt, doanh thu/giờ ngồi |
| Nhóm món theo thời gian | CUKCUK **"So sánh doanh thu mặt hàng theo thời gian"** [3]; Sapo chỉ tổng theo kỳ | Biểu đồ nhóm món theo tuần |
| Xuất file | Sapo **"Xuất báo cáo"**, KiotViet **"Xuất file"**, POS365 **"Xuất Excel"** — đều **Excel**, xuất báo cáo đang xem với bộ lọc đang chọn; không thấy CSV | Nút **"Xuất Excel"** (`.xlsx`) xuất đúng trang báo cáo đang xem (kỳ + chi nhánh), mỗi khối một trang tính |
| Danh sách khách | Sapo: **Khách hàng, Điện thoại, Hóa đơn, Hóa đơn gần nhất, Tổng chi tiêu**, Công nợ; lọc/sắp xếp [5]. KiotViet: Tên, Điện thoại, Tổng bán; chi tiết có tab **Lịch sử bán hàng** [6]; POS365 chi tiết + ghi chú [7]. **Không đối thủ nào che SĐT theo vai trò** (chỉ iPOS ẩn SĐT trên hóa đơn in) | Cột Khách hàng · Điện thoại · Số lần · Lần gần nhất · Tổng chi tiêu; bấm vào xem lịch sử + ghi chú; **SĐT hiện đầy đủ** cho chủ và quản lý (bỏ ý che SĐT với quản lý) |

[1] https://help.sapo.vn/bao-cao-doanh-thu-tren-quan-tri-sapo-fnb ·
[2] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bao-cao/bao-cao-nhan-vien/ ·
[3] https://helpv2.cukcuk.vn/vi/kb/1050000_tinh_hinh_ban_hang ·
[4] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/bao-cao-kinh-doanh-thong-minh-tren-ung-dung-fnb-quan-ly-nha-hang/ ·
[5] https://help.sapo.vn/xem-va-loc-danh-sach-khach-hang-tren-trang-quan-tri-sapo-fnb ·
[6] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-khach-hang/khach-hang/ ·
[7] https://www.pos365.vn/docs/chi-tiet-khach-hang-1877.html

## Các plan

| Plan | Yêu cầu | Phụ thuộc | Giá trị khi dừng ở đây |
|---|---|---|---|
| 16-01 Dữ liệu nguồn sạch: SĐT chuẩn hóa, snapshot tên bàn/khu/nhóm | REPORT-15, CUST-01 | không | Báo cáo lịch sử không bị "viết lại" khi xóa bàn/đổi nhóm |
| 16-02 Báo cáo theo nhân viên | REPORT-16 | 16-01 | Biết ai làm ra doanh thu, ai hủy/giảm |
| 16-03 Khu vực/bàn sâu + nhóm món + so sánh chi nhánh | REPORT-17, REPORT-18 | 16-01, P15 15-04 | Biết bàn/khu nào hiệu quả |
| 16-04 Xuất Excel mọi khối báo cáo | REPORT-19 | không | Chủ quán tự phân tích / gửi kế toán |
| 16-05 Danh sách khách hàng | CUST-02, CUST-03 | 16-01 | Biết khách quen, gọi lại được |

## Quy ước (thay cho QD)

| Chỉ số | Quy theo | Ghi chú |
|---|---|---|
| Người **nhận đơn** | `coalesce(orders.created_by, orders.confirmed_by)` | QR tự gửi (auto_send) → "Khách tự gọi" |
| Người **thu tiền** | `payments.received_by` (qua `pay_bill`) | Bill chia đều: lấy payments của **bill con**, không lấy vỏ |
| Người **hủy món** | `order_items.cancelled_by` | Dữ liệu trước 0028 `cancelled_at` là backfill ⇒ ghi chú trên màn |
| Người **duyệt giảm giá** | `bills.discount_by` | NULL trước 0037 → "Không rõ" |
| Doanh thu | Quy ước BILL-05: `status='paid' and split_count is null`, `[paid_at)` giờ VN | Như mọi báo cáo hiện có |
| Khách của một bill | Takeaway/online: contact của đơn gốc (`online_order_id`). Tại bàn: contact của **đơn đầu tiên có SĐT** trong phiên | Một bill tại bàn có thể nhiều tên — chỉ quy cho một SĐT |

## Phát hiện khi rà code (27/09/2026)

- Báo cáo: `app/r/[slug]/admin/(protected)/reports/page.tsx`, `lib/billing/reports.ts` (8 RPC 0023 + 6 RPC hủy + 2 giảm
  giá), kho `lib/inventory/report-server.ts`. Không có VIEW. **Không có xuất file**; `package.json` không có thư viện Excel.
- Danh tính = tài khoản đăng nhập; trước 0017 có thể là tài khoản `station` dùng chung ⇒ số liệu nhân viên chỉ đúng từ khi
  có email + PIN riêng.
- **Xóa bàn là xóa cứng** (`tables/actions.ts:173-181`) và `table_sessions.table_id on delete cascade` (0008:11) ⇒ lịch sử
  rơi vào "Không gắn bàn". Tên bàn/khu **không** snapshot. Nhóm món lấy theo category **hiện tại** (0023:118-123).
- `paid_at` ghi lùi được bởi owner/manager (`bill.ts:530`) ⇒ báo cáo theo giờ phản ánh giờ đã khai.
- Khách: `orders.customer_contact {name, phone, address?}`; `reservations.customer_name/phone` (không nối order). **Chưa có
  bảng khách.** `normalizePhone` (`lib/orders/guest-contact.ts:47-51`) chỉ chạy ở client QR; online/POS/đặt bàn lưu nguyên
  chuỗi ⇒ dữ liệu cũ lẫn "+84…", có dấu cách. POS mang về không có tên thì mất luôn SĐT (`create-order.ts:498-500`).
- Index thiếu: `orders(tenant_id, created_at)`, biểu thức SĐT chuẩn hóa. Khối lượng nhỏ (~115 đơn/ngày) nhưng trần
  PostgREST 1000 dòng ⇒ tổng hợp ở SQL.

## Ràng buộc xuyên suốt

- Không đổi số của báo cáo hiện có (so trước/sau trên qt-food cho mọi khối cũ).
- RPC mới: `revoke from public, anon` + `grant authenticated`; drop + create khi đổi cột trả về.
- SĐT khách là dữ liệu cá nhân: chỉ owner/manager xem danh sách; xuất file ghi nhật ký ai xuất, lúc nào (CLAUDE.md: không lưu PII ngoài phạm vi cần).

## Không nằm trong P16

| Việc | Vì sao |
|---|---|
| Tích điểm, hạng thẻ, voucher, chiến dịch | P19 (để sau — chủ dự án chốt 27/09) |
| Ca làm, chấm công, đối soát két | Chưa có trong danh sách chủ dự án |
| Gửi SMS/Zalo cho khách | Chưa có yêu cầu |
| AI phân tích | P18 |
