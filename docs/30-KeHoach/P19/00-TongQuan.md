# P19 — Voucher và chương trình ưu đãi (ĐỂ SAU)

> Lập 27/09/2026. **Trạng thái: ĐỂ SAU** — chủ dự án chốt 27/09/2026: "voucher để sau, chiến dịch ưu đãi chưa cần".
> Đây là khung phạm vi, **chưa** có plan chi tiết; khi xếp lịch: viết QD + yêu cầu VOUCHER-xx + plan 19-0x theo khuôn P13.
> Phụ thuộc: P16 16-05 (danh sách khách theo SĐT), P15 (phạm vi chuỗi).

## Phạm vi dự kiến

| Việc | Nội dung tối thiểu |
|---|---|
| Mã voucher | Mã giảm tiền/% có hạn dùng, số lượt, đơn tối thiểu; áp ở hộp thanh toán POS như giảm giá hiện nay (đi qua `bills.discount_*`) |
| Phạm vi | Một chi nhánh hoặc cả chuỗi |
| Chống lạm dụng | Mỗi mã mỗi SĐT một lần (tùy chọn); ghi ai áp, bill nào |
| Báo cáo | Số lượt dùng, tiền giảm, doanh thu đơn có voucher — nối vào khối "Giảm giá" (REPORT-12) |

## Chưa làm ở P19 (nếu không có yêu cầu mới)

Tích điểm, hạng thẻ, chiến dịch tự động (sinh nhật, khách lâu không quay lại), gửi SMS/Zalo, happy hour theo giờ.

## Câu hỏi cần chốt khi xếp lịch

1. Voucher có dùng **chung** với giảm giá tay trên cùng một bill không?
2. Giảm giá bằng voucher có cần PIN người duyệt như giảm giá tay (BILL-07) không?
3. Có in mã voucher lên hóa đơn để khách dùng lần sau không?

## Phát hiện khi rà code (27/09/2026)

- Bill chỉ có **một** giảm giá (`discount_type`, `discount_value`, `discount_amount`, `discount_by`) ⇒ voucher + giảm tay cùng lúc cần mô hình
  nhiều dòng giảm giá — quyết định ở câu hỏi 1 ảnh hưởng schema.
- Mỗi bill một dòng `payments` (0035) — voucher không phải phương thức thanh toán, nên đi đường giảm giá.
