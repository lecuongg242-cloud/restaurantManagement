# QD-033 — Quản trị mở trong app Thu ngân (cửa sổ riêng) + app "TechMenu Quản lý" cho chủ quán

**Ngày:** 04/10/2026 · **Trạng thái:** D1–D5 ĐÃ CHỐT (chủ dự án 04/10/2026); D6 là đề xuất kỹ thuật.
**Sửa:** QD-026 D7 (app Thu ngân chỉ có "Thu ngân + Màn bếp" → thêm "Quản trị"). **Kế hoạch:** `30-KeHoach/P30/` ·
**Yêu cầu:** DESK-13, ANDR-09, MGR-01..08. Liên quan: QD-028 (quản lý chi nhánh), QD-030 (app Android, APK tự cài).

## Bối cảnh

Chủ dự án (04/10/2026): "có vẻ như màn admin chưa có ở app Windows và Android đúng không?" → "tôi nghĩ là cả 2" (mở quản trị
trong app Thu ngân **và** có app riêng cho chủ quán). Cả 5 đối thủ đều có app riêng cho chủ ("KiotViet Quản lý Nhà hàng",
"Sapo - Quản lý nhà hàng", "CUKCUK – Quản lý", "FABi Manager", "POS365 BOSS"), tập trung xem doanh thu/hóa đơn/báo cáo, sửa nhẹ
thực đơn; không hãng nào nhúng trang quản trị vào app thu ngân (đưa ra trình duyệt). Chi tiết + nguồn: `P30/00-TongQuan.md`.

## Quyết định

| # | Nội dung | Chọn | Lý do | Đã loại |
|---|---|---|---|---|
| D1 | Quản trị trong app Thu ngân mở ở đâu | **Cửa sổ / màn riêng trong app, phiên đăng nhập riêng** (chủ dự án chọn) | POS và admin cùng origin ⇒ chung cookie; đăng nhập chủ trong cùng WebView sẽ đăng xuất thu ngân đang bán. Phiên riêng: Electron `partition`, Android WebView Profile | Mở bằng trình duyệt của máy (như KiotViet app Windows — ra khỏi app); mở trong màn POS (đá thu ngân ra) |
| D2 | Nền tảng app chủ quán | **Android: APK tự cài** (như QD-030). **iPhone: web app** "Thêm vào màn hình chính" (chủ dự án chọn) | Không phí Apple Developer (~99 USD/năm), không cần máy Mac, không chờ duyệt. iPhone vẫn có biểu tượng riêng, mở toàn màn hình | App Store (giống đối thủ, tốn phí + máy Mac); chỉ Android |
| D3 | Màn hình app chủ quán | **Màn gọn riêng cho điện thoại** ở web `/quan-ly`, thanh dưới 5 tab; việc sâu mở trang admin đầy đủ (chủ dự án chọn) | Giống app quản lý của đối thủ; một bộ màn dùng cho cả APK Android lẫn iPhone; giao diện ở máy chủ ⇒ sửa không cần phát hành app | Bọc nguyên trang admin (nhanh nhưng chật trên điện thoại, khác đối thủ); viết app gốc riêng từng nền tảng |
| D4 | Thông báo đẩy | **Không làm ở P30** (chủ dự án: "bỏ qua") | Cần Firebase (Android) + Web Push (iPhone ≥ 16.4) + bảng đăng ký thiết bị — để phase sau | Hủy món/hủy đơn, tổng kết cuối ngày, mỗi hóa đơn, đơn QR |
| D5 | Ai dùng app Quản lý / mục Quản trị | **owner + manager**, đúng ngưỡng `canAccess(role, "admin")` hiện tại; manager chỉ thấy chi nhánh của mình (QD-028) (chủ dự án chốt 04/10) | Không mở quyền mới; giống iPOS `POS_MANAGER`, Sapo theo vai trò | Mở cho thu ngân xem doanh thu |
| D6 | APK Quản lý trong code | **Product flavor** thứ hai trong `android/` (mã gói `vn.techmenu.quanly`), dùng chung code tự cập nhật + màn mất mạng; phát hành tag `quan-ly-v<phiên bản>` cùng nơi với app Thu ngân — *đề xuất* | Không chép hai bản code cập nhật; một khóa ký | Module/project Android riêng (trùng code); gộp vào app Thu ngân (chủ quán phải cài app quầy lên điện thoại riêng) |

## Hệ quả

- QD-026 D7 đổi: menu ☰ của app Thu ngân có thêm **"Quản trị"**. Áp cho cả app Android (QD-030 làm theo khuôn app Windows).
- App Thu ngân Windows + Android cần **phát hành bản mới** để có mục Quản trị (giao diện admin vẫn ở máy chủ).
- Thay đổi Android build (thêm flavor) có rủi ro làm APK Thu ngân không cài đè được — nghiệm thu bắt buộc kiểm cài đè.
- App Quản lý: hóa đơn **chỉ xem**; thực đơn sửa được Còn/Hết, tên, giá, nhóm (chủ dự án chốt 04/10).
- Thông báo đẩy (D4) và hủy hóa đơn từ xa: để phase sau, ghi vào Roadmap.
