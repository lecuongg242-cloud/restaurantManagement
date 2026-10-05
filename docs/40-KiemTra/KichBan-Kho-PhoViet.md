# Kịch bản thử kho ở quán demo Phở Việt: nhập hàng → định lượng → bán → kiểm kê → hao hụt

> Lập 05/10/2026 (P26 làm 03/10; 05/10 sửa để chạy được mọi ngày; P34 05/10: sổ để mở 7 ngày + nhập phiếu muộn). Quán:
> `pho-viet` trên DB production. Không đụng `qt-food`.
> Công cụ: `scripts/seed-kho-demo.mjs` (sinh 7 ngày), `scripts/doi-chieu-kho-demo.mjs` (đối chiếu),
> `tests/e2e/kho-thuc-te.spec.ts` (9 tình huống thao tác hôm nay), `tests/rls/p34-nhap-muon.test.ts` (nhập muộn trên DB).
> Kết quả lượt chạy 03/10: `docs/30-KeHoach/P26/26-01-SUMMARY.md`; P34: `docs/30-KeHoach/P34/34-01-SUMMARY.md`.
> Quyết định liên quan: QD-017, QD-027, QD-031, QD-034.

## 1. Thử cái gì, bằng cách nào

Câu hỏi cần trả lời: **nhập hàng, bán theo định lượng, rồi kiểm kê cuối ngày thì hệ thống có ra đúng tồn kho, đúng giá vốn và
tìm ra đúng chỗ hao hụt không?**

Cách thử gồm hai phần:

1. **Bảy ngày lịch sử, sinh bằng script.** Script ghi phiếu nhập và mẻ nấu qua đúng các hàm của app (như chủ quán bấm), rồi
   lùi ngày giờ về ngày mô phỏng. Song song, script giữ một **"kho thật"** mà hệ thống không thấy: bếp múc dư, gà lọc xương
   hao, mất bia, giò hỏng đổ bỏ không ghi phiếu. Số đếm kiểm kê lấy từ kho thật. Hệ thống phải **tự tìm ra** các khoản hao
   hụt đó. Script cũng tính sẵn **đáp án** (sổ kho từng ngày, tính độc lập bằng JS) để so với bản chốt sổ của app.
2. **Hôm nay, thao tác bằng giao diện.** 9 tình huống hay gặp khi làm thật: gõ nhầm, sửa phiếu, hủy, kiểm kê, nhập phiếu
   muộn sau kiểm kê. Mỗi bước
   kiểm sổ kho trong DB, không chỉ nhìn chữ trên màn.

## 2. Cách chạy lại

```
node scripts/seed-kho-demo.mjs --out kho-demo.json
```

Lệnh này xóa sạch dữ liệu kho của Phở Việt và đơn `KHO_DEMO` cũ, rồi sinh **7 ngày kết thúc hôm nay − 7** (giờ VN). Sổ kho để
mở 7 ngày (QD-034 D4): chỉ ngày ≤ hôm nay − 7 mới tự chốt, nên 7 ngày mô phỏng phải lùi hẳn về trước. Muốn cố định ngày thì
thêm `--den 2026-09-28` (phải ≤ hôm nay − 7, nếu không các ngày còn mở sẽ không có bản chốt để đối chiếu).

Sau đó:

1. Mở **Quản trị → Kho hàng** một lần. App tự chốt sổ các ngày đã qua.
2. `node scripts/doi-chieu-kho-demo.mjs kho-demo.json` → phải ra **"lệch 0 ô"**.
3. **Báo cáo** → chọn đúng 7 ngày đó → khối **Hao hụt** phải bằng số "Đáp án hao hụt" mà lệnh đối chiếu in ra.
4. `npx playwright test tests/e2e/kho-thuc-te.spec.ts` (cùng ngày với lệnh seed) → 9/9.

Lưu ý:

- Ca 2 hủy phiếu "Nhập sáng" của N7 (ngày đã chốt), nên **mỗi lần seed chỉ chạy trọn spec được một lần**. Chạy lại thì seed lại.
- Phải mở Kho hàng (bước 1) TRƯỚC khi chạy spec: chưa mở thì N7 chưa chốt, ca 2 hủy phiếu theo đường "ngày chưa chốt" (xóa dòng
  sổ) và làm sai đáp án. Ca 2 tự mở Kho hàng và kiểm có bản chốt N7 trước khi hủy.
