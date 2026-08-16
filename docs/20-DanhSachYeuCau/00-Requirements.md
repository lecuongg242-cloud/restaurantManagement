# DANH SÁCH YÊU CẦU ĐO ĐƯỢC — V1

> Phiên bản 1.0 — 21/07/2026. Nguồn: `10-BanThietKe/00-TongThe.md`, `01-KyThuatChiTiet.md`, `15-QuyetDinh/QD-005`.
> Mỗi yêu cầu có **tiêu chí chấp nhận quan sát được**. Cột "GĐ" = giai đoạn trong Roadmap. Trạng thái: ☐ chưa · ◐ đang · ☑ xong (kèm bằng chứng ở `40-KiemTra/`).

## OPS — Nền tảng & vận hành
| Mã | Yêu cầu | Tiêu chí chấp nhận | GĐ | TT |
|---|---|---|---|---|
| OPS-01 | Chạy 3 môi trường 1 codebase | Truy cập được app trên local, dev (Vercel), prod (Vercel) từ branch `dev`/`main` | P1 | ◐ (local ✓; dev/prod chờ nối Vercel) |
| OPS-02 | Migration & pipeline | Migration Supabase CLI chạy tự động khi merge; schema dev = prod | P1 | ◐ (migration CLI ✓ áp dev; CI viết sẵn, chờ secrets) |
| OPS-03 | Design system (Mistral) | 1 trang style-guide render đủ token Mistral (cam/kem) + font Fraunces/Inter/JetBrains Mono + 4 profile bề mặt (Customer/POS/KDS/Admin) + component mới, tiếng Việt (theo QD-006) | P1 | ☑ (checkpoint 01-01) |
| OPS-05 | Biến thể bề mặt | POS/KDS render biến thể dày đặc (Inter, nút ≥44px, màu status); app khách render editorial (Fraunces hero, thẻ kem) — cùng 1 bộ token | P1 | ☑ (checkpoint 01-01/03) |
| OPS-06 | Logo tenant | Logo+tên tenant hiện ở header khách, header admin, đầu hóa đơn/phiếu bếp; chrome giữ theme sản phẩm cố định | P2 | ◐ code (header admin+khách); đầu hóa đơn/phiếu bếp → P3/P4 |
| OPS-04 | PWA cài được | POS/KDS/khách cài lên màn hình chính; chạy online-only | P6 | ☐ |

## TENANT — Đa tenant & SaaS
| Mã | Yêu cầu | Tiêu chí chấp nhận | GĐ | TT |
|---|---|---|---|---|
| TENANT-01 | Super-admin tạo tenant | Super-admin tạo nhà hàng + owner; owner đăng nhập đúng tenant tại `/r/[slug]` | P1 | ☑ (checkpoint 01-02) |
| TENANT-02 | Cách ly tenant (RLS) | Bộ test tự động: user tenant A không đọc/ghi bất kỳ dữ liệu tenant B | P1 | ☑ (test:rls 6/6 PASS, 01-04) |
| TENANT-03 | Onboarding ≤ 15 phút | 1 người ngoài team tạo nhà hàng + 10 món + 5 bàn + in QR trong ≤ 15 phút (đo thật) | P2 | ◐ wizard 4 bước code xong; chờ đo ≤15' với người ngoài team |
| TENANT-04 | Định tuyến slug, chừa subdomain | `/r/[slug]` hoạt động; `tenants.subdomain` + nhánh middleware viết sẵn (tắt) | P1 | ☑ (checkpoint 01-01/02) |

