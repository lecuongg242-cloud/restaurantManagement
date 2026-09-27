# QD-022 — Hóa đơn điện tử khởi tạo từ máy tính tiền

**Ngày:** 27/09/2026 · **Trạng thái:** CHỜ — kế hoạch viết sẵn; bắt đầu khi chủ dự án liên hệ xong nhà cung cấp
(D2). **Kế hoạch:** `30-KeHoach/P14/` · **Yêu cầu:** EINV-01..05
**Liên quan:** `00-TongQuan/PhanTichDoiThu.md` §4

## Bối cảnh pháp lý (tra 27/09/2026 — cần đối chiếu nguyên văn trước khi CHỐT)

| Nội dung | Kết luận | Độ chắc |
|---|---|---|
| Văn bản hiện hành | **NĐ 254/2026/NĐ-CP** + **TT 91/2026/TT-BTC**, hiệu lực 01/07/2026, **thay NĐ 123/2020 và NĐ 70/2025** | Có trên vanban.chinhphu.vn; chưa đọc nguyên văn từng điều |
| Ai bắt buộc | Tổ chức, hộ kinh doanh bán trực tiếp cho người tiêu dùng, gồm **ăn uống**. Hộ kinh doanh: **doanh thu > 1 tỷ/năm**; dưới ngưỡng dùng tự nguyện | Nguồn thứ ba (MISA) |
| Chữ ký số | HĐ từ máy tính tiền **không bắt buộc** chữ ký số người bán | Nguồn thứ ba (MISA, EasyPOS) |
| Hộ ≤ 1 tỷ | Không chịu thuế GTGT/TNCN (từ 01/01/2026). Sổ sách theo **TT 152/2025**: sổ doanh thu **S1a-HKD**; hộ nộp theo tỷ lệ dùng **S2a-HKD** | baochinhphu.vn + luatvietnam |
| Miễn phí từ cơ quan thuế | Chỉ cho địa bàn khó khăn (12 tháng). Quán đô thị gần như không thuộc diện | Tóm tắt, chưa đọc nguyên văn |

Ví dụ: qt-food ~3,7 tỷ/năm ⇒ thuộc diện bắt buộc.

## Chủ dự án đã chốt (27/09/2026)

- Ưu tiên **miễn phí** cho quán.
- Hóa đơn điện tử **không** nằm trong P13; làm ở P14 sau khi liên hệ nhà cung cấp.

## Quyết định (đề xuất)

| # | Việc | Chọn | Vì sao | Phương án bị loại |
|---|---|---|---|---|
| D1 | Cách nối | **Gọi API nhà cung cấp HĐĐT** (họ lo truyền dữ liệu lên cơ quan thuế). Hệ thống chỉ lưu **thông tin đăng nhập API của từng quán** (mã hóa) | Hóa đơn gắn MST của quán ⇒ quán ký hợp đồng trực tiếp với nhà cung cấp; nền tảng không trả phí | Tự làm T-VAN nối thẳng cơ quan thuế — cần giấy phép |
| D2 | Nhà cung cấp đầu tiên | **VNPAY-Invoice nếu mở được đối tác API** (miễn phí cho hộ kinh doanh, không giới hạn, tới 31/12/2028; KiotViet/Sapo/iPOS/POS365 đã tích hợp). **Dự phòng: Viettel SInvoice** (tài liệu công khai, có môi trường demo) | Đúng ưu tiên miễn phí; Viettel cho phép làm trước khi có hợp đồng | MISA meInvoice (200–833đ/HĐ), M-invoice (thu 3,5tr/ngày hỗ trợ tích hợp) — giữ làm lựa chọn thêm |
| D3 | Kiến trúc | **Một lớp adapter** (giao diện chung: phát hành, tra trạng thái, hủy/thay thế) + mỗi nhà cung cấp một adapter | Quán tự chọn nhà cung cấp mình đã có hợp đồng; đổi bên không đụng POS | Viết thẳng cho một bên |
| D4 | Lúc phát hành | **Tự động khi đóng bill** (quán bật chế độ HĐĐT); gửi **bất đồng bộ** qua hàng đợi, thử lại khi lỗi. Đóng bill **không chờ** nhà cung cấp | Không làm chậm thu tiền (BILL-04 ≤ 5s); mất mạng/nhà cung cấp lỗi không chặn bán | Phát hành đồng bộ trong `pay_bill` |
| D5 | Hộ ≤ 1 tỷ | **Xuất sổ S1a-HKD / S2a-HKD** từ dữ liệu bán hàng (Excel/PDF) — không cần nhà cung cấp | 0đ, làm được ngay, dùng cho mọi quán | Tự làm phần mềm kế toán — ngoài phạm vi |
| D6 | Chữ ký số | **Không làm** cho luồng máy tính tiền | Không bắt buộc (bảng trên) | Tích hợp HSM/USB token |

## Việc của chủ dự án trước khi bắt đầu P14

1. Liên hệ VNPAY-Invoice: hỏi chương trình đối tác phần mềm POS, tài liệu API, môi trường thử, điều kiện
   miễn phí cho hộ kinh doanh và doanh nghiệp nhỏ.
2. Nếu VNPAY không mở trong ~2 tuần: đăng ký tài khoản demo Viettel SInvoice.
3. Nhờ kế toán/đại lý thuế xác nhận: bảng pháp lý trên, mẫu sổ S1a/S2a, dữ liệu bắt buộc trên HĐ MTT.

## Chưa quyết

- Có tính phí nền tảng cho tính năng HĐĐT không (hiện: không — gộp trong thuê bao, QD-021 C2).
- Hóa đơn cho khách yêu cầu xuất tên công ty/MST người mua — làm ngay P14 hay sau.
