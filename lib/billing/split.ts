/**
 * Logic tách bill — THUẦN, không I/O (có test ở tests/billing/split.test.ts).
 *  - planSplitByItems: tách theo món (di chuyển suất bill_items sang bill mới) — giữ bất biến
 *    Σ qty_allocated per order_item = qty.
 *  - planSplitEvenly: chia total thành N phần integer VND (dư dồn phần cuối, Σ phần = total).
 * Nghiệp vụ ghi DB ở bill.ts dùng các plan này.
 */

export type SplitSourceLine = {
  billItemId: string;
  orderItemId: string;
  qtyAllocated: number;
  unitPrice: number;
};

export type SplitPick = { billItemId: string; qty: number };

export type SplitByItemsPlan = {
  /** Dòng cho bill MỚI (phần chuyển đi). */
  newBillItems: { orderItemId: string; qtyAllocated: number; unitPrice: number; amount: number }[];
  /** Cập nhật dòng nguồn: giảm qty (amount tính lại) hoặc xóa nếu về 0. */
  sourceUpdates: { billItemId: string; qtyAllocated: number; amount: number }[];
  sourceDeletes: string[]; // billItemId cần xóa (chuyển hết suất)
};

/**
 * Tách theo món: chuyển `picks` suất từ bill nguồn sang bill mới. Ném lỗi (throw) nếu pick không
 * hợp lệ hoặc tách toàn bộ (bill nguồn rỗng). Không đổi order_items — chỉ phân bổ lại bill_items.
 */
export function planSplitByItems(source: SplitSourceLine[], picks: SplitPick[]): SplitByItemsPlan {
  const byId = new Map(source.map((s) => [s.billItemId, s]));
  const plan: SplitByItemsPlan = { newBillItems: [], sourceUpdates: [], sourceDeletes: [] };

  let totalPicked = 0;
  let totalSource = 0;
  for (const s of source) totalSource += s.qtyAllocated;

  for (const pick of picks) {
    const src = byId.get(pick.billItemId);
    if (!src) throw new Error("Dòng cần tách không thuộc hóa đơn.");
    const q = Math.round(pick.qty);
    if (q < 1) continue; // bỏ qua pick 0
    if (q > src.qtyAllocated) throw new Error(`Tách quá số suất còn lại của một món.`);

    plan.newBillItems.push({
      orderItemId: src.orderItemId,
      qtyAllocated: q,
      unitPrice: src.unitPrice,
      amount: src.unitPrice * q,
    });
    const remain = src.qtyAllocated - q;
    if (remain === 0) plan.sourceDeletes.push(src.billItemId);
    else plan.sourceUpdates.push({ billItemId: src.billItemId, qtyAllocated: remain, amount: src.unitPrice * remain });
    totalPicked += q;
  }

  if (plan.newBillItems.length === 0) throw new Error("Chưa chọn suất nào để tách.");
  if (totalPicked >= totalSource) throw new Error("Không thể tách toàn bộ — hóa đơn nguồn sẽ rỗng.");
  return plan;
}

/**
 * Chia `total` (integer VND) thành `n` phần bằng nhau; phần dư (do làm tròn) dồn phần CUỐI.
 * Đảm bảo Σ phần = total. n ≥ 2.
 */
export function planSplitEvenly(total: number, n: number): number[] {
  const count = Math.max(2, Math.round(n));
  const t = Math.max(0, Math.round(total));
  const base = Math.floor(t / count);
  const shares = Array.from({ length: count }, () => base);
  shares[count - 1] += t - base * count; // dồn dư vào phần cuối
  return shares;
}