- `scripts/seed-quan-lon.mjs` (bộ 200 bàn của P27) **xóa toàn bộ đơn** của Phở Việt, kể cả đơn `KHO_DEMO`. Chạy nó sau khi
  app đã chốt sổ thì bản chốt không đổi; chạy trước khi chốt thì sổ 7 ngày sai. Muốn thử kho thì chạy `seed-kho-demo` sau cùng.

## 3. Danh mục dùng trong kịch bản

### Nguyên liệu

Cột "Kho thật dùng" là hệ số ẩn: lượng bếp thật sự dùng so với định lượng khai. Hệ thống không biết số này.

| Nguyên liệu | Đơn vị tính | Đơn vị nhập | Giá | Kiểm cuối ngày | Kho thật dùng |
|---|---|---|---|---|---|
| Thịt bò thăn | g | kg | 280.000₫/kg (từ N5: 285.000) | ✓ | **112%** (bếp múc dư) |
| Thịt ngựa | g | kg | 250.000₫/kg | ✓ | 100% (đúng định lượng) |
| Bánh phở | g | kg | 18.000₫/kg | ✓ | 103% |
| Giò heo | g | kg | 95.000₫/kg | ✓ | 100% |
| Gà ta | g | kg | 130.000₫/kg | ✓ | **118%** (lọc xương còn 85%) |
| Tôm sú | g | kg | 220.000₫/kg (từ N6: 230.000) | ✓ | 102% |
| Bia Hà Nội | cái | thùng = 24 cái | 360.000₫/thùng | ✓ | 100% |
| Nước dùng phở (quán tự nấu) | lít | — | từ công thức mẻ | ✓ | **105%** (múc 0,42 l thay 0,4 l) |
| Bún tươi | g | kg | 15.000₫/kg | — | 105% |
| Rau thơm | g | kg | 40.000₫/kg | — | 120% |
| Gạo tám | g | kg | 20.000₫/kg | — | 100% |
| Cam sành | g | kg | 30.000₫/kg | — | 110% |
| Bánh tráng | cái | xấp = 50 cái | 25.000₫/xấp | — | 105% |
| Xương ống bò | kg | kg | 45.000₫/kg | — | (chỉ dùng nấu mẻ) |
| Hành tây | g | kg | 25.000₫/kg | — | (chỉ dùng nấu mẻ) |

Các nguyên liệu kiểm cuối ngày còn có sai số ngẫu nhiên 1–4% mỗi lần múc, và số đếm làm tròn theo bước cân (50 g, 100 g, 0,5 l,
1 chai).

### Định lượng món

| Món / tùy chọn | Định lượng 1 phần |
|---|---|
| Phở bò tái | Bánh phở 150 g · Thịt bò 80 g · Nước dùng 0,4 l · Rau 20 g |
| Phở ngựa | Bánh phở 150 g · Thịt ngựa 80 g · Nước dùng 0,4 l · Rau 20 g |
| Bún bò Huế | Bún 150 g · Giò 120 g · Thịt bò 40 g · Rau 20 g |
| Cơm gà xối mỡ | Gạo 120 g · Gà 200 g |
| Gỏi cuốn | Bánh tráng 2 cái · Tôm 40 g · Bún 30 g · Rau 10 g |
| Bia | Bia 1 cái |
| Nước cam | Cam 400 g |
| Tùy chọn "Thêm thịt" / "Thêm bánh" | Thịt bò 50 g / Bánh phở 100 g |
| 1 mẻ nước dùng = 30 lít | Xương ống bò 8 kg · Hành tây 800 g |

Các món khác trong thực đơn (Mì Quảng, Chả giò, Trà đá…) không khai định lượng, nên bán không trừ kho. Đây là trường hợp
"món chưa khai thì mọi thứ chạy như cũ".

### Nhà cung cấp

| Nhà cung cấp | Hàng | Cách trả |
|---|---|---|
| Thanh Tuấn | Thịt bò, thịt ngựa | Trả một nửa, nợ một nửa |
| Chợ Long Biên – cô Hoa | Bánh phở, bún, rau, cam, hành, bánh tráng | Trả đủ tiền mặt |
| Gà ta Sóc Sơn – anh Bình | Gà, giò, tôm, xương, gạo | Ghi nợ hết |
| Đại lý bia Hà Nội | Bia | Chuyển khoản đủ |

