# P8 — Tối ưu tải & chi phí (thiết kế)

> Lập 24/09/2026. Mục tiêu quy mô: **10–20 quán trong 12 tháng**. Hiện có **1 quán chạy thật**
> (qt-food) và **chưa có số liệu** tải/chi phí nào.
> Liên quan: `15-QuyetDinh/QD-013` (§3 chốt chặn lệch schema), `30-KeHoach/P7`.

## Vấn đề

Rà 23/09/2026 cho thấy hệ thống tiêu tài nguyên theo cách nhân lên với số quán và số thiết bị,
chứ không theo số việc thật sự phải làm.

Đo trên code hiện tại, một quán 4 máy POS + 1 KDS:

| Nguồn | Lượng |
|---|---|
| Một sự kiện đơn/món → mỗi thiết bị render lại toàn trang POS | 5 × ~11 truy vấn = **55 truy vấn** |
| Cầu in poll, kể cả lúc quán đóng cửa | **1.800 request/giờ/quán** |
| `broadcastOrderStatus` mở + đóng một WebSocket, chờ tới 3s | **mỗi lần** đổi trạng thái |

Riêng mục cuối không phải chuyện của lúc đông: hai chỗ gọi nó trong vòng lặp tuần tự
(`pos/actions.ts:1076`, `lib/billing/bill.ts:597`), nên đóng một bill gộp 5 đơn có thể mất tới
**15 giây** — phá thẳng cam kết BILL-04 "đóng bill ≤5s", ngay hôm nay, với một quán.

## Nguyên tắc của giai đoạn này

**Chưa đo thì chưa sửa thứ chưa biết có đau không.** Với 1 quán thật và 0 số liệu, tối ưu theo
phỏng đoán là cách chắc chắn nhất để bỏ công vào chỗ không đau. Nên P8 chỉ nhận hai loại việc:

1. **Lãng phí cấu trúc** — nhìn vào code là biết thừa, không cần số liệu nào để biện minh.
2. **Đo lường** — sinh ra số để quyết việc lớn tiếp theo.

Mọi thứ còn lại chờ số.

## Phạm vi

### P8-01 — Gỡ WebSocket churn trong `broadcastOrderStatus`

`lib/orders/broadcast.ts` hiện mở một kênh Realtime mới, `subscribe`, chờ `SUBSCRIBED` (guard
timeout 3s), gửi, rồi `removeChannel` — cho **mỗi** lần đổi trạng thái.

Thay bằng **REST broadcast endpoint** của Realtime:
`POST {SUPABASE_URL}/realtime/v1/api/broadcast`, body `{ messages: [{ topic, event, payload }] }`.

Đã kiểm thật 24/09/2026 trên chính project này:

- Gửi 2 message trong **một** request: HTTP `202`, **305ms**.
- Client `supabase-js` đang `channel('order:<id>')` nhận được sau **281ms**, payload nguyên vẹn.

Nghĩa là không phải đổi gì phía client — `ORDER_CHANNEL` và event `status` giữ nguyên.

Hai chỗ gọi trong vòng lặp gộp thành **một** request nhiều message.

**Giữ nguyên:** chữ ký `broadcastOrderStatus(orderId)` và `OrderStatusPayload`, để 9 lối gọi không
phải đổi. Thêm `broadcastOrderStatuses(orderIds: string[])` cho hai chỗ vòng lặp.

### P8-02 — POS thôi nạp lại thực đơn mỗi lần refresh

`app/r/[slug]/pos/page.tsx` gọi `getCustomerMenu(slug)` trong mọi lần render, mà mỗi sự kiện
realtime lại kích một lần render (debounce 400ms). Thực đơn thì gần như không đổi trong ca.

Bọc phần đọc thực đơn bằng `unstable_cache` gắn tag `menu:<tenantId>`, và `revalidateTag` ở **mọi**
lối ghi thực đơn. Các lối đó đã tập trung sẵn:

- `app/r/[slug]/admin/(protected)/menu/actions.ts` (danh mục, món, ảnh, sắp xếp)
- `app/r/[slug]/admin/(protected)/menu/modifiers/actions.ts` (nhóm tùy chọn, option)
- `setItemAvailable` ở `app/r/[slug]/pos/actions.ts` (bật/tắt "hết món" từ POS — MENU-04)
- `app/r/[slug]/admin/(protected)/onboarding/actions.ts` (seed thực đơn mẫu)

**Rủi ro chính là sót một lối ghi** → nhân viên tắt "hết món" mà khách vẫn đặt được. Vì vậy tiêu
chí nghiệm thu bắt buộc phủ **từng** lối ghi ở trên, không chỉ lối phổ biến nhất.

### P8-03 — Cầu in nhịp thích ứng

`scripts/print-bridge.mjs` poll cố định `POLL_MS=2000`, kể cả 3 giờ sáng.

Đổi thành bậc thang cố định, không có tham số nào phải chỉnh tay:

| Số nhịp rỗng liên tiếp | Nhịp poll |
|---|---|
| 0–4 | 2 giây (như hiện tại) |
| 5–14 | 5 giây |
| ≥ 15 | 10 giây (trần) |

Tìm thấy bất kỳ phiếu nào → đếm về 0, nhịp về ngay 2 giây.

Trần 10 giây là cố ý thấp: phiếu bếp nhạy thời gian, tiết kiệm thêm vài request không đáng đổi lấy
việc bếp chờ nửa phút. Ở nhịp trần, tải giảm còn 1/5 (1.800 → 360 request/giờ/quán) trong phần lớn
thời gian trong ngày, mà độ trễ xấu nhất chỉ tăng 8 giây ở phiếu đầu tiên sau kỳ vắng.

### P8-04 — Đo lường theo tenant

Chưa có gì để biết quán nào tốn, giờ nào tốn, và hướng C (viết lại realtime, bỏ `router.refresh()`)
có đáng hay không.

Thêm **log có cấu trúc**, không thêm hạ tầng:

- Ở `middleware.ts`: một dòng JSON mỗi request — `tenant_slug`, `path`, `ms`, `status`.
- Ở `getPosSnapshot` và `getCustomerMenu`: đo và ghi thời lượng.

Không dựng dashboard, không thêm dịch vụ. Log của Vercel đủ để trả lời ba câu: quán nào nhiều
request nhất, đường nào chậm nhất, và **số lần render POS mỗi giờ** — con số quyết định hướng C.

Không ghi dữ liệu cá nhân, không ghi nội dung đơn. Chỉ slug, đường dẫn, thời lượng.

### P8-05 — Chốt chặn lệch schema trong CI

QD-013 §3 đã hứa. Không có nó, quy tắc "chép thay đổi SQL editor thành migration" chỉ là lời hứa —
và ngày 23–24/09 đã mất nửa ngày vì đúng chuyện đó.

Thêm một job CI: dựng Postgres sạch từ `supabase/migrations/`, chạy `supabase db diff` với
production, khác nhau thì **CI đỏ** kèm diff.

Đây không phải tối ưu tải, nhưng thuộc cùng nhóm "chi phí vận hành" và rẻ hơn nhiều so với lần sau
phải đi truy lại bằng tay.

## Ngoài phạm vi (cố ý)

| Mục | Vì sao hoãn |
|---|---|
| Viết lại realtime, bỏ `router.refresh()` (hướng C) | Chạm sâu `PosBoard`/`KdsBoard` — hai bề mặt qt-food dùng thật hằng ngày, hỏng là quán đứng giữa ca. **Quyết sau khi P8-04 có số.** |
| Rate limit endpoint ẩn danh | Chưa đo thì không biết đặt ngưỡng nào; chưa có dấu hiệu bị lạm dụng. Đặt ngưỡng sai sẽ chặn khách thật. |
| `findAuthUserByEmail` quét tuyến tính | Chỉ chạy lúc tạo tenant. Sửa khi nào chạm tới file đó. |
| Gói cước SaaS | Đã hoãn sang V3 (`50-PhienBan/V2-KeHoach.md`). |

## Cách biết P8 thành công

Không phải "code xong" mà là **đo được**:

1. Đóng bill gộp 5 đơn: thời gian trước/sau P8-01, phải **≤5s** (BILL-04).
2. Số truy vấn mỗi lần render POS: trước/sau P8-02.
3. Request/giờ của cầu in lúc quán vắng: trước/sau P8-03.
4. Sau 2 tuần chạy P8-04: trả lời được "POS render bao nhiêu lần mỗi giờ cao điểm" — và từ đó chốt
   hướng C làm hay không.
5. CI đỏ khi cố tình tạo một object trên DB test mà không có migration (đối chứng âm cho P8-05).

Mục 4 là mục quan trọng nhất. P8 không kết thúc bằng "đã tối ưu" mà bằng **"đã biết cái gì đáng
tối ưu tiếp"**.

## Rủi ro đã biết

| Rủi ro | Xử lý |
|---|---|
| P8-02 sót lối ghi → khách đặt được món đã hết | Nghiệm thu phủ **từng** lối ghi đã liệt kê, không chỉ lối phổ biến |
| P8-01 đổi cơ chế gửi → khách không nhận được trạng thái | Đã kiểm đầu-cuối trước khi thiết kế (202 + client nhận sau 281ms); thêm test giữ tính chất này |
| P8-03 làm phiếu bếp chậm sau kỳ vắng | Trần 10 giây, không giãn hơn |
| P8-04 log phình ra tiền | Chỉ 1 dòng/request, không ghi payload; xem lại sau 2 tuần |
| P8-05 cần secrets CI chưa cấu hình | Nếu thiếu secrets thì job skip (như bước RLS hiện tại), không làm CI đỏ giả |
