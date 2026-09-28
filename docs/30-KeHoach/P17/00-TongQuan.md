# P17 — Bán khi quán mất mạng

> Lập 27/09/2026, **sửa cùng ngày** theo thông tin chủ dự án: khi wifi quán mất, nhân viên order bằng điện thoại 5G.
> Plan là hợp đồng + nghiệm thu, không phải bản nháp code.
> Quyết định: `15-QuyetDinh/QD-024` (chờ chốt C2) · Yêu cầu: OFFLINE-01..04, OPS-04 · Phụ thuộc: P12 (POS đầy đủ trên điện thoại).

## Vì sao P17 là việc này

Wifi quán chập chờn là chuyện thường. Điện thoại 5G vẫn bán được (P12), nhưng **cầu in trên PC quầy cần internet** ⇒ bếp không nhận
phiếu, hóa đơn không in; máy quầy tải lại thì trắng màn. KiotViet và POS365 quảng cáo "bán khi mất mạng".

**P17 kết thúc bằng: rút dây mạng quán giữa giờ bán — nhân viên tiếp tục gọi món và thu tiền trên điện thoại 5G; cầu in tự chuyển sang
wifi phát từ điện thoại quản lý, phiếu bếp tiếp tục ra (phiếu kẹt tự in bù); cả quán thấy cảnh báo khi in bị kẹt; máy quầy không trắng
màn và chỉ đường sang điện thoại.**

## Các plan

| Plan | Yêu cầu | Phụ thuộc | Giá trị khi dừng ở đây |
|---|---|---|---|
| 17-01 PWA + đọc khi mất mạng + chỉ báo mạng | OPS-04, OFFLINE-01 | không | Cài lên màn hình chính; máy quầy mất mạng không trắng màn |
| 17-02 Cầu in có mạng dự phòng + cảnh báo in kẹt toàn quán | OFFLINE-02, OFFLINE-03 | QD-024 C2 | Bếp vẫn nhận phiếu khi wifi quán mất |
| 17-03 Diễn tập mất mạng + tài liệu | OFFLINE-04 | 17-01, 17-02 | Có bằng chứng quán bán liền mạch khi rút mạng; nhân viên biết làm gì |

## Đối thủ làm thế nào (tra 28/09/2026)

| | Bán khi rớt Internet | In bếp khi rớt mạng | Chữ / cảnh báo trên màn |
|---|---|---|---|
| **KiotViet FnB** | "Offline First": tự chuyển giữa Internet và mạng LAN nội bộ, tự đồng bộ khi có mạng [1] | Qua LAN; lệnh in lỗi được giữ để in lại [2] | Pop-up ngay khi in lỗi; biểu tượng lỗi in kèm **số lệnh lỗi**, bấm vào → chọn đơn → **"In lại"**; xem ở "Lịch sử báo bếp" [2] |
| **Sapo FnB** | App thu ngân / phục vụ / PC nối nhau qua LAN, tự động [3]. **Tắt khi offline**: QR/thanh toán tích hợp, đơn Grab/Shopee, HĐĐT, quản lý khách, đơn web/QR [3] | "In LAN: tem, in bếp, tạm tính, hóa đơn" — máy in nối IP [3] | Bản bán lẻ: dòng chữ đỏ góc trên "Mất kết nối internet, bạn vẫn có thể tạo đơn hàng Offline" [4]; dặn không tắt máy / xóa bộ nhớ đệm / dùng tab ẩn danh |
| **CUKCUK** | Mô hình "Kết nối Offline": một PC cài CUKCUK Server tại quán, IP tĩnh [5]; dữ liệu đẩy lên sau, quản lý không xem báo cáo tức thời [6] | Qua máy chủ tại quán [5] | không tìm thấy |
| **iPOS (FABi)** | Máy chủ nội bộ + máy trạm/PDA (IP tĩnh) | Máy in IP tĩnh cùng dải; "máy POS mất mạng local" là lý do không in được [8] | "Mất kết nối, chạm để tải lại" [7] |
| **POS365** | Giao dịch lưu trên máy đang bán; cửa sổ "Đơn hàng Offline (Chờ đồng bộ)" + nút "Đồng bộ đơn hàng" (đồng bộ bằng tay) [9] | không tìm thấy | — |

