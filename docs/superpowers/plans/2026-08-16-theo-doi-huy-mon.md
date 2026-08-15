# Theo dõi & thống kê hủy món — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dữ liệu hủy món đã ghi vào DB (lý do, người duyệt) phải đọc lại được — trên lịch sử POS, và tổng hợp thành thống kê ở `/admin/reports` gồm cả đơn tại bàn; đồng thời hủy món phải trừ đúng tiền trên hóa đơn đang mở.

**Architecture:** Thêm cột `cancelled_at` làm mốc thời gian cho mọi thống kê (migration `0027`). Tổng hợp bằng RPC SQL (migration `0028`) theo đúng khuôn `0023_report_rpcs.sql` — PostgREST cắt 1000 dòng nên không được cộng trong JS. Mọi logic quyết định được tách thành **hàm thuần** trong `lib/` để unit test được (theo khuôn `lib/billing/split.ts` đã có: `planSplitByItems` thuần, `bill.ts` lo IO); tầng IO chỉ gọi hàm thuần rồi thực thi.

**Tech Stack:** Next.js App Router (server actions), Supabase Postgres + PostgREST, TypeScript, Tailwind (design tokens dự án), Vitest.

**Spec:** [docs/superpowers/specs/2026-08-16-theo-doi-huy-mon-design.md](../specs/2026-08-16-theo-doi-huy-mon-design.md)

## Global Constraints

- **UI tiếng Việt, code tiếng Anh** (tên biến/hàm/commit). Comment giải thích *tại sao*, tiếng Việt — theo văn phong file xung quanh.
- **Multi-tenant:** mọi truy vấn lọc `tenant_id` tường minh. RPC dùng `security invoker` (KHÔNG `security definer`, KHÔNG `service_role`) để RLS tenant vẫn áp dụng.
- **Mốc thời gian:** ngày Việt Nam, khoảng nửa mở `[from, to)`. Trong SQL dùng `at time zone 'Asia/Ho_Chi_Minh'`, không cộng `+7h` thủ công.
- **Không cộng dồn trong JS** những gì có thể `SUM`/`GROUP BY` trong Postgres — PostgREST trả tối đa 1000 dòng/request.
- **Không dùng hàm tổng hợp của PostgREST** (`select=count()`, `sum()`): project này tắt chúng (PGRST123). Đếm bằng `{ count: "exact", head: true }`.
- **Tỷ lệ phần trăm giữ 2 chữ số thập phân**, dấu phẩy thập phân kiểu Việt (`2,40%`) — nhất quán với `formatShare` trong `lib/billing/report-format.ts`.
- **Test chỉ viết cho hàm thuần.** Codebase không có hạ tầng mock Supabase; đừng dựng mới. Phần IO kiểm bằng bước thủ công có ảnh chụp.
- Chạy test: `npm test` (vitest run). Chạy một file: `npx vitest run tests/<path>.test.ts`.
- **Không sửa file migration đã áp dụng.** Mỗi task cần schema mới thì thêm file mới.

## File Structure

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/0027_cancel_tracking.sql` | **Tạo** — cột `cancelled_at` + backfill + index |
| `supabase/migrations/0028_cancel_report_rpcs.sql` | **Tạo** — 4 RPC tổng hợp hủy |
| `lib/billing/cancel-cleanup.ts` | **Tạo** — hàm thuần: dòng bill nào phải xóa/tính lại/xóa hẳn |
| `lib/orders/cancel-label.ts` | **Tạo** — hàm thuần: dựng chuỗi "Đã hủy 20:15 · …" |
| `lib/orders/history-filter.ts` | **Tạo** — hàm thuần: chip lọc → danh sách trạng thái |
| `lib/billing/cancel-format.ts` | **Tạo** — hàm thuần: tỷ lệ hủy %, biến động theo điểm |
| `components/admin/reports/CancellationPanel.tsx` | **Tạo** — khối "Món bị hủy" |
| `app/r/[slug]/pos/actions.ts` | Sửa — ghi `cancelled_at`; gọi dọn bill; tham số `status` |
| `lib/orders/online.ts` | Sửa — select thêm cột hủy, types, `actors`, lọc theo trạng thái |
| `lib/billing/bill.ts` | Sửa — thêm `dropCancelledItemsFromOpenBills` |
| `lib/billing/reports.ts` | Sửa — `getCancellationData`, mở rộng `getComparison` |
| `components/pos/TakeawayHistory.tsx` | Sửa — dòng lý do hủy, chip lọc, tổng kết tách |
| `app/r/[slug]/admin/(protected)/reports/page.tsx` | Sửa — thêm section |
| `docs/20-DanhSachYeuCau/00-Requirements.md` | Sửa — 4 dòng yêu cầu mới |

**Lệch so với spec (có chủ đích):** spec ghi "migration 0027" cho cả cột lẫn RPC. Kế hoạch tách thành `0027` (cột) + `0028` (RPC) để Task 1 áp lên dev xong không phải sửa lại file đã chạy khi tới Task 5.

---

### Task 1: Mốc thời gian hủy — cột `cancelled_at`

**Files:**
- Create: `supabase/migrations/0027_cancel_tracking.sql`
- Modify: `app/r/[slug]/pos/actions.ts` (`rejectOrder`, `cancelOrderItem`, `cancelOrder`)
- Modify: `lib/orders/online.ts` (`rejectOnlineOrder`)

**Interfaces:**
- Consumes: —
- Produces: cột `public.order_items.cancelled_at timestamptz`, `public.orders.cancelled_at timestamptz`, index `idx_order_items_cancelled`. Mọi task sau đọc `cancelled_at` để lọc kỳ.

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/0027_cancel_tracking.sql`:

```sql
-- 0027_cancel_tracking.sql — Mốc thời gian HỦY (ORDER-17/18, REPORT-10).
--
-- LÝ DO: `order_items`/`orders` mới chỉ có `cancel_reason` + `cancelled_by`, KHÔNG có mốc
-- thời gian hủy. Không có mốc này thì không xếp được một lượt hủy vào kỳ báo cáo, và vĩnh
-- viễn không phân tích được "hủy vào giờ nào" hay "hủy sau bao lâu kể từ lúc gọi".

alter table public.order_items add column if not exists cancelled_at timestamptz;
alter table public.orders      add column if not exists cancelled_at timestamptz;

-- Backfill `orders`: CHÍNH XÁC. 'cancelled' là trạng thái kết thúc (ORDER_FLOW.cancelled = [])
-- nên không còn transition nào sau đó — `updated_at` chính là lúc hủy.
update public.orders
   set cancelled_at = updated_at
 where status = 'cancelled' and cancelled_at is null;

-- Backfill `order_items`: XẤP XỈ. Bảng này không có `updated_at`, không có mốc nào tốt hơn.
-- `created_at` là lúc GỌI món, KHÔNG phải lúc hủy. Số liệu hủy trước 16/08/2026 chỉ dùng để
-- tham khảo, đừng đọc như mốc thật.
update public.order_items
   set cancelled_at = created_at
 where status = 'cancelled' and cancelled_at is null;

-- Index riêng cho báo cáo hủy: partial nên chỉ chứa dòng 'cancelled' (phần rất nhỏ của bảng).
create index if not exists idx_order_items_cancelled
  on public.order_items (tenant_id, cancelled_at)
  where status = 'cancelled';
```

- [ ] **Step 2: Áp migration lên dev và kiểm chứng backfill**

Chạy migration bằng cách dự án vẫn dùng (Supabase SQL editor của project dev, hoặc `supabase db push` nếu CLI đã cấu hình).

Sau đó chạy truy vấn kiểm chứng — cả hai phải trả `0`:

```sql
select count(*) from public.order_items where status = 'cancelled' and cancelled_at is null;
select count(*) from public.orders      where status = 'cancelled' and cancelled_at is null;
```

Expected: `0` và `0`. Khác `0` là backfill hụt — dừng lại, tìm nguyên nhân trước khi đi tiếp.

- [ ] **Step 3: Ghi `cancelled_at` trong `cancelOrderItem`**

Trong `app/r/[slug]/pos/actions.ts`, hàm `cancelOrderItem` — update `order_items` (hiện là `.update({ status: "cancelled", cancel_reason: ..., cancelled_by: ... })`):

```ts
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("order_items")
    .update({
      status: "cancelled",
      cancel_reason: reason.slice(0, 300),
      cancelled_by: cancelledBy,
      cancelled_at: now,
    })
    .eq("id", input.itemId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: "Hủy món thất bại. Vui lòng thử lại." };
```

Lưu ý: hàm này đang khai báo `const now = new Date().toISOString();` **sau** khối update (ngay trước phần roll-up). Chuyển khai báo lên trước update và **xóa dòng khai báo cũ** — nếu để hai dòng `const now` sẽ lỗi biên dịch "đã khai báo".

Trong khối roll-up cùng hàm, nhánh "mọi món bị hủy → order cancelled":

```ts
      await supabase
        .from("orders")
        .update({
          status: "cancelled",
          cancel_reason: "Tất cả món bị hủy",
          cancelled_at: now,
          updated_at: now,
        })
        .eq("id", item.order_id)
        .eq("tenant_id", tenantId);
```

- [ ] **Step 4: Ghi `cancelled_at` trong `cancelOrder`**

Cùng file, hàm `cancelOrder` — hai chỗ:

```ts
  const { error: itErr } = await supabase
    .from("order_items")
    .update({
      status: "cancelled",
      cancel_reason: reasonSlice,
      cancelled_by: cancelledBy,
      cancelled_at: now,
    })
    .in("order_id", targetIds)
    .eq("tenant_id", tenantId)
    .neq("status", "cancelled");
```

```ts
    await supabase
      .from("orders")
      .update({ status: "cancelled", cancel_reason: reasonSlice, cancelled_at: now, updated_at: now })
      .in("id", cancellable)
      .eq("tenant_id", tenantId);
```

- [ ] **Step 5: Ghi `cancelled_at` trong `rejectOrder`**

Cùng file, hàm `rejectOrder` (từ chối đơn QR chờ duyệt) — hai update:

```ts
    .from("orders")
    .update({ status: "cancelled", cancel_reason: trimmed.slice(0, 300), cancelled_at: now, updated_at: now })
```

