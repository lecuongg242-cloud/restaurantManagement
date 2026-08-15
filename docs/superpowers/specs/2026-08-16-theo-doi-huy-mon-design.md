# Thiết kế — Theo dõi & thống kê hủy món

> Ngày 16/08/2026 · Yêu cầu mới: ORDER-17, ORDER-18, REPORT-10, BILL-06 · Hoàn thiện: ORDER-05
> Bề mặt: `/r/[slug]/pos` (tab "Đã xong"), `/r/[slug]/admin/reports`

## 1. Bối cảnh & vấn đề

Luồng hủy hiện đã **kiểm soát chặt**: bắt buộc lý do, nhân viên thường phải có manager/cashier nhập PIN duyệt, ghi `cancel_reason` + `cancelled_by` vào DB ([`cancelOrderItem`](../../../app/r/[slug]/pos/actions.ts), [`cancelOrder`](../../../app/r/[slug]/pos/actions.ts)).

Nhưng **dữ liệu ghi ra rồi không ai đọc lại được**:

**(a) Lịch sử POS không hiện lý do và người hủy.** `ONLINE_ORDER_SELECT` không select `cancel_reason`/`cancelled_by`, type `OnlineOrderItem` cũng không có trường đó. Món hủy chỉ gạch ngang. Trong khi panel bàn dine-in thì có hiện `Đã hủy · <lý do>` — cùng một dữ liệu, một bề mặt hiện một bề mặt không.

**(b) Không lọc được đơn hủy, và con số tổng kết trộn mẫu số.** Tab "Đã xong" gộp chung `completed` + `cancelled` không có chip lọc. `orderCount` đếm cả hai trạng thái trong khi `paidTotal` chỉ cộng bill `paid` → "20 đơn · 4.500.000đ" thực chất có thể là 17 đơn thu tiền + 3 đơn hủy.

**(c) Admin không có gì.** `lib/billing/reports.ts` có **0 tham chiếu** tới `cancel`. Đơn dine-in bị hủy, phiên bàn đóng là mất dấu hoàn toàn — POS chỉ có lịch sử cho `channel='takeaway'`.

**(d) Không có mốc thời gian hủy.** `order_items` và `orders` đều **không có cột `cancelled_at`**. Không có mốc này thì không thống kê theo kỳ được.

**(e) Lỗi tính tiền: hủy món sau khi mở hóa đơn không trừ tiền.** Với đơn **tại bàn**, `cancelOrderItem` không đụng tới `bills`/`bill_items`, và `openBillForSession` khi gọi lại chỉ *thêm* món chưa phân bổ chứ không *xóa* món đã hủy. Bill `open` vẫn tính tiền món đã hủy. Luồng đơn nhóm mang về đã xử lý đúng qua `syncGroupBillItems` — chỉ dine-in thiếu.

Spec báo cáo trước ([2026-08-12](2026-08-12-bao-cao-dong-tien-nang-cap-design.md)) đã liệt kê "món bị hủy" vào mục *Không làm (đợt sau)*. Đây là đợt sau đó.

## 2. Phạm vi

**Làm:**

| ID | Yêu cầu | Tiêu chí đo được |
|---|---|---|
| ORDER-17 | Lịch sử POS hiện lý do + người hủy | Mở tab "Đã xong" → đơn/món hủy hiện `Đã hủy HH:MM · "<lý do>" · <tên> (<vai trò>)` |
| ORDER-18 | Lọc đơn hủy + tách con số tổng kết | Chip **Tất cả / Đã thu / Đã hủy** lọc ở server; tổng kết hiện `<N> đơn đã thu · <tiền>` và `<M> đơn hủy` tách riêng |
| REPORT-10 | Khối "Món bị hủy" ở `/admin/reports` | 3 KPI (số món · giá trị · tỷ lệ %) kèm biến động kỳ trước + bảng theo người duyệt + bảng top món + danh sách chi tiết phân trang; **gồm cả dine-in và mang về** |
| BILL-06 | Hủy món trừ đúng tiền trên hóa đơn đang mở | Bàn có bill `open`, hủy 1 món → tổng bill giảm đúng bằng tiền món đó; bill hết món thì bị xóa, bàn về "chưa có hóa đơn" |
| ORDER-05 | (hoàn thiện) Hủy/sửa món có kiểm soát — **có log** | Phần "kiểm soát" đã xong từ P3; ORDER-17/18 + REPORT-10 đóng phần "có log" |

