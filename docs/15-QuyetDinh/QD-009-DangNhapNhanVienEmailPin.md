# QD-009 — Đăng nhập nhân viên bằng Email + PIN (gộp 1 bước)

> Ngày: 2026-07-23 · Trạng thái: **Đã chốt** · Liên quan: [[QD-005-KienTrucKyThuat]], D7 (PIN nhân viên), AUTH-02, AUTH-03.

## Bối cảnh
Mô hình cũ (D7) đăng nhập trạm **2 bước**:
1. `/pos|/kds/login` — đăng nhập **tài khoản trạm** dùng chung thiết bị (email + mật khẩu, là "cửa" RLS).
2. Vào bề mặt → **lưới "Chọn nhân viên"** (`StaffPicker`) → nhập PIN 4 số để gắn `staff_id`.

Vấn đề thực tế: khi nhà hàng có **vài chục nhân viên**, lưới chọn người phải cuộn/tìm khó; và phải bấm 2 lần (chọn người + PIN). Yêu cầu: nhân viên **gõ thẳng email + PIN** ở trang login rồi vào ngay bề mặt với đúng danh tính.

## Quyết định
Chuyển sang **mỗi nhân viên = 1 tài khoản Supabase Auth riêng**, đăng nhập trực tiếp bằng **email + PIN 4 số** ở `/pos/login` (và `/kds/login`). Bỏ hẳn bước "Chọn nhân viên".

- **Định danh** = email riêng của nhân viên (đồng bộ `auth.users.email`, lưu bản sao ở `memberships.email`).
- **Mật khẩu Supabase KHÔNG phải 4 số trần** (Supabase yêu cầu ≥6 ký tự, và 4 số quá yếu). Server **suy dẫn** mật khẩu từ PIN bằng HMAC-SHA256 với **pepper bí mật** (`STAFF_PIN_PEPPER`, chỉ ở server): `password = "pin_" + HMAC(pepper, email + ":" + pin)`. Nhân viên chỉ gõ 4 số; mạng/Supabase không bao giờ thấy 4 số trần.
- **`pin_hash` giữ lại** cho PIN-gate duyệt thao tác nhạy cảm (giảm giá/hủy món — D9), NHƯNG thu hồi quyền đọc cột `pin_hash` khỏi vai trò `anon`/`authenticated` (chỉ `service_role` đọc) để nhân viên quyền thấp — nay đã có phiên RLS — không rút được hash PIN của quản lý về dò offline.
- **Chống dò PIN** qua endpoint login: khóa tạm theo email sau N lần sai (`staff_login_throttle`), cộng với rate-limit sẵn của Supabase Auth.
- **RLS không đổi**: mọi policy nghiệp vụ chỉ cách ly theo `tenant_id` (`auth_tenant_ids()`), không phân biệt vai trò. Nhân viên đăng nhập bằng phiên riêng **cùng tenant** ⇒ quyền dữ liệu y hệt tài khoản trạm trước đây. Không cần policy mới.

## Hệ quả
- **Runtime gọn hơn**: bỏ `StaffPicker`, `verifyStaffPin`, cookie `staff_*`, hàm `getCurrentStaff`/`clearStaff`. `getSessionMembership` trả thẳng danh tính nhân viên; mọi thao tác gắn `staff_id = membershipId` của chính người đăng nhập.
- **Onboarding đổi**: form "Thêm nhân viên" nay cần **Email (duy nhất) + PIN**; `createStaff/resetPin/deleteStaff/setStaffActive` đồng bộ tài khoản Supabase qua service-role (Admin API).
- **Owner/manager** vẫn đăng nhập email + mật khẩu mạnh; dùng chung `/pos/login`. Quy tắc: bí mật **đúng 4 chữ số** ⇒ xử lý như PIN (suy dẫn); còn lại ⇒ mật khẩu thường. (Mật khẩu owner/manager không phải 4 số nên không đụng nhau.)
- **Tài khoản `station`**: giữ tương thích (vẫn đăng nhập được) nhưng không còn bắt buộc cho luồng mới.
- **Ràng buộc**: `auth.users.email` **duy nhất toàn cục** → 1 nhân viên làm 2 nhà hàng không dùng trùng email (khuyến nghị email theo slug, ví dụ `cuong@pho-viet...`).
- **Dữ liệu cũ**: nhân viên PIN-only hiện có (`user_id NULL`, chưa có email) không đăng nhập kiểu mới cho tới khi được cấp email + auth user. Script `scripts/backfill-staff-auth.mjs` cấp email tự sinh + PIN tạm **1234** (PIN cũ băm bcrypt một chiều, không khôi phục được) — owner đổi lại sau ở `/admin/staff`.

## Phương án đã loại
- **Giữ 1 tài khoản trạm chung + "mint" phiên server-side theo email+PIN**: giữ được triết lý "không tài khoản riêng" nhưng phải tự dựng cơ chế tạo phiên cho tài khoản dùng chung (đi ngược framework, dễ vỡ), vẫn còn 2 lớp ẩn. Không chọn.
- **Bảng lưới có ô tìm kiếm/lọc**: sửa nhỏ nhưng vẫn 2 bước, không đạt yêu cầu "gõ thẳng 1 bước".

## Bảo mật — đánh đổi được chấp nhận
PIN 4 số (không gian 10⁴) làm bí mật đăng nhập yếu hơn mật khẩu mạnh. Giảm thiểu: pepper server-side (không lộ 4 số trần), khóa tạm theo email, rate-limit Supabase, và `pin_hash` không còn đọc được bởi client-facing roles. Chấp nhận vì đây là bề mặt POS/KDS nội bộ, không phải cổng khách hàng.