## 4. Bảy ngày: việc lặp lại mỗi ngày và sự cố cài sẵn

Ngày đặt theo thứ tự N1…N7 (N7 = hôm nay − 7), không theo ngày lịch, nên chạy hôm nào kịch bản cũng như nhau.

### Mỗi ngày

| Giờ | Việc | Ghi chú |
|---|---|---|
| 06:15 | Phiếu nhập chợ (cô Hoa) | Lượng mua = nhu cầu trong ngày × 1,2 − tồn thật, làm tròn 0,5 kg |
| 06:30 | Phiếu nhập thịt (Thanh Tuấn) | |
| 07:00 | Phiếu nhập gà, giò, tôm, xương, gạo (anh Bình) | |
| 07:30 | Nấu nước dùng | Mẻ 30 lít, thực ra được ít hơn 0,5–1,5 lít → **hụt mẻ** |
| 09:00 | Phiếu nhập bia (chuyển khoản) | Chỉ khi còn dưới 2 thùng |
| 10:30–13:30, 17:00–21:00 | Bán hàng | 70 lượt khách ngày thường, 95 cuối tuần; 75% ăn tại bàn. Khoảng 5% đơn hủy món **sau khi đã in phiếu bếp** (vẫn trừ kho), 3,5% món hủy **trước khi in** (không trừ) |
| 14:00 | Xuất hủy "Cơm nhân viên" | Gà 500 g, gạo 600 g |
| 21:30 | Xuất hủy "Hỏng" | Rau héo 200–400 g |
| 21:45 | Kiểm kê 8 nguyên liệu "cần kiểm" | Số đếm lấy từ kho thật |

### Sự cố cài sẵn

| Ngày | Sự cố | Hệ thống phải xử lý thế nào |
|---|---|---|
| N1 | Quán có sẵn 30 chai bia trước khi dùng phần mềm | Khai **Tồn đầu kỳ** (dòng nhập "Tồn đầu kỳ", giá 15.000₫/chai). Không phải lệch kiểm kê, không tính hao hụt |
| N2 | Nhập thịt bò gõ **70 kg thay 7 kg**, trả 2.000.000₫ | **Hủy bỏ** phiếu (hủy luôn phiếu chi) → dòng sổ biến mất → **Sao chép** → sửa 7 kg → Hoàn thành |
| N3 | Khách làm vỡ 1 chai bia | Xuất hủy "Đổ bỏ" 1 chai |
| N4 | Thanh Tuấn giảm giá 2% trên phiếu | Giá vốn ngày tính sau giảm giá |
| N4 | Tôm ươn 300 g | Xuất hủy "Hỏng" |
| N4 → N5 | Tối N4 **Lưu tạm** phiếu chợ đặt trước; sáng N5 hàng về, sửa số rồi Hoàn thành | Phiếu tạm không vào kho; vào kho ngày N5 với số đã sửa |
| N5 | Thịt bò lên 285.000₫/kg | Giá vốn ngày đổi theo |
| N5 | **Mất 3 chai bia**, không ai ghi | Kiểm kê ra lệch −3 chai → "không giải thích được" 45.000₫ |
| N5 | Kiểm kê thịt bò gõ **17 kg thay 1,7 kg**, rồi đếm lại | Hai dòng lệch cộng lại đúng bằng một lần đếm đúng |
| N6 | Sửa thông tin phiếu thịt: ghi chú "HĐ số 0012" | Thời gian nhập không sửa được (P34, QD-034 D1) — chỉ ghi chú đổi |
| N6 | Thịt bò hết sớm, chiều nhập bổ sung 2 kg giá 300.000₫/kg | Giá vốn ngày = **bình quân gia quyền** hai lần nhập |
| N6 | **Giò hỏng 800 g đổ bỏ, không ghi phiếu** | Kiểm kê giò ra lệch đúng ngày đó |
| N6 | Cuối tuần, nấu 2 mẻ nước dùng | |
| N7 | Cô Hoa cho thêm 0,5 kg rau, không tính tiền | Dòng nhập **không giá**: tồn tăng, giá vốn ngày không bị kéo xuống |

Trong lượt chạy 05/10 (N1 = 28/09 … N7 = 04/10), ngày N6 (03/10) còn có thêm **275 đơn của bộ dữ liệu quán lớn P27**. Các đơn này
cũng trừ kho theo định lượng. Script tính chúng vào cả đáp án lẫn kho thật, nên kết quả vẫn phải khớp.

