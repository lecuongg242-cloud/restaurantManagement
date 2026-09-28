# Danh mục thiết bị chuẩn — bộ cơ bản

> Chỉ hỗ trợ thiết bị trong danh mục này. Thiết bị ngoài danh mục: được dùng nếu quán muốn, nhưng không
> cam kết hỗ trợ. Bộ dùng máy POS Android (Sunmi) đang chờ thử máy thật (QD-018) — **chưa bán**.

| Vị trí | Thiết bị | Bắt buộc | Ghi chú |
|---|---|---|---|
| Quầy | Máy tính hoặc máy POS **Windows 10 trở lên**, màn hình ngang ≥ 1024 px | Có | Cài **Google Chrome**. Màn POS đầy đủ cần màn ngang — **trừ** khi quán thu tiền bằng điện thoại (bộ rẻ nhất bên dưới): máy chỉ chạy cầu in, không cần màn hình |
| Quầy | Máy in hóa đơn **Sapo SPR02** (80 mm, USB + LAN, ESC/POS) — cắm USB vào máy quầy hoặc dây LAN vào router, có driver của hãng | Có | **Máy in chuẩn** (chủ dự án chốt 27/09/2026) — đang chạy thật ở qt-food. Giá niêm yết **1.190.000đ** (gồm VAT, bảo hành 12 tháng — [SapoShop](https://shop.sapo.vn/may-in-hoa-don-spr02), tra 27/09/2026). Driver "Generic / Text Only" in sai — phải dùng driver hãng |
| Bếp | Thêm một máy **Sapo SPR02** nối **dây LAN** | Chỉ khi bếp ở xa quầy | Cắm dây mạng vào **cùng router** với máy quầy. **Không** nối máy in qua wifi: wifi quán chết là máy in mất theo, mạng dự phòng không cứu được. Bếp gần quầy: dùng **chung một máy in** cho hóa đơn và phiếu bếp (cầu in hỗ trợ) |
| Bếp | Tablet / màn hình (tùy chọn) | Không | Mở màn bếp (KDS) — **chỉ để xem**, bếp không bấm được gì ngoài "Báo hết món" |
| Phục vụ | Điện thoại (Android / iPhone) hoặc iPad / tablet | Không | Dùng POS đầy đủ (gọi món, tính tiền, thu tiền…) — màn hình tự co. **In hóa đơn** từ máy này: giấy ra ở **máy in quầy**, chỉ khi quán dùng **Cầu in** |
| Mạng | Router + wifi phủ tới khu bàn xa nhất | Có | Không dùng wifi khách cho máy quầy |
| Mạng dự phòng | **Điện thoại quản lý phát được wifi** (điểm phát cá nhân), khai tên + mật khẩu lúc cài cầu in | Nên có | Wifi quán mất → máy quầy tự nối điện thoại này, bếp vẫn nhận phiếu (P17, QD-024 D2). Bật "giữ phát wifi" để điểm phát không tự tắt. Dữ liệu 4G tốn thêm: xem `30-KeHoach/P17/17-SUMMARY.md` |
| Mạng dự phòng (quán lớn) | Router 4G dự phòng (bộ phát 4G có cổng LAN/wifi) | Không | Thay cho điện thoại quản lý, không phụ thuộc người mang máy. Giá tham khảo: kiểm lúc mua — chưa chốt mẫu |

## Bộ rẻ nhất (chủ dự án yêu cầu giá thấp nhất — 27/09/2026)

| Thiết bị | Chọn | Giá |
|---|---|---|
| Máy in | **1 máy Sapo SPR02** dùng chung cho hóa đơn + phiếu bếp | 1.190.000đ |
| Máy quầy (chạy cầu in + màn POS) | Máy tính Windows **sẵn có** của quán; không có thì **laptop cũ giá rẻ** (Dell/HP/Lenovo Core i3/i5, RAM 8GB, SSD, có bảo hành cửa hàng) — chủ dự án chọn laptop thay mini PC 27/09/2026: có sẵn màn hình, có pin khi cúp điện ngắn, dùng làm màn POS ở quầy luôn. Cắm sạc suốt giờ bán (bộ cài đã chỉnh gập nắp vẫn chạy) | 0đ hoặc ~4–5 triệu (kiểm giá lúc mua) |
| Gọi món, thu tiền | Điện thoại của nhân viên / chủ quán (POS đầy đủ trên điện thoại) | 0đ |
| Báo tiền chuyển khoản | Loa hoặc app của ngân hàng quán | 0đ |
| Router, wifi | Dùng cái quán đang có | 0đ |
| Dây mạng LAN, ổ cắm | | ~50–100 nghìn |
| Giấy in K80 (tiêu hao) | Thùng 50 cuộn | ~300–450 nghìn/thùng (6–9 nghìn/cuộn) |
| **Tổng lần đầu** | | **~1,5–1,8 triệu** (có sẵn máy tính) · **~5,5–6,8 triệu** (mua laptop cũ) |

Thêm máy in bếp riêng: +1.190.000đ. Két tiền: chưa dùng — máy in có cổng két nhưng hệ thống **chưa gửi lệnh mở két**.

## Chọn cách in (quyết định lúc cài, đổi được sau ở "Cài đặt")

| Quán có… | Chọn "Cách in phiếu" | Cần cài gì |
|---|---|---|
| Chỉ in ở máy quầy (thu ngân tự mang phiếu vào bếp), phục vụ **không** in từ điện thoại | **Trình duyệt** | Không cài gì — chỉ tạo lối tắt Chrome (`03-CaiDat.md` §5a) |
| Máy in bếp có LAN, muốn phiếu **tự ra bếp** | **Cầu in** | Bộ cài cầu in trên máy quầy (`03-CaiDat.md` §5b) |
| Phục vụ muốn **in hóa đơn / phiếu khách từ điện thoại, tablet** | **Cầu in** | Như trên; lúc cài chọn **máy in quầy** (câu 2 của bộ cài) |

Quán chọn "Trình duyệt" thì điện thoại/tablet vẫn gọi món, thu tiền được, nhưng bấm in sẽ báo không in được —
in ở máy quầy.

Quán dùng cầu in: máy quầy chạy cầu in phải **cắm điện và BẬT suốt giờ bán** (không cần tắt qua đêm) — cầu in
tự chạy khi bật máy. Máy quầy tắt thì bếp không tự ra phiếu, **và điện thoại/tablet không in được hóa đơn**.
