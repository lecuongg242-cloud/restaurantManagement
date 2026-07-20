===================================
QUYẾT ĐỊNH SỐ 002: Design system V1
NGÀY: 20/07/2026
===================================

1. TÌNH HUỐNG
Cần chốt style/màu/font trước khi dựng UI (plan 01-04). Generator ui-ux-pro-max đề xuất palette "appetizing red + warm gold" và font Playfair Display SC + Karla.

2. CÁC LỰA CHỌN ĐÃ CÂN NHẮC
- A: Dùng nguyên đề xuất generator.
  Nhược: Karla KHÔNG có subset vietnamese (vỡ dấu); Playfair Display SC là font trang trí, không hợp POS/KDS vận hành.
- B: Giữ palette, thay font bằng bộ hỗ trợ tiếng Việt.
  Ưu: màu đã pass WCAG (accent chỉnh sẵn cho 3:1), font đúng ngôn ngữ + đúng bối cảnh vận hành.

3. QUYẾT ĐỊNH
Chọn B:
- Màu: Primary #DC2626 (đỏ), Accent #A16207 (vàng ấm), nền khách #FEF2F2, chữ #450A0A; khu staff dùng nền trung tính; KDS dark mode mặc định.
- Font: Be Vietnam Pro (heading — thiết kế cho tiếng Việt), Inter (body), JetBrains Mono (số liệu/mã) — cả 3 có subset vietnamese.
- Token 3 lớp (primitive → semantic → component) bằng CSS variables trong globals.css, theo skill design-system.
- Nút/điểm chạm tối thiểu 44px (tiêu chí ORDER-05).

4. HỆ QUẢ DỰ KIẾN
- Tích cực: dấu tiếng Việt hiển thị chuẩn; staff UI đọc nhanh; khách thấy ấm/ngon miệng.
- Tiêu cực: khác đề xuất gốc của DB — đã ghi lý do tại đây. MASTER.md của generator giữ nguyên làm tham chiếu, file này là quyết định cuối.
