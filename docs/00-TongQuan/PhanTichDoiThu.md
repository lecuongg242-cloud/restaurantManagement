# Phân tích đối thủ cạnh tranh — chuẩn bị thương mại hóa

> Ngày khảo sát: 27/09/2026. Giá lấy từ trang chính thức của từng hãng, trừ các chỗ có đánh dấu.
> Ký hiệu: **(?)** = thông tin chưa chắc chắn, cần kiểm tra lại bằng mắt trước khi đem ra trích dẫn với khách.

## 1. Tóm tắt

- **Mặt bằng giá:** khoảng **160k–500k/tháng cho 1 chi nhánh**, thường phải trả trước cả năm. Thêm chi nhánh thì cộng thêm khoảng 200–375k mỗi chi nhánh. Với hộ kinh doanh nhỏ, giá đang bị kéo về **0đ**: iPOS FABiBox miễn phí trọn đời, POS365 miễn phí đến hết 2028.
- **Hóa đơn điện tử (HĐĐT) khởi tạo từ máy tính tiền đã là điều kiện bắt buộc.** Theo NĐ 70/2025, quán có doanh thu từ 1 tỷ/năm phải dùng. Từ 2026 bỏ thuế khoán, nên đối thủ nào cũng lấy HĐĐT làm lý do chính để kéo khách. Hệ thống của mình **chưa có HĐĐT**. Đây là khoảng trống lớn nhất.
- **Lợi thế của mình:**
  - QR gọi món tại bàn, KDS, đặt bàn, đặt món online đều có sẵn ở mức cơ bản. KiotViet và Sapo chỉ mở các tính năng này từ gói 330–399k.
  - Kiểm soát gian lận: hủy món và giảm giá phải có PIN người duyệt; có báo cáo hủy món sau khi đã in phiếu bếp.
  - Giá vốn theo định lượng, cho phép bán thành phẩm lồng nhau, có chốt sổ ngày.
  - Triển khai tận nơi và chạy song song với cách cũ.
- **Điểm thua:** thiếu VietQR động, CRM/tích điểm/voucher, chấm công, chuỗi nhiều chi nhánh, kết nối Grab/Shopee, chế độ offline, app native. Ngoài ra mình mới có 1 quán thật; đối thủ công bố từ 50.000 đến hơn 300.000 khách.

## 2. Bảng giá đối thủ

| Hãng / gói | Giá niêm yết | Phạm vi | Phí khác / dùng thử |
|---|---|---|---|
| **KiotViet** Hỗ trợ | 270k/tháng | 1 chi nhánh, tối đa 3 tài khoản | Không phí khởi tạo. Dùng thử 10 ngày. Nhiều khả năng trả theo năm (?) |
| KiotViet Chuyên nghiệp | 330k/tháng | +270k/chi nhánh, không giới hạn tài khoản | Có chấm công cho 15 nhân viên |
| KiotViet Cao cấp | 490k/tháng | +375k/chi nhánh | Có API, phân tích AI, chấm công cho 50 nhân viên |
| **Sapo FnB** Start Up | 249k/tháng; 170k nếu ký 2 năm | 1 chi nhánh, 5 thiết bị | Khởi tạo 1tr (miễn nếu ký từ 2 năm). Dùng thử 7 ngày |
| Sapo FnB Pro | 399k/tháng; 249k nếu ký 2 năm | 1 chi nhánh, không giới hạn thiết bị | Khởi tạo 1,5tr. Muốn làm chuỗi phải hỏi giá riêng |
| **CUKCUK** Standard / Pro / Enterprise | 199k / 299k / 499k mỗi tháng | Theo chi nhánh; thêm chi nhánh tính cùng mức giá | Dùng thử 15 ngày. Đào tạo 1-1 giá 3,95tr/buổi; triển khai tại chỗ 11,95tr (2 ngày) (?) |
| **iPOS FABi** | 250k/tháng (?) | Chưa rõ tính theo máy hay theo chi nhánh | Không công khai bảng giá, phải qua sales. Combo kèm máy POS khoảng 6,4tr/năm (?) |
| **iPOS FABiBox** | **0đ** bản cơ bản | Hộ kinh doanh nhỏ | Tính năng nâng cao thu phí, chưa công bố giá |
| **POS365** | 1,95tr/năm (≈162k/tháng) | Không giới hạn chi nhánh và thiết bị | Đang khuyến mãi miễn phí phần mềm + HĐĐT đến hết 2028 (qua VNPay) |
| Ocha POS | — | Có dấu hiệu gần như ngừng hoạt động (theo nguồn thứ ba) | Không tính là đối thủ |

