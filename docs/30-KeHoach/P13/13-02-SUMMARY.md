# 13-02 — SUMMARY: In mã QR chuyển khoản trên hóa đơn

> **ĐÃ ĐÓNG 28/09/2026** — chủ dự án kiểm tra thật và chốt đóng P13.
>
> Trước đó: **CODE XONG, chờ nghiệm thu trên giấy in thật** (27/09/2026). Còn: in trên máy nhiệt 80/58mm thật và quét
> bằng ≥ 2 app.

## Tệp đã đổi

- `lib/billing/transfer-qr.ts` (mới) — `dungTransferQr`: chỉ có QR khi có `bank` **và** bật cờ **và** bill `open` **và**
  không phải bill vỏ chứa của lần chia đều **và** tổng > 0 **và** có `bill_no`.
- `lib/billing/receipt-view.ts` — thêm `transferQr?`, số tiền lấy từ `view.total`. Không có QR thì **không có khóa** này
  (view model của quán chưa khai tài khoản giữ y nguyên).
- `lib/payments/qr-matrix.ts` (mới) — ma trận ô QR dùng chung cho cả hai đường in.
- `components/print/ReceiptDoc.tsx` — SVG QR dưới dòng TỔNG, `print-color-adjust: exact`, `shape-rendering: crispEdges`.
- `lib/print/anh-phieu.tsx` — cùng QR trong ảnh PNG: 6 chấm/ô (80mm), 5 chấm/ô (58mm), tối thiểu 4/3. Chiều cao ước lượng
  cộng thêm phần QR.
- `tests/print/transfer-qr.test.ts` (16 test), `tests/print/anh-qr.test.ts` (3 test).
- `docs/60-BanGiao/04-HuongDan-ThuNgan.md` — luồng "in trước, thu sau".

## Bằng chứng

- Ma trận (có/không bank) × (bật/tắt) × (open/paid): chỉ ô "có bank, bật, open" có QR. Bill void, vỏ chứa, 0đ → không QR.
- Số tiền trong tag 54 = `total` (giảm 10%, phí 5%, VAT 8%). Bill con dùng tổng bill con. Đổi giảm giá → QR đổi số tiền.
- Ảnh PNG: test **giải mã ảnh bằng chính `giaiMaPng` của cầu in**, tìm QR, rồi kiểm **từng chấm** trong vùng QR (cả lề 4 ô):
  chỉ có giá trị 0 hoặc 255, và đúng màu ô trong ma trận. Qua `thanhAnhDen` không bị cắt mất. Xanh ở cả 80mm và 58mm.
- **Quán chưa khai tài khoản → ảnh không đổi một byte:** chạy test ảnh trên HEAD và trên bản mới, so sha256 của 3 ảnh mẫu:
  `41845cd1…`, `bbbd4afe…`, `cfff1e5d…` giống hệt. Bản HTML chỉ thêm CSS cho lớp `.rc-qr`, lớp này không dùng khi không có QR.
- Chạy thật: hóa đơn in trình duyệt 80/58mm có QR (`anh/02-hoa-don-qr-*.png`); ảnh cầu in `anh/08-…`, `anh/09-…`.

```
npm run test → 765 passed · tsc sạch · lint sạch
```

## Cam kết

| Nghiệm thu | Trạng thái |
|---|---|
| 1. test + tsc + lint | ☑ |
| 2. Giấy in thật 80/58mm, cả trình duyệt và cầu in, ≥ 2 app | ☑ chủ dự án kiểm tra 28/09/2026 |
| 3. Hóa đơn đã trả không có QR; quán chưa khai tài khoản → như cũ | ☑ (test + so sha256) |
| 4. Hướng dẫn thu ngân | ☑ |
