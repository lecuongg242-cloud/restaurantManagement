# P37 — In theo bếp/bar, số liên, in riêng từng món, phiếu hủy món

> Lập 10/10/2026. **Trạng thái: WEB + APP WINDOWS XONG 10/10/2026, APP ANDROID CHƯA LÀM** (chủ dự án chốt phạm vi + giao diện A + B cùng ngày). Tổng kết `37-01-SUMMARY.md`. Migration 0087 đã áp DB dùng chung. Web phát hành `dev` + `main` 10/10/2026; app Windows 1.0.6 chưa build; Android: `37-02-PLAN.md`.
> Chủ dự án (10/10): "giao diện cài máy in ở hệ thống khác như nào — có khác cách hệ thống của chúng ta vận hành không?" →
> "giờ phần giao diện cài máy in và chức năng cần chỉnh gì?"

## Hiện trạng

- App Windows / Android › ☰ › **Cài đặt máy in** (`desktop/trang/cai-dat-may-in.html`, Android dùng chung trang): thẻ
  **Máy in bếp** (LAN hoặc "Không có — in phiếu bếp ra máy in quầy"), thẻ **Máy in quầy (hóa đơn)** (USB / LAN / Không có),
  **Khổ giấy**. Có **Dò máy in** (quét cổng 9100 dải /24) và **In thử**.
- **Một** máy in bếp cho cả quán: mọi phiếu bếp ra một máy. Không tách được đồ uống ra quầy pha chế.
- Không có số liên, không in riêng từng món, hủy món đã gửi bếp **không in phiếu** (bếp chỉ thấy trên màn bếp).
- `print_jobs.target_station` đã có nhưng luôn là `"kitchen"`.
- Web Quản trị › **Máy in** chỉ xem tình trạng cầu in / máy in.

## Đối thủ làm thế nào (tra 10/10/2026, trang hướng dẫn chính thức)

| | Khai báo nơi chế biến | Gán món | Máy in | Thêm |
|---|---|---|---|---|
| **KiotViet FnB** | Web: Thiết lập cửa hàng › Giao dịch › bật **"Dùng máy in chế biến/tem nhãn"** (tùy chọn "in theo khu vực chế biến") | Trên máy trung tâm (app **KiotViet Kết nối** / máy POS / điện thoại): **Máy in bar bếp › Cập nhật** → mỗi máy in **tích nhóm hàng** | Chọn tên máy in Windows hoặc **Tìm máy in** (USB/LAN), mẫu "Chế biến K80" | Thiết lập mở rộng: **số bản in (liên)**, **in riêng từng món**, tách combo, mẫu **Hủy món**, **Chuyển bàn** |
| **CUKCUK** | **Danh mục › Bếp/Bar** (mỗi bếp/bar bật "sử dụng máy in") | Món gán vào bếp/bar (một món gửi được nhiều bếp/bar) | Thiết lập › **Máy in và mẫu in** › Sửa → mỗi bếp/bar chọn **máy in đích** hoặc "Không chọn" (bỏ trống → cảnh báo "Bạn chưa thiết lập máy in cho bếp/bar") | **Tùy chỉnh mẫu in**, **In thử**, "In riêng từng món" |
| **Sapo FnB** | Trang quản trị: tạo **bar/bếp** | Thêm mặt hàng vào bar/bếp | Máy tính tiền: **Máy in** → IP + Port; app Sapo Phục vụ tự tìm IP | Mẫu in bếp; **số liên tối đa 10** cho từng bar/bếp |
| **iPOS FABi** | CMS: **Quản lý máy in** (theo cửa hàng) | Mỗi máy in chọn **Nhóm món**, **Món ăn**, **Nguồn đơn**; in theo khu vực | — | Gom món theo nhóm trên phiếu, không gộp món |