**Phần cứng:** KiotViet bán lẻ từng món: máy POS 5–7tr, máy in bếp 1,4tr, máy in hóa đơn khoảng 600k, màn hiển thị QR 490k, loa báo chuyển khoản 540k. POS365 và iPOS có combo kèm máy.

## 3. Ma trận chức năng

Ký hiệu: ✓ có · ◐ có một phần hoặc chưa nghiệm thu · ✗ không có · – trang hãng không nhắc đến.
Dấu "từ gói X" nghĩa là tính năng chỉ có từ gói X trở lên.

| Chức năng | **Mình** | KiotViet | Sapo FnB | CUKCUK | iPOS | POS365 |
|---|---|---|---|---|---|---|
| POS, sơ đồ bàn, món kèm tùy chọn | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Phục vụ gọi món trên điện thoại | ◐ POS web co giãn | ✓ app | ✓ | ✓ | ✓ PDA | ✓ |
| **Khách gọi món bằng QR tại bàn** | **✓ có sẵn ở mức cơ bản** | từ gói Chuyên nghiệp | chỉ gói Pro | ✓ | ✓ (O2O) | – |
| KDS màn hình bếp | ◐ chỉ để xem, chưa bấm đang làm/xong | ✓ | ◐ | ✓ | ✓ | ✓ |
| In bếp tự động | ◐ cầu in cho Windows | ✓ | ✓ | ✓ | ✓ | ✓ |
| Tách, gộp bill, chia đều | ✓ | ✓ | – | ✓ | ✓ | ✓ |
| **VietQR động / thẻ / ví** | **✗** chỉ ghi nhận chuyển khoản | ✓ | ✓ | ✓ | ✓ | ✓ |
| Giảm giá phải có PIN, lưu người duyệt | ✓ | – | – | – | – | – |
| Kho, định lượng, giá vốn | ◐ đã xong, chưa bật cho quán thật | ✓ | từ gói Pro | từ gói Pro | ✓ | ✓ |
| **CRM, tích điểm, voucher** | **✗** | ✓ | ✓ | chỉ gói Enterprise | ✓ | ✓ |
| Đặt bàn online | ✓ | từ gói Chuyên nghiệp | ✓ | ✓ | ✓ | – |
| Đặt món online trên web của quán | ✓ | từ gói Chuyên nghiệp | – | thu thêm 1,5tr/năm | ✓ | – |
| **Kết nối GrabFood / ShopeeFood** | **✗** | từ gói Chuyên nghiệp | ✓ | ✓ | ✓ | – |
| **HĐĐT từ máy tính tiền** | **✗** | ✓ miễn phí | ✓ | ✓ (meInvoice) | ✓ | ✓ miễn phí |
| Chấm công, tính lương | ✗ | từ gói Chuyên nghiệp | chỉ gói Pro | – | ✓ (HRM) | – |
| Báo cáo doanh thu, giờ cao điểm, hủy món | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Báo cáo hủy sau khi đã in phiếu bếp | ✓ | – | – | – | – | – |
| Chuỗi nhiều chi nhánh | ✗ (V2-A) | từ gói Chuyên nghiệp | chỉ gói Pro | ✓ | ✓ mạnh nhất | ✓ |
| Chạy offline | ✗ (V2-C) | ✓ | (?) | – | – | ✓ |
| App native / PWA | ✗ chỉ có web | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hỗ trợ | Hỗ trợ sát 14 ngày; giờ hỗ trợ chưa quyết | 7h–22h | – | ✓ | ✓ | ✓ |