**Không làm:**
- Đổi ô "lý do hủy" từ nhập tự do sang danh sách chọn sẵn → **không có** khối thống kê gom nhóm theo lý do (lý do tự do gần như không trùng nhau, gom lại vô nghĩa).
- Lịch sử đơn **dine-in** trên POS (dine-in xem ở `/admin/reports`).
- Trang admin riêng cho hủy món — nội dung nằm trong `/admin/reports`.
- Xuất CSV, cảnh báo tự động khi tỷ lệ hủy vượt ngưỡng.

## 3. Quyết định thiết kế

### 3.1 Mốc thời gian: thêm cột `cancelled_at`

Chọn **thêm cột** thay vì mượn `created_at` của món. Lý do: `created_at` là lúc *gọi* món, không phải lúc *hủy* — đơn gọi 23:50 hủy 00:10 sẽ rơi nhầm sang ngày hôm trước, và vĩnh viễn không làm được phân tích "hủy vào giờ nào" hay "hủy sau bao lâu kể từ lúc gọi".

Backfill dữ liệu cũ:
- `orders.cancelled_at ← updated_at`. Chính xác: `cancelled` là trạng thái kết thúc (`ORDER_FLOW.cancelled = []`), không còn transition nào sau đó nên `updated_at` chính là lúc hủy.
- `order_items.cancelled_at ← created_at`. **Xấp xỉ** — không có mốc nào tốt hơn. Ghi rõ trong comment migration để sau này không ai đọc nhầm số liệu cũ.

### 3.2 Tra tên người duyệt hủy: map ở tầng app, không thêm FK

`order_items.cancelled_by` là `uuid` **không có FK** sang `memberships`. Không thêm FK vì dữ liệu cũ có thể chứa id của membership đã bị xóa → migration sẽ fail giữa chừng. Thay vào đó query `memberships` của tenant (vài chục dòng, rẻ) rồi map `id → {display_name, role}` trong JS. Không tra được thì hiện `—`, không vỡ trang.

Hệ quả: RPC `report_cancel_*` dùng `left join memberships` — không phải `inner join` — để lượt hủy có `cancelled_by` mồ côi vẫn xuất hiện trong thống kê.

### 3.3 Lọc chạy ở server, không lọc trong trang đã tải

Chip "Đã hủy" phải thành tham số của `listTakeawayHistory` chứ không phải `.filter()` trên mảng đã tải. Lọc ở client thì đơn hủy nằm ngoài trang 20 sẽ biến mất — đúng cái lỗi mà phần tìm kiếm đã từng mắc và đã sửa (xem comment "Trước đây lọc ở client trong tập đã tải nên đơn nằm ngoài trần bị báo *không thấy* dù có thật").

### 3.4 Tổng hợp bằng RPC SQL, không fetch rồi cộng trong JS

Theo đúng quy ước đã lập ở `0023_report_rpcs.sql`: PostgREST giới hạn 1000 dòng/request, cộng trong JS sẽ báo thiếu ở tenant đông khách. Mọi `SUM`/`GROUP BY` nằm trong Postgres, `security invoker` để RLS tenant vẫn áp dụng.

### 3.5 "Giá trị món hủy" KHÔNG phải "doanh thu mất"

Khách hủy phở 50.000đ rồi gọi bún 55.000đ thì quán không mất đồng nào. Con số này là **chỉ số kiểm soát vận hành**, không phải khoản lỗ. Ghi chú thẳng dưới KPI để chủ quán không trừ nhầm vào doanh thu.

### 3.6 BILL-06: chỉ đụng bill `open`, không đụng bill `paid`

Khi tách hóa đơn theo món, một `order_item` có thể có `bill_items` nằm ở nhiều bill với `qty_allocated` khác nhau — phần đã `paid` là tiền đã thu thật, **không được xóa**. Quy tắc an toàn: chỉ xóa `bill_items` thuộc bill `status='open'`, rồi `recomputeBill` các bill đó.