Nguồn: [KiotViet – Máy in chế biến](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-thiet-bi-phan-cung/may-in-che-bien/) ·
[KiotViet – Máy in hóa đơn](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-thiet-bi-phan-cung/may-in-hoa-don/) ·
[CUKCUK – Thiết lập máy in cho bếp/bar](https://helpv2.cukcuk.vn/vi/kb/2080000_thiet_lap_may_in_bep_bar) ·
[CUKCUK – Gửi một món xuống nhiều bếp/bar](https://helpv2.cukcuk.vn/vi/kb/lam_the_nao_de_thiet_lap_va_gui_mot_mon_xuong_nhieu_bepbar) ·
[Sapo – Cấu hình FnB trên máy tính tiền](https://help.sapo.vn/cau-hinh-fnb) ·
[Sapo – Thiết lập mẫu in bếp](https://help.sapo.vn/thiet-lap-mau-in-bep-tren-trang-quan-tri-sapo-fnb) ·
[iPOS – In theo khu vực](https://huongdan.ipos.vn/docs/tai-lieu-cap-nhat-tinh-nang-fabi/fabi-noi-dung-da-cap-nhat-trong-t8-2023/3-cai-dat-may-in-in-theo-khu-vuc/) ·
[iPOS – Gom theo nhóm món](https://huongdan.ipos.vn/docs/tai-lieu-cap-nhat-tinh-nang-fabi/fabi-noi-dung-da-cap-nhat-trong-t10-2023/3-gom-theo-nhom-mon-an-tren-phieu-dat-do/)

**Kết luận:** cả 4 đối thủ cho **nhiều nơi chế biến**, gán **nhóm món** vào từng nơi, mỗi nơi một máy in. CUKCUK / Sapo / iPOS
khai báo nơi chế biến + gán món trên **web quản trị**, chọn máy in trên máy tại quán.

## Hướng đã chốt (chủ dự án 10/10/2026)

Phạm vi: **(1) in theo bếp/bar · (2) số liên · (3) in riêng từng món · (4) phiếu hủy món ra bếp.**
Giao diện **A + B**: khai báo bếp/bar + gán nhóm món trên web (như CUKCUK/Sapo/iPOS); chọn máy in cho từng bếp/bar trên app
Windows/Android (vì IP/cổng/USB gắn với mạng tại quán).

Khác đối thủ (nhỏ, có lý do):
- Gán theo **nhóm món (danh mục thực đơn)**, không gán từng món như iPOS/CUKCUK — đơn giản hơn, đủ cho bếp + bar. Mỗi danh mục
  thuộc **một** nơi (CUKCUK cho một món ra nhiều bếp — để sau).
- Bếp/bar **không có máy in riêng → in ra máy in quầy** (giữ PRINT-18), thay vì CUKCUK bắt chọn "Không chọn" mới lưu.
- Không làm "Phiếu chuyển bàn", "tách combo", "tùy chỉnh mẫu in" ở đợt này (chủ dự án không chọn).

## Giao diện (ĐÃ CHỐT 10/10/2026)

### A. Web: Quản trị › THIẾT LẬP › **Máy in** — thêm hàng tab
Tab viên thuốc như Kho hàng: **Tình trạng** (nội dung hiện có, mặc định) · **Bếp / Bar**. Quyền: chủ quán + quản lý (như trang).

Tab **Bếp / Bar**:
```
Bếp / Bar                                                    [+ Thêm bếp/bar]
Món thuộc nhóm nào sẽ in phiếu ra bếp/bar đó. Món chưa gán in ra Bếp chính.
┌───────────────────────────────────────────────────────────────────────────┐
│ Tên              Nhóm món                         Số liên   In từng món      │
│ Bếp chính        Các nhóm còn lại (mặc định)       1         —        Sửa    │
│ Quầy pha chế     Đồ uống, Trà, Cà phê              1         —        Sửa Xóa│
└───────────────────────────────────────────────────────────────────────────┘
```
- **Bếp chính** luôn có, không xóa được, không chọn nhóm (nhận mọi món chưa gán nơi khác); đổi tên, số liên, in từng món được.
- Hộp thoại **"Thêm bếp/bar" / "Sửa bếp/bar"**: **Tên** (bắt buộc, ≤ 30 ký tự) · **Nhóm món** (danh sách ô tích các danh mục
  thực đơn; danh mục đang thuộc nơi khác ghi mờ "(đang ở Quầy pha chế)" — tích vào thì chuyển sang nơi này) · **Số liên** (1–3) ·
  ☐ **In riêng từng món** (mỗi món một phiếu). Nút **Hủy** · **Lưu**.
- **Xóa** bếp/bar (hỏi lại) → nhóm món của nó về Bếp chính.
- Trống (chỉ Bếp chính): dòng Bếp chính + câu "Quán có quầy pha chế riêng? Thêm bếp/bar để in đồ uống ra máy in ở quầy."
- Điện thoại: bảng thành danh sách thẻ (tên · nhóm món · số liên), nút Sửa/Xóa.

### B. App Windows / Android › ☰ › **Cài đặt máy in**
Thẻ **"Máy in bếp"** đổi thành **"Máy in bếp / bar"**, liệt kê từng bếp/bar lấy từ web (thứ tự như web). Mỗi bếp/bar giữ kiểu
chọn đang có:
```
Máy in bếp / bar
Thêm bếp/bar và gán nhóm món ở Quản trị › Máy in › Bếp / Bar.
  Bếp chính      (•) Không có — in ra máy in quầy    ( ) Máy in mạng (LAN)
  Quầy pha chế   ( ) Không có — in ra máy in quầy    (•) Máy in mạng (LAN)
                 Địa chỉ IP [192.168.1.90 ]  Cổng [9100]  [Dò máy in]  [In thử]

Máy in quầy (hóa đơn)   (giữ nguyên: USB / LAN / Không có, Dò máy in, In thử)
                        + Số liên hóa đơn [1 ▾]  (1–3)
Khổ giấy                (giữ nguyên)
```
- **In thử** của một bếp/bar in tờ có tên bếp/bar đó ("IN THỬ — QUẦY PHA CHẾ").
- Ô chọn máy in USB: chữ dài xuống dòng, không bị cắt ("Generic / Text Only (Copy 3) — đang kết nối (USB030…").
- Bếp/bar mới tạo trên web mà máy chưa cài → mặc định "Không có — in ra máy in quầy".

### Giấy in
- Phiếu bếp: đầu phiếu thêm tên nơi nhận **in đậm** khi quán có > 1 bếp/bar ("QUẦY PHA CHẾ"); một đơn có món của 2 nơi → 2 phiếu,
  mỗi phiếu chỉ món của nơi đó. Số liên N → in N tờ giống nhau. In riêng từng món → mỗi món một tờ.
- **Phiếu hủy món** (mới): tiêu đề **"HỦY MÓN"** to, bàn / đơn, giờ hủy, món + số lượng hủy, lý do, người hủy. Ra đúng bếp/bar của
  món đó, chỉ khi món **đã được gửi bếp** (đã có phiếu bếp in ra hoặc đang chờ in).

## Yêu cầu

`docs/20-DanhSachYeuCau/00-Requirements.md`: **PRINT-19 … PRINT-23**.
