# Báo cáo tổng kết P3 — Lõi order

> Lập 22/07/2026. Phạm vi: 5 plan 03-01…03-05 + verify E2E toàn chuỗi trên trình duyệt.
> Chuỗi giá trị cốt lõi: **khách gọi món QR → POS duyệt → KDS làm món → phục vụ → in phiếu bếp.**

## 1. Trạng thái các plan

| Plan | Nội dung | Requirements | Trạng thái |
|---|---|---|---|
| 03-01 | Khách gọi món QR + theo dõi realtime | ORDER-01, TABLE-02 (mở/ghép), MENU-02 | ✅ Build + verify |
| 03-02 | POS duyệt/từ chối + thêm món (bố cục 3 cột) | ORDER-02, ORDER-03 | ✅ Build + verify |
| 03-03 | KDS realtime 3 cột + đo ≤3s | ORDER-04 | ✅ Build + verify |
| 03-04 | Hủy món có kiểm soát (PIN + lý do + log) | ORDER-05 | ✅ Build + verify |
| 03-05 | PrintAdapter + phiếu bếp 58/80mm | PRINT-01, PRINT-02, OPS-06 | ✅ Build + verify |

## 2. Kết quả verify E2E (Playwright, production build)

Chạy `tests/e2e/p3.spec.ts` trên `next start` (production, dữ liệu remote thật). **1 test — PASS toàn chuỗi.**

| # | Bước | Kết quả |
|---|---|---|
| 1 | Khách quét QR → chọn "Phở bò tái" (Size bắt buộc) → giỏ → Gửi | Order `pending_confirm`, sang trang theo dõi "Chờ xác nhận" ✅ |
| 2 | Đăng nhập POS + KDS (owner, không PIN) | Vào bảng điều khiển ✅ |
| 3 | POS duyệt → **KDS nhận vé REALTIME không reload** | Vé hiện trên KDS ✅ · badge delta **2.1s (xanh ≤3s)** — ORDER-04 |
| 4 | Khách thấy "Đang chuẩn bị" **realtime** | Cập nhật ~tức thì, không reload ✅ |
| 5 | **KDS chỉ để XEM** (không nút Bắt đầu/Xong) | Xác nhận 0 nút thao tác ✅ |
| 6 | POS "Đã phục vụ" món queued → khách "Đã phục vụ" + **vé KDS tự ẩn** realtime → đóng phiên | ✅ |
| 7 | In phiếu bếp 80mm | Logo+tên NH, số phiếu, bàn, "1x Phở bò tái + Nhỏ", "IN LẠI" ✅ |

**Ảnh bằng chứng** (scratchpad/shots): `01-khach-cho-xac-nhan`, `02-kds-nhan-ve` (delta 2.2s xanh), `03-pos-sau-dong-phien`, `04-phieu-bep-80mm`.

**Đo realtime (headless, đo trước):** độ trễ giao Supabase Realtime avg **0.58s**, max 0.80s, 8/8 ≤3s.

## 3. Bug phát hiện & đã sửa trong quá trình verify

| Bug | Nguyên nhân | Sửa |
|---|---|---|
| **POS/KDS không realtime, phải reload** | Browser client subscribe bằng anon key nhưng chưa gắn JWT → RLS chặn `postgres_changes` (0 event) | `realtime.setAuth(access_token)` trước subscribe + cập nhật khi token refresh (`PosBoard`/`KdsBoard`); thêm `tables` vào publication (migration `0009_realtime_tables`) |
| **Không đóng được phiên sau khi phục vụ hết** | Order `served` bị loại khỏi `getPosSnapshot` → panel trống → nút disable | Thêm `served` vào `ACTIVE_STATUSES` (`lib/orders/pos.ts`) |

## 3b. Sửa thiết kế KDS → chỉ để XEM (22/07/2026)
Chủ dự án: bếp thật tay bận/bẩn, không thể bấm từng nút cảm ứng. **KDS chuyển thành màn hình CHỈ ĐỂ XEM** — lưới vé (xếp cũ→mới), không nút Bắt đầu/Xong; vé tự ẩn khi POS bấm "Đã phục vụ" (`queued→served`). Bỏ `preparing/ready` khỏi luồng thực tế (giữ enum cho V2 bump-bar). Khách stepper gọn: Chờ xác nhận → Đang chuẩn bị → Đã phục vụ. Xóa `kds/actions.ts`. (Cập nhật QĐ P3 #7.)

## 4. Việc làm thêm ngoài plan (theo yêu cầu chủ dự án)
- **Pass QA frontend** (accessibility WCAG 2.2 + react-patterns + make-interfaces-feel-better): aria-live realtime, focus-visible ring toàn bộ control, label liên kết, Escape/dialog, fix `transition-all`, text-wrap, image outline.
- **Refactor bố cục POS 3 cột**: Sơ đồ bàn (trái) · Thực đơn lưới (giữa) · Đơn bàn (phải); menu luôn hiển thị, bỏ drawer thêm món.
- **Nhập PIN bằng bàn phím** (PinPad) + chặn khi focus ô text.
- **Seed dữ liệu test**: 9 bàn/3 khu, 12 món/3 danh mục, 3 nhóm tùy chọn (Size bắt buộc, Topping ≤3, Mức đá).

## 5. Nghiệm thu Roadmap P3
1. ✅ Khách quét QR gọi món ≤6 chạm, 360px, món hết không đặt (03-01).
2. ✅ Order QR duyệt → xuống KDS; POS thêm món thẳng KDS (03-02).
3. ✅ KDS nhận item ≤3s (badge 2.2s xanh; delivery 0.58s) (03-03).
4. ✅ Hủy món cần PIN manager/cashier + lý do, có log (03-04).
5. ✅ Phiếu bếp 58/80mm, logo+tên tenant, PDF preview (03-05).

## 6. Nợ kỹ thuật / chuyển P4
- Đóng phiên **khi thanh toán** (phần còn lại TABLE-02) + đầu **hóa đơn** (OPS-06) → P4.
- **Tự in ≤5s** qua cầu ESC/POS (BridgePrintAdapter) → V1.x (rủi ro phần cứng, Roadmap).
- `broadcastOrderStatus` (server subscribe+send, guard 3s) làm chậm phản hồi action duyệt (~vài giây); cân nhắc chuyển fire-and-forget ở P4.
- E2E hiện phủ happy-path chính; edge (validate/hủy/RLS) đã phủ bằng test API/DB. Có thể mở rộng Playwright sau.

## 7. Cách chạy lại verify
```bash
# QUAN TRỌNG (Windows): DỪNG server cũ TRƯỚC khi build, nếu không .next bị lock → asset 400 → trang mất CSS/không hydrate.
# dừng next start cũ → rồi:
rm -rf .next && npm run build && npx next start -p 3006   # cửa sổ 1
E2E_BASE_URL=http://localhost:3006 npm run test:e2e        # cửa sổ 2
```
> **Bài học**: build khi `next start` cũ còn chạy (Windows file-lock) → build lệch hash → `_next/static` trả 400 → trang không CSS + không hydrate (click vô hiệu). Luôn dừng server trước khi build.
> E2E chạy trên **production build**, KHÔNG dùng `next dev` — dev server lỗi biên dịch route-group `(customer)` không ổn định khi nhiều route compile đồng thời (không ảnh hưởng production).

## 8. Bổ sung: Số thứ tự bếp (22/07/2026)
`orders.kitchen_no` (migration 0011) — số theo ngày (reset 00:00 VN), gán khi confirmed. Hiển thị "Đơn #N" trên KDS + phiếu bếp + panel POS để bếp biết xử lý trước. E2E xác nhận #1.
