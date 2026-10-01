# P24 — Ứng dụng Android "TechMenu Thu ngân": APK tự cài, tự cập nhật, tablet tự in

> Lập 01/10/2026. Plan là hợp đồng và nghiệm thu, không phải bản nháp code. **Trạng thái: ĐÃ CHỐT 01/10/2026** (QD-030 + Giao diện;
> menu app đổi sang **nút ☰ nổi**). Plan chi tiết: `24-0x-PLAN.md`. **24-01 + 24-02 code xong (máy ảo) — `24-SUMMARY.md`.**
> Yêu cầu: ANDR-01..08 (`20-DanhSachYeuCau/00-Requirements.md`). Khuôn làm theo: **P21 app Windows** (QD-026, QD-028).

## Vì sao làm

Chủ dự án (01/10/2026): "phát hành APK tự cài được ngay, làm như app Windows (link tải + tự cập nhật) — triển khai cái này
trước". Tablet/máy POS Android hiện chỉ in được nhờ một máy Windows chạy cầu in; web không tự in được (QD-018).

**P24 xong khi:** chủ quán bấm "Tải TechMenu Thu ngân cho Android" → cài lên tablet → đăng nhập → POS mở ra; phiếu bếp và hóa
đơn **in thẳng từ tablet** ra máy in LAN, không cần laptop; bản mới tự báo "Cập nhật".

## Đối thủ làm thế nào (tra 01/10/2026)

| | KiotViet | Sapo FnB | CUKCUK | iPOS | POS365 |
|---|---|---|---|---|---|
| App Android | "KiotViet Máy POS Nhà hàng", "KiotViet Nhân viên Nhà hàng" | "Sapo Thu ngân", "Sapo Phục vụ" | "CUKCUK – Bán hàng", "CUKCUK Bếp/Bar" | "FABi POS", "FABi PDA" | "POS365" |
| Phát hành | Google Play | Google Play; máy POS thì Sapo cài sẵn | Google Play | Google Play | Google Play; máy Sunmi bán kèm cài sẵn |
| Vào cài máy in | ☰ → **"Thiết lập máy in"** → "Thêm máy in hóa đơn" / "Thêm máy in bar bếp" | ☰ → **"Máy in"** | ☰ → "Thiết lập" → **"Thiết lập máy in và mẫu in"** | Mục "Máy in" | ☰ → "Thiết Lập" → "Máy in" |
| Loại máy in | USB, LAN ("Scan IP"), Bluetooth ("Dò tìm") | LAN/Wi-Fi, USB | LAN, Bluetooth (máy đã ghép đôi), Sunmi | USB, LAN, Bluetooth | LAN, Sunmi/Bluetooth (?) |
| Ô nhập | IP, tên, khổ K80, số liên, **"In thử"** | IP, Port, khổ K80, tên gợi nhớ, **"In thử"** | IP, khổ 58/80, số liên, **"In thử"** | IP tĩnh, in thử | IP, khổ 80/57-58, test in |
| Máy làm trạm in | Máy tính chạy "KiotViet Kết Nối" **hoặc** cho điện thoại in thẳng (chọn một, tránh in trùng) | Mỗi máy tự in, "chưa hỗ trợ Printer Server" | Tick **"Thực hiện in ở bếp/bar qua máy tính này"** trên một máy | (?) | (?) |
| Đăng nhập | Địa chỉ gian hàng + tên đăng nhập + mật khẩu | Chủ: SĐT + mật khẩu → chọn cửa hàng; nhân viên: **mã thiết bị 6 ký tự + PIN** | Tên nhà hàng + tài khoản + mật khẩu | (?) | (?) |

