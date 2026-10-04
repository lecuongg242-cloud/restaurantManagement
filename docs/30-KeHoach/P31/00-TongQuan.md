# P31 — Làm lại màn "Nhân viên" theo đối thủ: bảng gọn + hộp thoại thêm / sửa

> Lập 04/10/2026. **Trạng thái: CHỦ DỰ ÁN CHỐT 04/10/2026** ("Chốt như đề xuất" + "Thêm luôn" chức năng Sửa nhân viên).
> **Code xong 04/10/2026, chưa deploy** — kết quả ở mục "Kết quả" cuối file. Yêu cầu: AUTH-07, AUTH-08. Chủ dự án (04/10): "chỉnh lại giao diện màn này, tôi thấy không chuyên nghiệp".

## Hiện trạng (Admin → Nhân viên)

- Form "Thêm" **luôn mở** trên đầu trang (Tên, Email, Vai trò, PIN, nút Thêm) + đoạn mô tả dài có chữ "QD-009".
- Bảng: mỗi dòng bày sẵn ô "Mật khẩu mới"/PIN + nút "Lưu", chữ "Tắt" "Xóa" màu đỏ; cột "Đặt lại" và cột không tên.
- Dòng chủ quán ghi "Không thao tác được". Không sửa được tên / vai trò.

## Đối thủ làm thế nào (tra 04/10/2026)

| | Sapo FnB | KiotViet FnB | CUKCUK |
|---|---|---|---|
| Mở form | Nhân viên → Danh sách nhân viên → **"Thêm nhân viên"** | **"+ Người dùng"** | Danh mục → Nhân viên → **"Thêm"** |
| Ô | Họ tên, Tên đăng nhập, Mật khẩu, **Mã PIN 4 số**, Vai trò; Email, SĐT | Tên, tài khoản, mật khẩu, SĐT, vai trò, chi nhánh | Mã NV (đăng nhập), Họ tên, Vai trò, Mật khẩu, PIN |
| Danh sách | Bảng | Bảng: tên, tài khoản, SĐT, vai trò, trạng thái | Bảng + "Lọc nhanh" theo trạng thái |
| Thao tác 1 người | Sửa (gán lại vai trò) | Cập nhật · Phân quyền · **Ngừng hoạt động** / Cho phép hoạt động · Xóa | Sửa |

