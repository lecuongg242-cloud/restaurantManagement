# 03-05 SUMMARY — PrintAdapter + phiếu bếp 58/80mm

> Thực thi 22/07/2026. Trạng thái: **CHỜ NGHIỆM THU** (checkpoint human-verify).
> Requirements: PRINT-01 (lớp in trừu tượng), PRINT-02 (phiếu bếp 58/80mm), OPS-06 (logo+tên ở phiếu bếp).

## File đã đổi / thêm
| File | Loại | Vai trò |
|---|---|---|
| `supabase/migrations/0010_print_jobs.sql` | thêm | `print_jobs` (type/status check, payload jsonb) + index + RLS tenant. **0010** vì 0009 đã dùng cho realtime_tables. |
| `lib/print/adapter.ts` | thêm | interface `PrintAdapter` + `BrowserPrintAdapter` (mở route in) + `getPrintAdapter()`. BridgePrintAdapter (V1.x) chừa chỗ, chưa implement (PRINT-01). |
| `lib/print/kitchen-ticket.ts` | thêm | `buildKitchenTicket(orderId, tenantId)` — snapshot order_items (loại hủy) + bàn + tenant(name,logo) + ticketNo + isReprint. |
| `app/r/[slug]/print/kitchen/actions.ts` | thêm | `logKitchenTicketPrint` — ghi print_jobs (kitchen_ticket, printed). |
| `app/r/[slug]/print/kitchen/[orderId]/page.tsx` | thêm | Route in: guard POS/KDS, ?w=58\|80, buildKitchenTicket → KitchenTicketDoc. |
| `components/print/KitchenTicketDoc.tsx` | thêm | Phiếu (client): JetBrains Mono, đen trắng, @page 58/80mm; auto window.print + ghi log 1 lần; nút In lại/Đóng/Đổi khổ. |
| `components/pos/OrderPanel.tsx` | sửa | Nhóm "đã gọi" theo order + nút "In phiếu bếp" mỗi order (qua PrintAdapter). |
| `components/pos/PendingOrdersDrawer.tsx` | sửa | Duyệt xong tự mở phiếu bếp (PrintAdapter). |

## Bằng chứng (tự động, chạy thật)
**Build/lint:** `tsc` sạch; `next lint` 0 warning; `next build` OK (route in `/print/kitchen/[orderId]` 1.72 kB). Migration 0010 áp remote, RLS bật.

**Nội dung phiếu + log** (embed REST + SQL thật, fixture bàn B3 rồi dọn):
```
EMBED → bàn: B3 | tổng items: 2 | lên phiếu (bỏ hủy): 1 | món hủy bị loại: CÓ
item lên phiếu: 2x Phở bò tái · Lớn · ít hành | ticketNo: EDF3A2
print_jobs sau in 1 lần → isReprint next = true (count 1)
```

## Cam kết must_haves
- [x] Duyệt order (hoặc panel bàn) → "In phiếu bếp" mở route + window.print().
- [x] Phiếu: logo+tên NH (OPS-06), bàn, giờ, số phiếu, món+SL+tùy chọn+ghi chú; 58 và 80mm (@page size, mono đen trắng, không tràn — dùng width cố định + word-break).
- [x] Mỗi lần in ghi 1 dòng print_jobs (kitchen_ticket, printed).
- [x] POS chỉ gọi `PrintAdapter.printKitchenTicket()` — không window.open rải rác (PRINT-01).
- [x] Món đã hủy KHÔNG lên phiếu; in lại có nhãn "IN LẠI".

## Chuyển sau (ghi rõ theo plan)
- OPS-06 phần **"đầu hóa đơn"** → P4. Nghiệm thu **"tự in ≤5s"** hoãn tới khi có cầu in + phần cứng (Roadmap rủi ro). BridgePrintAdapter (ESC/POS) V1.x.

## Còn lại cho manual verify (checkpoint — dùng PDF preview)
1. Điện thoại gửi order (món có Size + ghi chú "ít hành") → POS **Duyệt** → tab in tự mở, hộp thoại in hiện.
2. Save as PDF (80mm): logo+tên Phở Việt, số phiếu, bàn, giờ, "2x Phở bò tái" + "+ Lớn" + ">> ít hành". Không tràn.
3. Đổi khổ ?w=58 (nút "Đổi khổ") → vẫn không tràn.
4. In lại từ panel bàn → nhãn "IN LẠI"; món đã hủy không xuất hiện.
5. DB: print_jobs +1 dòng mỗi lần in.
