# QD-006 — Design System & Kiến trúc Frontend V1

> **Trạng thái: ĐÃ CHỐT** — Chủ dự án xác nhận qua phỏng vấn frontend ngày 21/07/2026.
> **Thay cho** "QD-004 (PostHog)" — file QD-004 không tồn tại trong repo (đã xóa ở đợt build lại), nên quyết định này là nguồn chính thức về design system.
> Chi tiết áp dụng: `10-BanThietKe/02-FrontendChiTiet.md`; luồng màn hình: `03-LuongFrontend.md`.

| # | Quyết định | Lựa chọn | Lý do / Hệ quả |
|---|---|---|---|
| F1 | **Design system nền** | Bộ token Mistral (`docs/DESIGN-mistral.ai.md`) — cam hoàng hôn `#fa520f` + kem `#fff8e0`, radius editorial (nút 8px/thẻ 12px) | Hợp thương hiệu đồ ăn; đầy đủ token + ~40 component để tái dùng. Thay QD-004 |
| F2 | **Theme đa tenant** | **Theme sản phẩm cố định** cho mọi bề mặt; tenant chỉ góp **logo + tên** | Nhất quán, ít việc. Không cho tenant đổi màu ở V1 (để V2). Cơ chế CSS vars sẵn để mở sau |
| F3 | **Bề mặt vận hành (POS/KDS)** | **Biến thể dày đặc** trên cùng token: bỏ serif hero, dải sunset, ảnh núi; Inter, mật độ cao, nút ≥44px, tương phản mạnh | Thao tác nhanh, đọc xa (KDS). App khách + landing giữ chất editorial |
| F4 | **Font** | **Fraunces** (serif miễn phí, thay PP Editorial Old) cho hero/tiêu đề lớn app khách + landing; **Inter** cho toàn UI; **JetBrains Mono** cho code + hóa đơn in | Không dính bản quyền; nạp qua `next/font` |
| F5 | **Màu trạng thái (mở rộng)** | Thêm token semantic status (success/warning/danger + trạng thái KDS/bàn) — Mistral không có sẵn (Known Gap) | Cần cho KDS (queued/preparing/ready/late) & sơ đồ bàn; giữ tông ấm, dùng tiết chế |
| F6 | **UI kit** | shadcn/ui (Radix + Tailwind) map sang token Mistral qua CSS vars; tiếng Việt | Đồng bộ với stack; a11y sẵn |
| F7 | **Bề mặt in** | Route in riêng, **không theme** — CSS `@media print` khổ 58/80mm, JetBrains Mono, đen trắng | Tách khỏi theme app; đúng máy in nhiệt |

## Nguyên tắc áp dụng
1. **1 design system, 4 profile bề mặt**: Customer (editorial), POS (dày đặc/tablet), KDS (dày đặc/màn lớn), Admin+Super (product/desktop). Cùng token, khác mật độ & thành phần trang trí.
2. **Sunset stripe + Fraunces hero** CHỈ ở app khách + landing; KHÔNG dùng ở POS/KDS/admin.
3. **Touch target ≥ 44px** ở mọi bề mặt chạm (khách mobile, POS, KDS).
4. **Logo tenant** hiện ở: header app khách, đầu hóa đơn/phiếu bếp, header admin. Không đổi màu chrome.
5. **Không thêm màu accent** ngoài palette cam/vàng/kem + bộ status mở rộng (F5).
