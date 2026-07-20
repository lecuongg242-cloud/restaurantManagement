# DANH SÁCH CAM KẾT — P1: Nền tảng

**Trạng thái: BẢN NHÁP** — chờ "XÁC NHẬN LƯU" cùng bản thiết kế chi tiết P1.
**Người chịu trách nhiệm:** Thợ Xây (Claude Code) · **Nghiệm thu:** Chủ dự án
**Nguồn:** `10-BanThietKe/10-P1-NenTang.md`

## Kết quả mong muốn
Khung SaaS chạy trên local/dev/prod; đăng nhập phân quyền 5 vai trò; dữ liệu tenant cách ly tuyệt đối; design system sẵn sàng cho các phase sau.

## Các tiêu chí phải đạt

| # | Tiêu chí | Cách kiểm tra |
|---|---|---|
| 1 | App chạy cả 3 môi trường từ cùng codebase | Mở URL local, dev, prod — cùng trang chủ; đổi 1 dòng text, merge `dev` → thấy trên dev mà prod chưa đổi |
| 2 | Super-admin tạo tenant ≤ 2 phút | Quay video tạo tenant "demo-2", truy cập được `/r/demo-2` |
| 3 | Đăng nhập email + mật khẩu, phiên giữ sau refresh | Đăng nhập, F5, đóng/mở tab — vẫn đăng nhập |
| 4 | 5 vai trò vào đúng khu vực của mình | Ma trận 5 tài khoản × 4 khu vực (super/admin/pos/kds): đúng 100%, sai vai trò bị chặn kèm thông báo tiếng Việt |
| 5 | RLS cách ly tenant tuyệt đối | Bộ test tự động 2 tenant × 6 user, ma trận đọc/ghi chéo = 0 truy cập trái phép; log test đính kèm |
| 6 | Khóa nhân viên có hiệu lực ngay | Khóa tài khoản đang đăng nhập → request kế tiếp bị đẩy ra |
| 7 | Không secrets trong code/log | `git log -p` + scan source: 0 key; `.env.example` không có giá trị thật |
| 8 | Trang /style-guide render đủ design system | Ảnh chụp: token màu/chữ, nút, form, bảng, dark mode KDS |
| 9 | Migration chạy tự động theo pipeline | Log CI: PR → lint/test; merge `dev` → migrate DB dev; merge `main` → migrate DB prod |

## KHÔNG ĐƯỢC LÀM
- ✗ Không dùng service-role key ở phía client hoặc trong route khách truy cập được
- ✗ Không viết query nghiệp vụ bỏ qua RLS ("just this once")
- ✗ Không xây UI tính năng của P2+ (menu, bàn, order...) trong phase này
- ✗ Không hardcode tenant/slug ở bất kỳ đâu

## Bằng chứng bàn giao (docs/40-KiemTra/BaoCao-P1-*.md)
Video demo các luồng chính, ảnh style-guide, log test RLS, log CI, danh sách file đã tạo/sửa, trạng thái từng tiêu chí (ĐẠT/CHƯA ĐẠT).

## Hạn hoàn thành
Đề xuất: 1 tuần kể từ "XÁC NHẬN LÀM". Tối đa 3 vòng sửa.
