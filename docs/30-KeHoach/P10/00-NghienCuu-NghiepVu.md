# P10 — Nghiên cứu nghiệp vụ: Định lượng, tồn nguyên liệu, giá vốn & hao hụt

> Lập 24/09/2026. **Trạng thái: NGHIÊN CỨU** — chưa phải plan, chưa có mã yêu cầu.
> Mục đích: gom nghiệp vụ thực tế (phần mềm F&B VN + chuẩn ngành quốc tế), đối chiếu với dữ liệu
> hệ thống đang có, rồi chốt các câu hỏi mở trước khi viết `20-DanhSachYeuCau` và `QD-017`.

## 1. Chủ dự án muốn gì (nguyên văn, chia nhỏ)

| # | Nhu cầu | Người dùng | Khi nào |
|---|---|---|---|
| N1 | Cấu hình nguyên liệu + gram cho từng món | Owner/manager | Một lần, sửa khi đổi công thức |
| N2 | Nhập nguyên liệu nhận vào buổi sáng: số lượng, giá (nếu có) | Manager/bếp | Mỗi sáng (có thể nhập thêm trong ngày) |
| N3 | Dự đoán **còn làm được bao nhiêu phần** mỗi món → thu ngân biết món sắp hết | Thu ngân (POS), phục vụ | Liên tục trong ca |
| N4 | Lợi nhuận & biên lợi nhuận **từng món** | Owner | Cuối ngày / kỳ |
| N5 | **Hao hụt** | Owner | Cuối ngày / kỳ |

N3 là giá trị vận hành hằng ngày (thu ngân dùng). N4–N5 là giá trị quản trị (chủ quán dùng).
Hai nhóm này có **độ chính xác cần thiết khác nhau** — xem §5.

## 2. Thị trường đang làm thế nào

### 2.1 Phần mềm F&B Việt Nam (KiotViet, Sapo FnB, iPOS, CukCuk)

Cùng một khuôn, khác nhau ở chi tiết:

1. **Định mức (định lượng) nguyên liệu** cho từng món — ví dụ 1 ly cà phê = 25g cà phê + 10g đường.
   Thuật ngữ trong nghề: *bảng định mức nguyên vật liệu* / *công thức chế biến*.
2. **Tự động trừ kho** khi bán: KiotViet trừ khi hóa đơn thanh toán; Sapo FnB trừ khi món hoàn
   thành. Không ai bắt nhân viên ghi tay lượng dùng.
3. **Phiếu nhập kho** (có giá, nhà cung cấp) → hình thành giá vốn.
4. **Phiếu xuất hủy / xuất hao hụt** cho hàng hỏng, hết hạn — ghi nhận là chi phí.
5. **Kiểm kê định kỳ** (cuối ngày/tuần/tháng): đếm thực tế → hệ thống so với tồn sổ sách →
   **báo cáo chênh lệch kiểm kê** (iPOS gọi đúng tên này) → phiếu điều chỉnh.
6. **Báo cáo tồn kho, giá vốn, lãi gộp theo món.**

### 2.2 Chuẩn ngành quốc tế (Toast, MarketMan, Restaurant365, meez)

Hai khái niệm quan trọng mà phần mềm VN thường làm mờ:

- **Giá vốn lý thuyết (theoretical food cost)** = Σ (định lượng × giá nguyên liệu × số phần bán),
  giả định không hao hụt, không làm dư, không mất mát.
- **Giá vốn thực tế (actual food cost)** = tồn đầu + nhập − tồn cuối (đếm thật). Chứa mọi thứ đã
  rời khỏi kho: bán, hỏng, đổ bỏ, làm dư phần, cho không, cơm nhân viên, thất thoát.
- **Chênh lệch = thực tế − lý thuyết** → chia doanh thu ra %. Quán vận hành tốt giữ **dưới 2%**;
  **trên 5%** là dấu hiệu lỗi hệ thống (làm dư phần, hỏng, mất cắp, hoặc định lượng khai sai).

→ **"Hao hụt" chính là chênh lệch này.** Không đo được hao hụt nếu không có tồn cuối đếm thật.