Nguồn: [KiotViet – cài máy in mobile](https://www.kiotviet.vn/cai-dat-may-in-fnb-man-mobile/) ·
[KiotViet – máy POS Android](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-thiet-bi-phan-cung/may-pos-android/) ·
[KiotViet – máy in chế biến](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-thiet-bi-phan-cung/may-in-che-bien/) ·
[Sapo – In thử](https://help.sapo.vn/in-thu-tren-sapo-thu-ngan-sapo-phuc-vu) ·
[Sapo – cài đặt, đăng nhập](https://help.sapo.vn/cai-dat-va-dang-nhap-ung-dung-sapo-thu-ngan) ·
[Sapo – thiết bị bán hàng](https://help.sapo.vn/thiet-lap-thiet-bi-ban-hang-tren-trang-quan-tri-sapo-fnb) ·
[CUKCUK – máy in LAN trên tablet](https://helpv2.cukcuk.vn/vi/kb/thiet_lap_may_in_co_ket_noi_mang_lan_cho_thu_ngan_su_dung_may_tinh_bang) ·
[CUKCUK – máy in Bluetooth](https://helpv2.cukcuk.vn/vi/kb/cach_thiet_lap_may_in_bluetooth_cho_thu_ngan_su_dung_may_tinh_bang) ·
[CUKCUK – 2 máy thu ngân](https://helpv2.cukcuk.vn/vi/kb/khi_nha_hang_co_tu_2_may_thu_ngan_tro_len_thi_thiet_lap_may_in_gui_bep_bar_the_nao) ·
[CUKCUK – Sunmi V2](https://helpv2.cukcuk.vn/vi/kb/thuc-hien-thu-tien-va-in-hoa-don-cho-khach-qua-thiet-bi-android-sunmi-v2-nhu-the-nao) ·
[POS365 – thiết lập](https://www.pos365.vn/docs/thiet-lap-tinh-nang-2397.html). (?) = chưa xác minh được.

**Làm theo:** máy in hóa đơn + máy in bếp riêng; LAN/Bluetooth/Sunmi; IP + khổ giấy; **"In thử"**; **một máy làm trạm in**
(như CUKCUK/KiotViet). **Khác đối thủ (cần chủ dự án đồng ý):** (1) phát hành APK, không qua Google Play — chủ dự án đã chọn;
(2) đăng nhập bằng tài khoản chủ quán như app Windows, không làm "mã thiết bị + PIN" của Sapo; (3) chưa gán bếp/bar theo nhóm
món (vẫn 1 máy in bếp + 1 máy in quầy như app Windows).

## Các đợt (ước lượng sau khi có công cụ build)

| Đợt | Nội dung | Xong khi (đo được) | Ước lượng |
|---|---|---|---|
| 24-01 | Vỏ app: kích hoạt, mở POS / Màn bếp, menu app, màn mất mạng, nhớ đăng nhập | Cài APK thử lên tablet → đăng nhập → POS mở đúng quán; tắt mở lại vào thẳng POS | 3–4 ngày |
| 24-02 | Phát hành + tự cập nhật: APK ký khóa thật lên GitHub Releases, nút tải ở Quản trị → Máy in, hướng dẫn cài | Tablet sạch cài theo hướng dẫn ≤ 5 phút; bản 1.0.1 hiện "Cập nhật" ≤ 1 giờ, bấm là lên bản mới, vẫn đăng nhập | 2–3 ngày |
| 24-03 | **Tablet tự in (LAN):** dịch vụ in chạy nền trong app (chuyển cầu in sang Android), máy in bếp + máy in quầy LAN, "Dò máy in", "In thử" | Gọi món từ điện thoại khác → phiếu ra máy in bếp ≤ 5 giây, không laptop; 0 phiếu trùng khi có cả app Windows (máy kích hoạt sau thắng); để yên 8 giờ vẫn in | 4–5 ngày |
| 24-04 | Máy in **Bluetooth** + máy in **liền thân Sunmi** cho hóa đơn | In hóa đơn có dấu ra máy Bluetooth 58/80 và Sunmi ≤ 3 giây | 3–4 ngày, **cần máy thật** |

Tổng ~2–3 tuần. 24-01 + 24-02 đáp ứng "APK tự cài + tự cập nhật" trước; 24-03 là "tablet tự in".

## Giao diện (ĐÃ CHỐT 01/10/2026)

> Cột "Chốt": chủ dự án đánh ✅ giữ, hoặc ✏️ kèm chỗ cần đổi. Màn POS / Màn bếp **không đổi** — là chính trang web hiện tại.
> Các màn riêng của app dùng lại trang của app Windows (chữ, ô, nút giống hệt), chỉ đổi lựa chọn máy in cho Android.

| # | Màn / chỗ | Nội dung | Đối thủ | Chốt |
|---|---|---|---|---|
| 1 | **Nút tải** — Quản trị → Máy in (dưới nút Windows) + trang `/huong-dan-cai-dat` | Nút **"Tải TechMenu Thu ngân cho Android (… MB)"**. Hướng dẫn 4 bước có ảnh: mở link trên tablet → cho phép "Cài ứng dụng không rõ nguồn gốc" → bấm "Vẫn cài đặt" nếu Play Protect cảnh báo → mở app | Đối thủ dẫn tới Google Play | ✅ |
| 2 | **Đăng nhập** (lần đầu) | Như app Windows: logo · **Email** · **Mật khẩu** · nút **"Đăng nhập"** → (nếu nhiều chi nhánh) danh sách **chọn chi nhánh** → câu hỏi **"Máy này có nối máy in không?"**: **"Có — máy quầy"** (kèm chữ "Máy khác đang in cho quán sẽ ngừng in") / **"Không — chỉ xem (ví dụ màn bếp)"** | KiotViet: gian hàng + tài khoản + mật khẩu; Sapo: SĐT + chọn cửa hàng | ✅ |
| 3 | **Màn chính** | Toàn màn hình là POS (hoặc Màn bếp nếu chọn "chỉ xem"). Không thanh tiêu đề riêng của app | — | ✅ |
| 4 | **Mở menu của app** | **Nút ☰ nổi** tròn nhỏ ở góc màn (chủ dự án chọn) → mở tấm menu từ dưới lên: **Thu ngân** · **Màn bếp** · **Cài đặt máy in** · **Tải lại** · **Đổi chi nhánh** (chỉ khi có >1) · **Đăng xuất máy** · dòng nhỏ "Phiên bản 1.0.0" | KiotViet, CUKCUK, POS365: menu ☰ | ✏️ → ☰ nổi |
| 5 | **Cài đặt máy in** | Tiêu đề **"Cài đặt máy in"**. Khối **"Máy in bếp"**: Máy in mạng (LAN) / Không có máy in bếp riêng → **Địa chỉ IP**, **Cổng** (9100), **"Dò máy in"**, **"In thử"**. Khối **"Máy in quầy (hóa đơn)"**: Máy in mạng (LAN) / **Bluetooth** (danh sách máy đã ghép đôi) / **Máy in liền thân (Sunmi)** / Không có → "In thử". Khối **"Khổ giấy"**: 80 mm / 58 mm. Nút **"Quay lại"**, **"Lưu"**. Bluetooth + Sunmi hiện từ đợt 24-04 | KiotViet "Thiết lập máy in", Sapo "Máy in", CUKCUK "Thiết lập máy in LAN / Bluetooth" — cùng các ô IP, khổ giấy, "In thử" | ✅ |
| 6 | **Thông báo thường trực** (thanh thông báo Android, chỉ máy "có nối máy in") | "**TechMenu đang in cho quán {tên}** · Máy in bếp: sẵn sàng" — chạm vào mở app. Đỏ khi máy in lỗi: "Máy in bếp không phản hồi" | Không đối thủ công bố | ✅ |
| 7 | **Cập nhật** | Có bản mới, tải xong, máy để yên 5 phút → hộp **"Có bản mới 1.0.x"** · **"Cập nhật"** / **"Để sau"** → màn cài của Android | App Windows tự cài khi máy để yên | ✅ |
| 8 | **Mất mạng** | Như app Windows: "**Chưa kết nối được — đang thử lại**", tự thử mỗi 10 giây (có màn xem offline P17 thì hiện màn đó) | — | ✅ |
| 9 | **Lần đầu bật "có nối máy in"** | Hộp xin quyền: "Cho TechMenu chạy nền để in liên tục" → mở cài đặt pin của Android (bỏ tối ưu pin). Tùy chọn **"Giữ màn hình sáng"** trong Cài đặt máy in | — | ✅ |

Điện thoại: cùng các màn, xếp một cột (trang của app Windows vốn đã co giãn). Tablet ngang: POS 3 cột như máy tính.

## Đã chốt (01/10/2026)

1. **Giao diện** như đề xuất; #4 dùng **nút ☰ nổi**.
2. Tên **"TechMenu Thu ngân"**, mã gói **`vn.techmenu.thungan`**.
3. Cho cài công cụ build (JDK 17 + Android SDK) lên máy dev.

## Còn chờ

4. **Máy thử:** một tablet/điện thoại Android cắm cáp USB vào máy dev (bật "Gỡ lỗi USB"); máy in LAN đang có. Đợt 24-04 cần
   máy in Bluetooth và/hoặc máy Sunmi.
5. **Khóa ký app:** ai giữ bản sao thứ hai (ví dụ USB của chủ dự án).

## Phát hiện khi rà code (01/10/2026)

- PWA đã có từ P17 (`app/r/[slug]/manifest.webmanifest`) — điện thoại cài POS lên màn hình chính được ngay, không cần app.
- Web POS đã tự chuyển mọi lệnh in sang cầu in khi thấy `window.techmenuDesktop.coCauIn` (`lib/print/device.ts`) ⇒ app
  Android báo đúng tín hiệu đó là POS in qua dịch vụ in của app, **hầu như không sửa web**.
- Cầu in hiện là Node (`scripts/print-bridge.mjs`, ~1.000 dòng) — Android không chạy Node ⇒ đợt 24-03 viết lại phần vòng lặp
  in (đọc `print_jobs`, dựng ESC/POS, gửi cổng 9100, báo đã in, nhịp tim) bằng mã gốc Android. Hóa đơn có dấu đã dựng thành
  ảnh ở máy chủ (QD-020 D4) ⇒ app chỉ đổi ảnh thành lệnh in.
- Kích hoạt dùng lại `/api/desktop/activate`; tự cập nhật thêm một đường như `/api/desktop/latest` cho tệp `.apk`.