## AUTH — Đăng nhập & phân quyền
| Mã | Yêu cầu | Tiêu chí chấp nhận | GĐ | TT |
|---|---|---|---|---|
| AUTH-01 | Owner/manager email | Đăng nhập Supabase email/mật khẩu vào đúng tenant | P1 | ☑ (checkpoint 01-02) |
| AUTH-02 | Thiết bị trạm | POS/KDS đăng nhập 1 lần bằng tài khoản station của nhà hàng (tương thích; không còn bắt buộc sau QD-009) | P1 | ☑ (checkpoint 01-03) |
| AUTH-03 | Đăng nhập nhân viên Email+PIN | Cashier/waiter/kitchen đăng nhập thẳng ở `/pos\|/kds/login` bằng email riêng + PIN 4 số → vào ngay bề mặt với đúng danh tính; thao tác gắn `staff_id`. Không còn bước "Chọn nhân viên" (QD-009) | P1 | ◐ (P5 — chuyển sang email+PIN) |
| AUTH-04 | RBAC theo vai trò | Mỗi vai trò chỉ thấy/làm đúng chức năng (owner/manager/cashier/waiter/kitchen); test phân quyền | P1 | ☑ (checkpoint 01-03) |
| AUTH-05 | Phân quyền chi tiết trong khu admin | `canManage(role, section)` là **ma trận thật** theo QD-010: `settings` chỉ owner; `menu`/`tables`/`staff`/`onboarding`/`reports` cho owner+manager. Sidebar `AdminNav` **ẩn hẳn** mục không có quyền (không hiện rồi chặn). Đăng nhập manager: sidebar không có "Cài đặt"; gõ thẳng `/admin/settings` → bị đá về `/admin`. Test `tests/auth/rbac.test.ts` phủ 6 vai trò × 6 mục | P6 | ◐ code xong (06-01); rbac.test 73/73 + smoke 8/8 PASS; chờ checkpoint |
| AUTH-06 | Owner cấp tài khoản quản lý | Owner tạo được thành viên vai trò `manager` ngay ở `/admin/staff` — nhánh **mật khẩu ≥8 ký tự**, không phải PIN 4 số (QD-010 §4). Manager chỉ tạo/sửa/xóa được cashier/waiter/kitchen: form manager KHÔNG có lựa chọn vai trò `manager`, và server action từ chối nếu manager gửi `role=manager` hoặc đụng membership của owner | P6 | ◐ code xong (06-01); smoke xác nhận owner tạo được manager, manager không thấy option "Quản lý"; chờ checkpoint |

## MENU
| Mã | Yêu cầu | Tiêu chí chấp nhận | GĐ | TT |
|---|---|---|---|---|
| MENU-01 | CRUD danh mục & món | Tạo/sửa/xóa danh mục, món (ảnh ≤2MB, giá, mô tả), sắp xếp | P2 | ◐ code xong (02-01); chờ checkpoint |
| MENU-02 | Nút "hết món" (86) | Bật/tắt `is_available` món & option; khách không đặt được món hết | P2 | ◐ toggle admin+DB code xong (02-01/02); "khách thấy Hết" → P3 |
| MENU-04 | "Hết món" bật được ngay trên POS/KDS | Nhân viên (cashier/waiter/kitchen/station) bật/tắt "hết món" **tại `/pos`**, không phải vào khu admin (QD-010 §5). Món đã tắt hiện mờ + nhãn "Hết" trong `MenuPanel` và không thêm vào giỏ được; khách ở `/menu` thấy Hết ≤ lần tải kế tiếp. Quyền `canToggleAvailability` chỉ mở đúng cột `is_available`: test khẳng định cashier gọi được `setItemAvailable` nhưng KHÔNG gọi được `updateItem`/`deleteItem` | P6 | ◐ code xong (06-01); smoke 7/7 PASS (POS toggle + KDS drawer + khách thấy "Hết"); chờ kiểm bằng tài khoản cashier/kitchen thật |
| MENU-03 | Nhóm tùy chọn + phụ thu | Tạo modifier group (min/max/required) + option có phụ thu; gắn vào món | P2 | ◐ code xong (02-02); chờ checkpoint |

## TABLE — Khu vực, bàn, QR
| Mã | Yêu cầu | Tiêu chí chấp nhận | GĐ | TT |
|---|---|---|---|---|
| TABLE-01 | Khu vực + bàn + QR | Tạo khu vực/bàn (số ghế); xuất QR từng bàn ra file in được | P2 | ◐ code xong (02-03); chờ checkpoint |
| TABLE-02 | Phiên bàn | Quét QR mở/ghép vào phiên bàn đang mở; đóng phiên khi thanh toán xong | P3 | ☐ |