Không hãng nào làm PWA; KiotViet, Sapo, iPOS có app gốc [2][10].

**Ta làm theo:** tự động (không bắt bật tay) · **dòng chữ đỏ trên cùng** khi mất mạng (Sapo) · **biểu tượng in kèm số phiếu kẹt, bấm → danh sách phiếu** (KiotViet) · khóa rõ ràng các việc cần mạng.
**Ta khác (đã được chủ dự án chốt, QD-024 C1):** đối thủ bán offline nhờ **máy chủ LAN tại quán**; ta dùng **điện thoại 5G** vẫn tới
được server, máy quầy mất mạng chỉ xem. Lý do: web không mở được socket LAN, và không phải đồng bộ ngược (không lệch tiền, số phiếu).

Nguồn: [1] kiotviet.vn/kiotviet-hoan-toan-moi-hoat-dong-on-dinh-ngay-ca-khi-mat-ket-noi-internet ·
[2] kiotviet.vn/huong-dan-su-dung-kiotviet/thu-ngan-bar-cafe-nha-hang/thong-bao-loi-in-che-bien ·
[3] help.sapo.vn/huong-dan-su-dung-chuc-nang-ban-hang-offline · [4] help.sapo.vn/chuyen-che-do-ban-tu-online-sang-offline ·
[5] helpv2.cukcuk.vn/vi/kb/ket_noi_offline · [6] trienkhai.cukcuk.vn (… khi bị cắt mạng internet …) ·
[7] huongdan.ipos.vn/docs/htkt-khac-phuc-loi-phan-mem/ban-hang/mat-ket-noi-cham-de-tai-lai ·
[8] huongdan.ipos.vn/docs/htkt-khac-phuc-loi-phan-mem/ban-hang/khong-in-duoc-phieu-order ·
[9] pos365.vn/docs/tao-hoa-don-o-che-do-offline-va-dong-bo-2323.html · [10] play.google.com (com.sapo.fnb.hub)

## Phát hiện khi rà code (27/09/2026)

- Mọi ghi là server action; POS `force-dynamic`; **không** có manifest, service worker, IndexedDB (OPS-04 ☐).
- Cầu in poll Supabase mỗi 2s bằng JWT tài khoản `printer`; hóa đơn tải ảnh PNG từ `/api/print/jobs/:id/image`; tự cập nhật từ
  `/api/bridge/latest` ⇒ **mọi** đường của cầu in cần internet. Bỏ phiếu cũ > 30 phút (`print-bridge.mjs:62-71`).
- Nhịp tim cầu in + `/admin/printers` + bảng `/super` (PRINT-13) đã biết cầu in sống/chết ⇒ nguồn cho cảnh báo toàn quán.
- Chip trạng thái in trên từng phiếu đã có (P12 12-03).

## Ràng buộc xuyên suốt

- Không đổi nghiệp vụ tiền, số phiếu, PIN, chốt sổ.
- Thử bằng **rút dây mạng thật** ở máy quầy + điện thoại 5G thật, không chỉ DevTools offline.

## Không nằm trong P17

| Việc | Vì sao |
|---|---|
| Bán khi cả 5G cũng mất (hàng đợi ghi offline, số phiếu tạm, đồng bộ) | QD-024 D5 — để sau, chỉ làm khi số liệu thật đòi hỏi |
| In trực tiếp từ điện thoại ra máy in LAN | Trình duyệt không mở được socket 9100 (QD-018); cần app vỏ |
| KDS offline | KDS chỉ xem (QD-021 C4); bếp dùng phiếu giấy |
