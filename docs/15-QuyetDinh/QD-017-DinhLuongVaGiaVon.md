# QD-017 — Định lượng nguyên liệu, tồn trong ngày, giá vốn & hao hụt

**Ngày:** 24/09/2026 · **Trạng thái:** CHỐT (4 câu hỏi nghiệp vụ đã được chủ dự án trả lời 24/09/2026)
**Nghiên cứu nền:** `30-KeHoach/P10/00-NghienCuu-NghiepVu.md`
**Yêu cầu:** INV-01..10, REPORT-13, REPORT-14

## Bối cảnh

V1 chỉ có nút "hết món" bật tay (`menu_items.is_available`). Chủ quán không biết giá vốn một bát,
lãi gộp từng món, hay mỗi ngày hụt bao nhiêu nguyên liệu. Thu ngân chỉ biết món hết khi bếp báo.

Quán nhỏ VN mua chợ mỗi sáng, dùng gần hết trong ngày, giá lúc có lúc không, không ai cân từng bát.
Mọi quyết định dưới đây xuất phát từ thực tế đó: **chu kỳ là một ngày**, và **mọi con số tính từ
định lượng là ước tính**.

## Chủ dự án đã chốt

| # | Câu hỏi | Chốt |
|---|---|---|
| C1 | Kiểm kê cuối ngày? | **Có, tùy chọn**: chỉ đếm nguyên liệu được đánh dấu "cần kiểm" |
| C2 | Nguyên liệu tính ra về 0 thì POS làm gì? | **Chỉ cảnh báo vàng**: "Có thể đã hết món — hãy hỏi bếp". Không khóa, vẫn gọi được |
| C3 | Bán thành phẩm (nước dùng, sốt)? | **Công thức lồng công thức** |
| C4 | Ai nhập, khách có thấy số phần? | **Manager/owner nhập**; chỉ nhân viên thấy, trang khách QR **không** hiện |

## Quyết định

### D1. Đơn hàng là sổ cái, không ghi phiếu trừ kho theo từng món bán
Lượng đã dùng theo đơn được **tính** từ `order_items` + `order_item_modifiers`, không ghi bảng
trừ kho riêng lúc bán. KiotViet/Sapo ghi phiếu trừ mỗi lần bán vì họ không có sẵn đơn hàng giàu
thông tin; hệ thống này có, nên ghi thêm là lưu một sự thật ở hai nơi — sẽ lệch.
- Không trigger trên `order_items`, không chạm luồng tạo đơn / đóng bill vốn là hai luồng nóng nhất.
- Sửa định lượng giữa ngày → số hôm nay tự tính lại (đúng ý: định lượng lúc đầu thường sai).

**Chỉ những sự kiện không có trong đơn hàng mới có bảng ghi:** nhập, chế biến mẻ, xuất hủy,
kiểm kê, chốt sổ.

### D2. Món được tính là "đã dùng" khi nào
| Trạng thái | Tính vào lượng dùng? | Lý do |
|---|---|---|
| Đơn `pending_confirm` (QR chưa duyệt) | Không | Chưa xuống bếp, có thể bị từ chối |
| Đơn đã xác nhận trở đi, món chưa hủy | **Có** | Thu ngân cần biết sắp hết *trước* khi khách trả tiền — không đợi thanh toán như KiotViet |
| Món hủy **trước** khi in phiếu bếp | Không | Chưa làm |
| Món hủy **sau** khi in phiếu bếp | **Có**, và vào hao hụt loại "hủy sau khi làm" | Món đã làm. Mốc in lấy theo đúng quy ước `0037` (mốc in sớm nhất, không lọc `status`) |

Ngày tính theo **giờ Việt Nam** (bài học 09-01: định dạng không nêu múi giờ thì sai trên Vercel).

