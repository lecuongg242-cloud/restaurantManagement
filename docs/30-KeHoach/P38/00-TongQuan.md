# P38 — Kéo thả sắp xếp: Thực đơn (món, danh mục) và Bàn (khu vực, bàn)

> Lập 10/10/2026. **Trạng thái: CODE XONG 10/10/2026** (chủ dự án chốt giao diện cùng ngày). Bằng chứng: E2E `p38-keo-tha` 2/2,
> hồi quy `p32-thuc-don-tab` + `p36-ban-qr` PASS, unit xanh, ảnh trong `anh/`. Không có migration. (Đánh số P38 vì P36 / P37 đã
> được phiên khác dùng cùng ngày.)
> Chủ dự án (10/10, kèm ảnh danh mục "Các món đặc sản ngựa" của Phòng Lim Quán): "tôi cần có thể kéo thả để sắp xếp vị trí".

## Hiện trạng

- Mỗi thẻ món có hai nút **↑ ↓**; mỗi bấm đổi chỗ với món liền kề, tải lại trang (`reorderItem` → `moveInList`,
  `app/r/[slug]/admin/(protected)/menu/actions.ts`). Đưa món cuối lên đầu danh mục 13 món phải bấm 12 lần.
- Danh mục có ↑ ↓ ở đầu mỗi khối (`CategoryManager`), cùng cách.

## Đối thủ làm thế nào (tra 10/10/2026)

| | Sắp xếp món | Ghi chú |
|---|---|---|
| **CUKCUK** | Danh mục › Thực đơn › Tiện ích khác › **Sắp xếp thứ tự** › tích "Người dùng tự sắp xếp" › chọn lần lượt món theo thứ tự › Lưu | Trên tablet/POS: **chạm và giữ biểu tượng 3 gạch rồi kéo** (thứ tự chức năng order) |
| **iPOS** | Gõ **số thứ tự** cho từng món, số nhỏ hiện trước | — |
| **KiotViet** | Không tự sắp: theo bảng chữ cái, món **gắn sao** ưu tiên lên đầu | — |

Kết luận: chưa đối thủ nào cho kéo thả ngay trên lưới món; CUKCUK dùng "chạm giữ ☰ rồi kéo" ở màn cảm ứng. Mình dùng đúng
cử chỉ đó (tay nắm ⠿) ngay trên thẻ món — chủ dự án yêu cầu trực tiếp và đồng ý 10/10.