Bill `open` sau khi xóa mà **không còn dòng nào** và **chưa có payment nào** thì xóa luôn bill — để bàn về trạng thái "chưa có hóa đơn" thay vì treo một hóa đơn 0đ vô nghĩa. Có tiền lệ: `mergeSessionsIntoBill` đã xóa bill `open` theo cách này.

Không cần lo trường hợp bill `paid`: khi thu đủ tiền, `payBill` đánh dấu món `served`, mà `served` thì `cancelOrderItem` đã chặn từ đầu.

## 4. Lớp dữ liệu — `supabase/migrations/0027_cancel_tracking.sql`

### 4.1 Cột + index

```sql
alter table public.order_items add column if not exists cancelled_at timestamptz;
alter table public.orders      add column if not exists cancelled_at timestamptz;

update public.orders
   set cancelled_at = updated_at
 where status = 'cancelled' and cancelled_at is null;

-- XẤP XỈ: order_items không có updated_at. Mốc này là lúc GỌI món, không phải lúc hủy.
-- Chỉ áp dụng cho dữ liệu có trước migration này.
update public.order_items
   set cancelled_at = created_at
 where status = 'cancelled' and cancelled_at is null;

create index if not exists idx_order_items_cancelled
  on public.order_items (tenant_id, cancelled_at)
  where status = 'cancelled';
```

### 4.2 RPC

Cùng khuôn `0023`: `language sql`, `stable`, `security invoker`, `set search_path = public`, lọc `tenant_id = p_tenant` tường minh, khoảng nửa mở `[p_from, p_to)` trên `cancelled_at`. **Không lọc `channel`** → gồm cả dine-in lẫn mang về.

| Hàm | Trả về |
|---|---|
| `report_cancel_summary(p_tenant, p_from, p_to)` | `cancelled_qty bigint, cancelled_amount bigint, ordered_qty bigint` |
| `report_cancel_by_actor(p_tenant, p_from, p_to)` | `membership_id uuid, display_name text, role text, cnt bigint, qty bigint, amount bigint` |
| `report_cancel_top_items(p_tenant, p_from, p_to, p_limit int)` | `name text, qty bigint, amount bigint` |
| `report_cancel_list(p_tenant, p_from, p_to, p_limit int, p_offset int)` | `cancelled_at timestamptz, place text, item_name text, qty int, amount bigint, reason text, actor_name text` |

Ghi chú:
- `cancelled_amount` = `sum(unit_price_snapshot * qty)`.
- `ordered_qty` = tổng `qty` của **mọi** `order_items` có `created_at` trong kỳ (mẫu số của tỷ lệ %). Dùng `created_at` chứ không `cancelled_at` vì đây là "đã gọi bao nhiêu món trong kỳ".
- `place` = `'Bàn ' || t.name` khi lần được `table_sessions → tables`, ngược lại `'Đơn #' || o.kitchen_no`, cuối cùng `'—'`.
- `report_cancel_list` sắp xếp `cancelled_at desc`.

## 5. Lớp ứng dụng

### 5.1 Ghi `cancelled_at` (4 chỗ)

| File | Hàm | Sửa |
|---|---|---|
| `app/r/[slug]/pos/actions.ts` | `cancelOrderItem` | thêm `cancelled_at: now` vào update `order_items` |
| `app/r/[slug]/pos/actions.ts` | `cancelOrder` | thêm vào cả update `order_items` lẫn update `orders` |
| `app/r/[slug]/pos/actions.ts` | `rejectOrder` | thêm vào cả hai update |
| `lib/orders/online.ts` | `rejectOnlineOrder` | thêm vào update `orders` |

Roll-up trong `cancelOrderItem` (mọi món hủy → order `cancelled`) cũng phải set `cancelled_at`.

### 5.2 ORDER-17 — lý do + người hủy ở lịch sử POS

| File | Thay đổi |
|---|---|
| `lib/orders/online.ts` | `ONLINE_ORDER_SELECT` thêm `cancel_reason, cancelled_at` (mức order) và `cancel_reason, cancelled_by, cancelled_at` (mức `order_items`) |
| `lib/orders/online.ts` | `OnlineOrderItem` thêm `cancelReason \| null`, `cancelledBy \| null`, `cancelledAt \| null`; `OnlineOrderView` thêm `cancelReason \| null`, `cancelledAt \| null` |
| `lib/orders/online.ts` | `TakeawayHistoryPage` thêm `actors: { id, name, role }[]` — query `memberships` của tenant |
| `components/pos/TakeawayHistory.tsx` | `HistoryLines` nhận `actorById` map; món hủy hiện thêm dòng đỏ |

