# P34 — Nhập phiếu muộn không làm sai kho

> Lập 05/10/2026. **Trạng thái: CODE XONG 05/10/2026** (chủ dự án chốt nguyên tắc + giao diện cùng ngày). Plan `34-01-PLAN.md`, tổng kết `34-01-SUMMARY.md`. Migration 0085 đã áp; chưa phát hành `main`.
> Yêu cầu: INV-18..INV-24. Chủ dự án (05/10): "nếu nhập đầu ngày không đủ, phải nhập thêm giữa ngày nhưng thu ngân chưa kịp
> nhập phiếu… cuối ngày (hoặc hôm sau) mới nhập phiếu thì tính kho, hao hụt thế nào?" — "tôi không muốn có sai số (nghiệp vụ
> rất quan trọng)".

## Hiện trạng: sai ở đâu

Ví dụ: sáng nhập 6 kg thịt bò; trưa hết, mua thêm 3 kg nhưng chưa ghi phiếu; cả ngày bán theo định lượng hết 8 kg; tối còn
thật 1 kg. Sổ chiều nay: 6 − 8 = **−2 kg** (cho âm, POS chỉ cảnh báo vàng).

| Lúc ghi phiếu 3 kg | Kết quả hôm nay | Vì sao |
|---|---|---|
| Cuối ngày, **trước** kiểm kê | Đúng: sổ 1 kg, lệch 0 | Phiếu vào trước lúc đếm |
| Cuối ngày, **sau** kiểm kê | **Sai**: kiểm kê ghi lệch +3 kg ("dư không giải thích" −840.000₫), sau đó phiếu cộng thêm 3 kg → sổ 4 kg, thật 1 kg | Kiểm kê lưu **độ lệch tại lúc đếm** (`recordCounts`) |
| **Hôm sau** | **Sai, không sửa được**: phiếu vào ngày hôm sau (`business_date` = ngày Hoàn thành, QD-027 D4); hôm qua đã **tự chốt** khi mở Kho hàng (INV-09). Hôm qua dư 3 kg, hôm nay thiếu 3 kg; giá vốn hôm qua dùng giá cũ | Không lùi ngày được; chốt sổ ngay sáng hôm sau |

## Đối thủ làm thế nào (tra 05/10/2026, trang hướng dẫn chính thức)

| | Phiếu nhập ghi được giờ cũ? | Nhập muộn sau khi đã kiểm kê | Khóa sổ |
|---|---|---|---|
| **iPOS** | Có — "Thời gian nhập", sửa được | **Chặn**: "Bạn không thể Chỉnh sửa, Tạo mới bổ sung, hay Xóa bất kỳ phiếu nhập - xuất kho nào trước Thời gian kiểm kê vừa hoàn thành. Để chỉnh sửa số liệu trước đó, bạn bắt buộc phải Hủy kiểm kê." Hóa đơn POS đến muộn cũng bị giữ lại ("Cửa hàng đã có thời gian kiểm kê lớn hơn thời gian hoá đơn"). Kiểm kê lùi ngày ghi vào 23:59 ngày đó | "Khoá không cho xử lý chứng từ sau x ngày" (V2.6) + khóa sổ theo tháng |
| **KiotViet** | Có — "Ngày/giờ nhập hàng" khi tạo. Đã hoàn thành chỉ sửa Người tạo, Thời gian, Ghi chú; cài đặt **"Không cho phép thay đổi thời gian giao dịch" bật sẵn** | Không thấy trong tài liệu. Khi đã bán âm: "tạo phiếu nhập… chỉnh lại thời gian về phía trước những hóa đơn bán hàng, việc tính lãi lỗ và giá vốn sẽ cập nhật lại" | "Khóa sổ" theo ngày chủ quán chọn |
| **CUKCUK** | Có — sửa được ngày nhập; cảnh báo khi sửa phiếu của nguyên liệu "đã từng xuất kho sau thời điểm phát sinh phiếu" | Không thấy trong tài liệu. Sau đó phải tự chạy **"Tính giá xuất kho"** (tối đa 31 ngày) | "Khóa sổ" / "Bỏ khóa sổ" bấm tay |
| **POS365** | Có cài đặt cho đổi ngày giao dịch; kiểm kê có "Ngày cân bằng kho" | Không thấy trong tài liệu | Không có (chỉ "không cho sửa đơn sau x ngày") |
| **Sapo FnB** | **Không** — phiếu nhập, phiếu kiểm không có ô ngày, ghi theo giờ thao tác | Kiểm kê "Lưu & Cân bằng kho" đưa tồn về số đếm, phiếu nhập sau đó **cộng chồng** (cùng lỗi với mình hiện nay) | Không thấy |

