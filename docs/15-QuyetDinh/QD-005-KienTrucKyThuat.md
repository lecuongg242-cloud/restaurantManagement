# QD-005 — Kiến trúc kỹ thuật V1

> **Trạng thái: ĐÃ CHỐT** — Chủ dự án xác nhận qua phỏng vấn thiết kế ngày 21/07/2026.
> Bổ nghĩa cho: `10-BanThietKe/00-TongThe.md` (ĐÃ DUYỆT). Thay cho các điểm để mở "chốt ở bản thiết kế chi tiết".

Mỗi mục = 1 quyết định, kèm lý do và hệ quả. Chi tiết triển khai: `10-BanThietKe/01-KyThuatChiTiet.md`.

| # | Quyết định | Lựa chọn V1 | Lý do | Hệ quả / chừa đường sau |
|---|---|---|---|---|
| D1 | **In ấn** | Nhân viên tự bấm in qua trình duyệt (CSS khổ 58/80mm), sau một lớp trừu tượng `PrintAdapter` | In tự động qua trình duyệt không đáng tin; ưu tiên chạy được, đơn giản | Bảng `print_jobs` + interface adapter chừa sẵn để cắm cầu in ESC/POS cục bộ (tự động) ở V1.x mà không sửa nghiệp vụ |
| D2 | **Định tuyến tenant** | Đường dẫn `/r/[slug]` | Vercel triển khai đơn giản, không cần wildcard DNS/SSL | `tenants.subdomain` (nullable) + middleware nhận diện đã chừa sẵn để bật subdomain sau |
| D3 | **Phiên khách QR** | Table session (phiên bàn) | Chuẩn nhà hàng ngồi tại chỗ VN; gộp mọi order của bàn | Bảng `table_sessions`; đóng phiên khi thanh toán xong |
| D4 | **Tùy chọn món** | Modifier groups + options có phụ thu | Phổ biến (size, topping, mức đường/đá) | Bảng `modifier_groups`, `modifier_options`, link N-N với `menu_items` |
| D5 | **Tách/gộp bill** | Gộp cả bàn + tách bill đầy đủ (theo món/người), gộp nhiều bàn | Linh hoạt thực tế | `bills` nhiều-trên-một `table_session`; `bill_items` phân bổ từng `order_item` (có `qty_allocated`) |
| D6 | **Điều chỉnh bill** | Giảm giá (số tiền/%) + phí phục vụ % + VAT %, cấu hình theo tenant | Thực tế VN hay dùng | Cột cấu hình trong `tenants.settings`; các dòng snapshot trên `bills` |
| D7 | **Đăng nhập nhân viên** | Owner/manager: email+mật khẩu (Supabase Auth). Thiết bị POS/KDS: đăng nhập 1 tài khoản "trạm" theo nhà hàng, nhân viên chọn tên + PIN 4 số để thao tác/gate thao tác nhạy cảm | Đổi ca nhanh trên thiết bị chung, vẫn truy vết được ai thao tác | **PIN = lớp phân định người + gate nghiệp vụ ở tầng app, KHÔNG phải ranh giới cách ly tenant.** Ranh giới tenant vẫn là RLS theo tài khoản Supabase của trạm/owner |
| D8 | **Duyệt order QR** | Nhân viên duyệt trước rồi mới xuống bếp/KDS | Chống order giỡn/nhầm bàn | `orders.status` bắt đầu `pending_confirm`; chỉ khi `confirmed` mới hiện KDS + tạo phiếu bếp |
| D9 | **Hủy/sửa món đã gửi bếp** | Chỉ manager/cashier, bắt buộc ghi lý do | Kiểm soát thất thoát | `order_items.cancel_reason`; bếp chỉ đổi trạng thái làm/xong |
| D10 | **Đặt bàn** | Quản lý duyệt thủ công | An toàn, không lo trùng chỗ | `reservations.status`: pending → confirmed/rejected |
| D11 | **Giao/mang về** | Tối thiểu — chỉ vòng đời trạng thái, không phí giao/vùng/tài xế | Đúng ranh giới V1 | `orders.channel` + liên hệ khách (jsonb); phí giao/vùng để V2 |
| D12 | **Báo cáo** | Doanh thu ngày/tuần/tháng + món bán chạy + theo phương thức thanh toán | Đủ giá trị cốt lõi | Theo nhân viên/khu vực để V2 |
| D13 | **SaaS/tenant** | Super-admin tạo tenant thủ công, chưa gói/subscription | Đúng ranh giới V1 | Gói + giới hạn + thu phí để V2 |
| D14 | **PWA/Offline** | Online-only, PWA cài được lên màn hình chính | Spec ghi PWA, không ghi offline | Đệm offline để V2 |
| D15 | **Truy cập dữ liệu khách (anon)** | Menu-đọc và tạo-order của khách QR đi qua Route Handler phía server (service role), scope tenant theo `slug`/`qr_token`; **không** ghi trực tiếp từ client anon | Không thể scope an toàn client anon vào đúng 1 tenant khi ghi | Staff/admin dùng client Supabase có RLS; khách dùng API server có kiểm soát |

## Làm rõ D7 — Tài khoản (cửa RLS) ≠ Người (truy vết)
> Chốt ngày 21/07/2026 sau thắc mắc của chủ dự án về "truy vết ai làm sai khi có nhiều thu ngân".

- **Tài khoản đăng nhập Supabase** = ít, là **cửa RLS**: mỗi nhà hàng có ≥1 tài khoản `role='station'` (mặc định 1, dùng cho cả POS/KDS; có thể tách thêm 1 trạm bếp). Owner/manager có tài khoản email riêng.
- **Nhân viên (cashier/waiter/kitchen)** = nhiều, mỗi người 1 **membership có `pin_hash`**, **`user_id = NULL`** (không có tài khoản Supabase riêng).
- **Truy vết**: mọi thao tác nhạy cảm (đóng bill, thanh toán, hủy món+lý do) ghi `staff_membership_id` của người vừa nhập PIN → truy được từng người mà không cần cấp tài khoản đăng nhập cho từng thu ngân.
- Hệ quả schema: `memberships.user_id` **nullable** (null cho nhân viên PIN-only); bảng nghiệp vụ ở P3/P4 (`orders`, `bills`, `payments`, `order_items`) mang cột `staff_membership_id` để truy vết.

## Nguyên tắc kỹ thuật xuyên suốt
1. **Mọi bảng nghiệp vụ có `tenant_id` + RLS bật.** Không có ngoại lệ; test RLS tự động là tiêu chí nghiệm thu P1.
2. **Snapshot giá/tên vào order & bill** khi ghi nhận — đổi giá/menu về sau không làm sai lịch sử.
3. **Realtime tối thiểu**: chỉ subscribe theo `tenant_id` + trạm (KDS/POS), lọc tại nguồn.
4. **Không secrets trong client**: service role key chỉ ở Route Handler/server.