### D3. Công thức lồng công thức qua **phiếu chế biến mẻ** (theo C3)
Nguyên liệu có hai loại: **mua vào** và **bán thành phẩm**. Bán thành phẩm có công thức **theo mẻ**
(ví dụ 1 mẻ nước dùng = 12kg xương + 2kg hành tây + … → ra 40 lít).

Manager ghi **phiếu chế biến**: "nấu 1 mẻ nước dùng, thực ra được 38 lít". Hệ thống trừ nguyên
liệu con theo công thức × số mẻ, cộng 38 lít vào tồn nước dùng. Món ăn trừ **nước dùng**, không trừ
thẳng xương.

**Phương án bị loại — "bung công thức" không cần phiếu chế biến** (1 bát = 400ml nước dùng =
400/40.000 × công thức nồi, trừ thẳng xương theo từng bát): gọn hơn cho người nhập, nhưng **sai số
phần**. Nồi đã ninh thì xương đã hết thật, còn sổ vẫn thấy còn xương cho tới khi bán hết 100 bát —
dự đoán hết món chạy ngược thực tế. Nó cũng không bắt được **hụt sản lượng** (công thức 40 lít, nấu
ra 38), là một nguồn hao hụt thật của quán phở.

Ràng buộc: **cấm vòng** (A chứa B chứa A → báo lỗi, không lưu) và tối đa **3 cấp** lồng.

Giá vốn bán thành phẩm = chi phí nguyên liệu con của mẻ ÷ **sản lượng thực** (không phải sản
lượng công thức) — hụt mẻ đổ vào giá vốn, đúng như thực tế.

### D4. Số phần dự đoán
Số phần món X = `min` trên từng thành phần trực tiếp của X của `floor(tồn lý thuyết ÷ lượng cần/phần)`,
với lượng cần/phần = định lượng ÷ yield. Thành phần là bán thành phẩm thì dùng **tồn đã chế biến**,
không tính "còn nguyên liệu nấu thêm được" — nồi chưa nấu thì bát chưa bán được.

Modifier có định lượng (thêm trứng, size lớn) được trừ khi đã gọi, nhưng **không** tham gia công
thức số phần của món gốc (không biết trước khách sẽ chọn gì). Hết trứng thì chính option "Thêm
trứng" được cảnh báo.

Món **không khai định lượng** → không tính, không hiện gì — POS như hôm nay.

### D5. Hiển thị trên POS (theo C2 + C4)
- Số phần ≤ 5 → nhãn trung tính "còn ~N" trên thẻ món.
- Số phần ≤ 0 → **nhãn vàng** "Có thể đã hết — hãy hỏi bếp". Món **vẫn bấm được, vẫn thêm vào
  giỏ được**. Không tự đổi `is_available`.
- Khóa món vẫn là việc của người, qua nút "hết món" sẵn có (MENU-04).
- Trang khách `/menu` **không** hiện số phần, không đổi gì.

Ngưỡng 5 là hằng số trong P10; đổi thành cài đặt theo quán chỉ khi có quán thật yêu cầu.

### D6. Giá vốn theo ngày: bình quân gia quyền, thiếu giá thì nói thẳng
- Giá nguyên liệu trong ngày = bình quân gia quyền các lần nhập **có giá** trong ngày; ngày không
  nhập có giá → giá gần nhất, gắn nhãn **"giá cũ"** kèm ngày.
- Nguyên liệu chưa từng có giá → mọi món dùng nó hiện **"chưa đủ giá"**, không hiện số giá vốn và
  **bị loại** khỏi tổng lãi gộp (kèm dòng "N món chưa đủ giá chưa được tính"). Hiện số sai tệ hơn
  không hiện số.

### D7. Chốt sổ ngày là bất biến
Cuối ngày (hoặc lần đầu mở ngày hôm sau, nếu quên) tạo **một bản chốt sổ** gồm tồn cuối, lượng dùng
lý thuyết, giá vốn, hao hụt theo từng nguyên liệu và giá vốn theo món. Báo cáo quá khứ đọc bản chốt,
nên sửa định lượng hôm nay **không** đổi số tháng trước.

