# Đánh giá giao diện quản lý order ở quy mô lớn (211 bàn, 111 món, 150 bàn cùng lúc)

> 03/10/2026 · quán demo `pho-viet` · dữ liệu sinh bởi `scripts/seed-quan-lon.mjs` · ảnh ở `anh-quy-mo-lon/`.
> Chủ dự án yêu cầu: "kiểm tra giao diện front end… quy mô hơn 200 bàn, menu hơn 100 món, 150 bàn vận hành cùng lúc… đánh giá
> giao diện có dễ cho người dùng quản lý order không".

## Dữ liệu thử

- **Đã xóa** toàn bộ đơn, hóa đơn, phiên bàn, phiếu in, gọi nhân viên và đặt bàn cũ của Phở Việt.
- **211 bàn** ở 5 khu (Tầng 1: 60, Tầng 2: 60, Tầng 3: 40, Sân vườn: 30, Phòng VIP: 12) cộng 9 bàn cũ. **111 món** trong 13 nhóm, trong đó 5 món đang hết.
- **150 bàn đang phục vụ** lúc khoảng 20:50 (giờ cao điểm tối): 243 đơn, 924 dòng món. Mỗi bàn có 1–3 lượt gọi, mở từ 3 tới 110 phút trước.
- Các ca kèm theo: **9 đơn QR chờ duyệt**, **9–11 đơn chưa in phiếu bếp**, **7 bàn đang gọi nhân viên**, 6 bàn đặt trước tối nay, 12 đơn mang về, món hủy, ghi chú, topping.
- Trạng thái món giữ **đúng như app vận hành hôm nay**: món ở "Chờ làm" tới khi thanh toán. Hiện không có màn nào để bếp hay phục vụ bấm "đang làm / xong / đã bưng". `pay_bill` mới đánh `served` (QD-007).

Đo bằng Playwright trên dev server (cổng 3000) ở 4 cỡ màn: laptop 1366×768, màn lớn 1920×1080, tablet thu ngân 1024×768 (P24),
điện thoại 390×844. Màn bếp đo ở 1920×1080.

## Kết luận ngắn

| Màn | Dễ quản lý order ở quy mô này? | Vì sao |
|---|---|---|
| POS trên **điện thoại** (phục vụ) | **Dùng được** | Ba loại cảnh báo gom thành 3 nút đếm gọn (chuông 9 · máy in 11 · bàn tay 7). Có tìm bàn, lọc khu, tab Bàn / Thực đơn / Đơn, giỏ nổi ở đáy. Chỉ thiếu lọc theo trạng thái bàn |
| POS trên **màn lớn 1920** | **Tạm được** | Còn khoảng 680px cho bàn, nhưng khu bàn chỉ 2 cột trong cột 320px, phải cuộn khoảng 18 màn |
| POS trên **laptop 1366** | **Khó** | Ba dải cảnh báo chiếm khoảng 300–430px. Mở bàn xong thì khung đơn chỉ thấy **1 dòng món**, khu bàn còn **197px**, phải cuộn khoảng **61 màn** để thấy hết 211 bàn |
| POS trên **tablet 1024** (máy thu ngân Android P24) | **Không dùng được** | Dải cảnh báo **phủ gần hết màn**: khu bàn còn **85px** (khoảng 141 màn cuộn), khung đơn và giỏ gần như không thấy |
| **Màn bếp (KDS)** | **Không dùng được** | **236 vé, vé nào cũng "TRỄ"**, phải cuộn 28 màn. Vé chỉ rời màn khi bàn **thanh toán**, nên vé của bàn đã ăn xong từ 112 phút trước vẫn nằm trên cùng, còn đơn mới nhất ở cuối. Đồ uống lẫn vào bếp |

Điểm tốt nên giữ:
- tìm bàn "C27" ra ngay (khoảng 1 giây);
- lọc khu đúng (Tầng 2 có 63 bàn);
- tìm món "bò" ra 16 món;
- gọi thêm món chỉ 5 lần bấm (món → size → số lượng → Thêm vào giỏ → Xác nhận);
- realtime hiện "bàn gọi" sau khoảng 2,5 giây;
- duyệt đơn QR hiện đủ món, topping, tiền, có Duyệt / Từ chối từng đơn;
- cảnh báo "Có thể đã hết — hãy hỏi bếp" theo tồn kho P10.