Chỉ **iPOS** có quy tắc bảo đảm không sai: **kiểm kê đã hoàn thành là mốc khóa**. Ta làm theo iPOS (chủ dự án chốt 05/10).

Nguồn: [iPOS – Kiểm kê (web)](https://iposvni.gitbook.io/inventory/kho-and-cung-ung/huong-dan/huong-dan-nghiep-vu/kiem-ke-hang-hoa/phien-ban-web) ·
[iPOS – Quy trình xuất kho](https://iposvni.gitbook.io/inventory/nghiep-vu-phat-sinh/quy-trinh-xuat-kho) ·
[iPOS – Quy trình kiểm kê](https://iposvni.gitbook.io/inventory/nghiep-vu-cuoi-ky/quy-trinh-kiem-ke) ·
[iPOS – V2.6.x](https://iposvni.gitbook.io/inventory/phien-ban/phien-ban/v2.6.x) ·
[iPOS – Kiểm kê (huongdan)](https://huongdan.ipos.vn/docs/huong-dan-su-dung-ipos-inventory/van-hanh/kiem-ke/) ·
[KiotViet FnB – Thiết lập cửa hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/thong-tin-cua-hang-web-fnb/) ·
[KiotViet FnB – Nhập hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-giao-dich/nhap-hang/) ·
[KiotViet – Sửa phiếu nhập](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-nhap-hang/sua-thong-tin-chung-phieu-nhap-hang/) ·
[KiotViet – Kiểm kho](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-hang-hoa/kiem-kho/) ·
[CUKCUK – Tự động xuất kho khi bán](https://helpv2.cukcuk.vn/vi/kb/huong-dan-thiet-lap-tu-dong-xuat-kho-khi-ban-hang) ·
[CUKCUK – Tính giá xuất kho](https://helpv2.cukcuk.vn/vi/kb/1010300_tinh_gia_xuat_kho) ·
[CUKCUK – Khóa sổ](https://helpv2.cukcuk.vn/vi/kb/khoa-so-ky-ke-toan-sau-khi-chot-so-lieu-de-khong-lam-thay-doi-so-lieu-da-chot) ·
[POS365 – Thiết lập tính năng](https://www.pos365.vn/docs/thiet-lap-tinh-nang-2397.html) ·
[POS365 – Phiếu kiểm kê](https://www.pos365.vn/docs/them-moi-phieu-kiem-ke-2263.html) ·
[Sapo – Phiếu nhập kho](https://help.sapo.vn/tao-phieu-nhap-kho-nguyen-lieu-mat-hang-tren-trang-quan-tri-sapo-fnb) ·
[Sapo – Phiếu kiểm kê](https://help.sapo.vn/tao-phieu-kiem-ke-kho-nguyen-lieu-mat-hang-tren-trang-quan-tri-sapo-fnb).
Câu trích KiotViet lấy qua công cụ tóm tắt trang, có thể lệch vài chữ so với trang gốc.

## Nghiệp vụ chuẩn (phần đối thủ không ghi rõ — tra 05/10/2026)

| Câu hỏi | Thực hành chuẩn | Nguồn |
|---|---|---|
| Phiếu nhập ghi ngày nào | **Ngày hàng thực nhập kho**, không phải ngày hóa đơn hay ngày gõ máy. Luật Kế toán 2015 Đ.26: "ghi sổ kế toán phải theo trình tự thời gian phát sinh của nghiệp vụ"; mẫu 01-VT: "Sau khi nhập kho ghi rõ ngày, tháng, năm nhập kho" | [thuvienphapluat](https://thuvienphapluat.vn/phap-luat-doanh-nghiep/bai-viet/nhung-noi-dung-co-ban-ve-mo-ghi-so-va-khoa-so-ke-toan-16135.html) · [ihoadon](https://ihoadon.vn/hddt/phieu-nhap-kho-la-gi.html) |
| Hàng về trước lúc đếm, phiếu ghi sau | Kiểm toán gọi là **cut-off**: lúc đếm ghi lại **phiếu nhập cuối cùng trước giờ đếm**, sau đó đối chiếu phiếu muộn và sửa phần chênh. ISA 501 A8: ghi "details of the movement of inventory just prior to, during and after the count so that the accounting for such movements can be checked at a later date" | [ISA 501](https://www.ifac.org/_flysystem/azure-private/publications/files/A024%202012%20IAASB%20Handbook%20ISA%20501.pdf) · [ciferi](https://ciferi.com/blog/how-to-perform-stock-count-observations-isa-501) |
| Tồn âm | Âm giữa kỳ chấp nhận được; **cuối kỳ không được âm**. Nguyên nhân thường là sót phiếu nhập → bổ sung phiếu **đúng ngày, đúng số lượng**, rồi tính lại giá | [forum MISA](https://forum.misa.vn/threads/tinh-gia-theo-pp-binh-quan-cuoi-ky-xem-so-chi-tiet-vthh-bi-am-thoi-diem.2440/) · [tintucketoan](https://tintucketoan.com/cac-truong-hop-hang-ton-kho-bi-am-va-cach-xu-ly/) |
| Bình quân gia quyền | TT 99/2025 (thay TT 200 từ 01/01/2026): "có thể được tính theo từng kỳ hoặc sau từng lô hàng nhập về". Tính theo kỳ (ta: kỳ = 1 ngày) thì phiếu muộn đúng ngày chỉ cần tính lại kỳ đó | [ketoanthienung](https://ketoanthienung.net/cach-tinh-gia-xuat-kho-theo-pp-binh-quan-gia-quyen.htm) |
| Sửa sổ đã khóa | Sổ điện tử chỉ sửa bằng **chứng từ điều chỉnh**, không sửa thẳng (Luật Kế toán Đ.27) | [ketoan.man.net.vn](https://ketoan.man.net.vn/cac-phuong-phap-sua-chua-so-ke-toan/) |
| Thứ tự cuối ngày / khóa kỳ ở nhà hàng | Đếm **sau ca cuối hoặc trước khi hàng về**; trước khi khóa kỳ "match invoices to deliveries received"; khóa tháng nhà hàng thường mất **5–7 ngày làm việc** | [MarketMan](https://www.marketman.com/blog/how-often-should-a-restaurant-take-inventory) · [Autymate](https://www.autymate.com/blog/month-end-close-checklist-for-restaurants-and-multi-unit-operators) |

Khớp với quy tắc dưới đây. Hai ý lấy thêm từ nghiệp vụ chuẩn: phiếu kiểm kê ghi **"phiếu nhập cuối trước lúc đếm"** (bằng chứng
cut-off), và **cảnh báo nguyên liệu còn âm trước khi ngày tự chốt**. Thứ tự "nhập hết phiếu → ghi hủy → đếm → chốt" và mốc 7
ngày không có văn bản chuẩn nào ghi nguyên văn — là suy ra từ các nguồn trên.

## Quy tắc (chủ dự án chốt 05/10/2026 — QD-034)

1. **Thời gian nhập** (ngày + giờ hàng về quán) là một ô duy nhất trên phiếu nhập, thay "Ngày chứng từ". Sổ kho, công nợ NCC,
   phiếu chi đi kèm đều theo thời gian này. Không được ở tương lai; không được rơi vào ngày đã chốt sổ.
2. **Kiểm kê đã hoàn thành là mốc khóa** (iPOS). Với mỗi nguyên liệu trong phiếu kiểm kê: mọi thay đổi có thời gian **trước hoặc
   bằng** thời gian kiểm kê đều bị chặn — Hoàn thành / Hủy bỏ phiếu nhập, Hủy phiếu xuất hủy, Hủy mẻ chế biến, Hoàn thành phiếu
   kiểm kê khác. Muốn ghi thì **Hủy phiếu kiểm kê → ghi phiếu → Hoàn thành lại phiếu kiểm kê**. Thay đổi có thời gian **sau** lúc
   kiểm kê ghi bình thường (đã đúng, vì kiểm kê lưu độ lệch tại lúc đếm).
3. **Hoàn thành lại** giữ nguyên **số đã đếm, đơn vị đếm và thời gian kiểm kê cũ**; độ lệch tính lại = số đếm − tồn sổ **tại
   thời gian kiểm kê** (đã có phiếu vừa ghi). Không phải đếm lại.
4. **Sổ kho tự chốt sau 1 tuần**: ngày D tự chốt khi hôm nay ≥ D + 7 (ví dụ 05/10 chốt vào 12/10). Ngày chưa chốt tính tại chỗ,
   báo cáo ghi "chưa chốt". Ngày đã chốt giữ nguyên tắc bất biến (QD-017 D7): sửa bằng dòng điều chỉnh ghi hôm nay.
5. **Cảnh báo âm**: kiểm kê nguyên liệu đang âm trên sổ → hỏi lại ("thường do chưa nhập phiếu"); ngày sắp tự chốt mà còn
   nguyên liệu âm → nhắc ở đầu Kho hàng. Không chặn (sổ phải chốt được).
6. **Thời gian không sửa sau khi Hoàn thành** (như mặc định KiotViet "Không cho phép thay đổi thời gian giao dịch"). Sai thì
   Hủy bỏ + Sao chép (đã có, QD-027 D5).

## Giao diện (đã chốt 05/10/2026)

### 1. Kho hàng → Nhập hàng → "+ Nhập hàng" (`/nhap-hang/moi`)

Thêm một ô ngay dưới "Nhà cung cấp" (KiotViet đặt "Ngày/giờ nhập hàng" cạnh Ghi chú ở cột phải; iPOS "Thời gian nhập" ở đầu
phiếu):

```
Nhà cung cấp (không bắt buộc)   [ — Không chọn (mua lẻ, trả đủ) —  ▾ ]
Thời gian nhập                  ( • Lúc bấm Hoàn thành   ○ Chọn giờ khác )
                                  └ khi chọn giờ khác: [ 05/10/2026 ] [ 14:00 ]
                                  Lùi được tới 29/09 (ngày cũ nhất chưa chốt sổ).
```

- Mặc định **"Lúc bấm Hoàn thành"** — để phiếu Lưu tạm tối hôm trước, sáng hôm sau mới Hoàn thành thì vẫn vào đúng giờ hàng về.
  Chọn giờ khác thì phiếu tạm giữ giờ đã chọn.
- Bấm **Hoàn thành** mà vướng kiểm kê → không ghi gì, hiện khung đỏ trên nút:

```
Không nhập được vào 14:00 05/10:
• Thịt bò thăn — đã kiểm kê lúc 21:45 05/10 (phiếu KK000012)
Cách làm: Hủy phiếu kiểm kê → Hoàn thành phiếu nhập này → Hoàn thành lại phiếu kiểm kê (giữ số đã đếm).
[ Mở phiếu KK000012 ]                                   (phiếu này đã được Lưu tạm)
```

  Phiếu được **Lưu tạm** tự động để không mất số đã gõ.
- Giờ ở tương lai → "Thời gian nhập không được sau bây giờ". Ngày đã chốt → "Ngày 28/09 đã chốt sổ — chọn từ 29/09".
- Điện thoại 360px: hai lựa chọn xếp dọc, ô ngày và ô giờ cùng một hàng.

**Bố cục phiếu nhập hai cột (chủ dự án chọn 05/10/2026 khi xem bản đầu, "ô tiền 1 góc thế này tôi thấy hơi cấn cấn").** Theo
KiotViet "Nhập hàng":
- Trái: **Hàng nhập** (các dòng, "+ Thêm nguyên liệu khác", "Lấy hàng lần trước").
- Phải: khung **Thông tin phiếu**, dính khi cuộn, gồm Nhà cung cấp, Thời gian nhập, Tổng tiền hàng, Giảm giá, Cần trả NCC, Tiền
  trả NCC, cách trả, Ghi chú. Nút Lưu tạm / Hoàn thành nằm ngay dưới khung.
- Dưới 1280px xếp dọc, nút dính đáy màn.
- Ảnh: `anh/8-phieu-nhap-hai-cot.png`, `anh/9-phieu-nhap-360.png`.

### 2. Danh sách phiếu nhập và chi tiết phiếu

- Danh sách: cột **"Ngày"** → **"Thời gian nhập"** (`14:00 05/10`), sắp xếp và lọc theo cột này.
- Chi tiết: dòng đầu "Ngày chứng từ 05/10 · vào kho 06/10" → **"Thời gian nhập 14:00 05/10/2026 · ghi lúc 08:10 06/10 bởi
  Lan"** (dòng "ghi lúc" chỉ hiện khi khác ngày giờ nhập — để thấy phiếu nhập muộn).
- Form sửa thông tin phiếu đã nhập: **bỏ ô ngày**, còn Ghi chú và Nhà cung cấp (khi chưa có).
- **Hủy bỏ** phiếu vướng kiểm kê → cùng khung đỏ như trên.

### 3. Kho hàng → "Kiểm kê & hủy" → phần Kiểm kê

Form kiểm kê giữ nguyên các cột (Tồn kho · Thực tế · SL lệch · Giá trị lệch, P25). Thêm:

- Dòng đầu form: **"Thời gian kiểm kê: lúc bấm Hoàn thành · Phiếu nhập cuối: PN000123 (16:20)"**.
- Dòng có **Tồn kho âm**: số đỏ, nhãn **"Sổ đang âm — còn phiếu nhập chưa ghi?"**. Bấm Hoàn thành mà có dòng này → hộp hỏi lại
  (cùng kiểu "Lệch lớn" P25): *"3 nguyên liệu đang âm trên sổ. Thường là do còn phiếu nhập chưa ghi — nhập phiếu trước rồi hãy
  kiểm. Vẫn hoàn thành?"* [Quay lại] [Vẫn hoàn thành].

Thêm khối mới dưới form, cạnh "Phiếu hủy hôm nay":

```
Phiếu kiểm kê 7 ngày gần đây
Mã        Thời gian      Nguyên liệu  Lệch tăng   Lệch giảm    Người kiểm  Trạng thái
KK000012  21:45 05/10    8            +0₫         −137.200₫    Lan         Đã cân bằng   [Hủy]
KK000011  21:50 04/10    8            +840.000₫   −45.000₫     Lan         Đã hủy        [Hoàn thành lại]
```

- **Hủy** (hỏi lại): *"Hủy phiếu KK000012? Tồn của 8 nguyên liệu trong phiếu về lại số theo sổ. Số đã đếm được giữ lại để
  Hoàn thành lại."* Chỉ hiện ở ngày chưa chốt; vướng phiếu kiểm kê sau nó → khung đỏ như mục 1.
- **Hoàn thành lại**: mở form kiểm kê **điền sẵn** số đếm và đơn vị cũ, dòng đầu ghi "Thời gian kiểm kê: 21:50 04/10 (giữ
  nguyên)"; cột Tồn kho, SL lệch tính lại theo sổ mới. Như iPOS "Hủy kiểm kê → Sao chép lại", KiotViet "Hủy bỏ".
- Điện thoại: mỗi phiếu một thẻ (Mã · thời gian · lệch tăng/giảm · nút).
- Trống: "Chưa có phiếu kiểm kê nào trong 7 ngày."

### 4. "Phiếu hủy hôm nay" và "Mẻ hôm nay" — nút Hủy

Đổi thành **"7 ngày gần đây"** (các ngày chưa chốt) để hủy được phiếu hôm qua. Vướng kiểm kê → khung đỏ như mục 1.

### 5. Đầu khu Kho hàng (mọi tab) và Báo cáo

- Dòng chữ hiện có "Đã chốt sổ tới hết ngày …" đổi thành: **"Sổ kho tự chốt sau 7 ngày. Đã chốt tới hết 28/09; từ 29/09 còn
  nhập bổ sung được."**
- Có nguyên liệu âm ở ngày sẽ chốt trong ≤ 2 ngày → khung vàng: **"Thịt bò thăn, Bia Hà Nội đang âm trên sổ. Ngày 29/09 sẽ tự
  chốt vào 06/10 — nhập phiếu còn thiếu trước đó."** [Nhập hàng].
- Báo cáo: khối Hao hụt / Lãi gộp chọn khoảng có ngày chưa chốt → ghi chú nhỏ **"Gồm N ngày chưa chốt — số có thể đổi khi nhập
  phiếu muộn hoặc sửa định lượng."**

## Hệ quả cần chủ dự án biết

- **Sửa định lượng** giờ đổi số của **cả 7 ngày chưa chốt** (trước chỉ đổi hôm nay). Đúng ý "định lượng lúc đầu thường sai",
  nhưng báo cáo tuần trước có thể nhích sau khi sửa.
- "% dùng được" cập nhật chậm 7 ngày (chỉ tính từ ngày đã chốt).
- Quán **không kiểm kê** nguyên liệu nào thì không có mốc khóa: phiếu nhập lùi giờ (trong 7 ngày) luôn được, sổ luôn đúng.
- Giáp năm: sửa ngày đã chốt bằng dòng ghi hôm nay; ngày đã chốt của năm cũ sửa vào đầu năm mới thì rơi sang năm mới. Kế toán
  (Đ.27) muốn sửa trong sổ năm cũ — chỉ quan trọng khi xuất số kho sang sổ kế toán (chưa có tính năng này).

## Phạm vi kỹ thuật (để lập plan sau khi chốt giao diện)

- `stock_entries.occurred_at` (thời gian phát sinh; dòng cũ = `created_at`). `inventory_on_hand` / `inventory_day` dùng
  `occurred_at` thay `created_at`; `business_date` = ngày VN của `occurred_at`.
- `purchase_receipts.received_at` (Thời gian nhập); `doc_date`, `stock_date` suy ra từ nó; phiếu chi đi kèm `occurred_at` =
  `received_at`. "Giá gần nhất" không bị phiếu lùi giờ cũ hơn ghi đè.
- Bảng phiếu kiểm kê (mã KK…, `counted_at`, trạng thái, phiếu nhập cuối trước lúc đếm) + dòng số đếm và đơn vị; dòng
  `count_adjust` gắn phiếu. Một hàm kiểm mốc khóa dùng chung cho mọi RPC/action ghi hoặc hủy.
- `ensureClosedThrough(today − 7)`; báo cáo và tồn đầu ngày chưa chốt tính bằng chuỗi `previewDay`.
- Cập nhật `seed-kho-demo.mjs` / `doi-chieu-kho-demo.mjs` (7 ngày giờ là chưa chốt) và `kho-thuc-te.spec.ts`.