Tồn đầu ngày sau = **tồn đếm thật** nếu nguyên liệu đó đã kiểm kê, ngược lại = tồn lý thuyết cuối
ngày. Đồ tươi bỏ đi cuối ngày ghi bằng phiếu xuất hủy trước khi chốt.

Không chụp định lượng vào từng `order_item`: thêm cột vào bảng nóng nhất để phục vụ một báo cáo
đọc theo ngày là sai chỗ.

### D8. Lãi gộp trên doanh thu thuần của món
*(Sửa 24/09/2026 khi rà schema cho plan 10-04 — bản đầu viết sai.)*

`bill_items.amount` = giá niêm yết × số lượng, **chưa** trừ giảm giá: giảm giá nằm ở cấp bill
(`bills.discount_amount`), còn KPI "Doanh thu" là `bills.total` — đã cộng phí phục vụ và VAT. Dùng
thẳng `bill_items.amount` sẽ phóng đại lãi đúng bằng phần giảm giá.

- **Doanh thu thuần của món** = `bill_items.amount` × (`subtotal` − `discount_amount`) ÷ `subtotal`
  của bill chứa nó. Làm tròn từng dòng, phần dư dồn vào dòng có tiền lớn nhất của bill để Σ khớp
  tuyệt đối.
- Phí phục vụ và VAT **không** là doanh thu của món → không vào lãi gộp.
- Đối soát: Σ doanh thu thuần các món = Σ (`subtotal` − `discount_amount`) của đúng tập bill
  `paid` mang `bill_items`. Màn báo cáo hiện một dòng nối về KPI: *Doanh thu = doanh thu món thuần
  + phí phục vụ + VAT*.
- Món chưa thanh toán không vào lãi gộp (vẫn vào số phần).

### D9. Hao hụt = chênh lệch kiểm kê, phân loại được nguồn
Tổng hao hụt (đồng) = Σ bốn nguồn: hủy sau khi làm (tự biết, nằm trong lượng dùng theo đơn) ·
hụt mẻ chế biến (tự biết, không đi qua tồn) · xuất hủy có lý do (người ghi) · **không giải thích
được** = −độ lệch kiểm kê. Nguồn thứ tư chỉ có ở nguyên liệu đã kiểm; nguyên liệu không kiểm hiện
"chưa kiểm", không hiện 0. *(Làm chặt 24/09/2026 khi viết 10-04.)*
Chuẩn ngành: chênh lệch < 2% doanh thu là tốt, > 5% là có lỗi hệ thống. Chênh lệch **cùng một
chiều nhiều ngày liền** trên một nguyên liệu gợi ý định lượng khai sai — báo cáo nói điều đó ra.

### D10. Tắt mặc định, không đụng quán chưa dùng
Quán không khai nguyên liệu nào thì POS, trang khách, báo cáo **y hệt hôm nay** — có test hồi quy
khẳng định. qt-food chỉ bật khi chủ quán đồng ý; mọi phép thử chạy trên `pho-viet`, `bun-bo`.

## Ngoài phạm vi
Nhà cung cấp & công nợ · đơn đặt hàng · nhiều kho / chuyển kho (chờ V2-A) · lô & hạn dùng ·
dự báo lượng mua (cần vài tuần dữ liệu thật) · ma trận menu engineering · đồng bộ kế toán.

## Hệ quả
- Mọi bảng mới có `tenant_id` + RLS, và phải vào ma trận TENANT-05 (4 phép mỗi bảng).
- `schema-snapshot.json` cập nhật cùng migration (OPS-07 sẽ đỏ nếu quên).
- Tính số phần chạy trên đường nạp POS mà P8 vừa tối ưu → thời gian thêm vào `getPosSnapshot`
  **phải đo** bằng log PERF-04 trước/sau và ghi vào summary 10-02.
