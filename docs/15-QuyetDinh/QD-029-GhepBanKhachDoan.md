# QD-029 — Ghép bàn khi mở cho khách đoàn

> Ngày: 2026-10-01 · Trạng thái: **Đã chốt** (giao diện chốt 01/10/2026) · Liên quan: TABLE-02, TABLE-03..06, ORDER-03, BILL (tách theo
> đơn, gộp bàn 04-02), [[QD-011-GoiThemChoDonKhongBan]]. Kế hoạch: `30-KeHoach/P23/`.

## Bối cảnh

Đoàn 20 người ngồi 5 bàn, cùng một thực đơn đặt trước, sau đó từng bàn có thể gọi lẻ. Hiện tại mỗi phiên chỉ gắn **một** bàn
(`table_sessions.table_id`, một phiên mở mỗi bàn). Nhân viên có hai cách, cách nào cũng dở:

- Gọi hết trên B1. B2–B5 vẫn hiện "Trống" dù có khách ngồi, phiếu bếp chỉ ghi B1.
- Gọi lặp lại trên 5 bàn. Chậm và dễ sót món.

"Gộp bàn" (04-02) chỉ gộp **hóa đơn** lúc thu tiền, không giúp được lúc gọi món.

## Đối thủ (tra 01/10/2026)

- **KiotViet FnB** — nút "Chuyển ghép bàn": nhiều bàn chung **một đơn**. Bàn phụ có biểu tượng nhiều bàn; chạm bàn phụ thì mở đơn
  của bàn chính; "Chọn lại" để bỏ bàn ghép sai. https://www.kiotviet.vn/fnb-gop-ban-270718/
- **Sapo FnB** — cài đặt "Cho phép 1 đơn được ghép nhiều bàn"; trong đơn bấm **"Chọn bàn"**, tích nhiều bàn, "Xác nhận". Danh sách
  đơn và hóa đơn ghi **bàn đầu + số bàn còn lại**; biểu tượng (i) xem đủ các bàn. https://help.sapo.vn/cho-phep-mot-don-duoc-ghep-nhieu-ban
- **CUKCUK** — "Ghép order": gộp các order đã có vào một order, chọn lại bàn. https://helpv2.cukcuk.vn/vi/kb/ghep-order

## Quyết định

### D1. Một nhóm = một phiên gắn nhiều bàn (theo KiotViet / Sapo)

Bàn của phiên là **bàn chính**. Các bàn ghép thêm là **bàn phụ**, trỏ về phiên đó. Mỗi bàn thuộc tối đa một phiên đang mở.

Vì sao chọn cách này: hóa đơn, tách bill, thu tiền và tự đóng phiên đều đang chạy **theo phiên**. Giữ nhóm trong một phiên thì
phần tiền gần như không phải sửa. Đã loại phương án "sao chép đơn sang nhiều bàn": không đối thủ nào làm, và chủ dự án chọn Hướng 1.

### D2. Mỗi đơn ghi bàn gọi

Đơn ghi lại bàn nơi món được gọi: chạm B3 rồi gọi trên POS, hoặc khách quét QR của B3. Đơn cũ không có bàn gọi thì hiểu là bàn chính.

### D3. Chạm bàn nào cũng mở đơn chung; "Tạm tính" là tổng cả nhóm

Chủ dự án chốt 01/10/2026 (cả hai câu chọn (a)). Panel hiện mọi đơn của nhóm, mỗi đơn có nhãn bàn gọi.

### D4. Chữ trên giấy in và màn hình

- **Phiếu bếp, KDS, chip "Đơn cần in phiếu":** ghi bàn gọi kèm nhóm, ví dụ **"Bàn B3 (nhóm B1)"**. Đơn gọi từ bàn chính ghi
  "Bàn B1 (nhóm B1)". Phục vụ phải biết mang món ra bàn nào.
- **Hóa đơn, phiếu khách, danh sách:** ghi **"Bàn B1 +4"**, tức bàn chính cộng số bàn phụ, theo cách của Sapo.

### D5. Ghép được những bàn nào

- **Bàn trống:** ghép được.
- **Bàn đang có món nhưng chưa mở hóa đơn:** ghép được. Các đơn của bàn đó **chuyển vào nhóm** và giữ bàn gọi là bàn đó; phiên
  cũ của bàn đóng lại. Cách này theo "Ghép order" của CUKCUK.
- **Không ghép được** (hộp chọn hiện lý do): bàn đang thuộc nhóm khác; bàn có hóa đơn đang mở hoặc đã chia đều.
- Bàn chính có thể đang trống. Bấm "Ghép bàn" trên bàn trống thì mở phiên mới.

### D6. Bỏ ghép

- Bỏ một bàn phụ khi **mọi món gọi từ bàn đó đã thu hoặc đã hủy**. Bàn đó về "Trống", nhóm còn lại giữ nguyên. Nếu còn món chưa
  thu, hệ thống báo bàn còn bao nhiêu món và hướng dẫn "Tách bill theo đơn" rồi thu trước.
- **Bàn chính không bỏ ghép được.** Khi cả nhóm thu đủ tiền, phiên đóng và mọi bàn về "Trống", như phiên thường.

### D7. Giữ "Gộp bàn" lúc tính tiền

"Gộp bàn" dành cho bàn lẻ gọi riêng rồi xin trả chung. Hai bàn cùng một nhóm không hiện là ứng viên gộp của nhau.

## Ngoài phạm vi (ghi lại để không quên)

- **Đặt bàn trước cho nhiều bàn.** Sapo có, nhưng `reservations.table_id` của ta chỉ có một bàn. Để sau.
- **Chuyển bàn và đổi bàn chính.**
- **Báo cáo theo bàn** (`report_table_usage`, `report_by_area`): đếm nhóm vào **bàn chính**. Báo cáo theo khu vực vẫn đúng nếu cả nhóm
  ngồi cùng khu.
- **Bật/tắt bằng cài đặt như Sapo:** không làm. Nút "Ghép bàn" luôn có, quán không dùng thì không bấm.
