===================================
QUYẾT ĐỊNH SỐ 003: Đổi design system sang ngôn ngữ MiniMax
NGÀY: 20/07/2026 · Thay thế: QD-002 (phần palette/style)
===================================

1. TÌNH HUỐNG
Chủ dự án cung cấp DESIGN-minimax.md (phân tích design system minimax.io) và yêu cầu đổi frontend theo hệ này: nền trắng editorial, chữ đen gần tuyệt đối, nút pill đen, viền hairline, thẻ sản phẩm màu đậm bo 32px, một typeface duy nhất.

2. VẤN ĐỀ KHI ÁP NGUYÊN BẢN
- DM Sans (typeface của hệ) KHÔNG có subset vietnamese (đã kiểm tra Google Fonts: chỉ latin + latin-ext) → chữ Việt sẽ vỡ/trộn font.
- Hệ gốc chưa có dark-mode palette (Known Gaps) — nhưng KDS của ta cần dark.
- Màu brand (coral/magenta/blue/purple) là "màu định danh sản phẩm", không dùng bừa.

3. QUYẾT ĐỊNH (bản chuyển thể)
- **Giữ nguyên**: palette monochrome (primary #0a0a0a, canvas #ffffff, surface #f7f8fa, hairline #e5e7eb, thang chữ ink/charcoal/slate/steel/stone/muted), nút pill `rounded-full` cho MỌI nút/badge/tab, input bo 8px cao 40px (44px mobile), card trắng bo 16px + card nổi bật bo 32px, spacing 4px-base, elevation phẳng + viền, success #e8ffea/#1ba673, error #d45656.
- **Typeface**: Be Vietnam Pro thay DM Sans (mọi vai trò, weight 400/500/600/700, không italic); JetBrains Mono chỉ cho số liệu/mã. Lý do: hỗ trợ vietnamese đầy đủ, cùng chất geometric-humanist.
- **Màu định danh khu vực** (tinh thần "product-identity color"): coral #ff5530 = app khách/QR; blue #1456f0 = POS; purple #a855f7 = admin; magenta #ea5ec1 = đặt bàn/online. CHỈ dùng ở thẻ định danh/accent, không dùng cho nút thường.
- **KDS dark** (tự định nghĩa vì hệ gốc thiếu): nền #0a0a0a, surface #181e25 (primary-soft), chữ trắng, hairline #333.
- Hero display 80px chỉ dùng cho trang marketing sau này; app vận hành dùng từ heading-lg trở xuống.

3b. ĐIỀU CHỈNH (20/07/2026, cùng ngày)
Chủ dự án không muốn nút đen → primary CTA đổi sang **brand-blue #1456f0** (chữ trắng ~5.8:1, đạt AA), cả light lẫn KDS dark. Black-pill của hệ gốc không dùng; đen chỉ còn là màu chữ ink và nền KDS/footer.

4. HỆ QUẢ DỰ KIẾN
- Tích cực: giao diện premium, nhất quán, dễ đọc; token 3 lớp giữ nguyên nên chỉ đổi giá trị + bo góc.
- Tiêu cực: bỏ palette đỏ/vàng "ngon miệng" của QD-002 → app khách bớt "màu ẩm thực"; bù bằng ảnh món chất lượng (Do của hệ: ảnh làm việc của màu). Style-guide và mọi UI P1 phải cập nhật đồng bộ.