## 5. Hệ thống tính thế nào: ví dụ thịt bò ngày N1

| | Thịt bò thăn |
|---|---|
| Tồn đầu ngày | 0 g (ngày đầu) |
| + Nhập sáng | 6.000 g, giá 280₫/g |
| − Đã dùng theo đơn | (số phần phở bò tái, bún bò, "Thêm thịt" × định lượng) |
| = **Tồn theo sổ lúc 21:45** | **1.840 g** |
| Kiểm kê đếm được | 1.350 g |
| **Lệch** | **−490 g** → tồn chuyển thành 1.350 g, ngày sau tính tiếp từ đó |
| Hao hụt "không giải thích được" | 490 g × 280₫ = **137.200₫** |

Bốn nguồn hao hụt trong Báo cáo:

| Nguồn | Lấy từ đâu |
|---|---|
| Hủy sau khi đã làm | Món hủy **sau** khi đã in phiếu bếp (bếp đã nấu) |
| Hụt khi chế biến mẻ | Mẻ công thức 30 lít, thực ra ít hơn |
| Xuất hủy có lý do | Phiếu xuất hủy (hỏng, đổ bỏ, cơm nhân viên, khác) |
| Không giải thích được | −(lệch kiểm kê). **Chỉ** nguyên liệu có kiểm; không kiểm thì ghi "chưa kiểm", không ghi 0₫ |

Khi đã có kiểm kê, hệ thống còn tự tính:

- **% dùng được**: Σ định lượng × số bán ÷ Σ lượng thật đã dùng, qua 14 lần kiểm gần nhất. Từ lúc có số này, mỗi phần bán trừ
  kho = định lượng ÷ % dùng được, và giá vốn món tính theo lượng thật.
- Nhãn **"có thể định lượng khai sai"**: lệch cùng một chiều ít nhất 5 lần kiểm liền nhau.

## 6. Kết quả

### Lượt chạy 05/10/2026 trưa, sau P34 (N1 = 22/09 … N7 = 28/09)

```
node scripts/doi-chieu-kho-demo.mjs kho-demo.json
Ngày 2026-09-22 → 2026-09-28: so khớp 1575 ô, lệch 0 ô
```

Báo cáo → 22/09–28/09 (ảnh `docs/30-KeHoach/P34/anh/5-bao-cao-7-ngay-da-chot.png`): **Tổng hao hụt 3.981.291₫ · 5,67%
doanh thu món · 7 ngày đã chốt** = đáp án (hủy sau khi làm 767.229₫ · hụt mẻ 132.352₫ · xuất hủy 700.000₫ · không giải thích
được 2.381.710₫). Các số chi tiết dưới đây là của lượt sáng 05/10 (trước P34, ngày 28/09–04/10); cách đọc không đổi.

### Lượt chạy 05/10/2026 sáng, trước P34 (N1 = 28/09 … N7 = 04/10)

### Bản chốt sổ khớp đáp án

```
node scripts/doi-chieu-kho-demo.mjs kho-demo.json
Ngày 2026-09-28 → 2026-10-04: so khớp 1575 ô, lệch 0 ô
```

1.575 ô = 7 ngày × 15 nguyên liệu × 15 cột. Các cột: tồn đầu, nhập, mẻ ra, mẻ vào, 4 loại hủy, lệch kiểm kê, đã kiểm, dùng
theo đơn, hủy sau làm, hụt mẻ, tồn cuối, giá ngày.

### Báo cáo Hao hụt trên app bằng đáp án

Báo cáo → 28/09–04/10, ảnh `anh-kho-pho-viet/1-bao-cao-hao-hut-7-ngay.png`:

| | App | Đáp án |
|---|---|---|
| **Tổng** | **4.512.968₫** · 6,22% doanh thu món | 4.512.968₫ |
| Hủy sau khi đã làm | 1.156.649₫ | 1.156.649₫ |
| Hụt khi chế biến mẻ | 125.516₫ | 125.516₫ |
| Xuất hủy có lý do | 704.000₫ | 704.000₫ |
| Không giải thích được | 2.526.803₫ | 2.526.803₫ |

### App tìm ra đúng các khoản cài ẩn