## Vấn đề, xếp theo mức nặng

| # | Mức | Vấn đề | Bằng chứng | Đối thủ làm thế nào |
|---|---|---|---|---|
| 1 | **Nặng** | **KDS không có nút cho bếp báo xong.** Vé chỉ rời màn khi thanh toán (QD-007 "chấp nhận ở V1"; ORDER-04 "bếp đổi trạng thái làm/xong" vẫn ◐). Ở 150 bàn: 236 vé đều đỏ "TRỄ", xếp cũ → mới nên đơn mới bị đẩy xuống cuối, cách 28 màn | `kds-01-kds.png` | KiotViet: 2 cột **"Chờ chế biến" / "Đã xong - Chờ cung ứng"**, món rời bếp khi phục vụ bấm **"Đã cung ứng"**. Sapo: **"Trả hết món"** → màn **"Trả đồ"**. CUKCUK: chuông trả món, "Ẩn món đã trả" |
| 2 | **Nặng** | **Dải cảnh báo chiếm chỗ cố định và dài ra không giới hạn** (chờ duyệt, cần in phiếu, bàn đang gọi). Mỗi đơn chưa in thêm một chip, 11 đơn là 4 hàng. Laptop và tablet mất gần hết chỗ cho bàn và khung đơn | `desk-04`, `desk-06`, `tab-04` | KiotViet: **một chip vàng "{X} lượt gọi món qua QR"**, gọi nhân viên / thanh toán hiện ở **quả chuông góc màn** và **chuông trên ô bàn**, không chiếm vùng cố định. Bản điện thoại của mình đã làm đúng kiểu này |
| 3 | **Nặng** | **Không biết bàn nào cần xử lý khi nhìn vào sơ đồ bàn.** Thẻ bàn chỉ có tên, tiền, thời gian. Bàn chờ duyệt, chưa in, đang gọi, đặt trước không có dấu trên thẻ; không có bộ lọc trạng thái. Muốn tìm bàn đang gọi phải dò tên trên dải cảnh báo rồi cuộn tìm thẻ | `big-01-tai.png` | KiotViet: lọc **"Tất cả / Sử dụng / Còn trống"**, màu **yêu cầu thanh toán / đã in tạm tính**, biểu tượng đặt trước / lỗi in trên ô bàn. iPOS: lọc **"Bàn có hóa đơn"** |
| 4 | Vừa | **Bố cục không giãn theo màn.** Khu bàn luôn là cột 320px, 2 cột, kể cả ở 1920. Khung phải 480px để trống ("Chọn một bàn để xem đơn") | `big-01-tai.png` | Sapo có mục **"Tất cả đơn"** dạng danh sách và mục **"Sơ đồ"** riêng |
| 5 | Vừa | **Menu 111 món thiếu đường tắt.** Không có thanh nhóm món để nhảy nhanh; mỗi thẻ có ô ảnh trống và công tắc "Còn/Hết" (việc của quản lý) nên màn 1920 chỉ thấy khoảng 9 món. Từ trên xuống "Đồ uống" phải cuộn khoảng 9 màn | `big-01-tai.png`, `desk-05-tim-mon-bo.png` | KiotViet: theo nhóm hàng, **"Món yêu thích" lên đầu**, tìm theo tên/mã |
| 6 | Vừa | **KDS không tách bếp / pha chế**: sinh tố, bia, nước suối, rượu nằm trong vé bếp | `kds-01-kds.png` | KiotViet lọc theo nhóm hàng; CUKCUK gán món cho từng bếp/bar; iPOS bếp nóng / lạnh / bar |
| 7 | Vừa | **KDS không có "xem theo món"** (gom "12× Phở bò tái" ở mọi bàn), cách quán phở hay làm | — | KiotViet **"Theo món"**, Sapo **"Chế biến theo món"**, CUKCUK **"Tổng hợp chế biến"** |
| 8 | Nhẹ | **Chữ "Đã thu"** cho món `served` ở khung đơn. Hiện đúng nghĩa (chỉ thanh toán mới đánh `served`), nhưng khi thêm bước phục vụ (vấn đề 1) thì phải đổi thành "Đã phục vụ" | `components/pos/OrderPanel.tsx:551` | Sapo: Món mới / Đang chế biến / Chờ cung ứng / **Đã cung ứng** |
| 9 | Nhẹ | **Số đo kỹ thuật hiện cho đầu bếp**: mỗi vé có ô "6750.3s" (độ trễ realtime ORDER-04). Vé có sẵn lúc mở trang thì ra số vô nghĩa | `KdsTicket.tsx:80` | — |
| 10 | Nhẹ | **Mỗi lần có thay đổi, POS tải lại toàn bộ.** Realtime ở 6 bảng (orders, order_items, tables, bills, reservations, staff_calls) đều gọi `router.refresh()` (trễ 400ms). Trang đầu nặng **940 KB** (KDS 687 KB, đo trên dev). Giờ cao điểm 150 bàn sẽ làm mới liên tục trên mọi máy | `PosBoard.tsx:142-159` | Chưa đo được tải thật trên production. Nên đo như PERF-04 trước khi kết luận |
| 11 | Nhẹ | Ở 9 bàn cũ, tên kiểu "B1", "T2" lẫn với bàn mới "B01". Đây là dữ liệu demo, không phải lỗi app | — | — |