## 4. Bối cảnh pháp lý

- **NĐ 70/2025/NĐ-CP** (hiệu lực từ 01/06/2025): hộ kinh doanh ăn uống có doanh thu **từ 1 tỷ/năm** phải dùng HĐĐT khởi tạo từ máy tính tiền, kết nối với cơ quan thuế.
- **Từ 01/01/2026 bỏ thuế khoán**, hộ kinh doanh chuyển sang tự kê khai. Doanh thu dưới 500 triệu/năm được miễn thuế GTGT và TNCN.
- **Cập nhật 27/09/2026:** **NĐ 254/2026/NĐ-CP** + **TT 91/2026/TT-BTC** (hiệu lực 01/07/2026) đã **thay NĐ 123/2020 và NĐ 70/2025**. Nội dung về hóa đơn từ máy tính tiền được giữ: bắt buộc với hộ ăn uống doanh thu > 1 tỷ/năm, **không bắt buộc chữ ký số**. Hộ ≤ 1 tỷ không chịu thuế GTGT/TNCN, chỉ ghi sổ S1a-HKD (TT 152/2025). Chi tiết và nhà cung cấp: `15-QuyetDinh/QD-022`.
- **Cách đối thủ khai thác:**
  - MISA tặng 300 hóa đơn và 6 tháng miễn phí.
  - iPOS có xác nhận của Tổng cục Thuế và tung FABiBox miễn phí.
  - POS365 miễn phí đến hết 2028.
  - KiotViet tặng HĐĐT và chữ ký số.
- Ví dụ quán mẫu qt-food: khoảng 565 triệu trong 8 tuần, tức khoảng 3,7 tỷ/năm, đã **thuộc diện bắt buộc**. Nếu không có HĐĐT, quán cỡ này sẽ phải dùng song song một phần mềm khác.

## 5. Khoảng trống cần lấp trước khi bán

Xếp theo mức độ chặn bán hàng:

| # | Hạng mục | Lý do | Cách làm đơn giản nhất (gợi ý) |
|---|---|---|---|
| 1 | **HĐĐT từ máy tính tiền** | Bắt buộc với quán từ 1 tỷ/năm; đối thủ nào cũng có | **Kết nối** một nhà cung cấp HĐĐT có API (VNPT, Viettel, M-invoice, MISA meInvoice…), không tự làm. Cần một QD riêng |
| 2 | **VietQR động + tự đối soát** | Hình thức thanh toán phổ biến nhất ở quán; đối thủ có ở mọi gói | Sinh mã QR VietQR theo số tiền của bill; tự xác nhận qua webhook (Casso/SePay) |
| 3 | KDS bấm đang làm/xong | Quán vừa và lớn sẽ hỏi | Đã có trong V2-B |
| 4 | PWA cài lên màn hình chính | Khách quen dùng app; chi phí làm thấp | Thêm manifest và icon (OPS-04) |
| 5 | CRM, tích điểm cơ bản | Có ở mọi đối thủ | Lưu khách theo số điện thoại, tích điểm theo bill |
| 6 | Chuỗi nhiều chi nhánh, Grab/Shopee, offline, chấm công | Chỉ cần cho phân khúc chuỗi hoặc quán lớn | Làm sau, đúng lộ trình V2/V3. Ban đầu **không** bán cho phân khúc chuỗi |

## 6. Gợi ý định vị và giá