Nguồn: [CUKCUK – Sắp xếp thứ tự thực đơn](https://helpv2.cukcuk.vn/vi/kb/1060100_sap_xep_thu_tu_thuc_don) ·
[CUKCUK – Sắp xếp chức năng khi order](https://helpv2.cukcuk.vn/vi/kb/thu-ngan-muon-sap-xep-cac-chuc-nang-tren-danh-sach-order-thi-lam-the-nao) ·
[iPOS – Cài đặt món](https://huongdan.ipos.vn/docs/huong-dan-su-dung-ipos-crm/cai-dat-nha-hang-mon-an/mon/) ·
[KiotViet – Tùy chọn hiển thị](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/thu-ngan-bar-cafe-nha-hang/tuy-chon-hien-thi/)

## Giao diện (ĐÃ CHỐT 10/10/2026)

Chỉ đổi màn **Quản trị › Thực đơn**. Không thêm màn, không thêm cài đặt.

### 1. Thẻ món
```
┌──────────────────────────────┐
│ ⠿ [ảnh] Lẩu ngựa (4 người)    │   ← tay nắm ⠿ góc trái trên
│          500.000₫            │
│──────────────────────────────│
│ (●) Còn            Sửa   Xóa │   ← BỎ hai nút ↑ ↓
└──────────────────────────────┘
```
- Giữ tay nắm ⠿ và kéo trong **cùng danh mục**; thả ra là lưu ngay, báo "Đã lưu thứ tự".
- Điện thoại: chạm giữ tay nắm rồi kéo (vuốt ở chỗ khác trên thẻ vẫn cuộn trang).
- Bàn phím: Tab tới tay nắm, Space nhấc, ← → ↑ ↓ di chuyển, Space thả, Esc hủy.
- Muốn chuyển món sang danh mục khác: vẫn dùng **Sửa** như hiện nay.
- Đang gõ ô "Tìm món": ẩn tay nắm (danh sách đang lọc, kéo sẽ sai chỗ).

### 2. Danh mục — kéo tab ở hàng tab trên cùng
- Hàng tab "Tất cả · Phở ngựa · Các món đặc sản ngựa · …": kéo một tab danh mục sang trái/phải để đổi thứ tự; thả ra lưu ngay.
  Bấm (không kéo) vẫn là chọn tab như cũ. Điện thoại: chạm giữ tab rồi kéo. "Tất cả" và "+ Danh mục" đứng yên.
- Nút ↑ ↓ ở đầu mỗi khối danh mục **giữ nguyên** (chủ dự án chỉ yêu cầu bỏ ↑ ↓ của món).

### 3. Bàn & QR (chủ dự án thêm 10/10: "Bàn cũng cần kéo thả được"; chốt lại cùng ngày trên bố cục mới của P36)
Màn Bàn & QR đã được P36 dựng lại (khu vực cột trái, bảng bàn bên phải). Kéo thả trên bố cục đó:
```
KHU VỰC          +    │ Tầng 1 · 20 bàn                          [Tìm bàn…]
Tất cả          234   │ ☐  TÊN BÀN   KHU VỰC   SỐ GHẾ  MÃ QR
⠿ Tầng 1     64  ⋯    │ ⠿ ☐  Bàn 1     Tầng 1    4       Xem / In    Sửa Xóa
⠿ Tầng 2     63  ⋯    │ ⠿ ☐  Bàn 2     Tầng 1    4       Xem / In    Sửa Xóa
Chưa xếp khu      0   │
```
- **Bàn**: tay nắm ⠿ đầu dòng (trước ô tích), **bỏ cột "Thứ tự ↑↓"**. Chỉ hiện khi đang xem **một khu** và **không tìm** (đúng
  luật cũ của ↑↓). Điện thoại: ⠿ đầu dòng danh sách, bỏ "Chuyển lên / xuống" trong menu ⋯ của bàn.
- **Khu vực**: tay nắm ⠿ bên trái tên khu ở cột trái, kéo lên/xuống; **bỏ "Chuyển lên / Chuyển xuống"** trong menu ⋯ (còn Sửa tên,
  Xóa khu). "Tất cả" và "Chưa xếp khu" đứng yên. Điện thoại (hàng chip): **chạm giữ chip rồi kéo**; bấm vẫn là chọn khu.
- Thứ tự bàn này cũng là thứ tự trên sơ đồ bàn ở POS.

### Trạng thái lỗi
Lưu thất bại: thứ tự quay về như trước, báo lỗi đỏ ở đầu trang như các thao tác khác.

## Yêu cầu đo được (đã đưa vào `00-Requirements.md`)

| Mã | Yêu cầu | Tiêu chí chấp nhận |
|---|---|---|
| MENU-06 | Kéo thả món trong danh mục | Thẻ món có tay nắm ⠿, không còn ↑ ↓. Kéo món thứ 3 lên đầu → tải lại trang vẫn đứng đầu; POS / trang khách cùng thứ tự (`sort_order` 0..n-1 liền mạch). Kéo được bằng bàn phím. Ô tìm có chữ → không có tay nắm |
| MENU-07 | Kéo thả tab danh mục | Kéo tab danh mục sang vị trí khác → tải lại trang đúng thứ tự mới; bấm tab vẫn lọc như cũ |
| TABLE-11 | Kéo thả khu vực và bàn | Tay nắm ⠿ trên dòng khu (cột trái) và đầu dòng bàn (khi xem một khu, không tìm); không còn cột Thứ tự / Chuyển lên-xuống. Tải lại trang đúng thứ tự mới; chip khu trên điện thoại vẫn bấm chọn được |
| MENU-08 | An toàn | Server chỉ nhận danh sách id **đúng bằng** tập món của danh mục / tập danh mục / tập khu vực / tập bàn của khu, thuộc tenant đang đăng nhập; sai → từ chối, không ghi. Cache thực đơn được làm mới (`revalidateMenu`) |
