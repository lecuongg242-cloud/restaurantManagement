/**
 * "% dùng được" TỰ TÍNH từ số đo (chủ dự án 29/09/2026 — không để người dùng gõ tay). Thuần.
 *
 * Một MẪU = khoảng từ sau lần kiểm kê trước tới hết một ngày có kiểm kê (quán nhập một lần dùng nhiều ngày, hay kiểm kê
 * 2–3 ngày một lần đều được — chênh lệch đếm được là của cả khoảng đó):
 *   - lý thuyết (thành phẩm) = Σ order_usage × yield ngày đó ÷ 100 — order_usage trong bản chốt là lượng THÔ (= định
 *     lượng × số bán ÷ yield), nhân ngược lại ra định lượng × số bán
 *   - thực dùng (thô)        = Σ order_usage − adjust của ngày kiểm kê (tồn đếm = tồn lý thuyết + adjust; tồn lý thuyết
 *     đã trừ nhập, mẻ, xuất hủy nên không cần có nhập trong khoảng đó)
 * % dùng được = Σ lý thuyết ÷ Σ thực dùng của 14 mẫu gần nhất, kẹp [1, 100], làm tròn số nguyên (cột int).
 *
 * Con số GỘP mọi hao hụt khi dùng (gọt bỏ, rơi vãi, múc dư…) — sát giá vốn thực tế một phần. Lấy nhiều mẫu (không riêng
 * hôm nay) để ngày hụt bất thường vẫn hiện ra ở báo cáo hao hụt.
 */
export const YIELD_WINDOW_DAYS = 14;

export type YieldSample = { day: string; theory: number; actual: number };

export function measureYield(samples: YieldSample[]): { pct: number | null; days: number } {
  const used = [...samples]
    .filter((s) => s.theory > 0)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, YIELD_WINDOW_DAYS);
  const theory = used.reduce((s, x) => s + x.theory, 0);
  const actual = used.reduce((s, x) => s + x.actual, 0);
  if (used.length === 0 || theory <= 0 || actual <= 0) return { pct: null, days: 0 };
  const pct = Math.round((theory / actual) * 100);
  return { pct: Math.min(100, Math.max(1, pct)), days: used.length };
}

/**
 * Bản chốt → mẫu của từng nguyên liệu MUA VÀO. `fallback` = yield hiện tại (bản chốt cũ chưa lưu yield ngày đó).
 * `truncated` = còn bản chốt cũ hơn khoảng đã đọc ⇒ mẫu ĐẦU của mỗi nguyên liệu thiếu phần đầu khoảng → bỏ.
 */
export function yieldSamples(
  closes: { business_date: string; payload: unknown }[],
  fallback: Map<string, number>,
  truncated = false
): Map<string, YieldSample[]> {
  const acc = new Map<string, { theory: number; usage: number }>();
  const out = new Map<string, YieldSample[]>();
  const seenCount = new Set<string>();
  for (const c of [...closes].sort((a, b) => a.business_date.localeCompare(b.business_date))) {
    const p = c.payload as { ingredients?: Record<string, unknown>[] } | null;
    for (const ing of p?.ingredients ?? []) {
      const id = String(ing.id);
      if (ing.kind !== "purchased" || !fallback.has(id)) continue;
      const ou = Number(ing.order_usage ?? 0);
      const y = typeof ing.yield_pct === "number" ? ing.yield_pct : fallback.get(id)!;
      const a = acc.get(id) ?? { theory: 0, usage: 0 };
      a.theory += (ou * y) / 100;
      a.usage += ou;
      if (ing.counted === true) {
        const first = !seenCount.has(id);
        seenCount.add(id);
        if (!(first && truncated)) {
          const arr = out.get(id) ?? [];
          arr.push({ day: c.business_date, theory: a.theory, actual: a.usage - Number(ing.adjust ?? 0) });
          out.set(id, arr);
        }
        acc.set(id, { theory: 0, usage: 0 });
      } else {
        acc.set(id, a);
      }
    }
  }
  return out;
}