## ORDER — Gọi món & bếp
| Mã | Yêu cầu | Tiêu chí chấp nhận | GĐ | TT |
|---|---|---|---|---|
| ORDER-01 | Gọi món QR mobile-first | Khách quét QR → menu đúng nhà hàng+bàn → chọn món+tùy chọn+ghi chú → gửi; gọi món ≤ 6 chạm, nút ≥44px, không vỡ ở 360px | P3 | ☐ |
| ORDER-02 | Duyệt order QR | Order QR vào `pending_confirm` trên POS; nhân viên duyệt → mới xuống KDS + tạo phiếu bếp | P3 | ☐ |
| ORDER-12 | Đơn chờ duyệt phải KHÔNG THỂ BỎ LỠ | Có đơn chờ → banner full-width nền kem + viền primary dày ngay dưới header, chuông rung, chip từng đơn (bàn · giờ · số món) bấm mở drawer, nút "Xem & duyệt". Nút header đổi sang nền primary + badge. Hết đơn chờ → banner biến mất, nút về dạng viền. Không duyệt tắt từ banner (D8: phải xem món trước) | P5 | ◐ code xong; chờ checkpoint |
| ORDER-03 | POS thêm món thay khách | Nhân viên mở bàn, thêm món vào phiên bàn (source=staff, bỏ duyệt) | P3 | ☐ |
| ORDER-04 | KDS realtime | Món `confirmed` hiện trên KDS ≤ 3s (đo 10 lần); bếp đổi trạng thái làm/xong ở mức món | P3 | ☐ |
| ORDER-05 | Hủy/sửa món có kiểm soát | Chỉ manager/cashier hủy món đã gửi, bắt buộc ghi lý do; có log | P3 | ◐ phần "kiểm soát" xong từ P3; phần "có log" đọc lại được ở ORDER-17/18 + REPORT-10; chờ checkpoint |
| ORDER-06 | Gọi nhân viên từ bàn | Khách quét QR bấm "Gọi nhân viên", có thể kèm yêu cầu (chip gợi ý nhanh hoặc tự ghi) → POS hiện banner "bàn đang gọi" + nội dung yêu cầu realtime; nhân viên bấm để đánh dấu đã xử lý. Dedupe 45s theo từng nội dung | P5 | ◐ code xong; chờ đo realtime |
| ORDER-14 | Gọi thêm cho đơn không gắn bàn | Nút **"Gọi thêm"** trên đơn mang về/tại quầy đang chờ → ô "Đơn mới" đổi sang chế độ nối vào đơn đó (hiện rõ *"Đang thêm vào Đơn #N"* + nút bỏ liên kết) → tạo ra **đơn thật** có số bếp + phiếu bếp riêng nhưng `parent_order_id` trỏ đơn gốc (QD-011). Panel hiện nhóm thành **MỘT khối** ("Đơn #N · +2 lượt gọi thêm"), tổng chung, **MỘT** nút "Thu tiền & hoàn tất" → 1 bill, 1 hóa đơn, thu 1 lần; cả nhóm chuyển `completed` và rời hàng đợi. Gọi thêm sau khi đã bấm mở bill thì tổng bill **tự đồng bộ** (không thiếu món mới). Hủy đơn gốc → hủy cả nhóm với 1 lý do | P6 | ◐ code xong (06-02); migration 0021 đã áp dev; 112 unit test + smoke 13/13 PASS; đối chiếu DB: 1 nhóm = 1 bill paid, cả nhóm `completed`; chờ checkpoint |
| ORDER-13 | Ảnh bìa + avatar nhà hàng | Admin → Cài đặt upload **ảnh bìa** (ngang) và **logo/avatar** (≤2MB, PNG/JPEG/WebP) trong một lần lưu. Trang chào bàn: bìa full-width + lớp tối nhẹ ở đáy, avatar TRÒN viền trắng nhô lên đè bìa. Chưa có bìa → dải gradient sunset như cũ; chưa có logo → chữ cái đầu trên nền primary. Cột `tenants.cover_url` (migration 0019) | P5 | ◐ code xong; chờ checkpoint |
| ORDER-07 | Trang chào bàn (A0) | QR trỏ `/r/{slug}?t={token}` → thẻ nhận diện (tên NH, bàn, tên khách sửa được) + 2 lối hỗ trợ + CTA vào thực đơn; token sai/thiếu → chỉ-xem (ẩn hành động cần bàn). Tên khách nhập ở đây prefill sẵn ô bắt buộc trong giỏ | P5 | ◐ code xong; chờ checkpoint |
| ORDER-08 | Gọi thanh toán từ bàn | Nút "Gọi thanh toán" trên trang chào → chọn hình thức (tiền mặt/chuyển khoản/thẻ) → ghi `staff_calls` với note mở đầu "Thanh toán · …" nên POS thấy ngay cùng danh sách gọi; không cần loại call riêng | P5 | ◐ code xong; chờ checkpoint |
| ORDER-09 | Panel "Đơn của bạn" | Nút chat nổi mở panel liệt kê các đơn đã gửi TỪ THIẾT BỊ NÀY (orderId lưu sessionStorage theo bàn) kèm trạng thái + món + tạm tính; chạm để mở trang theo dõi. **Panel đang mở phải TỰ đổi trạng thái realtime** khi POS duyệt: Broadcast `order:{id}` (push qua WebSocket). Polling 15s CHỈ bật khi kênh báo `CHANNEL_ERROR`/`TIMED_OUT`; `CLOSED` KHÔNG tính là lỗi (chính `removeChannel()` bắn ra nó). Tab quay lại → refetch 1 lần thay vì poll. **Tiêu chí đo: panel mở 50s không tương tác = 0 request `/api/order/`** | P5 | ◐ code xong; đo trên dev (StrictMode) + production |
| ORDER-10 | Hỏi tên khách khi vào bàn | Modal GIỮA màn hình mở ngay khi vào bàn (nền che `bg-ink/75` + blur): **tên bắt buộc**, SĐT tùy chọn (có nhập thì phải đúng định dạng VN, tự đổi +84→0). Không đóng được (Esc/bấm nền/X đều không) tới khi có tên. Chặn cả `/menu?t=` (QR cũ) để không lách. Đã điền → không hỏi lại trong phiên. **Giỏ hàng KHÔNG có ô nhập lại** — chỉ hiện "Khách: tên · SĐT" kèm nút "Sửa" mở lại modal. Dùng chung `contact:{slug}:{bàn}` | P5 | ◐ code xong; chờ checkpoint |
| ORDER-11 | Bottom sheet không vỡ khi mở bàn phím | Chạm ô text trong sheet (giỏ, ghi chú món, gọi nhân viên, lý do hủy) → sheet KHÔNG trôi lên/mất phần trên, ô nhập vẫn chạm được. Tắt `repositionInputs` của vaul (nó set height/bottom px sai trên iOS Safari) + `interactiveWidget: resizes-content` | P5 | ◐ code xong; **chờ kiểm trên iPhone thật** |
| ORDER-15 | Gọi món tại bàn bằng điện thoại | Nhân viên đã đăng nhập mở `/r/{slug}/pos/m` → danh sách bàn (nhóm theo khu vực, hiện bàn nào đang có món) → chọn bàn → thực đơn (tìm món, tùy chọn, ghi chú, báo hết món) → "Gửi về quầy". Đơn vào thẳng `confirmed` (`source=staff`, KHÔNG qua hàng chờ duyệt), gắn đúng phiên bàn nên gọi thêm gom chung một bill. Gửi xong hiện xác nhận "Đã gửi về quầy · Bàn X · N món" + lối về danh sách bàn. Không vỡ ở 360px, mọi nút ≥44px, từ mở màn tới gửi ≤ 8 chạm. Chế độ quầy (`service_mode=counter`) không có bàn → màn báo rõ và trỏ về POS quầy | P6 | ☐ |
| ORDER-16 | Đơn cần in phiếu bếp không thể bỏ lỡ | POS quầy hiện banner **"Đơn cần in phiếu (N)"** liệt kê đơn CÓ BÀN, đã `confirmed` trong ngày VN, mà `print_jobs` chưa có phiếu bếp nào. Chip từng đơn (Bàn · #số đơn · N món · giờ) bấm là in ngay tại máy quầy; in xong chip rời banner ≤2s; hết đơn thì banner biến mất. Sinh ra vì đơn gõ từ điện thoại (ORDER-15) không đi qua hàng chờ duyệt nên trước đó quầy không có tín hiệu nào để biết phải in | P6 | ☐ |
| ORDER-17 | Lịch sử POS hiện lý do hủy | Tab "Đã xong" → đơn/món bị hủy hiện `Đã hủy HH:MM · "<lý do>" · <tên> (<vai trò>)`; hủy cả đơn thì lý do hiện MỘT lần ở đầu thẻ, không lặp ở từng món | P7 | ◐ code+kiểm xong (unit 194/194, tsc+lint sạch; 0027+0028 đã áp dev); chờ checkpoint |
| ORDER-18 | Lọc đơn hủy + tách con số tổng kết | Chip **Tất cả / Đã thu / Đã hủy** lọc ở SERVER (đơn ngoài trang hiện tại vẫn ra); dòng tổng kết tách `<N> đơn đã thu · <tiền>` và `<M> đơn hủy` | P7 | ◐ code+kiểm xong (unit 194/194, tsc+lint sạch; 0027+0028 đã áp dev); chờ checkpoint |

## BILL — Bill & thanh toán
| Mã | Yêu cầu | Tiêu chí chấp nhận | GĐ | TT |
|---|---|---|---|---|
| BILL-01 | Gộp bill cả bàn | Bill gom mọi order của phiên bàn | P4 | ☐ |
| BILL-02 | Tách/gộp bill | Tách 1 bàn thành nhiều bill (theo món/chia đều N người); gộp nhiều bàn thành 1 bill | P4 | ☐ |
| BILL-03 | Điều chỉnh bill | Thêm giảm giá (số tiền/%), phí phục vụ %, VAT % (cấu hình tenant); tổng tính đúng công thức | P4 | ☐ |
| BILL-04 | Thanh toán | Ghi nhận tiền mặt/chuyển khoản; đóng bill; bàn về trạng thái phù hợp | P4 | ☐ |
| BILL-05 | Doanh thu khớp 100% | Doanh thu ngày trên dashboard = tổng bill đã đóng (đối chiếu 20 bill test) | P4 | ☐ |
| BILL-06 | Hủy món trừ đúng tiền hóa đơn đang mở | Bàn có bill `open`, hủy 1 món → tổng bill giảm đúng tiền món đó; hủy hết món → bill bị xóa, bàn về "chưa có hóa đơn". Không đụng bill `paid` | P7 | ◐ code+kiểm xong (unit 194/194, tsc+lint sạch; 0027+0028 đã áp dev); chờ checkpoint |

## PRINT — In ấn
| Mã | Yêu cầu | Tiêu chí chấp nhận | GĐ | TT |
|---|---|---|---|---|
| PRINT-01 | PrintAdapter | Interface `PrintAdapter`; BrowserPrintAdapter là mặc định V1; BridgePrintAdapter chừa sẵn (không sửa nghiệp vụ) | P3 | ☐ |
| PRINT-02 | Phiếu bếp | Bấm in phiếu bếp: bàn, giờ, món+SL+tùy chọn+ghi chú; khổ 58/80mm rõ, không tràn (test PDF preview V1) | P3 | ☐ |
| PRINT-03 | Hóa đơn khách | Bấm in hóa đơn: tên NH, bàn, món+giá, các dòng điều chỉnh, tổng; khổ 80mm đủ, không tràn | P4 | ☐ |

## RESV / ONLINE — Đặt bàn & kênh online
| Mã | Yêu cầu | Tiêu chí chấp nhận | GĐ | TT |
|---|---|---|---|---|
| RESV-01 | Đặt bàn online | Khách gửi đặt bàn (ngày giờ, số người, SĐT) → `pending` | P5 | ☐ |
| RESV-02 | Duyệt đặt bàn | Quản lý xác nhận/từ chối; thấy danh sách đặt bàn theo ngày | P5 | ☐ |
| ONLINE-01 | Đặt món mang về/giao | Khách chọn món + SĐT/địa chỉ → đơn vào hàng đợi; vòng đời trạng thái tới hoàn tất (không phí giao/tài xế) | P5 | ☐ |

## REPORT — Báo cáo
| Mã | Yêu cầu | Tiêu chí chấp nhận | GĐ | TT |
|---|---|---|---|---|
| REPORT-01 | Doanh thu ngày/tuần/tháng | Tổng doanh thu, số bill, TB/bill theo mốc thời gian | P4 | ◐ code+kiểm xong (0023 RPC; unit 30/30, e2e 6/6 trên tenant thật); chờ checkpoint |
| REPORT-02 | Cơ cấu doanh thu theo từng món | Xếp món theo TIỀN đóng góp (không theo số lượng — món rẻ bán nhiều dễ đứng đầu nhưng đóng góp ít), kèm tỷ trọng **2 chữ số thập phân** (28,35% — không làm tròn về số nguyên, dòng nhỏ như 0,41% không bị bóp thành 0%) và số phần. Hiện 20 món đầu, phần còn lại gộp "Món khác" tính bù từ tổng KPI nên Σ luôn đủ 100% | P4 | ◐ code+kiểm xong (0023 RPC; unit 30/30, e2e 6/6 trên tenant thật); chờ checkpoint |
| REPORT-03 | Theo phương thức TT | Tách tiền mặt vs chuyển khoản để đối soát chốt ca | P4 | ◐ code+kiểm xong (0023 RPC; unit 30/30, e2e 6/6 trên tenant thật); chờ checkpoint |
| REPORT-04 | Doanh thu khớp 100% ở mọi quy mô | Toàn bộ tổng hợp chạy bằng hàm SQL aggregate (`0023_report_rpcs.sql`), không fetch từng dòng. Tenant có > 1000 hóa đơn/kỳ: `summary.bill_count` khớp `select count(*)` chạy thẳng trên Postgres (trước đây dừng ở đúng 1000 — giới hạn PostgREST) | P4 | ◐ code+kiểm xong (0023 RPC; unit 30/30, e2e 6/6 trên tenant thật); chờ checkpoint |
| REPORT-05 | Chọn khoảng thời gian tùy chọn | Preset nhanh (Hôm nay/Hôm qua/7 ngày/30 ngày/Tháng này/Tháng trước) + lịch "Tùy chọn" từ ngày → đến ngày. `?from=2026-07-01&to=2026-08-12` render đúng 43 cột ngày; `from > to` hoặc kỳ > 400 ngày → tự về tháng này, không lỗi 500 | P4 | ◐ code+kiểm xong (0023 RPC; unit 30/30, e2e 6/6 trên tenant thật); chờ checkpoint |
| REPORT-06 | Độ mịn biểu đồ thích ứng | Kỳ ≤ 2 ngày → theo giờ (24 cột); 3–92 ngày → theo ngày; 93–366 ngày → theo tuần (mốc thứ Hai, khớp `date_trunc('week')`); > 366 ngày → theo tháng | P4 | ◐ code+kiểm xong (0023 RPC; unit 30/30, e2e 6/6 trên tenant thật); chờ checkpoint |
| REPORT-07 | So sánh kỳ trước | Mỗi KPI hiện delta % đúng dấu so kỳ liền trước (tháng → tháng trước theo lịch); kỳ trước = 0 → hiện "–", không chia 0. Biểu đồ chồng đường kỳ trước. Kỳ hiện tại "Tuần này"/"Tháng này" **cắt tới hôm nay** (nhãn `Tháng 8/2026 · đến 12/08`), kỳ trước cắt cho bằng số ngày để so tháng-đến-ngày với tháng-đến-ngày; kỳ đã trôi qua vẫn lấy trọn tuần/tháng | P4 | ◐ code+kiểm xong (0023 RPC; unit 30/30, e2e 6/6 trên tenant thật); chờ checkpoint |
| REPORT-08 | Cơ cấu doanh thu đa chiều | Tách doanh thu theo nhóm món, theo NƠI PHỤC VỤ, theo khu vực & bàn. Nơi phục vụ dùng chung `orderPlaceGroup` với phiếu bếp/hóa đơn: quán chế độ quầy có đơn `channel=takeaway` không gắn bàn phải hiện **"Tại quán"**, KHÔNG phải "Mang về". Quán không gắn bàn nào → ẩn hẳn khối "Theo khu vực & bàn". Σ mỗi chiều = tổng doanh thu KPI | P4 | ◐ code+kiểm xong (0023 RPC; unit 30/30, e2e 6/6 trên tenant thật); chờ checkpoint |
| REPORT-09 | Khung giờ cao điểm | Heatmap 7 × 24 (thứ × giờ) khi kỳ ≥ 7 ngày; KPI "Giờ cao điểm" hiện khung giờ doanh thu cao nhất | P4 | ◐ code+kiểm xong (0023 RPC; unit 30/30, e2e 6/6 trên tenant thật); chờ checkpoint |
| REPORT-10 | Thống kê món bị hủy | `/admin/reports` có khối "Món bị hủy": 3 KPI (số món · giá trị · tỷ lệ % kèm biến động theo ĐIỂM) + theo người duyệt + top món + chi tiết; **gồm cả dine-in lẫn mang về** | P7 | ◐ code+kiểm xong (unit 194/194, tsc+lint sạch; 0027+0028 đã áp dev); chờ checkpoint |

## MKT — Trang giới thiệu & khách quan tâm
| Mã | Yêu cầu | Tiêu chí chấp nhận | GĐ | TT |
|---|---|---|---|---|
| MKT-01 | Trang `/` giới thiệu sản phẩm | 7 khối: hero · 3 nỗi đau · ảnh báo cáo · 4 bề mặt · lưới 10 tính năng · vì sao tin được · CTA cuối. Ảnh chụp màn thật từ tenant demo (không dùng dữ liệu tenant thật). Mọi luận điểm truy được về tính năng đã chạy. KHÔNG còn liên kết `/style-guide` hay `/r/pho-viet` trên trang. Không vỡ ở 360px | P6 | ◐ code+kiểm xong (14 unit + 4 e2e; ảnh chụp từ tenant demo); chờ checkpoint |
| MKT-02 | Form nhận khách quan tâm | Gửi tên (≥2 ký tự) + SĐT VN hợp lệ → ghi bảng `leads`, form hiện lời cảm ơn. SĐT sai → báo lỗi tại ô nhập, không ghi DB. Gửi 2 lần cùng số trong 60s → chỉ 1 bản ghi. Dùng lại `normalizePhone`/`isValidPhone` của `guest-contact.ts` | P6 | ◐ code+kiểm xong (14 unit + 4 e2e; ảnh chụp từ tenant demo); chờ checkpoint |
| MKT-03 | Lead khóa kín + màn quản lý | `leads` bật RLS và KHÔNG có policy nào → anon key `select * from leads` trả 0 dòng và insert bị từ chối; ghi/đọc chỉ qua service role sau khi xác thực. `/super/leads` liệt kê tên · SĐT (`tel:`) · ghi chú · thời điểm, nút "Đã gọi" đổi `status` | P6 | ◐ code+kiểm xong (14 unit + 4 e2e; ảnh chụp từ tenant demo); chờ checkpoint |

## Tiêu chí phát hành V1 (map từ `00-TongThe.md` §7)
Onboard ≤15' (TENANT-03) · KDS ≤3s (ORDER-04) · đóng bill ≤5s (BILL-04) · doanh thu khớp 100% (BILL-05) · RLS test (TENANT-02) · 2 tenant demo prod (P6) · mobile 360px ≤6 chạm (ORDER-01) · hóa đơn 80mm đủ (PRINT-03) · phiếu bếp (PRINT-02; nghiệm thu "tự in ≤5s" hoãn tới khi có cầu in cục bộ + phần cứng — V1 nghiệm thu bấm-in + PDF preview).