```ts
    .from("order_items")
    .update({ status: "cancelled", cancel_reason: trimmed.slice(0, 300), cancelled_at: now })
```

- [ ] **Step 6: Ghi `cancelled_at` trong `rejectOnlineOrder`**

Trong `lib/orders/online.ts`, hàm `rejectOnlineOrder` — thêm `cancelled_at` vào object update `orders` (dùng cùng mốc `now` mà hàm đang có; nếu chưa có thì khai báo `const now = new Date().toISOString();` ngay trên update):

```ts
    .update({
      status: "cancelled",
      cancel_reason: reason.trim().slice(0, 300),
      cancelled_at: now,
      updated_at: now,
    })
```

- [ ] **Step 7: Kiểm tra biên dịch**

Run: `npx tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 8: Kiểm thủ công trên dev**

Vào `/r/<slug>/pos`, hủy 1 món ở một bàn. Rồi chạy:

```sql
select id, name_snapshot, cancelled_at, cancelled_by, cancel_reason
  from public.order_items
 where status = 'cancelled'
 order by cancelled_at desc limit 3;
```

Expected: dòng trên cùng có `cancelled_at` bằng thời điểm vừa bấm (±1 phút), `cancel_reason` đúng chữ vừa gõ.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0027_cancel_tracking.sql "app/r/[slug]/pos/actions.ts" lib/orders/online.ts
git commit -m "feat(orders): thêm cột cancelled_at làm mốc thời gian hủy"
```

---

### Task 2: BILL-06 — hủy món trừ đúng tiền hóa đơn đang mở

**Files:**
- Create: `lib/billing/cancel-cleanup.ts`
- Test: `tests/billing/cancel-cleanup.test.ts`
- Modify: `lib/billing/bill.ts` (thêm export mới)
- Modify: `app/r/[slug]/pos/actions.ts` (`cancelOrderItem`, `cancelOrder`)

**Interfaces:**
- Consumes: cột `cancelled_at` từ Task 1 (không bắt buộc cho task này, nhưng cùng file `actions.ts` nên làm sau Task 1 để tránh xung đột).
- Produces:
  - `planCancelledBillCleanup(input: CancelCleanupInput): CancelCleanupPlan` (thuần)
  - `dropCancelledItemsFromOpenBills(tenantId: string, orderItemIds: string[]): Promise<void>` export từ `lib/billing/bill.ts`

- [ ] **Step 1: Viết test thất bại cho hàm thuần**

Tạo `tests/billing/cancel-cleanup.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planCancelledBillCleanup } from "@/lib/billing/cancel-cleanup";

describe("planCancelledBillCleanup (BILL-06)", () => {
  it("xóa đúng dòng của món đã hủy, tính lại bill bị chạm", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [{ billItemId: "bi1", billId: "b1", orderItemId: "oi1" }],
      billLines: [
        { billItemId: "bi1", billId: "b1" },
        { billItemId: "bi2", billId: "b1" },
      ],
      billsWithPayments: [],
    });
    expect(plan.deleteBillItemIds).toEqual(["bi1"]);
    expect(plan.recomputeBillIds).toEqual(["b1"]);
    expect(plan.deleteBillIds).toEqual([]); // b1 vẫn còn bi2
  });

  it("bill rỗng sau khi xóa và chưa có payment → xóa luôn bill", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [{ billItemId: "bi1", billId: "b1", orderItemId: "oi1" }],
      billLines: [{ billItemId: "bi1", billId: "b1" }],
      billsWithPayments: [],
    });
    expect(plan.deleteBillIds).toEqual(["b1"]);
    expect(plan.recomputeBillIds).toEqual([]); // xóa rồi thì khỏi tính lại
  });

  it("bill rỗng nhưng ĐÃ có payment → giữ lại, chỉ tính lại", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [{ billItemId: "bi1", billId: "b1", orderItemId: "oi1" }],
      billLines: [{ billItemId: "bi1", billId: "b1" }],
      billsWithPayments: ["b1"],
    });
    expect(plan.deleteBillIds).toEqual([]);
    expect(plan.recomputeBillIds).toEqual(["b1"]);
  });

  it("nhiều bill bị chạm → gom không trùng", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [
        { billItemId: "bi1", billId: "b1", orderItemId: "oi1" },
        { billItemId: "bi2", billId: "b1", orderItemId: "oi2" },
        { billItemId: "bi3", billId: "b2", orderItemId: "oi3" },
      ],
      billLines: [
        { billItemId: "bi1", billId: "b1" },
        { billItemId: "bi2", billId: "b1" },
        { billItemId: "bi9", billId: "b1" },
        { billItemId: "bi3", billId: "b2" },
      ],
      billsWithPayments: [],
    });
    expect(plan.deleteBillItemIds.sort()).toEqual(["bi1", "bi2", "bi3"]);
    expect(plan.recomputeBillIds).toEqual(["b1"]); // b2 rỗng → nằm ở deleteBillIds
    expect(plan.deleteBillIds).toEqual(["b2"]);
  });

  it("không có dòng nào để xóa → kế hoạch rỗng", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [],
      billLines: [],
      billsWithPayments: [],
    });
    expect(plan).toEqual({ deleteBillItemIds: [], recomputeBillIds: [], deleteBillIds: [] });
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `npx vitest run tests/billing/cancel-cleanup.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/billing/cancel-cleanup"`.

- [ ] **Step 3: Viết hàm thuần**

Tạo `lib/billing/cancel-cleanup.ts`:

```ts
/**
 * Quyết định phải dọn gì khỏi hóa đơn ĐANG MỞ khi món bị hủy (BILL-06). Thuần, không IO —
 * `bill.ts` lo phần đọc/ghi, giống cặp `planSplitByItems` ↔ `splitBillByItems`.
 *
 * Vì sao chỉ đụng bill 'open': khi tách hóa đơn theo món, một `order_item` có thể có dòng ở
 * nhiều bill với `qty_allocated` khác nhau — phần đã 'paid' là tiền THẬT đã thu, xóa đi là làm
 * sai sổ. Bill 'paid' cũng không thể dính món đang hủy: thu đủ tiền thì `payBill` đánh dấu món
 * 'served', mà 'served' thì `cancelOrderItem` đã chặn từ đầu.
 */

export type OpenBillLine = { billItemId: string; billId: string; orderItemId: string };

export type CancelCleanupInput = {
  /** Dòng `bill_items` thuộc bill 'open' của các order_item vừa hủy. */
  cancelledLines: OpenBillLine[];
  /** MỌI dòng hiện có của các bill bị chạm — để biết bill nào rỗng sau khi xóa. */
  billLines: { billItemId: string; billId: string }[];
  /** Bill đã có ít nhất 1 payment → không xóa dù rỗng (còn dấu vết tiền, để người thật xử lý). */
  billsWithPayments: string[];
};

export type CancelCleanupPlan = {
  deleteBillItemIds: string[];
  /** Bill còn dòng → tính lại tổng. Bill bị xóa KHÔNG nằm ở đây (tính lại rồi xóa là thừa). */
  recomputeBillIds: string[];
  deleteBillIds: string[];
};

export function planCancelledBillCleanup(input: CancelCleanupInput): CancelCleanupPlan {
  const deleteBillItemIds = input.cancelledLines.map((l) => l.billItemId);
  const dropped = new Set(deleteBillItemIds);
  const withPayments = new Set(input.billsWithPayments);

  // Thứ tự bill giữ theo lần xuất hiện đầu tiên → kế hoạch ổn định, test không phụ thuộc thứ tự Set.
  const touched: string[] = [];
  for (const l of input.cancelledLines) if (!touched.includes(l.billId)) touched.push(l.billId);

  const remaining = new Map<string, number>(touched.map((id) => [id, 0]));
  for (const l of input.billLines) {
    if (dropped.has(l.billItemId)) continue;
    if (remaining.has(l.billId)) remaining.set(l.billId, (remaining.get(l.billId) ?? 0) + 1);
  }

  const recomputeBillIds: string[] = [];
  const deleteBillIds: string[] = [];
  for (const billId of touched) {
    const isEmpty = (remaining.get(billId) ?? 0) === 0;
    if (isEmpty && !withPayments.has(billId)) deleteBillIds.push(billId);
    else recomputeBillIds.push(billId);
  }

  return { deleteBillItemIds, recomputeBillIds, deleteBillIds };
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/billing/cancel-cleanup.test.ts`
Expected: PASS — 5 test.

- [ ] **Step 5: Commit hàm thuần**

```bash
git add lib/billing/cancel-cleanup.ts tests/billing/cancel-cleanup.test.ts
git commit -m "feat(bill): hàm thuần lập kế hoạch dọn hóa đơn khi hủy món"
```

- [ ] **Step 6: Viết tầng IO trong `bill.ts`**

Thêm vào cuối `lib/billing/bill.ts` (và thêm import ở đầu file: `import { planCancelledBillCleanup } from "./cancel-cleanup";`):

```ts
/**
 * Gỡ các `order_item` vừa bị hủy khỏi mọi hóa đơn ĐANG MỞ rồi tính lại tổng (BILL-06).
 *
 * Không có bước này thì bàn đã bấm "Tính tiền" xong mới hủy món sẽ vẫn bị tính tiền món đã hủy:
 * `openBillForSession` chỉ THÊM món chưa phân bổ, không XÓA món đã hủy. Luồng đơn nhóm mang về
 * đã có `syncGroupBillItems` lo việc này — dine-in thì chưa.
 *
 * Nuốt lỗi có chủ đích: món đã hủy là sự thật vận hành rồi, không được để lỗi dọn hóa đơn làm
 * hỏng cả thao tác hủy. Hóa đơn lệch còn sửa được ở lần mở bill sau.
 */
export async function dropCancelledItemsFromOpenBills(
  tenantId: string,
  orderItemIds: string[]
): Promise<void> {
  if (orderItemIds.length === 0) return;
  const client = await createClient();

  const { data: lines } = await client
    .from("bill_items")
    .select("id, bill_id, order_item_id, bills!inner(status)")
    .eq("tenant_id", tenantId)
    .eq("bills.status", "open")
    .in("order_item_id", orderItemIds);

  const cancelledLines = (lines ?? []).map((r) => ({
    billItemId: r.id as string,
    billId: r.bill_id as string,
    orderItemId: r.order_item_id as string,
  }));
  if (cancelledLines.length === 0) return;

  const touchedBillIds = [...new Set(cancelledLines.map((l) => l.billId))];

  const [{ data: allLines }, { data: pays }] = await Promise.all([
    client.from("bill_items").select("id, bill_id").eq("tenant_id", tenantId).in("bill_id", touchedBillIds),
    client.from("payments").select("bill_id").eq("tenant_id", tenantId).in("bill_id", touchedBillIds),
  ]);

  const plan = planCancelledBillCleanup({
    cancelledLines,
    billLines: (allLines ?? []).map((r) => ({ billItemId: r.id as string, billId: r.bill_id as string })),
    billsWithPayments: [...new Set((pays ?? []).map((r) => r.bill_id as string))],
  });

  if (plan.deleteBillItemIds.length > 0) {
    await client.from("bill_items").delete().in("id", plan.deleteBillItemIds).eq("tenant_id", tenantId);
  }
  for (const billId of plan.recomputeBillIds) await recomputeBill(client, tenantId, billId);
  if (plan.deleteBillIds.length > 0) {
    await client.from("bills").delete().in("id", plan.deleteBillIds).eq("tenant_id", tenantId);
  }
}
```

