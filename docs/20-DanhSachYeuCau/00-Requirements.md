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

## MENU
| Mã | Yêu cầu | Tiêu chí chấp nhận | GĐ | TT |
|---|---|---|---|---|
| MENU-01 | CRUD danh mục & món | Tạo/sửa/xóa danh mục, món (ảnh ≤2MB, giá, mô tả), sắp xếp | P2 | ◐ code xong (02-01); chờ checkpoint |
| MENU-02 | Nút "hết món" (86) | Bật/tắt `is_available` món & option; khách không đặt được món hết | P2 | ◐ toggle admin+DB code xong (02-01/02); "khách thấy Hết" → P3 |
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
| ORDER-03 | POS thêm món thay khách | Nhân viên mở bàn, thêm món vào phiên bàn (source=staff, bỏ duyệt) | P3 | ☐ |
| ORDER-04 | KDS realtime | Món `confirmed` hiện trên KDS ≤ 3s (đo 10 lần); bếp đổi trạng thái làm/xong ở mức món | P3 | ☐ |
| ORDER-05 | Hủy/sửa món có kiểm soát | Chỉ manager/cashier hủy món đã gửi, bắt buộc ghi lý do; có log | P3 | ☐ |

## BILL — Bill & thanh toán
| Mã | Yêu cầu | Tiêu chí chấp nhận | GĐ | TT |
|---|---|---|---|---|
| BILL-01 | Gộp bill cả bàn | Bill gom mọi order của phiên bàn | P4 | ☐ |
| BILL-02 | Tách/gộp bill | Tách 1 bàn thành nhiều bill (theo món/chia đều N người); gộp nhiều bàn thành 1 bill | P4 | ☐ |
| BILL-03 | Điều chỉnh bill | Thêm giảm giá (số tiền/%), phí phục vụ %, VAT % (cấu hình tenant); tổng tính đúng công thức | P4 | ☐ |
| BILL-04 | Thanh toán | Ghi nhận tiền mặt/chuyển khoản; đóng bill; bàn về trạng thái phù hợp | P4 | ☐ |
| BILL-05 | Doanh thu khớp 100% | Doanh thu ngày trên dashboard = tổng bill đã đóng (đối chiếu 20 bill test) | P4 | ☐ |

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
| REPORT-01 | Doanh thu ngày/tuần/tháng | Tổng doanh thu, số bill, TB/bill theo mốc thời gian | P4 | ☐ |
| REPORT-02 | Món bán chạy | Xếp hạng món theo số lượng/doanh thu trong kỳ | P4 | ☐ |
| REPORT-03 | Theo phương thức TT | Tách tiền mặt vs chuyển khoản để đối soát chốt ca | P4 | ☐ |

## Tiêu chí phát hành V1 (map từ `00-TongThe.md` §7)
Onboard ≤15' (TENANT-03) · KDS ≤3s (ORDER-04) · đóng bill ≤5s (BILL-04) · doanh thu khớp 100% (BILL-05) · RLS test (TENANT-02) · 2 tenant demo prod (P6) · mobile 360px ≤6 chạm (ORDER-01) · hóa đơn 80mm đủ (PRINT-03) · phiếu bếp (PRINT-02; nghiệm thu "tự in ≤5s" hoãn tới khi có cầu in cục bộ + phần cứng — V1 nghiệm thu bấm-in + PDF preview).