- **Tỷ lệ sử dụng được (yield %)**: 1kg thịt bò mua về (AP — *as purchased*), sau lọc gân mỡ còn
  850g dùng được (EP — *edible portion*) → yield 85%. Giá thật của 1g dùng được = giá mua / yield.
  Khai yield 85% mà bếp chỉ đạt 78% thì 7 điểm đó chảy thẳng vào chênh lệch.
- **Đếm ngược theo phần ("86 count", Toast)**: nhập tay "hôm nay có 20 phần sườn", mỗi lần bán tự
  trừ 1, số còn lại hiện ngay trên nút món ở POS, về 0 thì món bị khóa. **Không cần định lượng.**

## 3. Các khái niệm cần thống nhất (từ điển P10)

| Thuật ngữ | Nghĩa trong hệ thống | Ví dụ |
|---|---|---|
| Nguyên liệu | Thứ quán mua/nhập, có **đơn vị gốc** để trừ kho | Thịt bò (g), Bánh phở (g), Trứng (quả), Nước dùng (ml) |
| Đơn vị nhập | Đơn vị lúc mua, có hệ số quy đổi về đơn vị gốc | 1 kg = 1000 g · 1 vỉ = 10 quả · 1 bó ≈ 200 g |
| Định lượng | Lượng nguyên liệu (đơn vị gốc) cho **1 phần** món | Phở bò tái = 150g bánh phở + 80g bò + 400ml nước dùng |
| Định lượng tùy chọn | Lượng cộng thêm khi chọn modifier | "Thêm trứng" = +1 quả · "Size lớn" = +50g bò |
| Yield | % dùng được sau sơ chế | Bò 85%, hành 90% |
| Bán thành phẩm | Nguyên liệu do quán tự nấu từ nguyên liệu khác | Nước dùng, sốt, thịt kho |
| Tồn lý thuyết | Đầu ngày + nhập − Σ định lượng đã dùng theo đơn | — |
| Tồn thực tế | Số đếm được lúc kiểm kê | — |
| Giá vốn món | Σ (định lượng / yield × giá đơn vị nguyên liệu) | 18.500đ / bát |
| Lãi gộp món | Giá bán thực thu − giá vốn | 55.000 − 18.500 = 36.500đ |
| Food cost % | Giá vốn / giá bán | 33,6% |

## 4. Đối chiếu với hệ thống hiện có

Những gì **đã có sẵn** và P10 tái dùng được — đây là lợi thế lớn, nhiều phần mềm VN phải làm lại từ đầu:

| Dữ liệu có sẵn | Ở đâu | P10 dùng để |
|---|---|---|
| `order_items.qty`, `menu_item_id`, `status` | 0008 | Tính lượng đã dùng theo đơn (không cần bảng trừ kho riêng — xem §6 D2) |
| `order_item_modifiers.option_id` | 0008 | Cộng định lượng tùy chọn (thêm trứng, size lớn) |
| `order_items.cancelled_at` + mốc in phiếu bếp | 0028, 0037 | **Hủy trước khi in** = hoàn nguyên liệu · **hủy sau khi in** = món đã làm → **hao hụt có lý do** |
| `menu_items.is_available` + quyền bật/tắt hết món ở POS/KDS | 0004, QD-010 §5 | Chỗ gắn cảnh báo/khóa tự động khi hết |
| Bill + giảm giá + phân bổ `bill_items` | 0012, 0013, 0033 | Doanh thu **thực thu** theo món (sau giảm giá) cho lãi gộp |
| RPC báo cáo theo kỳ, mốc ngày VN | 0023, 0029 | Khuôn cho báo cáo giá vốn/lãi gộp |

**Chưa có gì** về: nguyên liệu, định lượng, giá vốn, nhập, kiểm kê. `GioiThieu.md` và thiết kế tổng
thể V1 ghi rõ "không quản lý kho nguyên liệu (chỉ bật/tắt hết món)"; spec báo cáo dòng tiền
12/08 ghi "không làm được lợi nhuận/biên lãi — `menu_items` chưa có giá vốn". **P10 là nơi gỡ hai
dòng đó.**

Lưu ý: hệ thống **không có biến thể size** ở món — size đang đi qua modifier. Nên định lượng tùy
chọn (modifier) là bắt buộc ngay từ đầu, không phải tính năng phụ.

