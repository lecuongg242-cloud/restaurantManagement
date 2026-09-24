# 09-05 — Màn "Máy in" trong admin · BÁO CÁO

> Yêu cầu: **PRINT-09** ◐ — máy đã kiểm xong trên production; còn máy in phần cứng thật tại quán.
> 24/09/2026.

## Kết quả chính — chuỗi thật trọn vẹn trên production

Cầu in **thật** (tenant demo `pho-viet`) → thử một máy in giả (cổng TCP đếm byte) → database →
trang `/admin/printers` trên production. Không có dòng dữ liệu giả lập nào:

| Cảnh | Cầu in bếp | Máy in bếp |
|---|---|---|
| 1. Máy in bật | **Đang kết nối** | **Phản hồi bình thường** · `127.0.0.1:19100` |
| 2. Tắt máy in (như rút dây) | Đang kết nối | **KHÔNG phản hồi** + gợi ý kiểm tra |
| 3. Tắt cầu in, chờ quá 90s | **Mất kết nối từ 15:10** | **Không biết** — không hiện lại "không phản hồi" cũ |

Cảnh 2 là thứ **trước đây không ai thấy được**: cầu in sống nên nhịp tim 09-03 báo ổn, trong khi
máy in đã chết.

Máy in giả qua **8 lần thử nhận 0 byte** — thử máy in không làm máy in thật ra giấy.

Kiểm cả màn điện thoại (390px): không tràn ngang, thẻ xếp dọc.

## Theo nghiệm thu

| # | Tiêu chí | Kết quả |
|---|---|---|
| 1 | Hàm thuần trạng thái | 6 test: mọi tổ hợp cầu in sống/chết × máy in ok/lỗi/chưa kiểm/kiểm cũ |
| 2 | Thử máy in | 3 test: cổng nghe → phản hồi **và nhận 0 byte**; cổng đóng → không; không tồn tại → không, không treo |
| 3 | RLS | **13/13**: cầu in bản cũ gọi không tham số vẫn chạy **và không xóa** kết quả máy in |
| 4 | Phân quyền | 87/87 — owner + manager thấy "Máy in"; 4 vai trò trạm không |
| 5 | Production 3 trạng thái | Bảng trên |
| 6 | Gói mang ra quán | Đóng lại; `--test-auth` từ chính gói báo đăng nhập + nhịp tim + trạng thái máy in |

## Bổ sung: chip thiết bị in trên POS

Theo yêu cầu chủ dự án (24/09 tối): nhân viên đứng quầy cũng phải thấy. Chip thường trực trên thanh
công cụ POS — *Máy in bếp sẵn sàng* (xanh) / *không phản hồi* (đỏ) / *Cầu in mất kết nối* (đỏ) /
*Chưa có cầu in* (xám); rê chuột thấy IP + lần kiểm. Thêm băng *"Máy in bếp không phản hồi (IP)"*
khi cầu in sống mà máy in chết — báo trước khi có phiếu lỗi. Chip + băng dùng chung một lần hỏi
server 30 giây/lần.

E2E production `cau-in.spec.ts` **5/5** (2 đường in + 3 trạng thái chip). Chụp màn cả hai trạng thái.

## Sửa thiết kế giữa chừng

**Bỏ hàm đếm phía client đã viết và đã test xanh.** Nó tải danh sách phiếu về rồi đếm — nhưng
PostgREST trả tối đa 1.000 dòng mỗi lần; ngày đông quá số đó thì màn hình **đếm thiếu mà không báo
gì** (REPORT-04 từng dính đúng lỗi này). Thay bằng truy vấn đếm của database; test chèn **1.005
phiếu** để chứng minh.

**Kết quả in thật cũng cập nhật trạng thái máy in.** Đang in thì cầu in không thử (máy in rẻ chỉ
nhận một kết nối một lúc). Nếu chỉ dựa vào lần thử, giữa giờ cao điểm màn sẽ rơi vào "không biết"
trong khi máy in đang chạy tốt.

## Sự cố phụ

`tests/smoke/kiem-tra.test.ts` đỏ dù **cả tệp test lẫn script không đổi**. Nguyên nhân: các lần
`git checkout` với `autocrlf=true` viết lại script sang CRLF, và dòng shebang `#!/usr/bin/env node\r`
làm trình biên dịch của vitest báo lỗi cú pháp. Bỏ shebang (lệnh luôn chạy qua `node`).

## Còn lại

- Thử kết nối-không-gửi-byte **chưa kiểm trên máy in nhiệt thật**. Phần lớn máy in mạng chịu được.
  Nếu máy in của quán hành xử lạ (ra giấy trắng, treo) thì **hiện chưa có công tắc tắt việc thử** —
  báo lại để thêm.
- Không tách "in qua cầu in / qua trình duyệt", không hiện câu lỗi của cầu in — lý do trong plan.
