# QD-024 — Bán khi quán mất mạng: điện thoại 5G làm tiếp, cầu in có mạng dự phòng

**Ngày:** 27/09/2026 · **Trạng thái:** ĐÃ TRIỂN KHAI (P17, 28/09/2026) theo C1 + đề xuất C2 (hotspot điện thoại quản lý); chủ dự án xác nhận C2 sau buổi diễn tập 17-03.
**Kế hoạch:** `30-KeHoach/P17/` · **Yêu cầu:** OFFLINE-01..04, OPS-04
**Thay thế:** QD-005 D14 ("online-only") ở phần đọc offline; `50-PhienBan/V2-KeHoach.md` §V2-C giữ để tham khảo.
**Liên quan:** QD-019/020 (cầu in, in từ mọi thiết bị), QD-021 D1 (VietQR dựng tại chỗ)

## Bối cảnh

**Chủ dự án (27/09/2026):** *"Lúc mất mạng người dùng vẫn có thể dùng điện thoại để order cho khách (điện thoại dùng 5G)."*

Vậy "mất mạng" ở quán thực tế là **mất internet cáp/wifi của quán**, không phải mất server. Điện thoại nhân viên có 5G vẫn tới
được server, và POS đầy đủ đã chạy trên điện thoại từ P12 (gọi món, bill, thu tiền, in). Rà code 27/09/2026 cho thấy chỗ gãy thật
khi wifi quán mất:

| Thành phần | Khi wifi quán mất | Hệ quả |
|---|---|---|
| Điện thoại nhân viên (5G) | **Vẫn chạy bình thường** | Gọi món, thu tiền được |
| Máy quầy (PC/tablet qua wifi) | Mất kết nối; POS `force-dynamic`, không cache ⇒ tải lại là trắng màn | Thu ngân phải chuyển sang điện thoại |
| **Cầu in** trên PC quầy | Poll Supabase qua internet ⇒ **không lấy được phiếu**; hóa đơn là ảnh PNG dựng trên Vercel ⇒ không in được | **Bếp không nhận phiếu, không in được hóa đơn** — đây là điểm gãy chính |
| Máy in LAN | Vẫn nối được với PC quầy trong mạng nội bộ | In được nếu cầu in có internet |

Cầu in đã có sẵn: phiếu `pending` < 30 phút vẫn được in khi có mạng lại (`print-bridge.mjs:62-71`), và điện thoại đã có chip trạng thái
in (đang gửi / đã in / kẹt, P12).

## Chủ dự án đã chốt / cần chốt

| # | Câu hỏi | Chốt |
|---|---|---|
| C1 | Khi quán mất mạng, nhân viên làm gì? | **Dùng điện thoại 5G để order** (chủ dự án, 27/09/2026) |
| C2 | Cầu in lấy internet ở đâu khi wifi quán mất? | Đề xuất: **tự chuyển sang wifi phát từ điện thoại quản lý (hotspot)** đã lưu sẵn lúc cài; khuyến nghị thêm router 4G dự phòng cho quán lớn |

## Quyết định (đề xuất)

| # | Việc | Chọn | Vì sao | Phương án bị loại |
|---|---|---|---|---|
| D1 | Đường bán khi mất wifi | **Điện thoại 5G + POS đầy đủ (P12)** — không cần code bán offline | Đúng thực tế C1; mọi nghiệp vụ (PIN, số phiếu, thanh toán) vẫn ở server, không có xung đột đồng bộ | Hàng đợi ghi offline trên máy quầy — khó nhất lộ trình, rủi ro lệch tiền, và thừa khi điện thoại vẫn online |
| D2 | Cầu in khi mất wifi | Bộ cài lưu thêm **một mạng wifi dự phòng** (hotspot điện thoại quản lý). Cầu in phát hiện mất internet > 30 giây → nhắc trên POS điện thoại "Bật phát wifi trên điện thoại X"; Windows tự nối mạng dự phòng khi thấy | Phiếu bếp tiếp tục ra mà không thêm thiết bị; phiếu kẹt < 30 phút tự in bù | Cầu in nhận lệnh qua LAN từ điện thoại — trang https không gọi được http LAN (mixed content / Private Network Access) |
| D3 | Thấy ngay khi in kẹt | Điện thoại và máy quầy hiện **cảnh báo toàn quán** khi cầu in mất kết nối (từ nhịp tim, PRINT-13), kèm danh sách phiếu đang chờ in | Bếp không bị "im lặng" mất phiếu | Chỉ chip trên từng phiếu |
| D4 | Máy quầy mất mạng | **PWA + đọc offline**: không trắng màn, hiện bàn/đơn đang mở lúc mất mạng (chỉ xem) + banner "Mất mạng — dùng điện thoại để gọi món và thu tiền" | Thu ngân vẫn tra được bàn nào đang ăn gì; cài được lên màn hình chính (OPS-04) | Ghi offline ở máy quầy |
| D5 | Bán khi **cả 5G** cũng mất | **Để sau.** Chỉ làm nếu số liệu thật cho thấy xảy ra thường xuyên (thiết kế hàng đợi lệnh đã phân tích ở bản 27/09/2026 sáng — xem lịch sử git của file này) | Hiếm; chi phí và rủi ro lớn | — |

## Hệ quả

- P17 nhỏ đi nhiều: không đụng nghiệp vụ tiền, số phiếu, PIN, chốt sổ kho.
- Thiết bị chuẩn (`docs/60-BanGiao/02-ThietBiChuan.md`) thêm: điện thoại quản lý bật được phát wifi; tùy chọn router 4G dự phòng.
- Hướng dẫn thu ngân + phục vụ thêm mục "Khi quán mất mạng".