| Cài ẩn | App thấy |
|---|---|
| Bếp múc thịt bò dư 12% | Bò "không giải thích" 1.563.835₫, nhãn "có thể định lượng khai sai"; % dùng được **89%** (thật 1 ÷ 1,12 = 89,3%) |
| Gà lọc xương còn 85% | "Không giải thích" 637.000₫, nhãn "có thể định lượng khai sai"; % dùng được **85%** |
| Múc nước dùng 0,42 l thay 0,4 l | "Không giải thích" 142.368₫, nhãn "có thể định lượng khai sai". Bán thành phẩm không có % dùng được |
| Bánh phở dư 3%, tôm dư 2% | % dùng được **97%**, **98%**; bánh phở có nhãn "có thể định lượng khai sai" |
| Thịt ngựa đúng định lượng | Lệch −50₫ cả tuần (do làm tròn khi cân); % dùng được **100%** |
| Mất 3 chai bia (N5) | Bia "không giải thích" **45.000₫** = đúng 3 × 15.000₫. Vỡ 1 chai (N3) nằm ở "Xuất hủy" 15.000₫ |
| Giò hỏng 800 g không ghi (N6) | Giò lệch −800 g đúng ngày N6; cả tuần "không giải thích" 75.050₫ |
| Bún, rau, gạo, cam không kiểm | Cột "Không giải thích" ghi **"chưa kiểm"**, không ghi 0₫ |

Lưu ý: % dùng được của giò ra 97% và của bia ra 99%, dù kho thật dùng đúng 100%. Lý do chính: phần **mất / hỏng không ghi
phiếu** (800 g giò, 3 chai bia) bị tính gộp vào % dùng được; giò còn thêm sai số khi múc. Đây là cách tính đã chốt (gộp mọi hao hụt khi dùng). Muốn tách riêng thì
phải ghi phiếu xuất hủy trước khi kiểm kê.

## 7. Chín tình huống thao tác bằng giao diện (ngày hôm nay)

`tests/e2e/kho-thuc-te.spec.ts`. Lượt chạy 05/10 sau P34: **9/9**. Ảnh nằm ở `docs/30-KeHoach/P26/anh/` (ca 9: số 12a–12d).