Định dạng dòng hủy — thống nhất với panel bàn dine-in:

```
1× Phở ngựa tái + lòng                              50.000đ
   Đã hủy 20:15 · "khách đổi ý" · Hoàng (Quản lý)
```

Đơn bị hủy cả đơn: `orders.cancel_reason` hiện một dòng ngay dưới badge "Đã hủy" ở đầu thẻ, không lặp lại ở từng món (cùng một lý do).

### 5.3 ORDER-18 — chip lọc + tách con số

`listTakeawayHistory` thêm tham số `opts.status?: "all" | "paid" | "cancelled"` (mặc định `"all"`), áp vào cả truy vấn trang lẫn `takeawayHistorySummary`:
- `"paid"` → `.eq("status", "completed")`
- `"cancelled"` → `.eq("status", "cancelled")`
- `"all"` → giữ nguyên `.in("status", ["completed", "cancelled"])`

Kiểu tổng kết đổi hình:

```diff
- type TakeawayHistorySummary = { orderCount, paidTotal, paidTotalCapped }
+ type TakeawayHistorySummary = { paidCount, cancelledCount, paidTotal, paidTotalCapped }
```

`takeawayHistorySummary` chạy **2** truy vấn `count: exact, head: true` (một cho `completed`, một cho `cancelled`) thay vì 1. Vẫn không kéo dòng nào về nên không đụng giới hạn aggregate bị tắt (PGRST123).

UI: hàng chip thứ hai dưới hàng chip ngày — **Tất cả · Đã thu · Đã hủy**, dùng lại helper `chip()` sẵn có. Đổi chip → reset phân trang, tải lại từ trang đầu. Tổng kết hiện `17 đơn đã thu · 4.500.000đ` + `3 đơn hủy` (chữ đỏ, tách riêng).

### 5.4 REPORT-10 — khối "Món bị hủy"

| File | Thay đổi |
|---|---|
| `lib/billing/reports.ts` | thêm type `CancelSummary`, `CancelActorSlice`, `CancelItemSlice`, `CancelRow`, `CancellationData`; thêm `getCancellationData(tenantId, range)` gọi 4 RPC song song |
| `lib/billing/reports.ts` | `getComparison` gọi thêm `report_cancel_summary` với `prevRange` → `ComparisonData` thêm `cancel: CancelSummary` |
| `app/r/[slug]/admin/(protected)/reports/page.tsx` | thêm section cuối trang, dùng lại `RangePicker` sẵn có |
| `components/admin/reports/CancellationPanel.tsx` | **mới** — 3 KPI + 2 bảng + danh sách chi tiết |

Bố cục:

```
MÓN BỊ HỦY
┌──────────────┬──────────────┬──────────────┐
│ 12 món hủy   │   640.000đ   │     2,4%     │
│ ▲ +3 kỳ trước│ ▲ +180.000đ  │ ▼ -0,6 điểm  │
└──────────────┴──────────────┴──────────────┘
Giá trị món bị hủy, không phải doanh thu mất — khách hủy món này
thường gọi món khác thay thế.

Theo người duyệt          Món bị hủy nhiều nhất
Hoàng (Quản lý) 7 · 380.000   Phở bò tái   4 · 200.000
Lan (Thu ngân)  5 · 260.000   Cơm gà       3 · 135.000

Chi tiết
20:15  Bàn 4      Phở bò tái  1  50.000đ  "khách đổi ý"   Hoàng
19:42  Đơn #112   Cơm gà      2  90.000đ  "gọi nhầm bàn"  Lan
                                              [ Tải thêm ]
```

- Tỷ lệ % = `cancelled_qty / ordered_qty`, giữ **2 chữ số thập phân** (nhất quán với sửa gần đây ở phần tỷ trọng báo cáo). Biến động của tỷ lệ tính bằng **điểm phần trăm**, không phải %.
- `ordered_qty = 0` → hiện `—`, không chia cho 0.
- Danh sách chi tiết: 20 dòng/lần, nút "Tải thêm" dùng `p_offset`.
- Quyền: dùng nguyên `canManage(session.role, "reports")` của trang — manager/owner.
- Kỳ không có lượt hủy nào → hiện trạng thái rỗng "Kỳ này không có món nào bị hủy.", không hiện bảng trống.

