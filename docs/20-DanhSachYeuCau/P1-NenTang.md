# DANH SÁCH CAM KẾT — P1: Nền tảng

**Trạng thái: ĐÃ DUYỆT** — "XÁC NHẬN LƯU" ngày 20/07/2026. Đây là hợp đồng nghiệm thu P1; chờ "XÁC NHẬN LÀM" để bắt đầu build.
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
| 4 | Phân quyền đúng cho **6 tài khoản**: super-admin + 5 vai trò tenant (owner, manager, cashier, waiter, kitchen) | Ma trận 6 tài khoản × 4 khu vực (super/admin/pos/kds): đúng 100%, sai vai trò bị chặn kèm thông báo tiếng Việt |
| 5 | RLS cách ly tenant tuyệt đối | Bộ test tự động 2 tenant × bộ user đủ 5 vai trò, ma trận đọc/ghi chéo = 0 truy cập trái phép; log test đính kèm |
| 6 | Mời nhân viên qua `tenant_invitations`, chỉ tạo membership khi người được mời chấp nhận hợp lệ | Test 3 nhánh: (a) lời mời hợp lệ → chấp nhận → đăng nhập được đúng vai trò; (b) lời mời hết hạn → báo lỗi, không có membership; (c) lời mời bị thu hồi → báo lỗi, không có membership |
| 7 | Khóa nhân viên có hiệu lực **ngay từ request tiếp theo**, trên cả 2 tầng | Khóa tài khoản đang đăng nhập → (a) request route kế tiếp bị middleware đẩy ra; (b) gọi API trực tiếp bằng session cũ → RLS trả 0 dòng/từ chối ghi với tenant đó; (c) membership tenant khác của cùng user vẫn hoạt động |
| 8 | Không secrets trong code/log | `git log -p` + scan source: 0 key; `.env.example` không có giá trị thật |
| 9 | Trang /style-guide render đủ design system | Ảnh chụp: token màu/chữ, nút, form, bảng, dark mode KDS |
| 10 | Migration chạy tự động theo pipeline | Log CI: PR → lint/test; merge `dev` → migrate DB dev; merge `main` → migrate DB prod |

## KHÔNG ĐƯỢC LÀM
- ✗ Không dùng service-role key ở phía client hoặc trong route khách truy cập được
- ✗ **Không tắt/bỏ qua RLS** dưới mọi hình thức: không disable RLS, không policy `USING (true)` cho bảng nghiệp vụ, không dùng service-role để lách RLS trong luồng nghiệp vụ
- ✗ **Không sửa database production thủ công** — mọi thay đổi qua migration → PR → pipeline; khẩn cấp phải có Quyết định (QD-00X) + migration bổ sung ngay sau
- ✗ Không tạo membership trực tiếp khi mời — bắt buộc đi qua luồng `tenant_invitations`
- ✗ Không xây UI tính năng của P2+ (menu, bàn, order...) trong phase này
- ✗ Không hardcode tenant/slug ở bất kỳ đâu

## Bằng chứng bàn giao (docs/40-KiemTra/BaoCao-P1-*.md)
Video demo các luồng chính, ảnh style-guide, log test RLS, log CI, danh sách file đã tạo/sửa, trạng thái từng tiêu chí (ĐẠT/CHƯA ĐẠT).

## Hạn hoàn thành
Đề xuất: 1 tuần kể từ "XÁC NHẬN LÀM". Tối đa 3 vòng sửa.
