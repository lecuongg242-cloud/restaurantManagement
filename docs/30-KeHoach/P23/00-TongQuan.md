# P23 — Ghép bàn cho khách đoàn

> Lập 01/10/2026. Plan là hợp đồng và nghiệm thu, không phải bản nháp code. **Trạng thái: GIAO DIỆN ĐÃ CHỐT 01/10/2026 (chủ dự án: "ok rồi" — giữ toàn bộ); CODE XONG 23-01, kết quả `23-01-SUMMARY.md`.** Chủ dự án đánh
> dấu cột "Chốt" ở mục Giao diện rồi mới bắt đầu code.
> Quyết định: `15-QuyetDinh/QD-029`. Yêu cầu: TABLE-03..06. Plan: `23-01-PLAN.md`.
> Phụ thuộc: P3 (phiên bàn, gọi món), P4 (hóa đơn, tách theo đơn, gộp bàn), P6 (chip "Đơn cần in phiếu"), P12 (POS trên điện thoại).

## Vì sao làm

Chủ dự án hỏi ngày 01/10/2026: đoàn 20 người đặt 5 bàn, thực đơn giống nhau, sau đó mỗi bàn tự gọi lẻ thì làm nhanh thế nào?
Hiện nhân viên phải gọi lặp lại trên 5 bàn, hoặc gọi hết trên một bàn trong khi 4 bàn kia vẫn hiện "Trống".

**P23 kết thúc khi:** chạm "Ghép bàn" và chọn 4 bàn, gọi món một lần cho cả đoàn. Bàn nào gọi lẻ thì phiếu bếp ghi đúng bàn đó,
và cả đoàn thu tiền bằng một hóa đơn (hoặc tách theo đơn nếu có bàn muốn trả riêng).

## Đối thủ làm thế nào (tra 01/10/2026)

| | KiotViet FnB | Sapo FnB | CUKCUK |
|---|---|---|---|
| Tên chức năng | **"Chuyển ghép bàn"** (nút góc dưới phải màn thu ngân) | Cài đặt **"Cho phép 1 đơn được ghép nhiều bàn"**, nút **"Chọn bàn"** trong đơn | **"Ghép order"** (menu ⋯ của order) |
| Mô hình | Nhiều bàn, **một đơn** | Nhiều bàn, **một đơn** | Gộp nhiều order thành một |
| Chọn bàn | Danh sách bàn; **"Chọn lại"** để xóa hết chọn | Tích xanh từng bàn, **"Xác nhận"** | Tích order cần ghép, "Đồng ý"; "Chọn bàn" để đổi bàn |
| Bàn phụ trên sơ đồ | Biểu tượng nhiều bàn; chạm bàn phụ thì **mở đơn bàn chính** | Hiện đúng "đang phục vụ" | — |
| Ghi bàn trên đơn / hóa đơn | (?) | **Bàn đầu + số bàn còn lại**; biểu tượng (i) xem đủ | — |
| Bỏ ghép | Bỏ được trước khi thanh toán | (?) | — |

