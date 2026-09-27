# 11-07 SUMMARY — Bộ tài liệu bàn giao

> Thực hiện 27/09/2026. Yêu cầu: OPS-11 (+ đo TENANT-03). Không có code.
> **Trạng thái: 10 tệp tài liệu xong. Nghiệm thu chính (người NGOÀI nhóm dựng quán thử chỉ theo tài liệu,
> đo thời gian, ghi mọi câu phải hỏi) chưa làm — cần một người thật.**

## Tệp đã tạo — `docs/60-BanGiao/`

`00-QuyTrinh` · `01-PhieuKhaoSat` · `02-ThietBiChuan` · `03-CaiDat` · `04-HuongDan-ThuNgan` · `05-HuongDan-Bep` ·
`06-HuongDan-QuanLy` · `07-HuongDan-PhucVu` · `08-ChecklistGoLive` · `09-BienBanNghiemThu`. Mỗi hướng dẫn vai trò ≤ 1 trang.

## Cách viết cho đúng

Nhãn nút, tiêu đề và luồng lấy từ **mã nguồn** (khảo sát toàn bộ bề mặt POS/KDS/admin/khách trước khi viết),
không theo trí nhớ. Kiểm lại riêng những chỗ dễ sai — và đã sai một lần: bản nháp ghi "email hệ thống sinh
cho nhân viên", thực tế form **có ô Email do quản lý nhập** — đã sửa.

Những điều tài liệu phải nói thẳng vì người dùng sẽ tưởng khác:

| Thực tế trong app | Người dùng dễ tưởng |
|---|---|
| Nút gửi món tại bàn là "Xác nhận thêm N món · <tiền>" | Có nút "Gửi bếp" |
| Màn bếp chỉ để xem; vé ẩn khi bàn **thanh toán xong**; việc duy nhất: "Báo hết món" | Bếp bấm "xong món" |
| Thu tiền: Tiền mặt, Chuyển khoản | Có "Thẻ" |
| Điện thoại phục vụ (`/pos/m`) không in; đơn vào thẳng quầy, không chờ duyệt | Điện thoại in được |

## Khoảng trống sản phẩm lộ ra khi viết (chưa sửa — ghi để xét)

| Khoảng trống | Hệ quả khi bàn giao | Gợi ý |
|---|---|---|
| POS không có nút dẫn tới `/pos/m` | Phải lưu dấu trang tay trên từng điện thoại | P12 12-05 gộp `/pos/m` vào `/pos` — tự hết |
| Không có PWA (manifest) | Lối tắt màn hình chính mở kèm thanh trình duyệt | OPS-04 |
| Chủ quán không tự đổi được mật khẩu | Mọi lần quên mật khẩu đều gọi hỗ trợ | Việc nhỏ, đáng làm trước khi lên 20 quán |
| Không có cách thu "Thẻ" | Quán nhận thẻ phải tự quy ước cách ghi → báo cáo theo cách thu lệch | Hỏi chủ dự án |
| Tạo quán không gửi email cho chủ quán | Người lắp chuyển mật khẩu tạm bằng tay | Chấp nhận được ở quy mô hiện tại |

## Chưa kiểm được

| Nghiệm thu | Chờ |
|---|---|
| 2. Người ngoài nhóm dựng quán thử trên production theo `03-CaiDat.md` tới một đơn thu tiền xong — ghi tổng thời gian, phần TENANT-03 (≤ 15'), mọi câu phải hỏi | Một người thật không tham gia code |
| 3. Sửa tài liệu theo các câu hỏi | Sau mục 2 |
| Ảnh chụp màn hình trong hướng dẫn vai trò (plan có ghi) | Chưa làm — thêm sau lần đo mục 2, chụp theo đúng những chỗ người thử vướng |
