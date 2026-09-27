# 11-04 SUMMARY — Chế độ in theo từng quán

> Thực hiện 27/09/2026 (ngoài giờ bán qt-food). Yêu cầu: PRINT-10. Quyết định: QD-019 D5.
> **Trạng thái: code xong, migration 0051 đã áp, E2E xanh tại máy. Còn: deploy + kiểm qt-food ca đầu tiên
> + gỡ biến `NEXT_PUBLIC_PRINT_MODE` trên Vercel sau khi deploy.**

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `lib/tenant/settings.ts` | `PrintMode`, `print_mode` trong `TenantSettings` (mặc định `browser`, giá trị lạ → `browser`) |
| `lib/print/adapter.ts` | `getPrintAdapter(mode)` — một adapter mỗi chế độ; bỏ singleton theo env |
| `lib/print/print-mode.tsx` (mới) | `PrintModeProvider`, `usePrintMode`, `usePrintAdapter`. Thiếu provider → `browser` (đường an toàn) |
| 6 component POS | `getPrintAdapter()` → `usePrintAdapter()` (hook ở đầu thân component) |
| `CauInBanner.tsx`, `TicketPrintButtons.tsx` | Hằng `BRIDGE` từ env → `usePrintMode()` |
| `pos/page.tsx`, `pos/online/page.tsx` | Bọc `PrintModeProvider` theo settings của quán (trang online thêm 1 truy vấn, chạy song song) |
| `admin/settings` (page + action) | Ô "Cách in phiếu" (chỉ owner — `canManage("settings")` sẵn có). Form không gửi ô này → **giữ** giá trị cũ |
| `supabase/migrations/0051_print_mode.sql` (mới) | Quán có membership `printer` active và chưa chọn chế độ → `bridge` |
| `.env.local.example`, `docs/50-PhienBan/V1x-CauInBep.md` | Bỏ biến env; hướng dẫn chọn trong cài đặt quán |
| `tests/e2e/tenant-mode.ts`, `cau-in.spec.ts` | `get/setPrintMode` (chỉ quán demo); `cau-in.spec` tự đặt chế độ cầu in — trước đây ngầm dựa vào env chung |

Layout `/r/[slug]` **không** đổi: nó chạy trên mọi request (cả trang khách) và là chốt chặn tạm ngưng —
thêm truy vấn settings ở đó là thêm tải cho mọi trang.

## Bằng chứng

```
tests/print/print-mode.test.ts   6 passed (thuần + đọc mã nguồn: env = 0 chỗ, getPrintAdapter() thiếu chế độ = 0 chỗ)
toàn bộ unit 611 passed · tsc · lint · build sạch · schema:check khớp
```

Migration trên database dùng chung (`db push --dry-run` chỉ `0051` → áp thật):
```
trước:  pho-viet null · bun-bo null · qt-food null (có printer)
sau:    pho-viet null · bun-bo null · qt-food 'bridge'
qt-food còn đủ 9 khóa settings (allow_discount, currency, onboarding_done, print_mode, qr_order_auto_send,
receipt_footer, service_charge_pct, service_mode, vat_pct) — `||` gộp, không ghi đè
```

E2E (`next start` + DB dùng chung), **cùng một bản build**:
```
print-mode.spec  2 passed — pho-viet (browser): không có chip cầu in · bun-bo (bridge): có chip cầu in
cau-in.spec      3 passed, 2 skipped (điều kiện dữ liệu sẵn có của spec: "không có đơn cần in để thử")
```
Sau E2E hai quán demo được trả về `browser` (trước là `null` — cùng nghĩa); qt-food không bị chạm (rào `DEMO_SLUGS`).

## Diff tối thiểu — một lần tự sửa

Chạy `prettier` trên `pos/page.tsx` định dạng lại cả các dòng không liên quan (dự án không có cấu hình
prettier). Đã hoàn tác và sửa tay — diff trang đó chỉ còn phần bọc provider.

## Thứ tự deploy — BẮT BUỘC

1. ✅ Migration 0051 đã áp (qt-food = `bridge`).
2. Deploy code **ngoài 5h–10h**.
3. Ca đầu tiên của qt-food: bấm "Phiếu bếp" → phiếu ra ở máy bếp qua cầu in, chip thiết bị in vẫn hiện.
4. Sau khi (3) đạt: gỡ `NEXT_PUBLIC_PRINT_MODE` khỏi Vercel env (code không còn đọc nó — để lại chỉ gây nhầm).
