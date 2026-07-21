===================================
QUYẾT ĐỊNH SỐ 004: Chốt design system theo ngôn ngữ PostHog
NGÀY: 21/07/2026 · Thay thế: QD-003 (MiniMax — không còn áp dụng)
===================================

1. TÌNH HUỐNG
Chủ dự án cung cấp `DESIGN-posthog.md` (phân tích design system posthog.com) và yêu cầu **chốt lại** — dùng hệ này làm design system chính thức cho toàn bộ ứng dụng, thay QD-003 (MiniMax). Quyết định này ra đúng lúc thuận lợi: toàn bộ code đã được dọn sạch (chỉ còn `docs/` + `.claude/`), nên không phát sinh chi phí "vẽ lại UI cũ" — hệ mới sẽ được build thẳng từ đầu ở P1 tiếp theo.

2. KIỂM TRA KỸ THUẬT TRƯỚC KHI CHỐT (bài học từ QD-002 → QD-003: DM Sans từng bị loại vì không hỗ trợ tiếng Việt)
- Đã kiểm tra Google Fonts CSS2 API (`fonts.googleapis.com/css2?family=IBM+Plex+Sans...`, cả bản tĩnh và bản Variable ital,wght) bằng UA trình duyệt thật: **IBM Plex Sans (Variable) CÓ subset `vietnamese` đầy đủ** — `unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB`. Phủ đủ Ăă/Đđ/Ĩĩ/Ũũ/Ơơ/Ưư + dấu tổ hợp (huyền/sắc/hỏi/ngã/nặng) + **luôn tiện có sẵn ký hiệu Đồng ₫ (U+20AB)**. → **Dùng trực tiếp, KHÔNG cần font thay thế** (khác tình huống DM Sans trước đây).