| # | Thao tác | Số phải ra trong sổ kho |
|---|---|---|
| 1 | **Nhập hàng**: Thanh Tuấn, thịt bò **40 kg** (gõ nhầm, đúng là 4) × 285.000 + thịt ngựa 2 kg × 250.000, trả 1.000.000₫ tiền mặt → Hoàn thành. Thấy sai → **Hủy bỏ** → **Sao chép** → sửa 4 → trả 1.000.000₫ → Hoàn thành → ghi chú "HĐ số 0015" | Sau phiếu sai: tồn bò +40.000 g, phiếu chi 1.000.000₫. Sau Hủy bỏ: dòng sổ của phiếu **bị xóa**, tồn về như cũ, phiếu chi "Đã hủy". Phiếu mới: +4.000 g giá 285₫/g, tổng 1.640.000₫, ghi "sao chép từ" phiếu sai. Sửa thông tin: **không còn ô ngày** (P34), ngày chứng từ = ngày vào kho = hôm nay |
| 2 | **Phiếu N7 sai giá giò** (ngày đã chốt sổ): mở Kho hàng (app chốt tới N7) → mở phiếu gà/giò "Nhập sáng" N7 → Hủy bỏ → Sao chép → giò 90.000 thay 95.000 → ghi nợ → Hoàn thành | Hủy bỏ: dòng sổ N7 **giữ nguyên**, thêm dòng nhập **âm** hôm nay, không giá; bản chốt N7 **không đổi một byte**. Nhập lại: tồn giò về như cũ; phiếu mới rẻ hơn đúng (kg giò × 5.000₫); nợ anh Bình giảm đúng số đó |
| 3 | **Lưu tạm** phiếu bia 1 thùng (chuyển khoản) → mở lại sửa 2 thùng → Hoàn thành | Lưu tạm: **0** dòng sổ. Hoàn thành: +48 chai; phiếu chi 720.000₫ quỹ ngân hàng, không phát sinh nợ |
| 4 | "+ Nhập hàng" → **"Lấy hàng lần trước"** → gõ số và giá cho 6 dòng (bánh phở, bún, rau, gà, xương, tôm), để trống các dòng còn lại | Chỉ các dòng đã gõ vào sổ; dòng để trống bị bỏ |
| 5 | **Nấu 1 mẻ** nước dùng, thực ra 28,5 lít → ghi nhầm thêm 2 mẻ 60 lít → "Mẻ hôm nay" → **Hủy** mẻ nhầm | Mẻ đúng: nước dùng +28,5 l, xương −8 kg, hụt mẻ 1,5 l. Mẻ nhầm: +60 l, xương −16 kg. Sau Hủy: trở lại như chỉ có mẻ đúng |
| 6 | **Xuất hủy**: rau 0,3 kg "Hỏng", gà 0,5 kg "Cơm nhân viên", tôm **3 kg** (gõ nhầm) → **Hủy** phiếu tôm → ghi lại 0,3 kg | Hủy phiếu tôm: tồn tôm cộng lại 3 kg. Cuối cùng sổ hôm nay chỉ có **một** dòng hủy tôm −300 g |
| 7 | **Kiểm kê**: tôm gõ "-0,3" → gõ thịt bò 10 lần số thật (thiếu dấu phẩy) → sửa → bia chọn đơn vị **"cái"**, gõ số chai → Hoàn thành | "-0,3": báo **"Số không hợp lệ"**, bấm Hoàn thành không ghi gì. Bò ×10: dòng bôi vàng **"Lệch lớn"**, hỏi lại; bấm Hủy thì 0 dòng ghi. Sau Hoàn thành: tồn bò, tôm, bia **bằng đúng số đếm**; bia đúng số chai, không ra số lẻ thùng |
| 8 | **Thêm nguyên liệu** "Nước mắm Phú Quốc", đơn vị ml, "1 chai = 500 ml", giá 60.000₫/chai, **tồn kho ban đầu 6 chai**. Thêm "Ớt tươi" không kèm tồn → mở Sửa → khai 0,5 kg | Nước mắm: một dòng nhập 3.000 ml, 120₫/ml, ghi chú "Tồn đầu kỳ", không gắn phiếu nhập; tab Tồn kho "6 chai (3.000 ml)". Ớt: khai sau được **một lần**; lần sau không còn ô. Thịt bò (đã có phát sinh) không có ô khai tồn đầu |
| 9 | **Nhập phiếu muộn (P34)**: lấy lần kiểm kê thịt bò của ca 7 (giờ T) → "+ Nhập hàng" → **Chọn giờ khác** = T − 30′ → bò 3 kg × 300.000 → Hoàn thành → khung đỏ → **Mở phiếu KK…** → **Hủy** → quay lại phiếu tạm → Hoàn thành → "Kiểm kê & hủy" → **Hoàn thành lại** | Hoàn thành bị chặn: phiếu **Lưu tạm**, khung đỏ nêu "Thịt bò thăn — đã kiểm kê lúc … (phiếu KK…)", **0** dòng sổ, tồn bò = số đếm. Hủy phiếu kiểm kê: tồn về số theo sổ. Phiếu nhập: một dòng +3.000 g, giờ phát sinh = T − 30′. Hoàn thành lại: giữ giờ T, ghi "(giữ nguyên)"; tồn bò = **đúng số đã đếm** (không cộng chồng 3 kg); lệch mới = lệch cũ − 3.000 g |

## 8. Giới hạn đã biết

- Chỉ chạy trên quán demo `pho-viet`. Script xóa sạch dữ liệu kho của quán trước khi sinh lại.
- Đáp án tính % dùng được là 100% trong 7 ngày (chưa có lần chốt nào trước đó). Từ ngày thứ 8 trở đi, app trừ kho theo % dùng
  được đã tự tính, nên muốn đối chiếu sổ hôm nay thì phải tính theo % đó.
- Spec chỉ chạy trọn **một lần** cho mỗi lần seed (ca 2 tiêu phiếu của N7).
- Seed ghi kiểm kê thẳng vào sổ (không qua phiếu kiểm kê KK…), vì RPC chỉ cho kiểm kê ở giờ hiện tại. 7 ngày mô phỏng đều đã chốt
  nên không ảnh hưởng mốc khóa; nhập muộn được thử ở ca 9 và `tests/rls/p34-nhap-muon.test.ts`.
- Spec không thử: nhiều người cùng kiểm kê một lúc, và kiểm kê cách ngày (2–3 ngày mới kiểm một lần). Phần cách ngày đã có unit
  test ở `tests/inventory/yield.test.ts`.