### 5.5 BILL-06 — trừ tiền hóa đơn khi hủy món

Hàm mới trong `lib/billing/bill.ts`:

```ts
/**
 * Gỡ các order_item vừa bị hủy khỏi mọi hóa đơn ĐANG MỞ rồi tính lại tổng.
 * Không đụng bill 'paid' — phần đã thu là tiền thật (bill tách theo món có thể
 * đã thu một phần qty). Bill mở mà hết sạch dòng và chưa có payment thì xóa luôn.
 */
export async function dropCancelledItemsFromOpenBills(
  tenantId: string,
  orderItemIds: string[]
): Promise<void>
```

Các bước: select `bill_items` (join `bills!inner(status)` = `'open'`) theo `order_item_id in (...)` → delete → `recomputeBill` từng `bill_id` bị ảnh hưởng → bill nào còn 0 dòng và 0 payment thì delete bill.

Gọi từ `cancelOrderItem` (1 id) và `cancelOrder` (mọi id vừa hủy), **sau** khi update `order_items` thành công và **trước** `revalidatePath`. Lỗi ở bước này chỉ log, không làm hỏng thao tác hủy — món đã hủy là sự thật vận hành, hóa đơn lệch có thể sửa lại bằng lần mở bill sau.

## 6. Kiểm thử

**Unit (`vitest`)**
- `tests/billing/cancel-report.test.ts` — tỷ lệ % (gồm mẫu số 0), quy đổi điểm phần trăm cho biến động, map `cancelled_by → tên` khi id mồ côi.
- `tests/orders/takeaway-history-filter.test.ts` — `status` filter sinh đúng truy vấn; `paidCount`/`cancelledCount` tách đúng.
- `tests/billing/cancel-bill-sync.test.ts` — `dropCancelledItemsFromOpenBills`: chỉ xóa dòng của bill `open`, giữ nguyên dòng của bill `paid`, xóa bill khi rỗng, giữ bill khi đã có payment.

**Thủ công trên tenant dev (bằng chứng: ảnh chụp)**
1. Bàn 4 gọi 2 món → mở hóa đơn → hủy 1 món → tổng bill giảm đúng (BILL-06).
2. Đơn mang về hủy cả đơn → tab "Đã xong" → chip "Đã hủy" → thấy lý do + tên người duyệt (ORDER-17, ORDER-18).
3. `/admin/reports` chọn "Hôm nay" → khối "Món bị hủy" khớp đúng số lượt vừa tạo, gồm cả lượt dine-in ở bước 1 (REPORT-10).
4. Đối chiếu DB: `select count(*) from order_items where status='cancelled' and cancelled_at >= <đầu ngày VN>` khớp KPI.

**Kiểm tra migration**: chạy `0027` trên dev, xác nhận backfill không để `cancelled_at IS NULL` ở bất kỳ dòng `cancelled` nào.

## 6b. Cập nhật tài liệu

Thêm 4 dòng ORDER-17, ORDER-18, REPORT-10, BILL-06 vào `docs/20-DanhSachYeuCau/00-Requirements.md` (bảng yêu cầu đo được — theo quy trình VibeCode, phải có trước khi code), và cập nhật trạng thái ORDER-05 từ ☐ sang ✔ khi cả bốn hoàn tất.

## 7. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Backfill `order_items.cancelled_at` sai lệch với thực tế | Comment rõ trong migration; số liệu trước 16/08/2026 chỉ dùng để tham khảo |
| `cancelled_by` mồ côi (membership đã xóa) | `left join`, hiện `—`; không thêm FK |
| Khối mới làm trang báo cáo chậm thêm | 4 RPC chạy song song trong cùng `Promise.all` với các RPC sẵn có; có index riêng cho `cancelled_at` |
| `dropCancelledItemsFromOpenBills` xóa nhầm dòng đã thu | Chỉ lọc bill `status='open'`; có unit test cho ca bill tách một phần đã `paid` |
