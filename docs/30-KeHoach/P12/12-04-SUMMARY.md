# 12-04 SUMMARY — POS co giãn: khung + tablet dọc

> Thực hiện 27/09/2026. Yêu cầu: ORDER-19. Quyết định: QD-020 D1.
> **Trạng thái: code + E2E xong tại máy. Còn: iPad thật (Safari) và một ca thật của qt-food sau deploy.**

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `components/pos/PosBoard.tsx` | Cột sơ đồ bàn `hidden lg:block`; nút "Bàn: X ▾" (`lg:hidden`); cột đơn `w-80 md:w-[26rem]` dưới lg; chữ "Đặt bàn"/"Đơn online" ẩn dưới lg (còn icon + `aria-label`), "Chờ duyệt" ẩn chữ dưới md; ô tìm bàn hẹp hơn dưới lg. **Mọi class `lg:` giữ nguyên; state/handler diff = 0** |
| `components/pos/TablePickerDrawer.tsx` (mới) | Ngăn kéo trái (vaul, cùng khuôn `AdminMobileNav`) chứa ĐÚNG `TableMap` — chọn bàn/mang về xong tự đóng |
| `components/pos/use-resume-refresh.ts` (mới) | `taoBoLamMoi` (thuần) + `useResumeRefresh`: `visibilitychange`→visible hoặc `online` → `router.refresh()`, gộp trong 5 giây |
| `PosBoard`, `KdsBoard`, `OnlineQueue`, `ReservationList` | Gắn `useResumeRefresh` |
| `components/pos/SearchField.tsx`, `MenuPanel.tsx` | Ô nhập `text-base` dưới lg (iOS phóng to khi < 16 px), `lg:text-sm` như cũ |
| `tests/e2e/pos-kho-lon.spec.ts` (mới) | **Cổng chặn ≥1024**: 6 ảnh (chưa chọn bàn / bàn B2 / mang về × 1280×800, 1024×768) |
| `tests/e2e/pos-kho-man.spec.ts` (mới) | Tablet 768×1024, 820×1180, 800×1280: trọn luồng + máy thức dậy |

`StationScreen` đã dùng `h-dvh` từ trước — không phải sửa.

## Bằng chứng

**Cổng chặn ≥1024** — ảnh gốc chụp trên code CHƯA sửa, chạy lại ngay trên code chưa sửa: 6/6 khớp (ổn định).
Sau khi sửa: **6/6 khớp từng pixel**. **Đối chứng âm:** nới cột bàn ở `lg` thêm 16 px → **6/6 đỏ**; trả lại → xanh.
Chạy lại trên bản build cuối (sau mọi thay đổi): 6/6 xanh.

**Tablet** (`next start` + DB dùng chung, quán demo `pho-viet`):
```
768×1024 · 820×1180 · 800×1280 — chọn bàn qua ngăn kéo → gọi món (có hộp tùy chọn bắt buộc) → Xác nhận
thêm → Tính tiền → Thu tiền → Chuyển khoản → "Đã thanh toán": 3/3 xanh. Mọi nút thanh công cụ nằm trong
khung + ≥ 44×44; cột thực đơn ≥ 200 px; hộp Thu tiền nằm trong khung.
```
Màn POS có `overflow-hidden` ⇒ `scrollWidth` của trang không bao giờ lộ tràn — test đo mép phải từng nút.

**Máy thức dậy:** cắt HẲN realtime (`routeWebSocket` — WebSocket không chạm server), thêm một lượt "gọi nhân
viên" vào DB, khẳng định băng **chưa** hiện sau 2 giây (realtime bị cắt thật), phát sự kiện `online` → băng
"Bàn đang gọi" hiện trong ≤ 5 giây. **Đối chứng âm:** tắt hook trong `PosBoard`, build lại → test **đỏ** đúng
bước cuối; bật lại → xanh.

```
unit 639 (có 4 test taoBoLamMoi) · tsc · lint · build sạch
E2E cũ dùng POS (p3, order15-mobile, print-mode): 4 xanh, 1 bỏ qua (điều kiện dữ liệu sẵn có)
/r/[slug]/pos: 27,7 → 28,2 kB
```

## Test tôi viết sai — hai lần, bắt được trước khi tin nó

1. **Bản đầu của test "máy thức dậy" dùng `context.setOffline()`** — xanh cả khi đã tắt hook. `setOffline` không
   cắt WebSocket đang mở, realtime vẫn nhận sự kiện trực tiếp ⇒ test không chứng minh gì. Chỉ lộ ra nhờ chạy
   đối chứng âm. Viết lại bằng `routeWebSocket` + bước khẳng định "realtime bị cắt thật".
2. Khổ 800: test chạm món rồi kiểm `isVisible()` lúc hộp tùy chọn còn đang hiện dần → bỏ qua "Thêm vào giỏ". Sửa:
   chờ một trong hai (hộp tùy chọn / nút xác nhận) rồi mới xử lý. Ảnh chụp lúc lỗi cho thấy bố cục đúng.

## Giới hạn đã biết

- **Ảnh gốc cổng chặn không commit** (`.gitignore`): phụ thuộc dữ liệu DB dùng chung. Trước mỗi lần sửa bố cục
  POS phải chụp lại gốc trên code chưa sửa (lệnh ghi ở đầu `pos-kho-lon.spec.ts`).
- supabase-js tự nối lại WebSocket; hook chỉ tải lại để bắt kịp thay đổi đã lỡ — không tự tạo lại kênh.
- Chưa thử Safari thật trên iPad (Playwright chạy Chromium).

## Chưa kiểm được

| Nghiệm thu | Chờ |
|---|---|
| 2. iPad thật dọc, một người làm trọn một bàn | Thiết bị thật |
| 3. Khóa màn hình iPad 5 phút, đổi dữ liệu từ máy khác, mở lại → đúng dữ liệu ≤ 3 giây | Thiết bị thật (đã chứng minh cơ chế bằng E2E) |
| 4. qt-food sau deploy: màn quầy không đổi, ca đầu không lỗi | Deploy |