- [ ] **Step 7: Gọi từ `cancelOrderItem`**

Trong `app/r/[slug]/pos/actions.ts`: thêm `dropCancelledItemsFromOpenBills` vào khối import từ `@/lib/billing/bill`.

Trong `cancelOrderItem`, đặt **ngay sau** khối roll-up và **trước** `await broadcastOrderStatus(...)`:

```ts
  // Món đã ra khỏi hóa đơn thì tiền phải giảm theo (BILL-06).
  await dropCancelledItemsFromOpenBills(tenantId, [input.itemId]);
```

- [ ] **Step 8: Gọi từ `cancelOrder`**

Trong `cancelOrder`, cần id của những món **vừa** bị hủy. Update hiện tại không trả về id, nên thêm `.select("id")` vào nó:

```ts
  const { data: cancelledItems, error: itErr } = await supabase
    .from("order_items")
    .update({
      status: "cancelled",
      cancel_reason: reasonSlice,
      cancelled_by: cancelledBy,
      cancelled_at: now,
    })
    .in("order_id", targetIds)
    .eq("tenant_id", tenantId)
    .neq("status", "cancelled")
    .select("id");
  if (itErr) return { ok: false, error: "Hủy đơn thất bại. Vui lòng thử lại." };
```

Rồi đặt sau khối update `orders` (trước vòng `broadcastOrderStatus`):

```ts
  await dropCancelledItemsFromOpenBills(
    tenantId,
    (cancelledItems ?? []).map((r) => r.id as string)
  );
```

- [ ] **Step 9: Kiểm tra biên dịch + toàn bộ test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi TypeScript; toàn bộ test PASS.

- [ ] **Step 10: Kiểm thủ công — đây là ca chính của BILL-06**

Trên `/r/<slug>/pos`:
1. Mở bàn, gọi **2 món** (vd 50.000đ + 40.000đ).
2. Bấm mở hóa đơn → ghi lại tổng hiện trên panel (vd 90.000đ + phụ thu/VAT nếu có).
3. Hủy món 50.000đ (nhập lý do, PIN nếu cần).
4. **Expected:** tổng hóa đơn giảm đúng 50.000đ (phần phụ thu/VAT tính lại theo subtotal mới).
5. Hủy nốt món còn lại → **Expected:** hóa đơn biến mất, bàn về trạng thái "chưa có hóa đơn", không còn hóa đơn 0đ treo.

Chụp màn hình bước 2, 4, 5 làm bằng chứng.

- [ ] **Step 11: Commit**

```bash
git add lib/billing/bill.ts "app/r/[slug]/pos/actions.ts"
git commit -m "fix(bill): hủy món trừ đúng tiền trên hóa đơn đang mở (BILL-06)"
```

---

### Task 3: ORDER-17 — lịch sử POS hiện lý do + người hủy

**Files:**
- Create: `lib/orders/cancel-label.ts`
- Test: `tests/orders/cancel-label.test.ts`
- Modify: `lib/orders/online.ts`
- Modify: `components/pos/TakeawayHistory.tsx`

**Interfaces:**
- Consumes: `orders.cancelled_at`, `order_items.cancelled_at` (Task 1).
- Produces:
  - `formatCancelNote(input: { reason, at, actor }): string` từ `lib/orders/cancel-label.ts`
  - `CancelActor = { name: string; role: string }`
  - `OnlineOrderItem` thêm `cancelReason`, `cancelledBy`, `cancelledAt`
  - `OnlineOrderView` thêm `cancelReason`, `cancelledAt`
  - `TakeawayHistoryPage` thêm `actors: CancelActorRow[]` với `CancelActorRow = { id: string; name: string; role: string }`

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/orders/cancel-label.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatCancelNote } from "@/lib/orders/cancel-label";

// 20:15 giờ VN = 13:15 UTC
const AT = "2026-08-16T13:15:00.000Z";