**Định vị:** *"Quán tầm trung: QR gọi món, bếp và giá vốn có sẵn ngay ở gói cơ bản; chống thất thoát; có người đến tận quán cài đặt."*
- Không cạnh tranh giá với các gói 0đ.
- Không cạnh tranh độ đầy đủ với iPOS/KiotViet ở phân khúc chuỗi.
- Nhắm vào quán 10–40 bàn, doanh thu 1–10 tỷ/năm. Đây là nhóm đang phải chuyển đổi vì HĐĐT và mất tiền vì nhân viên hủy món.

**Khung giá gợi ý** (cần kiểm chứng bằng phỏng vấn 5–10 chủ quán trước khi chốt):

| Gói | Giá | Bao gồm |
|---|---|---|
| Cơ bản | ~249k/tháng (trả năm ~199k) | POS, QR gọi món, KDS, in bếp, đặt bàn, đặt món online, báo cáo, kiểm soát hủy món và giảm giá |
| Chuyên nghiệp | ~349k/tháng (trả năm ~299k) | Thêm kho, định lượng, giá vốn, lãi gộp theo món; sau này thêm CRM |
| Triển khai tận nơi | Thu một lần 1–2tr, hoặc miễn khi trả năm | Khảo sát, cài đặt, chạy song song, hỗ trợ sát 14 ngày |

- **So sánh:** gói Cơ bản của mình có QR gọi món và đặt món online. KiotViet bán các tính năng này ở gói 330k, Sapo ở gói 399k. Mức ~249k vì vậy vẫn rẻ hơn khi so cùng tính năng.
- **Chi phí hạ tầng:** Supabase Pro khoảng 25 USD + Vercel Pro khoảng 20 USD mỗi tháng, dùng chung cho nhiều quán. Với khoảng 20 quán, chi phí hạ tầng mỗi quán chỉ vài chục nghìn đồng. Chi phí thật nằm ở **người hỗ trợ** (QD-019).
- **HĐĐT:** tính phí theo lượng hóa đơn của nhà cung cấp, hoặc gộp vào gói. Quyết định khi chọn đối tác.

## 7. Việc tiếp theo đề xuất

1. Kiểm tra lại bằng mắt các giá có dấu (?) và tra văn bản NĐ 254/2026.
2. Viết `QD-0xx-HoaDonDienTu` chọn nhà cung cấp HĐĐT, và `QD-0xx-GoiCuoc` chốt giá.
3. Thêm mã yêu cầu EINV-xx và PAY-QR-xx vào `docs/20-DanhSachYeuCau/00-Requirements.md`, lập kế hoạch P13.
4. Cập nhật trạng thái cũ trong Requirements: các mục P3–P5 đã có code nhưng vẫn ghi ☐.

## Nguồn

- KiotViet: https://www.kiotviet.vn/phi-dich-vu/ · https://www.kiotviet.vn/phan-mem-quan-ly-nha-hang/
- Sapo FnB: https://www.sapo.vn/bang-gia-sapo-fnb.html
- CUKCUK: https://www.cukcuk.vn/bang-gia/
- iPOS: https://ipos.vn/thong-bao-dieu-chinh-gia-thue-bao-ipos-fabi/ · https://vietnamnet.vn/ipos-tung-mien-phi-phan-mem-quan-ly-ban-hang-fabibox-2471447.html
- POS365: https://www.pos365.vn/phi-dich-vu
- Pháp lý: https://baochinhphu.vn/thuc-hien-nghi-dinh-70-2025-nd-cp-huong-toi-minh-bach-hoa-so-hoa-quan-ly-ho-kinh-doanh-102250529211550033.htm · https://vov.vn/kinh-te/bo-thue-khoan-tu-112026-hon-25-trieu-ho-kinh-doanh-can-chuan-bi-gi-post1255111.vov
- Chức năng của hệ thống mình: đối chiếu `docs/20-DanhSachYeuCau`, `docs/60-BanGiao`, `supabase/migrations`, `app/r/[slug]/*`.
