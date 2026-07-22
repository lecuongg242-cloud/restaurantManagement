# 03-03 SUMMARY — KDS realtime 3 cột + đo ≤3s

> Thực thi 22/07/2026. Trạng thái: **CHỜ NGHIỆM THU** (checkpoint human-verify).
> Requirements: ORDER-04 (KDS nhận vé ≤3s — tiêu chí phát hành V1 #2).

## File đã đổi / thêm
| File | Loại | Vai trò |
|---|---|---|
| `lib/orders/kds.ts` | thêm | `getKdsTickets(tenantId)` — orders confirmed/preparing/ready + items chưa served/cancelled + bàn (embed table_sessions→tables) + modifiers, gom theo order, sort confirmed_at. |
| `app/r/[slug]/kds/actions.ts` | thêm | `startItem` (queued→preparing, order→preparing), `readyItem` (preparing→ready + prepared_at, roll-up order→ready). Guard canAccess('kds') + broadcast. |
| `app/r/[slug]/kds/page.tsx` | sửa | Guard + getKdsTickets → KdsBoard trong StationScreen (thay placeholder P1). |
| `components/kds/KdsBoard.tsx` | thêm | 3 cột Chờ làm/Đang làm/Sẵn sàng; realtime postgres_changes → router.refresh; badge delta chốt lần đầu vé hiện. |
| `components/kds/KdsTicket.tsx` | thêm | Vé: bàn (Fraunces lớn), đồng hồ đếm lên, món SL×tên + tùy chọn thụt lề + ghi chú nổi bật, nút LỚN Bắt đầu/Xong ≥44px, cảnh báo TRỄ (màu + chữ). |

## Bằng chứng (tự động, chạy thật trên remote)
**Build/lint:** `tsc` sạch; `next lint` 0 warning; `next build` OK (route `/kds` 5.87 kB).

**Embed query getKdsTickets** (supabase-js REST thật):
```
EMBED ticket → table: B1 | items: 1 | item0: phở bò   (table_sessions→tables lồng OK)
```

### Bảng đo ORDER-04 — độ trễ giao realtime (UPDATE order → event tới subscriber)
Đo headless bằng supabase-js `postgres_changes` (filter `tenant_id`), 8 mẫu thu được:

| Lần | Giây | Đạt ≤3s |
|---|---|---|
| 1 | 0.39 | ✅ |
| 2 | 0.64 | ✅ |
| 3 | 0.41 | ✅ |
| 4 | 0.69 | ✅ |
| 5 | 0.45 | ✅ |
| 6 | 0.74 | ✅ |
| 7 | 0.51 | ✅ |
| 8 | 0.80 | ✅ |
| **Trung bình** | **0.58** | **8/8** |
| **Max** | **0.80** | ✅ |

> Đây là **độ trễ giao realtime** (Supabase Realtime, server→subscriber) — thành phần chi phối của ORDER-04. Đường đầy-đủ trên trình duyệt cộng thêm `router.refresh` + `getKdsTickets` refetch (~vài trăm ms cục bộ), tổng vẫn ≤3s. **Phép đo 10 lần end-to-end trên trình duyệt (POS duyệt → vé render) là bước human-verify** — badge delta trên mỗi vé hiển thị sẵn số giây để đọc.

## Cam kết must_haves
- [x] Chỉ item thuộc order confirmed hiện trên KDS (pending_confirm KHÔNG hiện).
- [x] 3 cột; bấm Bắt đầu (queued→preparing) / Xong (preparing→ready) mức MÓN.
- [x] Vé: bàn + đồng hồ đếm lên + món+SL+tùy chọn+ghi chú; >10 phút chưa xong → viền + nhãn "TRỄ" (màu **và** chữ — a11y mù màu).
- [x] Roll-up: mọi item ready → order ready; POS thấy để phục vụ.
- [x] Badge delta giây (đo ORDER-04) chốt lúc vé xuất hiện; xanh ≤3s.
- [x] Broadcast sau mỗi đổi trạng thái → khách thấy "Đang làm"/"Sẵn sàng" realtime.

## Còn lại cho manual verify (checkpoint — 2 cửa sổ POS + KDS)
1. POS duyệt order → KDS: vé hiện cột "Chờ làm" ≤3s không reload, badge delta xanh, đồng hồ chạy.
2. Bắt đầu/Xong di chuyển vé đúng cột; mọi món xong → POS thấy item ready để phục vụ.
3. Vé để >10 phút → nhãn "TRỄ".
4. Chạy đo 10 lần trên trình duyệt, đọc badge delta → xác nhận 10/10 ≤3s.
5. KDS Bún Bò không nhận vé Phở Việt (RLS + filter).