## Đã xử lý (P27, 03/10/2026)

Vấn đề #1, #2, #3, #5 (tab nhóm món ngang), #8 và tab khu một hàng đã làm ở P27 (`30-KeHoach/P27/27-01-SUMMARY.md`, QD-032).
Còn mở: #4 bố cục giãn theo màn (một phần — tablet 1024 đã thu hẹp cột), #6 tách bếp/pha chế, #7 xem theo món, #9 ô số giây,
#10 realtime (đo ở 150 bàn trên dev: vé hiện sau ~12 giây).

## Đề xuất (cần chủ dự án chốt giao diện trước khi làm)

Theo thứ tự đáng làm trước, mỗi mục làm theo cách của đối thủ:

1. **Bếp và phục vụ có nút đổi trạng thái** (sửa vấn đề 1 và 8; hoàn tất ORDER-04).
   - Màn bếp chia 2 cột **"Chờ chế biến" / "Đã xong – chờ mang ra"**, bấm vào món hoặc vé để chuyển cột.
   - Khung đơn POS có nút **"Đã mang ra"** cho món xong. Món rời màn bếp khi đã mang ra, không đợi thanh toán.
   - Khi đó đổi chữ "Đã thu" thành "Đã phục vụ". Đây là thay đổi lớn về luồng (QD-007), cần quyết định mới.
2. **Gom cảnh báo POS** (vấn đề 2): trên laptop và tablet làm như bản điện thoại: 3 nút đếm trên thanh đầu, bấm mở ngăn danh sách. Không còn dải cố định.
3. **Dấu trên thẻ bàn và lọc trạng thái** (vấn đề 3): biểu tượng chờ duyệt / chưa in / đang gọi / đặt trước ngay trên thẻ; bộ lọc **Tất cả · Đang phục vụ · Trống · Cần xử lý** cạnh tab khu (như KiotViet, iPOS).
4. **KDS tách quầy và xem theo món** (vấn đề 6, 7): lọc theo nhóm món (Bếp / Pha chế), thêm tab "Theo món"; bỏ ô số giây (vấn đề 9).
5. **Bố cục giãn theo màn và menu gọn** (vấn đề 4, 5): khu bàn rộng ra khi chưa chọn bàn; thanh nhóm món; ẩn công tắc "Còn/Hết" vào chế độ quản lý; bỏ ô ảnh khi món chưa có ảnh.
6. **Đo realtime trên production** ở cỡ 150 bàn trước khi tối ưu (vấn đề 10).

## Cách dựng lại

```
node scripts/seed-quan-lon.mjs     # xóa hết đơn cũ của pho-viet, dựng 211 bàn / 111 món / 150 bàn đang phục vụ
```

Món mới chèn thẳng DB nên POS cần làm mới cache thực đơn: bật/tắt "Còn/Hết" một món trên POS, hoặc sửa một món ở admin.
