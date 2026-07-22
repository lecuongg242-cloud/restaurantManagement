import { describe, it, expect } from "vitest";
import { planSplitByItems, planSplitEvenly, type SplitSourceLine } from "@/lib/billing/split";

const src: SplitSourceLine[] = [
  { billItemId: "a", orderItemId: "oiA", qtyAllocated: 2, unitPrice: 50_000 }, // Phở ×2
  { billItemId: "b", orderItemId: "oiB", qtyAllocated: 3, unitPrice: 10_000 }, // Trà ×3
];

describe("planSplitByItems", () => {
  it("chuyển 1 Phở + 2 Trà sang bill mới, nguồn giữ phần còn lại", () => {
    const p = planSplitByItems(src, [
      { billItemId: "a", qty: 1 },
      { billItemId: "b", qty: 2 },
    ]);
    expect(p.newBillItems).toEqual([
      { orderItemId: "oiA", qtyAllocated: 1, unitPrice: 50_000, amount: 50_000 },
      { orderItemId: "oiB", qtyAllocated: 2, unitPrice: 10_000, amount: 20_000 },
    ]);
    expect(p.sourceUpdates).toEqual([
      { billItemId: "a", qtyAllocated: 1, amount: 50_000 },
      { billItemId: "b", qtyAllocated: 1, amount: 10_000 },
    ]);
    expect(p.sourceDeletes).toEqual([]);
  });

  it("chuyển hết suất 1 dòng → dòng nguồn bị xóa", () => {
    const p = planSplitByItems(src, [{ billItemId: "b", qty: 3 }]);
    expect(p.newBillItems[0]).toMatchObject({ orderItemId: "oiB", qtyAllocated: 3, amount: 30_000 });
    expect(p.sourceDeletes).toEqual(["b"]);
    expect(p.sourceUpdates).toEqual([]);
  });

  it("chặn tách quá suất còn lại", () => {
    expect(() => planSplitByItems(src, [{ billItemId: "a", qty: 3 }])).toThrow();
  });

  it("chặn tách toàn bộ (nguồn rỗng)", () => {
    expect(() =>
      planSplitByItems(src, [
        { billItemId: "a", qty: 2 },
        { billItemId: "b", qty: 3 },
      ])
    ).toThrow();
  });

  it("chặn khi chưa chọn suất nào", () => {
    expect(() => planSplitByItems(src, [{ billItemId: "a", qty: 0 }])).toThrow();
  });
});

describe("planSplitEvenly", () => {
  it("chia 300.000 cho 3 → [100k,100k,100k]", () => {
    expect(planSplitEvenly(300_000, 3)).toEqual([100_000, 100_000, 100_000]);
  });

  it("chia lẻ 100.000 cho 3 → dư dồn phần cuối, Σ = total", () => {
    const s = planSplitEvenly(100_000, 3);
    expect(s).toEqual([33_333, 33_333, 33_334]);
    expect(s.reduce((a, b) => a + b, 0)).toBe(100_000);
  });

  it("n < 2 ép về 2", () => {
    expect(planSplitEvenly(100, 1)).toEqual([50, 50]);
  });
});
