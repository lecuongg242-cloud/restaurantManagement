# P27 — Quản lý order cho quán lớn: tab nhóm món, gom cảnh báo, dấu trên thẻ bàn, bếp báo xong

> Lập 03/10/2026. **Trạng thái: CHỦ DỰ ÁN CHỐT 03/10/2026** ("cứ làm như bạn khuyên dùng"; "Ba vấn đề nặng nhất… xử lí luôn"). **27-01 XONG, chưa deploy** — `27-01-SUMMARY.md`.
> Nguồn: `40-KiemTra/DanhGia-GiaoDienOrder-QuyMoLon.md` (211 bàn, 111 món, 150 bàn cùng lúc). Quyết định: QD-032 (sửa QD-007).
> Yêu cầu: ORDER-04 (hoàn tất), ORDER-21..24.

## Vì sao làm

Ở quy mô Phở Việt lớn (211 bàn, 111 món, 150 bàn cùng lúc), bản đánh giá giao diện thấy những chỗ sau:

- **Màn bếp không dùng được:** 236 vé đều "TRỄ", vé chỉ rời màn khi thanh toán.
- **Dải cảnh báo trên POS chiếm gần hết màn:** laptop 1366 còn 197px cho bàn; tablet 1024 còn 85px.
- **Thẻ bàn không cho biết bàn nào cần xử lý.**
- **Thực đơn chỉ cuộn dọc:** từ trên xuống "Đồ uống" phải cuộn khoảng 9 màn. Ngày 03/10 chủ dự án chỉ ra: "nên có tab đồ ăn ngang".

## Đối thủ làm thế nào (tra 03/10/2026)

| | Đối thủ | Ta làm |
|---|---|---|
| Thực đơn nhiều món | KiotViet: theo **nhóm hàng**, "Món yêu thích" lên đầu, tìm theo tên/mã. Sapo: danh mục + tìm + lọc | Tab nhóm món ngang, bấm thì **lọc** |
| Cảnh báo dồn | KiotViet: **một chip vàng "{X} lượt gọi món qua QR"**, gọi nhân viên / thanh toán ở **chuông góc màn** và **chuông trên ô bàn** | Nút đếm trên thanh trên cùng (đã có ở bản điện thoại) |
| Sơ đồ bàn | KiotViet: lọc **"Tất cả / Sử dụng / Còn trống"**, màu yêu cầu thanh toán, biểu tượng đặt trước / lỗi in trên ô bàn. iPOS: lọc **"Bàn có hóa đơn"** | Dấu trên thẻ bàn + lọc Tất cả · Đang phục vụ · Trống · Cần xử lý |
| Màn bếp | KiotViet: **"Chờ chế biến" / "Đã xong – Chờ cung ứng"**; món rời bếp khi phục vụ bấm **"Đã cung ứng"**. Sapo: **"Trả hết món"** → màn **"Trả đồ"**. CUKCUK: chuông trả món, "Ẩn món đã trả" | Hai cột **Chờ chế biến / Đã xong – chờ mang ra**; POS bấm **"Mang ra"** |