3. VẤN ĐỀ KHI ÁP NGUYÊN BẢN
- **Linh vật nhím (hedgehog)**: là tài sản thương hiệu riêng của PostHog, không thể/không nên tái dùng cho một sản phẩm SaaS nhà hàng Việt Nam không liên quan. Đây là điểm khác biệt duy nhất buộc phải bỏ, không chuyển thể được.
- **Nút pill cho mọi nút** (đặc trưng MiniMax cũ) KHÔNG còn — hệ PostHog dùng bo góc 6px (`rounded.md`) cho button-primary/secondary/tertiary chuẩn, pill (`rounded.full`) chỉ dành cho tab/chip/badge nhỏ. Đây là thay đổi hình thái rõ rệt so với QD-003, cần build đúng ngay từ đầu.
- **4 banner màu pastel** (blue/green/red/purple) theo luật gốc CHỈ dùng cho nội dung tài liệu dài (tip/warning/success/note), cấm dùng làm nền thẻ marketing. Dự án cần khái niệm "màu định danh khu vực" (khách/POS/admin/online) đã có từ QD-003 — không map thẳng vào 4 màu pastel này theo kiểu nền lớn (phá luật gốc).
- **Dark mode cho KDS** (bếp cần tối): hệ gốc không có ("Known Gaps: In-product app chrome... not captured"). Phải tự định nghĩa.
- **CTA màu vàng cam** (#f7a501) là màu bão hòa DUY NHẤT toàn hệ, dùng cho mọi hành động chính — khác với QD-003 §3b (đã đổi CTA từ đen sang xanh dương theo yêu cầu trước đó "không muốn nút đen"). Quyết định này **coi như ghi đè** lựa chọn màu CTA trước đó sang vàng cam, theo đúng tinh thần "chốt nguyên hệ PostHog".

4. QUYẾT ĐỊNH (bản chuyển thể)
- **Giữ nguyên từ hệ gốc**: canvas kem ấm `#eeefe9` (không còn trắng thuần như MiniMax), thang chữ ink/body/charcoal/mute/ash/stone (olive), primary vàng cam `#f7a501` + pressed `#dd9001` + active `#b17816`, on-primary `#23251d`, surface-card trắng `#ffffff`, surface-soft `#e5e7e0`, surface-doc `#fcfcfa`, hairline `#bfc1b7` / hairline-soft `#dcdfd2`, thang bo góc `0/2/4/6/8px/full`, elevation phẳng — **không đổ bóng**, chỉ viền hairline 1px (giữ tinh thần "flat + border" đã có từ MiniMax, nay chính thức hóa theo hệ mới).
- **Typography**: IBM Plex Sans Variable (400/500/600/700/800) — dùng trực tiếp toàn hệ, đã xác minh đủ dấu tiếng Việt (mục 2). Monospace: giữ **JetBrains Mono** (đã có sẵn trong dự án từ QD-003, là gợi ý thay thế chính thức của hệ gốc cho Source Code Pro — không cần thêm phụ thuộc mới) cho giá tiền/mã bàn/mã đơn.
- **Linh vật/trang trí**: KHÔNG dùng hedgehog. Thay bằng **ảnh món ăn chất lượng cao** làm điểm nhấn trực quan chính trong card (đúng silver-lining đã ghi ở QD-003: "ảnh làm việc của màu") — hệ thẻ trắng/viền hairline/bo 6px của PostHog vốn hợp để tôn ảnh món.
- **4 banner màu pastel**: giữ đúng vai trò gốc — dùng trong màn hình quản trị cho thông báo/cảnh báo dạng nội dung dài (vd: hướng dẫn onboarding, cảnh báo hết nguyên liệu), KHÔNG dùng làm nền thẻ menu/marketing.
- **Màu định danh khu vực** (kế thừa khái niệm từ QD-003, đổi giá trị màu): dùng dạng **chấm nhỏ/badge** (như sidebar admin đã làm), không phải nền lớn — coral/magenta của MiniMax cũ đổi sang bộ accent sẵn có của hệ: `accent-blue` (POS), `accent-purple` (admin), `accent-green` (đặt bàn/online), và app khách dùng riêng `primary` vàng cam (vì đây là nơi CTA "Gọi món" xuất hiện nhiều nhất, hợp lý để trùng với màu CTA chủ đạo).
- **Dark mode KDS** (tự định nghĩa, đúng tinh thần "dùng lại token có sẵn trước khi thêm token mới" — mục Iteration Guide #7 của hệ gốc): nền `surface-dark` (`#23251d` — đúng token hệ gốc dùng cho code-block, tái dùng cho KDS thay vì bịa màu mới), chữ `on-dark` (`#ffffff`), cảnh báo món quá giờ dùng `accent-red` (`#cd4239`).
- **Nút**: bỏ pill-cho-mọi-nút của MiniMax; theo đúng hệ mới — `button-primary`/`button-secondary`/`button-tertiary` bo `rounded.md` (6px), cao 40px; `pill-tab`/badge mới bo `rounded.full`.

5. HỆ QUẢ DỰ KIẾN
- Tích cực: giao diện "công cụ vận hành nghiêm túc nhưng thân thiện", rất hợp màn hình nhiều dữ liệu bảng biểu (POS/KDS/Admin); nền kem ấm hơn, đỡ lạnh hơn trắng thuần; đã xác minh kỹ tiếng Việt nên không lặp lại rủi ro QD-002; tận dụng luôn ký hiệu ₫ có sẵn trong font.
- Cần lưu ý khi build P1 tiếp theo: CTA đổi màu vàng cam (khác quyết định xanh dương trước đó ở QD-003 §3b) — nếu Chủ dự án không đồng ý, cần QD tiếp theo điều chỉnh riêng phần này, tương tự cách QD-003 §3b từng điều chỉnh riêng CTA mà không đổi cả hệ.
- Hình dạng nút đổi hẳn (pill toàn phần → bo 6px chuẩn) — ảnh hưởng mọi component, cần build nhất quán ngay từ token đầu tiên, không sửa nửa chừng.
- Không có mascot riêng → chất lượng ảnh món ăn trở thành yếu tố sống còn của nhận diện thị giác (đã cảnh báo tương tự ở QD-003, nay càng quan trọng hơn vì hệ mới không còn nền màu định danh lớn để "cứu" các trang thiếu ảnh đẹp).
- `docs/15-QuyetDinh/QD-002-DesignSystem.md` và `QD-003-DoiDesignMiniMax.md` giữ nguyên trong lịch sử (không xóa) — chỉ không còn hiệu lực, đã có dòng "Thay thế" ở đầu file này để tra cứu.