Nguồn: [KiotViet – Gộp bàn](https://www.kiotviet.vn/fnb-gop-ban-270718/) ·
[Sapo – 1 đơn ghép nhiều bàn](https://help.sapo.vn/cho-phep-mot-don-duoc-ghep-nhieu-ban) ·
[CUKCUK – Ghép order](https://helpv2.cukcuk.vn/vi/kb/ghep-order). Không tìm thấy đối thủ nào ghi "bàn gọi" trên phiếu bếp cho từng
lượt gọi lẻ. Ta làm thêm điểm này vì chủ dự án yêu cầu "mỗi bàn tự gọi lẻ" (đã chốt ở QD-029 D4).

**Khác đối thủ (đã ghi lý do ở QD-029):** không có công tắc bật/tắt như Sapo, vì nút luôn có và quán không dùng thì không bấm.
Phiếu bếp ghi bàn gọi, như nói ở trên.

## Chủ dự án đã chốt (01/10/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Cách làm | **Hướng 1:** ghép bàn khi mở, một đơn chung (giống KiotViet / Sapo) |
| 2 | Chạm bàn phụ (B3) thì panel hiện gì | **(a)** Mọi đơn của nhóm, mỗi đơn có nhãn bàn gọi |
| 3 | "Tạm tính" cuối panel | **(a)** Tổng cả nhóm |

## Giao diện (ĐÃ CHỐT 01/10/2026 — giữ toàn bộ)

> Cột "Chốt": chủ dự án đánh ✅ giữ, hoặc ✏️ kèm chỗ cần đổi. Không có tab mới, không có mục menu mới. Mọi thay đổi nằm trong màn
> **Thu ngân (POS)** và trên giấy in.

### 1. Panel bàn (cột phải của POS; trên điện thoại là tab **Đơn**)

| Chỗ | Bàn thường (như nay) | Bàn trong nhóm | Đối thủ | Chốt |
|---|---|---|---|---|
| Tiêu đề | "Bàn B3" · "Mở lúc 18:43" | "Bàn B3" · dòng phụ **"Nhóm B1 · 5 bàn · Mở lúc 18:43"** | KiotViet: tên bàn chính | ✅ |
| Nút ở đầu panel (cạnh ✕) | **"Ghép bàn"** (biểu tượng nối) | **"Nhóm 5 bàn"**. Hai nút mở **cùng một hộp** (mục 2) | KiotViet "Chuyển ghép bàn"; Sapo "Chọn bàn" | ✅ |
| Dòng đầu mỗi đơn | "Đơn #2 · 18:43 · POS" | **"Đơn #4 · B3 · 18:52 · POS"**: nhãn bàn gọi nằm ngay sau số đơn | Sapo: bàn đầu + số bàn | ✅ |
| Khối giỏ | "Đang thêm (5)" | **"Đang thêm cho B3 (5)"**, để nhân viên biết món sẽ ghi bàn nào | — | ✅ |
| Dòng tiền cuối panel | "Tạm tính" | **"Tạm tính (cả nhóm)"**: tổng mọi bàn (chốt #3) | — | ✅ |
| Nút "Tính tiền" / "Đóng phiên" | Như nay | Như nay, áp cho cả nhóm | — | ✅ |

### 2. Hộp "Ghép bàn" (máy tính/tablet: hộp giữa màn; điện thoại: ngăn kéo từ dưới lên, nút dính đáy)

- **Tiêu đề:** "Ghép bàn với B1", trong đó B1 là bàn chính. Dòng phụ: *"Các bàn được chọn dùng chung một đơn và một hóa đơn."*
- **Thân:** bàn chia theo khu vực (Tầng 1, Tầng 2, Sân vườn…), mỗi bàn là một ô giống sơ đồ bàn, có ô tích ở góc.

| Loại bàn | Trong hộp | Chốt |
|---|---|---|
| Bàn chính | Đã tích, **khóa**, nhãn "Bàn chính" | ✅ |
| Bàn phụ hiện tại | Đã tích; bỏ tích được = **bỏ ghép** | ✅ |
| Bàn phụ còn món chưa thu | Đã tích, **khóa**, nhãn *"còn 2 món chưa thu"* | ✅ |
| Bàn trống | Tích được | ✅ |
| Bàn đang có món, chưa mở hóa đơn | Tích được, nhãn *"3 món — chuyển vào nhóm"* | ✅ |
| Bàn thuộc nhóm khác | Mờ, không tích được, nhãn *"Nhóm B6"* | ✅ |
| Bàn đang có hóa đơn / đã chia đều | Mờ, không tích được, nhãn *"Đang có hóa đơn"* | ✅ |

- **Nút:** "Hủy" · **"Xác nhận (5 bàn)"** (chữ theo Sapo). Đang lưu thì nút quay vòng. Lỗi hiện một dòng đỏ ngay trên nút,
  ví dụ *"B3 vừa có hóa đơn ở máy khác — tải lại để chọn lại."*
- **Mất mạng:** dùng câu chung của POS (*"Mất kết nối — chưa ghép bàn. Kiểm tra mạng rồi thử lại."*), không đóng hộp.

### 3. Sơ đồ bàn (cột trái của POS; trên điện thoại là tab **Bàn**)

| Chỗ | Nội dung | Đối thủ | Chốt |
|---|---|---|---|
| Trạng thái | Mọi bàn trong nhóm hiện **"Đang phục vụ"** | Sapo: hiện đúng bàn đang phục vụ | ✅ |
| Nhãn nhóm | Dưới trạng thái: biểu tượng nối + **"Nhóm B1"**. Riêng bàn chính ghi **"Nhóm B1 · 5 bàn"** | KiotViet: biểu tượng nhiều bàn | ✅ |
| Chấm đỏ (số món) | Số món chưa xong **gọi từ chính bàn đó**; món gọi chung tính vào bàn chính | — | ✅ |
| Chạm bàn phụ | Viền chọn nằm trên bàn vừa chạm; panel mở đơn chung (chốt #2) | KiotViet: mở đơn bàn chính | ✅ |

### 4. Giấy in và màn bếp

| Giấy / màn | Ghi bàn | Chốt |
|---|---|---|
| Phiếu bếp · Màn bếp (KDS) · chip "Đơn cần in phiếu" · hàng chờ duyệt QR | **"Bàn B3 (nhóm B1)"**, theo bàn gọi | ✅ |
| Hóa đơn · Phiếu khách · khối hóa đơn trên POS | **"Bàn B1 +4"** (theo Sapo) | ✅ |
| Tách bill → "Theo đơn" | Mỗi đơn có nhãn bàn: "Đơn #4 · B3", để chọn đúng phần bàn B3 trả riêng | ✅ |

### 5. Khách quét QR

Không đổi màn. Khách ở B3 vẫn thấy "Bàn B3". Đơn gửi đi vào nhóm và ghi bàn gọi B3.

## Ngoài phạm vi

Xem QD-029 §Ngoài phạm vi: đặt trước nhiều bàn, chuyển bàn và đổi bàn chính, báo cáo theo bàn (đếm vào bàn chính).

## Phát sinh 01/10/2026: ô bàn hiện tạm tính + thời gian ngồi (thay số món)

Chủ dự án: con số đỏ trên ô bàn (đếm dòng món chưa thu) "không hợp lý". Tra đối thủ cùng ngày:

| Đối thủ | Trên ô bàn đang có khách |
|---|---|
| Sapo FnB | Tổng tiền hóa đơn (chữ lớn), thời gian từ khi khách ngồi, số người; số đỏ nhỏ = số hóa đơn chưa thanh toán ([1](https://www.sapo.vn/app-sapo-fnb-thu-ngan.html), [2](https://help.sapo.vn/man-hinh-may-tinh-tien-fnb)) |
| CUKCUK | Thời gian phục vụ, tổng tiền, nhân viên phục vụ, số khách ([3](https://helpv2.cukcuk.vn/vi/kb/thiet-lap-so-do-ban-3)) |
| KiotViet FnB | Trang hướng dẫn chỉ tả biểu tượng trạng thái (đang dùng, đã in tạm tính, yêu cầu thanh toán, gộp bàn) ([4](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/ban-hang-bar-cafe-nha-hang/)) |

**Chốt ("ok", 01/10/2026):** bỏ chấm đỏ số món. Góc phải ô bàn hiện **tạm tính đầy đủ** ("610.000₫", cùng số với "Tạm tính"
của panel). Dưới trạng thái hiện **thời gian ngồi** ("25'", "1g25'"), tính từ lúc mở phiên, tự chạy mỗi 30 giây. Nhóm bàn: tiền
cả nhóm chỉ hiện ở bàn chính, bàn phụ chỉ ghi "Nhóm B1". Chưa làm số khách, vì chưa có ô nhập.

Báo cáo: thời gian ngồi **đã có** trong báo cáo "Hiệu quả bàn" (P16 16-03, `report_table_usage`): lượt, phút ngồi trung bình,
doanh thu / lượt, doanh thu / giờ ngồi. Hai nơi đo cùng mốc (mở phiên → đóng phiên).

Ảnh: `anh/o-ban-tien-thoi-gian-1280.png`, `anh/o-ban-tien-thoi-gian-390.png`. Code: `components/pos/TableMap.tsx`,
`thoiGianNgoi` trong `lib/time/vn.ts` (test ở `tests/time/vn.test.ts`).

## Phát sinh 01/10/2026: dòng món "Tên · SL · Thành tiền" và đơn mới nhất lên trên

- **Dòng món** (chủ dự án: "1× Phở bò tái" không hợp lý). Đối thủ: CUKCUK có cột Tên món · SL · Đơn giá · Thành tiền
  ([nguồn](https://helpv2.cukcuk.vn/vi/kb/voi-khach-den-an-tai-nha-hang-thu-ngan-ghi-order-nhu-the-nao)); KiotViet mỗi dòng có
  tên, số lượng (+/−), đơn giá, thành tiền ([nguồn](https://www.kiotviet.vn/phan-mem-kiotviet-danh-cho-nha-hang-cafe-quan-an-nang-cap-giao-dien-thu-ngan-moi/)).
  **Chốt ("ok"):** panel bàn và khối "Đang thêm" đều ghi **Tên món** (tùy chọn / ghi chú bên dưới) · **SL** · **Thành tiền**;
  SL ≥ 2 thì có đơn giá nhỏ "55.000₫/món" dưới thành tiền. Panel hẹp nên không tách cột đơn giá riêng. Món đã gửi **không** có
  +/− (bớt món = hủy món, phải qua lý do + PIN). Ngăn Giỏ hàng trên điện thoại: cụm SL · tiền · Sửa/Xoá xuống hàng dưới tên.
- **Thứ tự đơn** (chủ dự án: "đơn món mới nhất nên xếp ở bên trên"): panel bàn xếp đơn **mới nhất lên trên**. KiotViet có tùy
  chọn cho món mới hiện ở đầu hoặc cuối đơn (cùng nguồn trên). Món trong một đơn giữ thứ tự gọi.

Code: `components/pos/OrderPanel.tsx`. E2E `pos-dien-thoai.spec` đổi bước hủy món sang nút "Hủy" **đầu tiên** (món vừa gửi).