describe("formatCancelNote (ORDER-17)", () => {
  it("đủ ba phần: giờ VN · lý do · người duyệt kèm vai trò", () => {
    expect(
      formatCancelNote({ reason: "khách đổi ý", at: AT, actor: { name: "Hoàng", role: "manager" } })
    ).toBe('Đã hủy 20:15 · "khách đổi ý" · Hoàng (Quản lý)');
  });

  it("không tra được người duyệt → bỏ hẳn phần đó, không in ra dấu gạch trơ", () => {
    expect(formatCancelNote({ reason: "hết hàng", at: AT, actor: null })).toBe(
      'Đã hủy 20:15 · "hết hàng"'
    );
  });

  it("thiếu mốc thời gian (dữ liệu cũ chưa backfill) → vẫn đọc được", () => {
    expect(
      formatCancelNote({ reason: "gọi nhầm", at: null, actor: { name: "Lan", role: "cashier" } })
    ).toBe('Đã hủy · "gọi nhầm" · Lan (Thu ngân)');
  });

  it("không có lý do → chỉ còn giờ và người duyệt", () => {
    expect(formatCancelNote({ reason: null, at: AT, actor: { name: "Lan", role: "cashier" } })).toBe(
      "Đã hủy 20:15 · Lan (Thu ngân)"
    );
  });

  it("lý do chỉ có khoảng trắng bị coi như không có", () => {
    expect(formatCancelNote({ reason: "   ", at: null, actor: null })).toBe("Đã hủy");
  });

  it("vai trò lạ thì hiện tên trơn, không in mã tiếng Anh ra màn hình", () => {
    expect(formatCancelNote({ reason: null, at: null, actor: { name: "Ai đó", role: "robot" } })).toBe(
      "Đã hủy · Ai đó"
    );
  });

  it("qua nửa đêm giờ VN vẫn đúng (17:30 UTC = 00:30 hôm sau)", () => {
    expect(
      formatCancelNote({ reason: null, at: "2026-08-16T17:30:00.000Z", actor: null })
    ).toBe("Đã hủy 00:30");
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `npx vitest run tests/orders/cancel-label.test.ts`
Expected: FAIL — không resolve được `@/lib/orders/cancel-label`.

- [ ] **Step 3: Viết hàm thuần**

Tạo `lib/orders/cancel-label.ts`:

```ts
/**
 * Dựng chuỗi mô tả một lượt hủy để hiện trên POS (ORDER-17). Thuần để test được — vitest không
 * parse .tsx (tsconfig để `jsx: preserve`), nên logic chữ nghĩa phải nằm ngoài component.
 *
 * Phần nào thiếu thì BỎ HẲN thay vì in "—": dòng này nằm ngay dưới tên món, mỗi ký tự thừa là
 * một lần nhân viên phải đọc lướt qua thứ không mang tin.
 */

const VN_OFFSET = 7 * 3600 * 1000;

const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ quán",
  manager: "Quản lý",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  kitchen: "Bếp",
  station: "Máy trạm",
};

export type CancelActor = { name: string; role: string };

/** "HH:MM" giờ VN. */
function vnTime(iso: string): string {
  return new Date(new Date(iso).getTime() + VN_OFFSET).toISOString().slice(11, 16);
}

export function formatCancelNote(input: {
  reason: string | null;
  at: string | null;
  actor: CancelActor | null;
}): string {
  const head = input.at ? `Đã hủy ${vnTime(input.at)}` : "Đã hủy";

  const parts: string[] = [head];
  const reason = input.reason?.trim();
  if (reason) parts.push(`"${reason}"`);
  if (input.actor) {
    const role = ROLE_LABEL[input.actor.role];
    parts.push(role ? `${input.actor.name} (${role})` : input.actor.name);
  }
  return parts.join(" · ");
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/orders/cancel-label.test.ts`
Expected: PASS — 7 test.

- [ ] **Step 5: Commit hàm thuần**

```bash
git add lib/orders/cancel-label.ts tests/orders/cancel-label.test.ts
git commit -m "feat(orders): hàm thuần dựng nhãn lý do hủy"
```

- [ ] **Step 6: Mở rộng select + kiểu dữ liệu trong `online.ts`**

Trong `lib/orders/online.ts`:

`ONLINE_ORDER_SELECT` — thêm cột hủy ở cả hai mức:

```ts
const ONLINE_ORDER_SELECT =
  "id, channel, status, kitchen_no, note, customer_contact, created_at, parent_order_id, cancel_reason, cancelled_at, order_items(id, name_snapshot, unit_price_snapshot, qty, note, status, created_at, cancel_reason, cancelled_by, cancelled_at, order_item_modifiers(name_snapshot))";
```

`OnlineOrderItem`:

```ts
export type OnlineOrderItem = {
  id: string;
  name: string;
  qty: number;
  note: string | null;
  status: OrderItemStatus;
  unitPrice: number;
  modifiers: string[];
  /** Chỉ có nghĩa khi status = 'cancelled'. */
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
};
```

`OnlineOrderView` — thêm hai trường (lý do hủy CẢ ĐƠN):

```ts
  cancelReason: string | null;
  cancelledAt: string | null;
```

`toOnlineOrderView` — trong `.map(...)` của items thêm:

```ts
      cancelReason: (it.cancel_reason as string) ?? null,
      cancelledBy: (it.cancelled_by as string) ?? null,
      cancelledAt: (it.cancelled_at as string) ?? null,
```

và trong object trả về của hàm thêm:

```ts
    cancelReason: (o.cancel_reason as string) ?? null,
    cancelledAt: (o.cancelled_at as string) ?? null,
```

- [ ] **Step 7: Trả kèm danh sách người duyệt**

Cùng file, thêm kiểu và mở rộng `TakeawayHistoryPage`:

```ts
/** Người từng duyệt hủy — tra tên ở tầng app vì `cancelled_by` KHÔNG có FK sang memberships. */
export type CancelActorRow = { id: string; name: string; role: string };
```

```ts
export type TakeawayHistoryPage = {
  orders: OnlineOrderView[];
  bills: TakeawayBillInfo[];
  nextCursor: string | null;
  summary: TakeawayHistorySummary | null;
  matchedIds: string[];
  /**
   * Nhân sự của tenant để tra `cancelled_by → tên`. Không thêm FK sang `memberships` vì dữ liệu
   * cũ có thể trỏ tới membership đã xóa — migration thêm FK sẽ fail giữa chừng. Tra không ra thì
   * component tự bỏ phần tên.
   */
  actors: CancelActorRow[];
};
```

Trong `listTakeawayHistory`: thêm `actors: []` vào object `empty` và vào nhánh `rootIds.length === 0`. Trước `return` cuối cùng, nạp danh sách:

```ts
  const { data: actorRows } = await supabase
    .from("memberships")
    .select("id, display_name, role")
    .eq("tenant_id", tenantId);
  const actors: CancelActorRow[] = (actorRows ?? []).map((m) => ({
    id: m.id as string,
    name: (m.display_name as string) ?? "—",
    role: (m.role as string) ?? "",
  }));
```

rồi thêm `actors` vào object trả về.

- [ ] **Step 8: Hiện dòng hủy trong `TakeawayHistory.tsx`**

Thêm import:

```ts
import { formatCancelNote, type CancelActor } from "@/lib/orders/cancel-label";
```

Đổi `HistoryLines` để nhận map người duyệt và in dòng đỏ:

```tsx
/** Danh sách món của một đơn trong lịch sử — món đã hủy gạch ngang, không biến mất. */
function HistoryLines({
  order,
  actorById,
}: {
  order: OnlineOrderView;
  actorById: Map<string, CancelActor>;
}) {
  return (
    <ul className="mt-sm flex flex-col divide-y divide-hairline-soft">
      {order.items.map((it) => {
        const cancelled = it.status === "cancelled";
        // Hủy CẢ ĐƠN thì mọi món mang cùng một lý do — đã hiện một lần ở đầu thẻ, khỏi lặp
        // lại ở từng dòng.
        const note =
          cancelled && !order.cancelReason
            ? formatCancelNote({
                reason: it.cancelReason,
                at: it.cancelledAt,
                actor: (it.cancelledBy && actorById.get(it.cancelledBy)) || null,
              })
            : null;
        return (
          <li key={it.id} className="flex items-start justify-between gap-md py-xs">
            <div className="min-w-0">
              <p className={cancelled ? "text-sm text-stone line-through" : "text-sm text-ink"}>
                {it.qty}× {it.name}
              </p>
              {it.modifiers.length > 0 && (
                <p className="text-xs text-steel">{it.modifiers.join(" · ")}</p>
              )}
              {it.note && <p className="text-xs italic text-stone">“{it.note}”</p>}
              {note && <p className="text-xs text-status-late">{note}</p>}
            </div>
            <span
              className={
                cancelled
                  ? "shrink-0 text-sm tabular-nums text-stone line-through"
                  : "shrink-0 text-sm tabular-nums text-steel"
              }
            >
              {formatVnd(it.unitPrice * it.qty)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 9: Nối state `actors` và truyền xuống**

Trong component `TakeawayHistory`:

```ts
const [actors, setActors] = useState<CancelActorRow[]>([]);
```

(import thêm `CancelActorRow` từ `@/lib/orders/online`)

- trong `loadFirst`: nhánh lỗi thêm `setActors([])`; nhánh thành công thêm `setActors(res.history.actors)`.
- `loadMore` **không** cần đụng `actors` (danh sách nhân sự không đổi giữa các trang).
- thêm map dẫn xuất:

```ts
const actorById = useMemo(
  () => new Map(actors.map((a) => [a.id, { name: a.name, role: a.role }])),
  [actors]
);
```

- hai chỗ dùng `<HistoryLines order={...} />` (đơn gốc và lượt gọi thêm) đổi thành `<HistoryLines order={...} actorById={actorById} />`.

- [ ] **Step 10: Hiện lý do hủy CẢ ĐƠN ở đầu thẻ**

Trong khối thẻ đơn, ngay **sau** hàng badge (`<div className="flex flex-wrap items-center gap-xs">…</div>`) và trước khối thông tin khách:

```tsx
                {cancelled && g.root.cancelReason && (
                  <p className="mt-xxs text-xs text-status-late">
                    {formatCancelNote({
                      reason: g.root.cancelReason,
                      at: g.root.cancelledAt,
                      actor: null,
                    })}
                  </p>
                )}
```

Không tra người duyệt ở mức đơn vì `orders` không có cột `cancelled_by` — chỉ `order_items` có.

- [ ] **Step 11: Kiểm tra biên dịch + test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi; test PASS.

- [ ] **Step 12: Kiểm thủ công**

Trên `/r/<slug>/pos`, panel mang về: tạo 1 đơn, hủy **một món** trong đơn (lý do "khách đổi ý"), thu tiền phần còn lại. Tạo đơn thứ hai rồi **hủy cả đơn** (lý do "gọi nhầm bàn").

Sang tab "Đã xong" → bung cả hai đơn.

**Expected:**
- Đơn 1: dòng món hủy gạch ngang + dòng đỏ `Đã hủy HH:MM · "khách đổi ý" · <tên bạn> (<vai trò>)`.
- Đơn 2: badge "Đã hủy" + ngay dưới là `Đã hủy HH:MM · "gọi nhầm bàn"`, và các dòng món **không** lặp lại lý do.

Chụp màn hình làm bằng chứng.

- [ ] **Step 13: Commit**

```bash
git add lib/orders/online.ts components/pos/TakeawayHistory.tsx
git commit -m "feat(pos): lịch sử hiện lý do hủy và người duyệt (ORDER-17)"
```

---

### Task 4: ORDER-18 — chip lọc đơn hủy + tách con số tổng kết

**Files:**
- Create: `lib/orders/history-filter.ts`
- Test: `tests/orders/history-filter.test.ts`
- Modify: `lib/orders/online.ts`
- Modify: `app/r/[slug]/pos/actions.ts` (`listTakeawayHistoryAction`)
- Modify: `components/pos/TakeawayHistory.tsx`

**Interfaces:**
- Consumes: `TakeawayHistoryPage` (Task 3).
- Produces:
  - `HistoryStatusFilter = "all" | "paid" | "cancelled"` và `historyStatuses(f)` từ `lib/orders/history-filter.ts`
  - `TakeawayHistorySummary` đổi thành `{ paidCount, cancelledCount, paidTotal, paidTotalCapped }`
  - `listTakeawayHistory(tenantId, fromDay, toDay, opts)` — `opts` thêm `status?: HistoryStatusFilter`
  - `listTakeawayHistoryAction(slug, fromDay, toDay, opts)` — `opts` thêm `status?: HistoryStatusFilter`

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/orders/history-filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { historyStatuses, isHistoryStatusFilter } from "@/lib/orders/history-filter";

describe("historyStatuses (ORDER-18)", () => {
  it("'all' lấy cả đơn đã thu lẫn đơn hủy", () => {
    expect(historyStatuses("all")).toEqual(["completed", "cancelled"]);
  });

  it("'paid' chỉ lấy đơn đã hoàn tất", () => {
    expect(historyStatuses("paid")).toEqual(["completed"]);
  });

  it("'cancelled' chỉ lấy đơn hủy", () => {
    expect(historyStatuses("cancelled")).toEqual(["cancelled"]);
  });
});

describe("isHistoryStatusFilter — chặn giá trị lạ từ client", () => {
  it("nhận đúng 3 giá trị hợp lệ", () => {
    expect(isHistoryStatusFilter("all")).toBe(true);
    expect(isHistoryStatusFilter("paid")).toBe(true);
    expect(isHistoryStatusFilter("cancelled")).toBe(true);
  });

  it("từ chối giá trị ngoài danh sách", () => {
    expect(isHistoryStatusFilter("completed")).toBe(false);
    expect(isHistoryStatusFilter("")).toBe(false);
    expect(isHistoryStatusFilter(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `npx vitest run tests/orders/history-filter.test.ts`
Expected: FAIL — không resolve được `@/lib/orders/history-filter`.

- [ ] **Step 3: Viết hàm thuần**

Tạo `lib/orders/history-filter.ts`:

```ts
/**
 * Chip lọc của màn lịch sử POS (ORDER-18) → danh sách `orders.status` cần truy vấn.
 *
 * Lọc phải chạy Ở SERVER. Lọc trong mảng đã tải thì đơn hủy nằm ngoài trang 20 hiện tại sẽ biến
 * mất khỏi kết quả — đúng cái lỗi mà phần tìm kiếm đã từng mắc và đã phải sửa.
 */

export type HistoryStatusFilter = "all" | "paid" | "cancelled";

/** Trạng thái đơn ĐÃ KẾT THÚC mà màn lịch sử quan tâm. */
export type FinishedOrderStatus = "completed" | "cancelled";

export function historyStatuses(f: HistoryStatusFilter): FinishedOrderStatus[] {
  if (f === "paid") return ["completed"];
  if (f === "cancelled") return ["cancelled"];
  return ["completed", "cancelled"];
}

/** Server action nhận chuỗi từ client — không tin, phải kiểm. */
export function isHistoryStatusFilter(v: unknown): v is HistoryStatusFilter {
  return v === "all" || v === "paid" || v === "cancelled";
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/orders/history-filter.test.ts`
Expected: PASS — 5 test.

- [ ] **Step 5: Commit hàm thuần**

```bash
git add lib/orders/history-filter.ts tests/orders/history-filter.test.ts
git commit -m "feat(orders): hàm thuần ánh xạ chip lọc lịch sử sang trạng thái đơn"
```

- [ ] **Step 6: Áp bộ lọc vào `listTakeawayHistory`**

Trong `lib/orders/online.ts`, thêm import:

```ts
import { historyStatuses, type HistoryStatusFilter } from "./history-filter";
```

Đổi chữ ký:

```ts
export async function listTakeawayHistory(
  tenantId: string,
  fromDay: string,
  toDay: string,
  opts: { cursor?: string | null; query?: string; status?: HistoryStatusFilter } = {}
): Promise<TakeawayHistoryPage> {
```

Ngay sau dòng `const q = sanitizeSearch(...)`:

```ts
  const statuses = historyStatuses(opts.status ?? "all");
```

Rồi thay **cả hai** chỗ `.in("status", ["completed", "cancelled"])` trong hàm này bằng `.in("status", statuses)`: truy vấn tìm kiếm (`hits`) và truy vấn đơn gốc (`rootQ`).

Lời gọi `takeawayHistorySummary` **giữ nguyên, không truyền `statuses` xuống** — dòng tổng kết mô tả cả khoảng ngày chứ không mô tả bộ lọc đang bật. Đổi chip mà con số nhảy theo thì mất tác dụng đối chiếu. Chỗ `.in("status", ...)` thứ ba nằm trong hàm đó và được viết lại ở bước sau.

- [ ] **Step 7: Tách con số tổng kết**

Cùng file, đổi kiểu:

```ts
/** Con số của CẢ khoảng lọc — không phải của trang đang xem. */
export type TakeawayHistorySummary = {
  /** Số nhóm đơn ĐÃ THU (completed), đếm chính xác ở DB. */
  paidCount: number;
  /** Số nhóm đơn ĐÃ HỦY — tách riêng vì không cùng mẫu số với `paidTotal`. */
  cancelledCount: number;
  /** Σ bill đã thu. */
  paidTotal: number;
  /** Chạm trần `SUM_ROW_CAP` → `paidTotal` là con số THIẾU, màn hình phải nói rõ. */
  paidTotalCapped: boolean;
};
```

Viết lại `takeawayHistorySummary` — hai truy vấn đếm thay vì một. Summary **luôn đếm cả hai trạng thái** bất kể chip đang chọn gì: dòng tổng kết mô tả cả khoảng ngày, không phải mô tả bộ lọc đang bật; đổi chip mà con số nhảy theo thì mất tác dụng đối chiếu.

```ts
async function takeawayHistorySummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  fromUtc: string,
  toUtc: string,
  searchRootIds: string[] | null
): Promise<TakeawayHistorySummary> {
  const countFor = (status: "completed" | "cancelled") => {
    let q = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("channel", "takeaway")
      .eq("status", status)
      .is("parent_order_id", null)
      .gte("created_at", fromUtc)
      .lt("created_at", toUtc);
    if (searchRootIds) q = q.in("id", searchRootIds);
    return q;
  };

  const sumQ = searchRootIds
    ? supabase
        .from("bills")
        .select("total")
        .eq("tenant_id", tenantId)
        .eq("status", "paid")
        .in("online_order_id", searchRootIds)
        .limit(SUM_ROW_CAP)
    : supabase
        .from("bills")
        .select("total, orders!inner(created_at, channel, status, parent_order_id)")
        .eq("tenant_id", tenantId)
        .eq("status", "paid")
        .eq("orders.channel", "takeaway")
        .is("orders.parent_order_id", null)
        .in("orders.status", ["completed", "cancelled"])
        .gte("orders.created_at", fromUtc)
        .lt("orders.created_at", toUtc)
        .limit(SUM_ROW_CAP);

  const [{ count: paid }, { count: cancelled }, { data: totals }] = await Promise.all([
    countFor("completed"),
    countFor("cancelled"),
    sumQ,
  ]);

  const rows = (totals ?? []) as { total: number }[];
  return {
    paidCount: paid ?? 0,
    cancelledCount: cancelled ?? 0,
    paidTotal: rows.reduce((s, r) => s + (r.total ?? 0), 0),
    paidTotalCapped: rows.length >= SUM_ROW_CAP,
  };
}
```

- [ ] **Step 8: Nhận tham số `status` ở server action**

Trong `app/r/[slug]/pos/actions.ts`, hàm `listTakeawayHistoryAction`:

```ts
export async function listTakeawayHistoryAction(
  slug: string,
  fromDay: string,
  toDay: string,
  opts: { cursor?: string | null; query?: string; status?: HistoryStatusFilter } = {}
): Promise<{ ok: true; history: TakeawayHistoryPage } | { ok: false; error: string }> {
```

và ở lời gọi:

```ts
  const history = await listTakeawayHistory(auth.tenantId, fromDay, toDay, {
    cursor: opts.cursor ?? null,
    query: opts.query ?? "",
    // Không tin giá trị từ client — rơi về "all" nếu lạ.
    status: isHistoryStatusFilter(opts.status) ? opts.status : "all",
  });
```

Thêm import:

```ts
import { isHistoryStatusFilter, type HistoryStatusFilter } from "@/lib/orders/history-filter";
```

- [ ] **Step 9: Thêm hàng chip trạng thái vào UI**

Trong `components/pos/TakeawayHistory.tsx`, thêm import `type HistoryStatusFilter` từ `@/lib/orders/history-filter` và hằng số cạnh `PRESETS`:

```ts
const STATUS_CHIPS: { key: HistoryStatusFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "paid", label: "Đã thu" },
  { key: "cancelled", label: "Đã hủy" },
];
```

State mới:

```ts
const [status, setStatus] = useState<HistoryStatusFilter>("all");
```

`loadFirst` và `loadMore` truyền thêm `status` vào lời gọi action, và `loadFirst` thêm `status` vào mảng dependency của `useCallback` (thiếu là đổi chip không tải lại):

```ts
const res = await listTakeawayHistoryAction(slug, from, to, { query: debouncedQuery, status });
```

```ts
}, [slug, from, to, debouncedQuery, status]);
```

```ts
const res = await listTakeawayHistoryAction(slug, from, to, {
  cursor,
  query: debouncedQuery,
  status,
});
```

JSX — thêm ngay **sau** khối chip ngày (`</div>` của hàng preset), trước khối `preset === "custom"`:

```tsx
        <div className="flex flex-wrap items-center gap-xs" role="group" aria-label="Lọc theo trạng thái">
          {STATUS_CHIPS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatus(s.key)}
              aria-pressed={status === s.key}
              className={chip(status === s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
```

- [ ] **Step 10: Đổi dòng tổng kết**

Thay khối hiện `summary.orderCount`:

```tsx
          {!loading && !error && summary && (
            <span className="text-sm text-steel">
              <span className="font-medium text-ink">{summary.paidCount} đơn đã thu</span>
              {" · "}
              <span className="font-semibold tabular-nums text-ink">
                {summary.paidTotalCapped ? "≥ " : ""}
                {formatVnd(summary.paidTotal)}
              </span>
              {summary.cancelledCount > 0 && (
                <span className="text-status-late"> · {summary.cancelledCount} đơn hủy</span>
              )}
            </span>
          )}
```

- [ ] **Step 11: Sửa nhãn trạng thái rỗng theo chip**

`emptyLabel` hiện chỉ nói "đã xong". Khi lọc "Đã hủy" mà rỗng thì câu đó sai. Thay bằng:

```ts
  const emptyLabel =
    status === "cancelled"
      ? "Không có đơn nào bị hủy trong khoảng này."
      : status === "paid"
        ? "Không có đơn nào đã thu trong khoảng này."
        : counter
          ? "Không có đơn nào đã xong trong khoảng này."
          : "Không có đơn mang về nào đã xong trong khoảng này.";
```

- [ ] **Step 12: Kiểm tra biên dịch + test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi; test PASS. (TypeScript sẽ báo nếu còn chỗ nào đọc `summary.orderCount` — sửa hết.)

- [ ] **Step 13: Kiểm thủ công**

Dùng lại dữ liệu Task 3 (1 đơn đã thu, 1 đơn hủy), tab "Đã xong":
- Chip **Tất cả** → thấy cả hai đơn; dòng tổng kết `1 đơn đã thu · <tiền> · 1 đơn hủy`.
- Chip **Đã hủy** → chỉ còn đơn hủy; con số tổng kết **giữ nguyên** (mô tả cả khoảng, không theo chip).
- Chip **Đã thu** → chỉ còn đơn đã thu.
- Chọn khoảng ngày không có đơn hủy + chip **Đã hủy** → hiện đúng câu "Không có đơn nào bị hủy trong khoảng này."

Chụp màn hình 3 trạng thái chip.

- [ ] **Step 14: Commit**

```bash
git add lib/orders/online.ts "app/r/[slug]/pos/actions.ts" components/pos/TakeawayHistory.tsx
git commit -m "feat(pos): chip lọc đơn hủy và tách con số tổng kết lịch sử (ORDER-18)"
```

---

### Task 5: REPORT-10 (dữ liệu) — RPC tổng hợp hủy + tầng đọc

**Files:**
- Create: `supabase/migrations/0028_cancel_report_rpcs.sql`
- Create: `lib/billing/cancel-format.ts`
- Test: `tests/billing/cancel-format.test.ts`
- Modify: `lib/billing/reports.ts`

**Interfaces:**
- Consumes: `order_items.cancelled_at` + index (Task 1).
- Produces:
  - `cancelRateLabel(cancelledQty, orderedQty): string`, `cancelRateDeltaPoints(cur, prev): number | null` từ `lib/billing/cancel-format.ts`
  - `CancelSummary = { cancelledQty: number; cancelledAmount: number; orderedQty: number }`
  - `CancelActorSlice = { membershipId: string | null; name: string; role: string; cnt: number; qty: number; amount: number }`
  - `CancelItemSlice = { name: string; qty: number; amount: number }`
  - `CancelRow = { cancelledAt: string; place: string; itemName: string; qty: number; amount: number; reason: string; actorName: string }`
  - `CancellationData = { summary: CancelSummary; actors: CancelActorSlice[]; items: CancelItemSlice[]; rows: CancelRow[]; hasMore: boolean }`
  - `getCancellationData(tenantId, range, opts?): Promise<CancellationData>`
  - `ComparisonData` thêm trường `cancel: CancelSummary`

- [ ] **Step 1: Viết migration RPC**

Tạo `supabase/migrations/0028_cancel_report_rpcs.sql`:

```sql
-- 0028_cancel_report_rpcs.sql — Tổng hợp món bị hủy (REPORT-10).
--
-- Cùng khuôn 0023: SUM/GROUP BY nằm trong Postgres vì PostgREST cắt 1000 dòng/request, cộng
-- trong JS sẽ báo thiếu ở tenant đông khách. `security invoker` ⇒ RLS tenant vẫn áp dụng.
--
-- KHÔNG lọc `channel`: đây là chỗ DUY NHẤT xem lại được đơn dine-in bị hủy (lịch sử POS chỉ có
-- takeaway, và phiên bàn đóng là mất dấu).
--
-- `left join memberships`: `order_items.cancelled_by` không có FK, dữ liệu cũ có thể trỏ tới
-- membership đã xóa. `inner join` sẽ NUỐT MẤT chính những lượt hủy đáng ngờ nhất.

-- ---- 1. Tổng quan -----------------------------------------------------------
create or replace function public.report_cancel_summary(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (cancelled_qty bigint, cancelled_amount bigint, ordered_qty bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce((select sum(oi.qty)
                from public.order_items oi
               where oi.tenant_id = p_tenant
                 and oi.status = 'cancelled'
                 and oi.cancelled_at >= p_from
                 and oi.cancelled_at <  p_to), 0)::bigint,
    coalesce((select sum(oi.unit_price_snapshot::bigint * oi.qty)
                from public.order_items oi
               where oi.tenant_id = p_tenant
                 and oi.status = 'cancelled'
                 and oi.cancelled_at >= p_from
                 and oi.cancelled_at <  p_to), 0)::bigint,
    -- Mẫu số của tỷ lệ hủy = số món ĐÃ GỌI trong kỳ (gồm cả món sau đó bị hủy) ⇒ lọc theo
    -- created_at, không phải cancelled_at.
    coalesce((select sum(oi.qty)
                from public.order_items oi
               where oi.tenant_id = p_tenant
                 and oi.created_at >= p_from
                 and oi.created_at <  p_to), 0)::bigint;
$$;

-- ---- 2. Theo người duyệt hủy -------------------------------------------------
create or replace function public.report_cancel_by_actor(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (membership_id uuid, display_name text, role text, cnt bigint, qty bigint, amount bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    oi.cancelled_by,
    coalesce(m.display_name, '—'),
    coalesce(m.role, ''),
    count(*)::bigint,
    sum(oi.qty)::bigint,
    sum(oi.unit_price_snapshot::bigint * oi.qty)::bigint
  from public.order_items oi
  left join public.memberships m
    on m.id = oi.cancelled_by and m.tenant_id = p_tenant
  where oi.tenant_id = p_tenant
    and oi.status = 'cancelled'
    and oi.cancelled_at >= p_from
    and oi.cancelled_at <  p_to
  group by oi.cancelled_by, m.display_name, m.role
  order by sum(oi.unit_price_snapshot::bigint * oi.qty) desc;
$$;

-- ---- 3. Món bị hủy nhiều nhất ------------------------------------------------
create or replace function public.report_cancel_top_items(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz,
  p_limit  int default 10
)
returns table (name text, qty bigint, amount bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    oi.name_snapshot,
    sum(oi.qty)::bigint,
    sum(oi.unit_price_snapshot::bigint * oi.qty)::bigint
  from public.order_items oi
  where oi.tenant_id = p_tenant
    and oi.status = 'cancelled'
    and oi.cancelled_at >= p_from
    and oi.cancelled_at <  p_to
  group by oi.name_snapshot
  order by sum(oi.qty) desc, sum(oi.unit_price_snapshot::bigint * oi.qty) desc
  limit greatest(p_limit, 1);
$$;

-- ---- 4. Danh sách chi tiết ---------------------------------------------------
create or replace function public.report_cancel_list(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz,
  p_limit  int default 20,
  p_offset int default 0
)
returns table (
  cancelled_at timestamptz,
  place        text,
  item_name    text,
  qty          int,
  amount       bigint,
  reason       text,
  actor_name   text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    oi.cancelled_at,
    coalesce(
      case when t.name is not null then 'Bàn ' || t.name end,
      case when o.kitchen_no is not null then 'Đơn #' || o.kitchen_no end,
      '—'
    ),
    oi.name_snapshot,
    oi.qty,
    (oi.unit_price_snapshot::bigint * oi.qty)::bigint,
    -- Hủy cả đơn chỉ ghi lý do ở `orders`; hủy lẻ ghi ở `order_items`. Lấy cái nào có.
    coalesce(nullif(oi.cancel_reason, ''), nullif(o.cancel_reason, ''), '—'),
    coalesce(m.display_name, '—')
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.table_sessions ts on ts.id = o.table_session_id
  left join public.tables t on t.id = ts.table_id
  left join public.memberships m on m.id = oi.cancelled_by and m.tenant_id = p_tenant
  where oi.tenant_id = p_tenant
    and oi.status = 'cancelled'
    and oi.cancelled_at >= p_from
    and oi.cancelled_at <  p_to
  order by oi.cancelled_at desc, oi.id desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;
```

- [ ] **Step 2: Áp migration và thử từng RPC trên dev**

```sql
select * from public.report_cancel_summary('<tenant-uuid>', now() - interval '7 days', now());
select * from public.report_cancel_by_actor('<tenant-uuid>', now() - interval '7 days', now());
select * from public.report_cancel_top_items('<tenant-uuid>', now() - interval '7 days', now(), 10);
select * from public.report_cancel_list('<tenant-uuid>', now() - interval '7 days', now(), 20, 0);
```

Expected: cả 4 chạy không lỗi. `report_cancel_summary` trả `cancelled_qty` khớp với:

```sql
select coalesce(sum(qty), 0) from public.order_items
 where tenant_id = '<tenant-uuid>' and status = 'cancelled'
   and cancelled_at >= now() - interval '7 days';
```

- [ ] **Step 3: Commit migration**

```bash
git add supabase/migrations/0028_cancel_report_rpcs.sql
git commit -m "feat(reports): RPC tổng hợp món bị hủy (REPORT-10)"
```

- [ ] **Step 4: Viết test thất bại cho hàm định dạng**

Tạo `tests/billing/cancel-format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cancelRateLabel, cancelRateDeltaPoints } from "@/lib/billing/cancel-format";

describe("cancelRateLabel (REPORT-10)", () => {
  it("giữ 2 chữ số thập phân, dấu phẩy kiểu Việt", () => {
    expect(cancelRateLabel(12, 500)).toBe("2,40%");
  });

  it("không có món nào được gọi → '—', không chia cho 0", () => {
    expect(cancelRateLabel(0, 0)).toBe("—");
  });

  it("không hủy món nào nhưng có gọi → 0,00%", () => {
    expect(cancelRateLabel(0, 500)).toBe("0,00%");
  });

  it("tỷ lệ rất nhỏ vẫn không bị bóp thành 0", () => {
    expect(cancelRateLabel(1, 100000)).toBe("0,0010%");
  });

  it("hủy hết → 100,00%", () => {
    expect(cancelRateLabel(30, 30)).toBe("100,00%");
  });
});

describe("cancelRateDeltaPoints — biến động tính bằng ĐIỂM phần trăm", () => {
  it("2,40% so với 3,00% → -0,6 điểm (không phải -20%)", () => {
    const d = cancelRateDeltaPoints(
      { cancelledQty: 12, orderedQty: 500 },
      { cancelledQty: 15, orderedQty: 500 }
    );
    expect(d).toBe(-0.6);
  });

  it("tỷ lệ tăng → số dương", () => {
    const d = cancelRateDeltaPoints(
      { cancelledQty: 20, orderedQty: 500 },
      { cancelledQty: 10, orderedQty: 500 }
    );
    expect(d).toBe(2);
  });

  it("kỳ trước không có món nào được gọi → null (không so sánh được)", () => {
    expect(
      cancelRateDeltaPoints({ cancelledQty: 12, orderedQty: 500 }, { cancelledQty: 0, orderedQty: 0 })
    ).toBeNull();
  });

  it("kỳ này không có món nào được gọi → null", () => {
    expect(
      cancelRateDeltaPoints({ cancelledQty: 0, orderedQty: 0 }, { cancelledQty: 5, orderedQty: 100 })
    ).toBeNull();
  });
});
```

- [ ] **Step 5: Chạy test để chắc chắn nó fail**

Run: `npx vitest run tests/billing/cancel-format.test.ts`
Expected: FAIL — không resolve được `@/lib/billing/cancel-format`.

- [ ] **Step 6: Viết hàm thuần**

Tạo `lib/billing/cancel-format.ts`:

```ts
/**
 * Định dạng con số cho khối "Món bị hủy" (REPORT-10). Thuần, không JSX — vitest không parse
 * .tsx (tsconfig để `jsx: preserve`).
 */

/** Số chữ số thập phân của tỷ lệ — giống `formatShare`, không làm tròn về số nguyên. */
const RATE_DECIMALS = 2;

/**
 * Tỷ lệ hủy dạng chữ: 12 món hủy / 500 món gọi → "2,40%".
 *
 * `ordered = 0` trả "—" chứ không phải "0%": không có món nào được gọi thì tỷ lệ KHÔNG XÁC ĐỊNH,
 * in ra 0% là khẳng định sai (nghe như "không hủy món nào").
 *
 * Tỷ lệ dương mà 2 số lẻ vẫn ra 0 thì tự nới thêm chữ số — không bao giờ in "0,00%" cho một kỳ
 * thật sự có món bị hủy.
 */
export function cancelRateLabel(cancelledQty: number, orderedQty: number): string {
  if (orderedQty <= 0) return "—";
  if (cancelledQty <= 0) return `0,${"0".repeat(RATE_DECIMALS)}%`;

  const pct = (cancelledQty / orderedQty) * 100;
  for (const decimals of [RATE_DECIMALS, 4, 6]) {
    const text = pct.toFixed(decimals);
    if (Number(text) > 0) return `${text.replace(".", ",")}%`;
  }
  return "<0,000001%";
}

/**
 * Biến động tỷ lệ hủy so kỳ trước, tính bằng ĐIỂM phần trăm.
 *
 * Không dùng `deltaPct` như các KPI tiền: 2,40% so với 3,00% là giảm 0,6 ĐIỂM, còn `deltaPct`
 * sẽ ra "-20%" — con số đúng về toán nhưng đọc ra thành "tỷ lệ hủy giảm 20%", sai hẳn quy mô.
 *
 * null khi một trong hai kỳ không có món nào được gọi (không có mẫu số để so).
 */
export function cancelRateDeltaPoints(
  cur: { cancelledQty: number; orderedQty: number },
  prev: { cancelledQty: number; orderedQty: number }
): number | null {
  if (cur.orderedQty <= 0 || prev.orderedQty <= 0) return null;
  const diff = (cur.cancelledQty / cur.orderedQty - prev.cancelledQty / prev.orderedQty) * 100;
  return Math.round(diff * 100) / 100;
}
```

- [ ] **Step 7: Chạy test để xác nhận pass**

Run: `npx vitest run tests/billing/cancel-format.test.ts`
Expected: PASS — 9 test.

- [ ] **Step 8: Thêm tầng đọc vào `reports.ts`**

Trong `lib/billing/reports.ts`, thêm kiểu (đặt sau `HourCell`):

```ts
export type CancelSummary = { cancelledQty: number; cancelledAmount: number; orderedQty: number };
export type CancelActorSlice = {
  membershipId: string | null;
  name: string;
  role: string;
  cnt: number;
  qty: number;
  amount: number;
};
export type CancelItemSlice = { name: string; qty: number; amount: number };
export type CancelRow = {
  cancelledAt: string;
  place: string;
  itemName: string;
  qty: number;
  amount: number;
  reason: string;
  actorName: string;
};
export type CancellationData = {
  summary: CancelSummary;
  actors: CancelActorSlice[];
  items: CancelItemSlice[];
  rows: CancelRow[];
  /** Còn dòng phía sau `rows` → màn hình hiện nút "Tải thêm". */
  hasMore: boolean;
};
```

Hằng số + hàm dựng, đặt sau `getReportData`:

```ts
/** Số dòng chi tiết mỗi lần tải. */
export const CANCEL_PAGE = 20;

const EMPTY_CANCEL: CancelSummary = { cancelledQty: 0, cancelledAmount: 0, orderedQty: 0 };

type CancelSummaryRow = { cancelled_qty: number; cancelled_amount: number; ordered_qty: number };

function toCancelSummary(rows: CancelSummaryRow[]): CancelSummary {
  const r = rows[0];
  if (!r) return EMPTY_CANCEL;
  return {
    cancelledQty: Number(r.cancelled_qty),
    cancelledAmount: Number(r.cancelled_amount),
    orderedQty: Number(r.ordered_qty),
  };
}

/**
 * Thống kê món bị hủy trong kỳ (REPORT-10). Gồm CẢ dine-in lẫn mang về — lịch sử POS chỉ có
 * takeaway nên đây là chỗ duy nhất xem lại được đơn tại bàn bị hủy.
 */
export async function getCancellationData(
  tenantId: string,
  range: ReportRange,
  opts: { offset?: number } = {}
): Promise<CancellationData> {
  const client = await createClient();
  const args = baseArgs(tenantId, range);
  const offset = Math.max(opts.offset ?? 0, 0);

  const [summaryRows, actorRows, itemRows, listRows] = await Promise.all([
    rpc<CancelSummaryRow>(client, "report_cancel_summary", args),
    rpc<{ membership_id: string | null; display_name: string; role: string; cnt: number; qty: number; amount: number }>(
      client,
      "report_cancel_by_actor",
      args
    ),
    rpc<{ name: string; qty: number; amount: number }>(client, "report_cancel_top_items", {
      ...args,
      p_limit: 10,
    }),
    // Lấy dư 1 dòng để biết còn trang sau mà không cần thêm truy vấn đếm.
    rpc<{
      cancelled_at: string;
      place: string;
      item_name: string;
      qty: number;
      amount: number;
      reason: string;
      actor_name: string;
    }>(client, "report_cancel_list", { ...args, p_limit: CANCEL_PAGE + 1, p_offset: offset }),
  ]);

  const hasMore = listRows.length > CANCEL_PAGE;

  return {
    summary: toCancelSummary(summaryRows),
    actors: actorRows.map((r) => ({
      membershipId: r.membership_id,
      name: r.display_name,
      role: r.role,
      cnt: Number(r.cnt),
      qty: Number(r.qty),
      amount: Number(r.amount),
    })),
    items: itemRows.map((r) => ({ name: r.name, qty: Number(r.qty), amount: Number(r.amount) })),
    rows: (hasMore ? listRows.slice(0, CANCEL_PAGE) : listRows).map((r) => ({
      cancelledAt: r.cancelled_at,
      place: r.place,
      itemName: r.item_name,
      qty: Number(r.qty),
      amount: Number(r.amount),
      reason: r.reason,
      actorName: r.actor_name,
    })),
    hasMore,
  };
}
```

- [ ] **Step 9: Mở rộng `getComparison`**

Cùng file — `ComparisonData` thêm trường và hàm gọi thêm 1 RPC:

```ts
export type ComparisonData = { summary: RevenueSummary; series: number[]; cancel: CancelSummary };
```

```ts
  const [summaryRows, seriesRows, cancelRows] = await Promise.all([
    rpc<{ total_revenue: number; bill_count: number; avg_per_bill: number }>(client, "report_summary", args),
    rpc<{ bucket_start: string; revenue: number; bill_count: number }>(client, "report_series", {
      ...args,
      p_grain: prevRange.grain,
    }),
    rpc<CancelSummaryRow>(client, "report_cancel_summary", args),
  ]);

  return {
    summary: toSummary(summaryRows),
    series: fillSeries(prevRange, seriesRows).map((p) => p.revenue),
    cancel: toCancelSummary(cancelRows),
  };
```

- [ ] **Step 10: Kiểm tra biên dịch + test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi; toàn bộ test PASS.

- [ ] **Step 11: Commit**

```bash
git add lib/billing/cancel-format.ts tests/billing/cancel-format.test.ts lib/billing/reports.ts
git commit -m "feat(reports): tầng đọc thống kê món bị hủy"
```

---

### Task 6: REPORT-10 (giao diện) — khối "Món bị hủy"

**Files:**
- Create: `components/admin/reports/CancellationPanel.tsx`
- Modify: `app/r/[slug]/admin/(protected)/reports/page.tsx`

**Interfaces:**
- Consumes: `getCancellationData`, `CancellationData`, `CancelSummary`, `cancelRateLabel`, `cancelRateDeltaPoints` (Task 5); `KpiCard`, `formatVnd` (sẵn có).
- Produces: `CancellationPanel({ data, prev }: { data: CancellationData; prev: CancelSummary })`

- [ ] **Step 1: Viết component**

Tạo `components/admin/reports/CancellationPanel.tsx`:

```tsx
import type { CancellationData, CancelSummary } from "@/lib/billing/reports";
import { cancelRateLabel, cancelRateDeltaPoints } from "@/lib/billing/cancel-format";
import { deltaPct } from "@/lib/billing/report-range";
import { formatVnd } from "@/lib/orders/cart";
import { KpiCard } from "./KpiCard";

const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ quán",
  manager: "Quản lý",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  kitchen: "Bếp",
  station: "Máy trạm",
};

const VN_OFFSET = 7 * 3600 * 1000;

/** "HH:MM dd/mm" giờ VN — kỳ báo cáo có thể trải nhiều ngày nên phải kèm ngày. */
function vnStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + VN_OFFSET).toISOString();
  return `${d.slice(11, 16)} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/**
 * Khối "Món bị hủy" (REPORT-10) — gồm CẢ đơn tại bàn lẫn mang về.
 *
 * Con số tiền ở đây là GIÁ TRỊ MÓN BỊ HỦY, không phải doanh thu mất: khách hủy phở rồi gọi bún
 * thì quán không mất đồng nào. Ghi chú thẳng dưới KPI vì đặt cạnh các khối doanh thu khác rất
 * dễ bị trừ nhầm vào doanh thu.
 */
export function CancellationPanel({ data, prev }: { data: CancellationData; prev: CancelSummary }) {
  const { summary, actors, items, rows } = data;

  if (summary.cancelledQty === 0) {
    return <p className="text-sm text-steel">Kỳ này không có món nào bị hủy.</p>;
  }

  const ratePoints = cancelRateDeltaPoints(summary, prev);

  return (
    <div className="flex flex-col gap-lg">
      <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
        <KpiCard
          label="Số món bị hủy"
          value={`${summary.cancelledQty} món`}
          delta={deltaPct(summary.cancelledQty, prev.cancelledQty)}
          hint={`Kỳ trước: ${prev.cancelledQty} món`}
        />
        <KpiCard
          label="Giá trị món bị hủy"
          value={formatVnd(summary.cancelledAmount)}
          delta={deltaPct(summary.cancelledAmount, prev.cancelledAmount)}
          hint={`Kỳ trước: ${formatVnd(prev.cancelledAmount)}`}
        />
        <KpiCard
          label="Tỷ lệ hủy"
          value={cancelRateLabel(summary.cancelledQty, summary.orderedQty)}
          hint={
            ratePoints === null
              ? "Kỳ trước chưa đủ dữ liệu để so sánh"
              : `${ratePoints > 0 ? "+" : ""}${String(ratePoints).replace(".", ",")} điểm so kỳ trước · trên ${summary.orderedQty} món đã gọi`
          }
        />
      </div>

      <p className="text-xs text-steel">
        Đây là <strong className="font-medium text-ink">giá trị món bị hủy</strong>, không phải doanh thu
        mất — khách hủy món này thường gọi món khác thay thế.
      </p>

      <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
        <div>
          <h3 className="mb-sm text-sm font-medium text-ink">Theo người duyệt hủy</h3>
          <ul className="flex flex-col divide-y divide-hairline-soft">
            {actors.map((a) => (
              <li
                key={a.membershipId ?? "unknown"}
                className="flex items-baseline justify-between gap-md py-xs"
              >
                <span className="min-w-0 truncate text-sm text-ink">
                  {a.name}
                  {ROLE_LABEL[a.role] && (
                    <span className="ml-xs text-xs text-steel">({ROLE_LABEL[a.role]})</span>
                  )}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-steel">
                  {a.qty} món · <span className="font-medium text-ink">{formatVnd(a.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-sm text-sm font-medium text-ink">Món bị hủy nhiều nhất</h3>
          <ul className="flex flex-col divide-y divide-hairline-soft">
            {items.map((i) => (
              <li key={i.name} className="flex items-baseline justify-between gap-md py-xs">
                <span className="min-w-0 truncate text-sm text-ink">{i.name}</span>
                <span className="shrink-0 text-sm tabular-nums text-steel">
                  {i.qty} món · <span className="font-medium text-ink">{formatVnd(i.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h3 className="mb-sm text-sm font-medium text-ink">Chi tiết</h3>
        {/* Bảng rộng tự cuộn ngang trong khung của nó — trang không được cuộn ngang theo. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-steel">
                <th className="py-xs pr-md font-medium">Lúc</th>
                <th className="py-xs pr-md font-medium">Nơi</th>
                <th className="py-xs pr-md font-medium">Món</th>
                <th className="py-xs pr-md text-right font-medium">SL</th>
                <th className="py-xs pr-md text-right font-medium">Giá trị</th>
                <th className="py-xs pr-md font-medium">Lý do</th>
                <th className="py-xs font-medium">Người duyệt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.cancelledAt}-${idx}`} className="border-b border-hairline-soft">
                  <td className="py-sm pr-md whitespace-nowrap tabular-nums text-steel">
                    {vnStamp(r.cancelledAt)}
                  </td>
                  <td className="py-sm pr-md whitespace-nowrap text-ink">{r.place}</td>
                  <td className="py-sm pr-md text-ink">{r.itemName}</td>
                  <td className="py-sm pr-md text-right tabular-nums text-ink">{r.qty}</td>
                  <td className="py-sm pr-md text-right tabular-nums text-ink">{formatVnd(r.amount)}</td>
                  <td className="py-sm pr-md text-steel">{r.reason}</td>
                  <td className="py-sm whitespace-nowrap text-steel">{r.actorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.hasMore && (
          <p className="mt-sm text-xs text-steel">
            Chỉ hiện {rows.length} lượt hủy gần nhất của kỳ này. Thu hẹp khoảng ngày để xem phần còn lại.
          </p>
        )}
      </div>
    </div>
  );
}
```

**Ghi chú về "Tải thêm":** trang báo cáo là Server Component, không có state client. Thay vì dựng thêm một client component chỉ để phân trang, khối này hiện 20 lượt gần nhất và nói rõ còn nữa. `getCancellationData` đã nhận `offset` nên khi cần phân trang thật thì chỉ việc thêm client wrapper — không phải sửa tầng dữ liệu. Đây là **lệch có chủ đích so với spec** (spec ghi nút "Tải thêm").

- [ ] **Step 2: Nối vào trang báo cáo**

Trong `app/r/[slug]/admin/(protected)/reports/page.tsx`:

Thêm import:

```ts
import { getReportData, getComparison, getCancellationData, type ReportData, type ComparisonData, type CancellationData } from "@/lib/billing/reports";
import { CancellationPanel } from "@/components/admin/reports/CancellationPanel";
```

Mở rộng khối tải dữ liệu:

```ts
  let data: ReportData;
  let prev: ComparisonData;
  let cancellations: CancellationData;
  try {
    [data, prev, cancellations] = await Promise.all([
      getReportData(session.tenant.id, range),
      getComparison(session.tenant.id, prevRange),
      getCancellationData(session.tenant.id, range),
    ]);
  } catch (err) {
```

Trong thông báo lỗi, đổi tên migration được nhắc:

```tsx
            {err instanceof Error ? err.message : "Lỗi không xác định."} Thử tải lại trang; nếu vẫn lỗi, kiểm tra
            migration <code className="font-mono text-xs">0023_report_rpcs.sql</code> và{" "}
            <code className="font-mono text-xs">0028_cancel_report_rpcs.sql</code> đã chạy chưa.
```

Thêm section — đặt **sau** khối `{!hasData ? … : …}`, tức là ngoài điều kiện `hasData`. Lý do: kỳ có thể **không có hóa đơn nào** nhưng vẫn có món bị hủy (hủy hết thì không phát sinh doanh thu) — giấu khối này sau `hasData` là giấu đúng lúc cần nhất.

```tsx
      <Panel title="Món bị hủy" className="mt-lg">
        <CancellationPanel data={cancellations} prev={prev.cancel} />
      </Panel>
```

- [ ] **Step 3: Kiểm tra biên dịch + lint + test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: không lỗi.

- [ ] **Step 4: Kiểm thủ công — ca chính của REPORT-10**

Vào `/r/<slug>/admin/reports`, chọn kỳ "Hôm nay".

**Expected:**
- Khối "Món bị hủy" hiện ở cuối trang.
- KPI "Số món bị hủy" khớp với các lượt hủy đã tạo ở Task 2 và Task 3 — **gồm cả lượt hủy dine-in ở Task 2** (đây là điểm khác biệt chính so với lịch sử POS).
- Bảng "Theo người duyệt" có tên bạn; "Chi tiết" hiện đúng giờ, nơi (`Bàn 4` cho dine-in, `Đơn #N` cho mang về), lý do.
- Tỷ lệ hủy hiện dạng `x,xx%`.

Đối chiếu bằng SQL:

```sql
select coalesce(sum(qty), 0) as cancelled_qty
  from public.order_items
 where tenant_id = '<tenant-uuid>'
   and status = 'cancelled'
   and cancelled_at >= (current_date at time zone 'Asia/Ho_Chi_Minh');
```

Expected: khớp KPI "Số món bị hủy".

Chụp màn hình khối + kết quả SQL.

- [ ] **Step 5: Kiểm ca rỗng**

Chọn một kỳ chắc chắn không có lượt hủy nào (vd tháng trước, nếu tenant dev mới dùng).
Expected: khối hiện đúng câu "Kỳ này không có món nào bị hủy.", không có bảng trống.

- [ ] **Step 6: Commit**

```bash
git add components/admin/reports/CancellationPanel.tsx "app/r/[slug]/admin/(protected)/reports/page.tsx"
git commit -m "feat(reports): khối thống kê món bị hủy gồm cả dine-in (REPORT-10)"
```

---

### Task 7: Cập nhật tài liệu yêu cầu

**Files:**
- Modify: `docs/20-DanhSachYeuCau/00-Requirements.md`

**Interfaces:**
- Consumes: kết quả Task 1–6.
- Produces: —

- [ ] **Step 1: Thêm 4 dòng yêu cầu**

Trong `docs/20-DanhSachYeuCau/00-Requirements.md`, thêm vào đúng bảng/nhóm tương ứng (ORDER-xx cạnh ORDER-16, REPORT-10 cạnh REPORT-09, BILL-06 cạnh BILL-05), giữ nguyên số cột của bảng hiện có:

```markdown
| ORDER-17 | Lịch sử POS hiện lý do hủy | Tab "Đã xong" → đơn/món bị hủy hiện `Đã hủy HH:MM · "<lý do>" · <tên> (<vai trò>)`; hủy cả đơn thì lý do hiện MỘT lần ở đầu thẻ, không lặp ở từng món | P7 | ☐ |
| ORDER-18 | Lọc đơn hủy + tách con số tổng kết | Chip **Tất cả / Đã thu / Đã hủy** lọc ở SERVER (đơn ngoài trang hiện tại vẫn ra); dòng tổng kết tách `<N> đơn đã thu · <tiền>` và `<M> đơn hủy` | P7 | ☐ |
| BILL-06 | Hủy món trừ đúng tiền hóa đơn đang mở | Bàn có bill `open`, hủy 1 món → tổng bill giảm đúng tiền món đó; hủy hết món → bill bị xóa, bàn về "chưa có hóa đơn". Không đụng bill `paid` | P7 | ☐ |
| REPORT-10 | Thống kê món bị hủy | `/admin/reports` có khối "Món bị hủy": 3 KPI (số món · giá trị · tỷ lệ % kèm biến động theo ĐIỂM) + theo người duyệt + top món + chi tiết; **gồm cả dine-in lẫn mang về** | P7 | ☐ |
```

Kiểm tra cột "Phase" (`P7` ở trên) khớp với quy ước đang dùng trong file — nếu dự án đang ở phase khác thì dùng số phase hiện hành.

- [ ] **Step 2: Đổi trạng thái 4 dòng mới + ORDER-05**

Sau khi Task 1–6 đã kiểm thủ công xong, đổi cột trạng thái của ORDER-17, ORDER-18, BILL-06, REPORT-10 sang `◐ code+kiểm xong; chờ checkpoint` (theo văn phong các dòng khác trong file).

Dòng ORDER-05 ("Hủy/sửa món có kiểm soát — có log") đang là `☐`: phần "kiểm soát" xong từ P3, phần "có log" vừa xong ở đây → đổi sang `◐ code+kiểm xong; chờ checkpoint` và ghi chú `log đọc lại được ở ORDER-17/18 + REPORT-10`.

- [ ] **Step 3: Commit**

```bash
git add docs/20-DanhSachYeuCau/00-Requirements.md
git commit -m "docs: thêm ORDER-17/18, BILL-06, REPORT-10 vào danh sách yêu cầu"
```

---

## Tổng kiểm cuối

- [ ] `npx tsc --noEmit` — không lỗi
- [ ] `npm run lint` — không lỗi
- [ ] `npm test` — toàn bộ PASS (4 file test mới: `cancel-cleanup`, `cancel-label`, `history-filter`, `cancel-format`)
- [ ] Cả hai migration `0027`, `0028` đã áp lên dev, truy vấn kiểm chứng trả đúng
- [ ] Có ảnh chụp cho: BILL-06 (bill giảm tiền + bill bị xóa), ORDER-17 (dòng lý do), ORDER-18 (3 chip), REPORT-10 (khối + đối chiếu SQL)
- [ ] Báo cáo phần việc theo quy trình VibeCode: file đã đổi, bằng chứng, trạng thái từng cam kết
