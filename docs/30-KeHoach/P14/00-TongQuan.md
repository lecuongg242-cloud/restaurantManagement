# P14 — Hóa đơn điện tử từ máy tính tiền + sổ hộ kinh doanh

> Lập 27/09/2026. **Trạng thái: CHỜ** — viết sẵn; bắt đầu khi chủ dự án liên hệ xong nhà cung cấp (QD-022
> "Việc của chủ dự án"). Plan là hợp đồng + nghiệm thu, không phải bản nháp code.
> Quyết định: `15-QuyetDinh/QD-022` · Yêu cầu: EINV-01..05

## Vì sao P14 là việc này

Theo NĐ 254/2026 (thay NĐ 70/2025), quán ăn uống doanh thu > 1 tỷ/năm **bắt buộc** dùng hóa đơn điện tử khởi
tạo từ máy tính tiền. Mọi đối thủ đều có và đang dùng nó làm lý do chính để kéo khách; POS365 và KiotViet
còn tặng miễn phí. Không có HĐĐT thì quán cỡ qt-food (~3,7 tỷ/năm) phải chạy song song một phần mềm khác.

**P14 kết thúc bằng: khách cần hóa đơn điện tử → thu ngân tích "Xuất hóa đơn điện tử" cho bill đó (nhập MST công ty nếu có) →
bill được cấp mã của cơ quan thuế mà thu ngân không phải chờ, và một phiếu HĐĐT riêng có mã/QR tra cứu in ra cho khách; quán diện
bắt buộc bật được chế độ phát hành mọi hóa đơn; quán nhỏ xuất được sổ S1a/S2a-HKD để kê khai.**

## Điều kiện bắt đầu

| # | Điều kiện | Ai |
|---|---|---|
| 1 | Có tài liệu API + môi trường thử của **VNPAY-Invoice** (ưu tiên, miễn phí tới 2028) **hoặc** tài khoản demo **Viettel SInvoice** (dự phòng) | Chủ dự án liên hệ |
| 2 | Kế toán/đại lý thuế xác nhận: dữ liệu bắt buộc trên HĐ MTT, mẫu sổ S1a/S2a theo TT 152/2025 | Chủ dự án |
| 3 | Đọc nguyên văn NĐ 254/2026 + TT 91/2026 (phần HĐ MTT), cập nhật bảng pháp lý QD-022 → CHỐT | Claude |

**14-04 (sổ S1a/S2a) không cần điều kiện 1** — làm trước được nếu muốn.

## Các plan

| Plan | Yêu cầu | Phụ thuộc | Giá trị khi dừng ở đây |
|---|---|---|---|
| 14-01 Cấu hình HĐĐT (theo yêu cầu / mọi hóa đơn) + ô yêu cầu xuất + hàng đợi + giao diện adapter | EINV-01, EINV-02 | Điều kiện 3 | Khung sẵn sàng; thêm nhà cung cấp chỉ là viết một adapter |
| 14-02 Adapter nhà cung cấp đầu tiên (VNPAY hoặc Viettel) | EINV-04 | 14-01, điều kiện 1 | Quán thật phát hành được HĐĐT |
| 14-03 In riêng phiếu HĐĐT + trạng thái trên POS/admin | EINV-03 | 14-02 | Khách nhận hóa đơn hợp lệ |
| 14-04 Xuất sổ S1a/S2a-HKD | EINV-05 | điều kiện 2 | Quán ≤ 1 tỷ kê khai được, 0đ |

## Phát hiện khi rà code (27/09/2026)

- `pay_bill` (0035) đóng bill trong một RPC; BILL-04 yêu cầu ≤ 5s ⇒ phát hành HĐĐT **không** được nằm trong RPC.
- Đã có mẫu hàng đợi + thử lại: `print_jobs` (pending → done/failed, chống trùng `print-dedupe`). Hàng đợi HĐĐT
  nên theo cùng mẫu, **bảng riêng** (không trộn với in).
- Chạy trên **Vercel Hobby**: cron chỉ được **1 lần/ngày** ⇒ không dùng Vercel cron để quét hàng đợi. Cần chọn:
  gọi phát hành ngay sau khi đóng bill (`after()` của Next) + quét lại lỗi bằng Supabase `pg_cron` / GitHub
  Actions. Ghi lựa chọn vào QD-022 khi CHỐT.
- Bí mật của từng quán (mật khẩu API nhà cung cấp) chưa có chỗ lưu: `tenants.settings` đọc ở nhiều bề mặt, **không**
  được để bí mật ở đó ⇒ bảng riêng, chỉ server đọc, mã hóa.
- Báo cáo doanh thu có quy ước `paid_at` + BILL-05 (`lib/billing/reports.ts`) ⇒ sổ S1a/S2a dùng lại, không tính riêng.

## Ràng buộc xuyên suốt

- Đóng bill không bao giờ chờ nhà cung cấp; mất mạng hoặc nhà cung cấp lỗi **không** chặn bán.
- Không phát hành trùng: một bill → tối đa một hóa đơn đã cấp mã (khóa idempotency theo bill).
- Không log bí mật; không gửi dữ liệu khách ngoài những gì hóa đơn bắt buộc.
- Hủy/điều chỉnh hóa đơn đã cấp mã theo đúng quy trình của nhà cung cấp — **không** xóa dòng.

## Không nằm trong P14

| Việc | Vì sao |
|---|---|
| Chữ ký số, HSM | Không bắt buộc với HĐ MTT (QD-022 D6) |
| Phần mềm kế toán, khai thuế thay quán | Ngoài phạm vi; chỉ xuất sổ |
| Tự làm T-VAN nối thẳng cơ quan thuế | Cần giấy phép |
| Nhiều nhà cung cấp cùng lúc ngay từ đầu | Một adapter trước; bên thứ hai khi có quán yêu cầu |