Nguồn: [KiotViet màn hình bếp](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/bep-bar-cafe-nha-hang/cach-su-dung-man-hinh-bep/) ·
[KiotViet gọi món QR](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-thuc-don-dien-tu/goi-mon-qua-ma-qr/) ·
[KiotViet phòng bàn](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/quan-ly-phong-ban-web-fnb/) ·
[Sapo Bar Bếp](https://help.sapo.vn/huong-dan-su-dung-ung-dung-sapo-bar-bep) ·
[Sapo màn thu ngân](https://help.sapo.vn/man-hinh-may-tinh-tien-fnb) ·
[CUKCUK thiết lập bếp](https://helpv2.cukcuk.vn/vi/kb/thiet-lap-chung) ·
[iPOS lọc bàn](https://huongdan.ipos.vn/docs/tai-lieu-cap-nhat-tinh-nang-fabi/fabi-noi-dung-da-cap-nhat-trong-t6-2023/2-loc-ban-tai-giao-dien-ban/).

## Giao diện (đã chốt hướng 03/10/2026)

### 1. Thực đơn POS — tab nhóm món ngang (ORDER-21)

- **Vị trí:** ngay dưới ô "Tìm món…".
- **Thanh tab:** một hàng **cuộn ngang** `Tất cả · <nhóm 1> · <nhóm 2> · …` theo thứ tự nhóm; tab đang chọn nền đậm.
- **Bấm tab:** chỉ hiện món của nhóm đó, không còn tiêu đề nhóm.
- **"Tất cả":** hiện như cũ, mỗi nhóm có tiêu đề.
- **Tìm món:** khi đang gõ thì tìm trong mọi nhóm, thanh tab mờ đi; xóa chữ thì quay về tab đang chọn.
- **Điện thoại:** cùng thanh tab, vuốt ngang.

### 2. Sơ đồ bàn — tab khu một hàng (ORDER-22) + lọc trạng thái + dấu trên thẻ (ORDER-24)

- **Tab khu** (Tất cả · Tầng 1 · … · Chưa xếp khu): **một hàng cuộn ngang**, không gấp nhiều hàng.
- **Hàng lọc trạng thái** ngay dưới, mỗi nút kèm số đếm: **Tất cả · Đang phục vụ · Trống · Cần xử lý**.
  - "Cần xử lý" là bàn có ít nhất một trong các việc: đơn QR chờ duyệt, đơn chưa in phiếu bếp, đang gọi nhân viên, món bếp đã xong chờ mang ra.
- **Thẻ bàn:** thêm hàng dấu nhỏ có số, mỗi loại một màu:
  - chuông **chờ duyệt** (cam);
  - máy in **chưa in** (đỏ);
  - bàn tay **gọi** (cam nhạt);
  - đĩa **món xong N** (xanh).
  - Thẻ cần xử lý có viền đỏ.
- **Trống:** nếu lọc ra 0 bàn thì ghi "Không có bàn." như cũ.

### 3. Gom cảnh báo POS (màn từ 640px) (ORDER-23)

- **Bỏ** ba dải "Đơn khách chờ duyệt", "Đơn cần in phiếu", "Bàn đang gọi" khỏi vùng giữa màn hình.
- **Thanh trên cùng**, cạnh nút **"Chờ duyệt N"** có sẵn, thêm nút **"Cần in N"** (viền đỏ) và **"Bàn gọi N"** (bàn tay). Mỗi nút chỉ hiện khi có việc.
- **Bấm "Cần in" / "Bàn gọi":** mở ngăn danh sách từ đáy màn (giống bản điện thoại). Chạm một đơn để in phiếu bếp; chạm một bàn để đánh dấu đã xử lý.
- **Điện thoại:** không đổi (đã gọn).
- Mức độ gấp vẫn thấy được nhờ nút màu luôn ở thanh trên cùng và dấu trên thẻ bàn (mục 2).

### 4. Màn bếp — báo xong; POS — "Mang ra" (ORDER-04, QD-032)

- **KDS chia hai cột:**
  - **Chờ chế biến (N):** vé theo đơn, xếp cũ → mới. Mỗi món có nút **"Xong"**; vé có nút **"Xong cả vé"**.
  - **Đã xong – chờ mang ra (N):** món bếp đã xong mà phục vụ chưa mang. Mỗi món có nút **"Trả lại"** (bấm nhầm thì quay về Chờ chế biến).
  - Món rời màn bếp khi phục vụ bấm **"Mang ra"**, hủy món, hoặc khi thanh toán.
  - Màn hẹp: hai cột xếp chồng, cột Chờ chế biến ở trên.
- **POS, khung đơn của bàn:**
  - nhãn món: **Chờ làm · Xong – chờ mang ra · Đã mang ra · Đã thanh toán** (thay chữ "Đã thu"), và "Đã hủy" như cũ;
  - món "Xong – chờ mang ra" có nút **"Mang ra"**; đơn có từ 2 món xong trở lên thì có thêm **"Mang ra tất cả"**.
- **Quán không dùng màn bếp:** không có món nào "Xong", nên POS không hiện nút. Luồng y hệt hôm nay.

## 27-02 — Khu bàn rộng, danh sách thả xuống, hàng chờ thanh toán (chủ dự án chốt 03/10/2026)

Sau 27-01, chủ dự án nhận xét (03/10/2026):

- Bấm "Cần in phiếu" / "Bàn gọi" thì danh sách bật lên **từ đáy màn**, người dùng phải nhìn xuống và kéo chuột xuống.
- Với vài trăm bàn, cột sơ đồ bàn **quá hẹp**; các hàng tab còn lộ thanh cuộn xám.
- Câu hỏi: **nhiều bàn cùng đến thanh toán thì xử lý thế nào?**

Chủ dự án chốt **"Tab Sơ đồ bàn / Thực đơn"** và **"Hàng chờ thanh toán"**.

| Màn | Giao diện đã chốt | Đối thủ |
|---|---|---|
| Thanh trên cùng (máy ≥ 640px) | Bấm "Cần in phiếu N" / "Bàn gọi N" / **"Thanh toán N"** → danh sách **thả xuống ngay dưới nút**, rộng 26rem. Bấm ra ngoài hoặc Escape thì đóng (Escape không bỏ chọn bàn). Điện thoại vẫn mở từ đáy | KiotViet: chuông góc màn |
| Hàng tab (khu, lọc, nhóm món) | Không còn thanh cuộn xám; lăn chuột dọc thì cuộn ngang; mép phải mờ dần khi còn tab khuất | — |
| Vùng làm việc (≥ 1024px, chế độ bàn) — ORDER-25 | Hai tab **Sơ đồ bàn · Thực đơn** (thực đơn ghi kèm "· Bàn B12" khi đang chọn bàn), góc phải "211 bàn · 145 đang phục vụ". **Sơ đồ bàn** chiếm cả vùng trái + giữa, lưới tự giãn (khoảng 5 cột ở 1366, 8 cột ở 1920). Mở POS mặc định là Sơ đồ bàn. Chọn bàn → tự sang Thực đơn; đóng bàn → về Sơ đồ bàn. Khung đơn bên phải giữ nguyên. Dưới 1024px không đổi (ngăn chọn bàn / thanh tab dưới) | KiotViet thu ngân: tab **Phòng bàn / Thực đơn** |
| Hàng chờ thanh toán — ORDER-26 | Bàn vào hàng khi khách bấm **"Gọi thanh toán"** ở QR (ghi chú "Thanh toán · Chuyển khoản"…) **hoặc** nhân viên đã bấm **"Tính tiền"**. Nút **"Thanh toán N"** (xanh) → danh sách, chờ lâu nhất trước: "Bàn B05 · 475.000₫ · Chuyển khoản · chờ 7'". **Bấm dòng là mở thẳng hóa đơn** bàn đó để thu. Thu đủ → phiên đóng → lượt gọi thanh toán **tự đánh dấu đã xử lý** (ở server, máy nào thu cũng vậy). Thẻ bàn có dấu **"TT"**; bộ lọc thêm **"Chờ thanh toán N"**. Lượt gọi thanh toán không lặp ở "Bàn gọi" | KiotViet: màu "yêu cầu thanh toán" trên ô bàn. Sapo: thẻ **"Chờ thanh toán"** |

**Nhiều người thu cùng lúc:** mọi máy POS (thu ngân, và điện thoại phục vụ có vai trò POS) đều thu được; thu song song các bàn
khác nhau không xung đột; `pay_bill` (0035) có khóa và khóa idempotent nên hai người bấm thu cùng một hóa đơn không ra hai lần
tiền. Khóa "đang thu bởi…" (phương án 2) chủ dự án không chọn.

**Đã "Tính tiền" (bàn vào hàng chờ) rồi khách gọi thêm** (chủ dự án hỏi 03/10/2026):

- Món mới vẫn xuống bếp bình thường; bàn **vẫn ở hàng chờ**.
- Dòng hàng chờ hiện thêm dấu đỏ **"+N món gọi thêm"**: N là số phần món đã duyệt, chưa hủy, chưa nằm trên hóa đơn. Tiền trên
  dòng vẫn là tiền hóa đơn cũ, vì hóa đơn còn VAT / phí phục vụ nên không cộng tay.
- Thu ngân bấm dòng đó (hoặc "Xem hóa đơn") → hóa đơn **tự thêm món mới và tính lại tổng** (`openBillForSession`, có từ P4) → dấu
  mất → thu đúng.
- Lỡ thu hóa đơn cũ thì món mới chưa trả tiền: phiên **không đóng**, lượt gọi thanh toán không tự xong, bàn vẫn ở hàng chờ cho
  đến khi thu nốt.

**Nút đang chọn không dùng nền đen** (chủ dự án 03/10/2026):

- Tab vùng làm việc: nền cam đặc.
- Tab khu, nhóm món, bộ lọc: nền kem, chữ và viền cam.
- "Mang ra" nằm cạnh nhãn "Xong – chờ mang ra" dưới tên món. Cột phải chỉ còn "Hủy", rộng cố định, nên số lượng và thành tiền
  thẳng cột.

**Bếp đã làm xong thì không cho hủy món** (chủ dự án 03/10/2026). Món ở trạng thái "Xong – chờ mang ra" hoặc "Đã mang ra"
không còn nút "Hủy"; server (`cancelOrderItem`) cũng từ chối: "Bếp đã làm xong món này, không thể hủy." Cần hủy thật thì bếp
bấm "Trả lại" trên KDS, món về chờ làm, lúc đó hủy được.

**Quán không dùng màn bếp** (chủ dự án chốt 03/10/2026): món không bao giờ "Xong" nên luật trên không áp dụng; món hủy được
đến khi thu tiền, vẫn cần lý do và PIN. Hủy món thì nhân viên **báo bếp bằng miệng**. Không làm cài đặt "có dùng màn bếp", không
in phiếu báo hủy.

## Kế hoạch (27-01, làm trong phiên bằng TDD)

| Bước | File | Kiểm bằng |
|---|---|---|
| Hàm thuần | `lib/orders/table-flags.ts` (dấu + lọc thẻ bàn), `lib/orders/status.ts` (`orderStatusFromItems`), `lib/orders/kds-columns.ts` (tách hai cột) | Vitest |
| Cột `order_items.delivered_at`, `delivered_by` | `supabase/migrations/0083_order_item_delivered.sql`, `schema-snapshot.json` | `npm run schema:check` |
| Action | `kds/actions.ts` (`markItemsReady`, `undoItemReady`), `pos/actions.ts` (`markItemsDelivered`) | E2E |
| Giao diện | `MenuPanel`, `TableMap`, `PosBoard`, `PhoneAlertBar`, `OrderPanel`, `KdsBoard`, `KdsTicket`, `lib/orders/kds.ts`, `lib/orders/pos.ts` | E2E `p27-quan-lon.spec.ts` trên dữ liệu `seed-quan-lon.mjs`; ảnh 1366 / 1024 / 390 / 1920 |
| Hồi quy | E2E POS cũ (`pos-kho-man`, `pos-dien-thoai`, `p3`, `ghep-ban`, `in-trung`) | Playwright |