## 5. Đặc thù quán nhỏ Việt Nam — vì sao không nên bê nguyên "phần mềm kho"

1. **Mua chợ mỗi sáng, dùng hết trong ngày.** Không có "kho" theo nghĩa kế toán; tồn qua đêm chủ
   yếu là đồ khô (gia vị, bánh phở khô, nước ngọt). Mô hình "nhập buổi sáng" của chủ dự án đúng
   với thực tế này — **chu kỳ là một ngày, không phải một tháng**.
2. **Giá thường không có hóa đơn**, lúc có lúc không ("giá nếu có"). Hệ thống phải chạy được khi
   thiếu giá: đếm phần vẫn chạy, còn lãi gộp đánh dấu "chưa đủ giá" thay vì hiện số sai.
3. **Định lượng khai lần đầu sẽ sai.** Không quán nào cân từng bát. Vì vậy:
   - Số "còn ~N phần" là **ước tính** → nên **cảnh báo**, không nên tự khóa món cứng (khóa sai giữa
     giờ cao điểm = mất doanh thu thật, còn cảnh báo sai chỉ tốn một cái liếc mắt).
   - Kiểm kê cuối ngày là **vòng phản hồi** để sửa định lượng: chênh lệch kéo dài một chiều trên
     một nguyên liệu = định lượng khai sai, không phải mất cắp.
4. **Bán thành phẩm là trung tâm của quán phở/bún** (nồi nước dùng). Làm "công thức lồng công
   thức" (xương + hành + gia vị → nước dùng) là phức tạp nhất và ít giá trị nhất cho quán nhỏ.
   Cách đơn giản: coi **nước dùng là một nguyên liệu**, sáng nhập "nấu được 40 lít, chi phí nồi
   ~600k". Đếm phần vẫn đúng, giá vốn vẫn có.
5. **Người nhập liệu bận.** Buổi sáng là giờ sơ chế. Màn nhập phải nhanh như điền một danh sách
   quen thuộc (nguyên liệu hôm qua đã điền sẵn, chỉ sửa số), dùng được trên điện thoại.

## 6. Các quyết định thiết kế cần chốt (đề xuất cho QD-017)

### D1. Có kiểm kê cuối ngày không?
- **Không có** → chỉ có giá vốn lý thuyết + đếm phần. **Không đo được hao hụt** (N5 rơi).
- **Có, tùy chọn** → cuối ngày đếm các nguyên liệu chính (thường 5–10 thứ đắt: thịt, hải sản,
  nước dùng). Tồn cuối đếm được = tồn đầu ngày mai (đồ khô) hoặc = hao hụt (đồ tươi bỏ đi).
- **Đề xuất:** có, tùy chọn, **chỉ các nguyên liệu được đánh dấu "cần kiểm"**. Không bắt đếm
  gia vị.

### D2. Trừ nguyên liệu lúc nào, lưu thế nào?
Các phần mềm VN ghi phiếu trừ kho mỗi lần bán (trigger/ledger). Với hệ thống này, **đơn hàng đã
là sổ cái**: `order_items` + modifier + trạng thái hủy + mốc in đủ để tính lượng đã dùng bằng một
phép cộng.
- **Đề xuất:** **không** tạo bảng trừ kho theo từng món bán. Tồn lý thuyết = một hàm tính
  (tồn đầu + nhập − Σ định lượng × qty theo đơn trong ngày). Ít bảng, không trigger, không lệch
  giữa hai nơi lưu, và sửa định lượng thì số tự tính lại.
- Mốc tính: **món đã gửi bếp** (không đợi thanh toán) — vì thu ngân cần biết "sắp hết" *trước*
  khi khách trả tiền. Hủy trước in: không tính. Hủy sau in: tính là đã dùng **và** ghi vào hao
  hụt có lý do.
- Rủi ro cần đo: tính lại mỗi lần POS tải có nặng không (P8 vừa tối ưu tải). Quy mô một quán một
  ngày là vài trăm dòng — dự kiến nhẹ, nhưng phải đo, không đoán.

