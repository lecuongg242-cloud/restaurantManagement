# Danh mục thiết bị chuẩn — bộ cơ bản

> Chỉ hỗ trợ thiết bị trong danh mục này. Thiết bị ngoài danh mục: được dùng nếu quán muốn, nhưng không
> cam kết hỗ trợ. Bộ dùng máy POS Android (Sunmi) đang chờ thử máy thật (QD-018) — **chưa bán**.

| Vị trí | Thiết bị | Bắt buộc | Ghi chú |
|---|---|---|---|
| Quầy | Máy tính hoặc máy POS **Windows 10 trở lên**, màn hình ngang ≥ 1024 px | Có | Cài **Google Chrome**. Màn POS đầy đủ cần màn ngang |
| Quầy | Máy in nhiệt **80 mm** (hóa đơn) — cắm USB vào máy quầy, có driver của hãng | Có | Loại Xprinter 80 mm đang chạy thật ở qt-food. Driver "Generic / Text Only" in sai — phải dùng driver hãng |
| Bếp | Máy in nhiệt **80 mm có cổng LAN** | Nếu muốn phiếu tự in ra bếp | Cắm dây mạng vào **cùng router** với máy quầy |
| Bếp | Tablet / màn hình (tùy chọn) | Không | Mở màn bếp (KDS) — **chỉ để xem**, bếp không bấm được gì ngoài "Báo hết món" |
| Phục vụ | Điện thoại (Android / iPhone) hoặc iPad / tablet | Không | Dùng POS đầy đủ (gọi món, tính tiền, thu tiền…) — màn hình tự co. **In hóa đơn** từ máy này: giấy ra ở **máy in quầy**, chỉ khi quán dùng **Cầu in** |
| Mạng | Router + wifi phủ tới khu bàn xa nhất | Có | Không dùng wifi khách cho máy quầy |

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