Nguồn:
- [Sapo — Tạo tài khoản nhân viên](https://help.sapo.vn/tao-tai-khoan-nhan-vien-tren-trang-quan-tri-sapo-fnb)
- [Sapo — Phân quyền nhân viên](https://help.sapo.vn/phan-quyen-nhan-vien-tren-trang-quan-tri-sapo-fnb)
- [KiotViet FnB — Quản lý người dùng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/quan-ly-nguoi-dung-web-fnb/)
- [CUKCUK — Quản lý tài khoản nhân viên](https://helpv2.cukcuk.vn/vi/kb/1060900_quan_ly_nhan_vien)

Điểm chung: form thêm **mở bằng nút góc phải**, danh sách **bảng gọn**, đổi mật khẩu / ngừng / xóa **không bày ô nhập trên từng dòng**.

## Giao diện (đã chốt)

**Màn Nhân viên**
- Đầu trang: "Nhân viên" + nút cam **"+ Thêm nhân viên"** góc phải. Bỏ đoạn mô tả dài.
- Thanh lọc: ô **"Tìm theo tên, email"** (không dấu) + lọc **"Đang làm (n) · Đã tắt (n)"**.
- Bảng, cột: **Nhân viên** (chữ cái đầu trong vòng tròn, tên đậm, email nhỏ dưới) · **Vai trò** (nhãn màu dịu) ·
  **Đăng nhập bằng** ("PIN 4 số" / "Mật khẩu") · **Trạng thái** (chấm xanh "Đang làm" / chấm xám "Đã tắt") · nút **⋯**.
- **⋯** → **Sửa thông tin** · **Đổi PIN** (Quản lý: **Đổi mật khẩu**) · **Tắt tài khoản** / **Bật lại** · **Xóa** (đỏ, hỏi lại).
  Bấm dòng = Sửa thông tin. Dòng chủ quán (và quản lý khi người xem là quản lý) không có ⋯, không bấm được.
- Trống: "Chưa có nhân viên. Bấm '+ Thêm nhân viên' để tạo tài khoản đầu tiên." Tìm không ra: "Không tìm thấy nhân viên."
- Điện thoại: mỗi người một dòng (vòng tròn + tên + nhãn vai trò, dòng dưới email · trạng thái), ⋯ bên phải.

**Hộp thoại "Thêm nhân viên"**: Tên hiển thị *, Email *, Vai trò * (4 nút: Thu ngân · Phục vụ · Bếp · Quản lý — dưới ghi
1 dòng vai trò vào được đâu; "Quản lý" chỉ chủ quán thấy), PIN 4 số * (Quản lý → Mật khẩu ≥ 8 ký tự).
Nút **Bỏ qua · Lưu & thêm mới · Lưu**. Lỗi (trùng email…) → giữ hộp thoại, câu lỗi ở cuối.

**Hộp thoại "Sửa nhân viên"**: Tên hiển thị *, Email (chỉ xem — là tên đăng nhập, mã PIN gắn với email), Vai trò *.
Đổi giữa vai trò trạm (PIN) và Quản lý (mật khẩu) → hiện ô bí mật mới bắt buộc. Nút **Bỏ qua · Lưu**.

**Hộp thoại "Đổi PIN" / "Đổi mật khẩu"**: 1 ô, nút **Bỏ qua · Lưu**.

**Khác đối thủ (chủ dự án đồng ý 04/10/2026):** không có mã NV, SĐT, chi nhánh, phân quyền chi tiết; vai trò cố định;
đăng nhập bằng email (QD-009). Không đổi email ở Sửa (mật khẩu PIN suy dẫn từ email).

## Kiểm bằng

- `tests/auth/rbac.test.ts` vẫn xanh; server action sửa: quản lý không sửa được quản lý / chủ quán, không nâng ai lên Quản lý.
- E2E `p31-nhan-vien.spec.ts` (quán demo, không đụng qt-food): thêm bằng hộp thoại ("Lưu & thêm mới" giữ hộp thoại),
  trùng email báo lỗi trong hộp thoại, sửa tên + vai trò, đổi PIN rồi đăng nhập POS bằng PIN mới, tắt → lọc "Đã tắt", xóa.
- Ảnh 1366 và 390, không tràn ngang.

## Kết quả (04/10/2026)

File: `app/r/[slug]/admin/(protected)/staff/page.tsx` (gọn lại), `staff/actions.ts` (trả `StaffResult`; mới `updateStaff`),
`components/admin/staff/StaffTable.tsx` (mới — bảng, menu ⋯, 2 hộp thoại), bỏ `StaffCreateForm.tsx`,
`components/ui/toaster.tsx` (sửa lỗi toast kẹt mãi: cleanup effect `[flash]` hủy hẹn giờ của toast trước).

- E2E `tests/e2e/p31-nhan-vien.spec.ts` PASS (localhost:3000, quán demo `pho-viet`): thêm (Lưu & thêm mới giữ hộp thoại),
  trùng email báo trong hộp thoại, tìm không dấu, sửa tên + Phục vụ, Phục vụ → Quản lý (`pin_hash` null), Quản lý → Thu ngân
  (PIN mới), Đổi PIN → đăng nhập POS bằng PIN mới, Tắt → "Đã tắt", Xóa; 390 px không tràn ngang.
- `tests/auth/rbac.test.ts` 111/111. `tsc --noEmit` sạch.
- Ảnh: `anh/1-bang-nhan-vien-1366.png`, `anh/2-hop-thoai-them-1366.png`, `anh/3-sua-sang-quan-ly-1366.png`, `anh/4-dien-thoai-390.png`.