### D3. Giá vốn lấy theo giá nào?
| Cách | Ưu | Nhược |
|---|---|---|
| Giá nhập gần nhất | Đơn giản, dễ hiểu | Nhảy theo giá chợ từng ngày |
| **Bình quân gia quyền** | Chuẩn kế toán VN, mượt | Cần lịch sử nhập có giá |
| FIFO | Chính xác nhất | Quá nặng cho quán nhỏ |

**Đề xuất:** giá vốn **theo ngày** = bình quân gia quyền các lần nhập có giá trong ngày; ngày
không nhập có giá → dùng giá gần nhất và gắn nhãn "giá cũ".

### D4. Sửa định lượng có làm đổi báo cáo quá khứ?
Nếu tính động (D2) thì sửa định lượng hôm nay sẽ đổi giá vốn tháng trước. Hai lựa chọn:
chụp định lượng + giá vốn vào mỗi `order_item` (như `unit_price_snapshot` đang làm), hoặc **chốt
sổ cuối ngày** thành một bản ghi tổng hợp bất biến. **Đề xuất:** chốt sổ theo ngày — một thao tác,
một bảng, khớp với thói quen "chốt ca" quán đã có.

### D5. Hết nguyên liệu thì làm gì trên POS?
- Hiện "còn ~N" trên thẻ món ở POS/trang khách khi dưới ngưỡng (ví dụ ≤ 10).
- Về 0: **cảnh báo + gợi ý bấm "hết món"**, không tự khóa (lý do ở §5.3). Có thể thêm công tắc
  "tự khóa" theo quán khi họ tin định lượng của mình.

### D6. Lãi gộp tính trên giá nào?
Giá niêm yết × qty sẽ **phóng đại** lãi khi có giảm giá cấp bill. Hệ thống đã phân bổ bill về
từng món (`bill_items`), nên lãi gộp dùng **doanh thu thực thu đã phân bổ**. Món chưa thanh toán
không vào báo cáo lãi (vẫn vào đếm phần).

## 7. Phân loại hao hụt (để báo cáo nói được "hụt vì đâu")

| Loại | Nguồn dữ liệu | Hệ thống tự biết? |
|---|---|---|
| Hủy sau khi đã làm | `order_items` hủy sau mốc in (0037) | **Có** — đã đo từ P6 |
| Sơ chế (yield) | Hệ số yield khai trên nguyên liệu | Có, theo khai báo |
| Hỏng / đổ bỏ / hết hạn | Phiếu "xuất hủy" nhập tay + lý do | Chỉ khi nhân viên ghi |
| Cơm nhân viên, mời khách | Phiếu xuất nội bộ hoặc món giá 0 | Chỉ khi ghi |
| **Không giải thích được** | Chênh lệch kiểm kê − các loại trên | Có — **đây là con số chủ quán cần nhất** |

## 8. Chỉ số báo cáo đề xuất

- **Theo món:** giá bán, giá vốn/phần, lãi gộp/phần, food cost %, số phần bán, **tổng lãi gộp
  đóng góp** (lãi/phần × số phần — món lãi/phần cao nhưng bán ít có thể đóng góp ít hơn món rẻ).
- **Theo ngày:** doanh thu, giá vốn lý thuyết, giá vốn thực tế (nếu có kiểm kê), chênh lệch đ và %.
- **Theo nguyên liệu:** dùng lý thuyết vs dùng thực tế — chỉ ra nguyên liệu nào đang hụt.
- **Để sau P10:** ma trận menu engineering (Ngôi sao / Ngựa thồ / Câu đố / Chó — lãi cao-thấp ×
  bán chạy-chậm), dự báo lượng cần mua ngày mai theo lịch sử bán.

## 9. Đề xuất phạm vi — chia lát cắt dọc

Mỗi lát tự mang lại giá trị, dừng ở lát nào quán cũng dùng được:

| Lát | Nội dung | Giá trị ngay | Cần kiểm kê? |
|---|---|---|---|
| **10-01** | Danh mục nguyên liệu (đơn vị gốc, đơn vị nhập, yield) + định lượng món + định lượng modifier | Chủ quán thấy **giá vốn/món và food cost %** ngay khi có giá | Không |
| **10-02** | Nhập nguyên liệu buổi sáng (điền sẵn từ hôm qua, giá tùy chọn) + **"còn ~N phần"** trên POS | **N3** — thu ngân biết món sắp hết | Không |
| **10-03** | Báo cáo lãi gộp theo món trên doanh thu thực thu | **N4** | Không |
| **10-04** | Kiểm kê cuối ngày (nguyên liệu "cần kiểm") + phiếu xuất hủy + chốt sổ ngày + báo cáo hao hụt | **N5** | Có |

Tương tự P7–P9: thử trên tenant demo (`pho-viet`, `bun-bo`) trước; qt-food chỉ bật khi chủ quán
đồng ý và **tính năng mặc định tắt** — quán không khai định lượng thì mọi thứ chạy y như hôm nay.

## 10. Ngoài phạm vi P10 (đề xuất)

| Việc | Vì sao để sau |
|---|---|
| Công thức lồng công thức (bán thành phẩm tự tính từ nguyên liệu con) | Phức tạp nhất, ít giá trị cho quán nhỏ; §5.4 có cách thay thế |
| Nhà cung cấp, công nợ, đơn đặt hàng | Là nghiệp vụ mua hàng/kế toán, không phải vận hành ca |
| Kho nhiều nơi, chuyển kho | Chờ V2-A đa chi nhánh |
| Hạn sử dụng, lô | Quán dùng trong ngày |
| Dự báo lượng mua bằng lịch sử | Cần vài tuần dữ liệu thật trước |

## 11. Câu hỏi mở → đã chốt 24/09/2026 (chi tiết ở `QD-017`)

| Câu hỏi | Chốt |
|---|---|
| Kiểm kê cuối ngày (D1) | Có, tùy chọn, chỉ nguyên liệu "cần kiểm" |
| Hết thì cảnh báo hay khóa (D5) | **Chỉ cảnh báo vàng** "Có thể đã hết — hãy hỏi bếp", không khóa |
| Bán thành phẩm (§5.4) | **Công thức lồng công thức** — khác đề xuất ở §5.4; thực hiện qua *phiếu chế biến mẻ* (QD-017 D3), nên việc lồng công thức chuyển từ §10 vào phạm vi P10 |
| Ai nhập, khách có thấy | Manager/owner nhập; chỉ nhân viên thấy số phần |
| Món không cần định lượng (bia, nước ngọt) | Theo đề xuất: khai nguyên liệu 1:1 ("Coca lon" = 1 cái), một cơ chế duy nhất |

## Nguồn tham khảo

- KiotViet — định lượng & trừ kho tự động: https://www.kiotviet.vn/quan-ly-dinh-luong-nguyen-lieu-san-xuat-chia-khoa-thanh-cong-cho-cac-chu-nha-hang
- KiotViet — quản lý kho nguyên phụ liệu: https://www.kiotviet.vn/quan-ly-kho-nguyen-phu-lieu-la-lam-gi
- Sapo — bảng định mức nguyên vật liệu: https://www.sapo.vn/blog/bang-dinh-muc-nguyen-vat-lieu
- Sapo FnB — kiểm kê kho: https://help.sapo.vn/tao-phieu-kiem-ke-kho-nguyen-lieu-mat-hang-tren-trang-quan-tri-sapo-fnb
- iPOS — kiểm kê & chênh lệch kiểm kê: https://huongdan.ipos.vn/docs/huong-dan-su-dung-ipos-accounting/cac-nghiep-vu-cuoi-ky/kiem-ke-kho/
- CukCuk — so sánh phần mềm quản lý nguyên vật liệu: https://www.cukcuk.vn/443/phan-mem-quan-ly-nguyen-vat-lieu/
- meez — actual vs theoretical food cost: https://www.getmeez.com/blog/actual-vs-theoretical-food-costs
- Restaurant365 — closing the AvT gap: https://www.restaurant365.com/blog/closing-the-gap-between-actual-and-theoretical-food-costs/
- Apicbase — food cost variance: https://get.apicbase.com/food-cost-variance/
- Toast — menu item inventory (86 count): https://doc.toasttab.com/doc/platformguide/adminMenuItemInventoryOverview.html
