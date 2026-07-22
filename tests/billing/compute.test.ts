import { describe, it, expect } from "vitest";
import { computeBillTotals } from "@/lib/billing/compute";
import type { ComputeBillInput } from "@/lib/billing/types";

const base = (over: Partial<ComputeBillInput> = {}): ComputeBillInput => ({
  lines: [{ amount: 100_000 }, { amount: 50_000 }],
  discountType: "none",
  discountValue: 0,
  serviceChargePct: 0,
  vatPct: 0,
  ...over,
});

describe("computeBillTotals (§3.5)", () => {
  it("(a) 0% phí, 0% VAT, không giảm → total = subtotal", () => {
    const t = computeBillTotals(base());
    expect(t.subtotal).toBe(150_000);
    expect(t.discountAmount).toBe(0);
    expect(t.serviceChargeAmount).toBe(0);
    expect(t.vatAmount).toBe(0);
    expect(t.total).toBe(150_000);
  });

  it("(b) chỉ VAT 8% → vat = round(subtotal*8/100)", () => {
    const t = computeBillTotals(base({ vatPct: 8 }));
    expect(t.vatAmount).toBe(12_000);
    expect(t.total).toBe(162_000);
  });

  it("(c) phí 5% + VAT 8% — VAT tính trên (subtotal + phí)", () => {
    const t = computeBillTotals(base({ serviceChargePct: 5, vatPct: 8 }));
    // phí = 150.000*5% = 7.500 ; VAT = (150.000+7.500)*8% = 12.600
    expect(t.serviceChargeAmount).toBe(7_500);
    expect(t.vatAmount).toBe(12_600);
    expect(t.total).toBe(170_100);
  });

  it("(d) giảm số tiền > subtotal → discount = subtotal, total = 0", () => {
    const t = computeBillTotals(
      base({ discountType: "amount", discountValue: 999_000, serviceChargePct: 5, vatPct: 8 })
    );
    expect(t.discountAmount).toBe(150_000);
    expect(t.serviceChargeAmount).toBe(0);
    expect(t.vatAmount).toBe(0);
    expect(t.total).toBe(0);
  });

  it("(e) giảm 10% + VAT 8% — thứ tự đúng, làm tròn lẻ", () => {
    const t = computeBillTotals(
      base({ lines: [{ amount: 33_333 }], discountType: "percent", discountValue: 10, vatPct: 8 })
    );
    // subtotal 33.333 ; giảm 10% = round(3.333,3)=3.333 ; sau giảm 30.000 ; VAT 8% = 2.400
    expect(t.subtotal).toBe(33_333);
    expect(t.discountAmount).toBe(3_333);
    expect(t.vatAmount).toBe(2_400);
    expect(t.total).toBe(32_400);
  });

  it("(f) subtotal = 0 → mọi số = 0", () => {
    const t = computeBillTotals(base({ lines: [], serviceChargePct: 5, vatPct: 8 }));
    expect(t).toEqual({ subtotal: 0, discountAmount: 0, serviceChargeAmount: 0, vatAmount: 0, total: 0 });
  });

  it("(g) clamp pct ngoài [0,100] và discountValue âm", () => {
    const t = computeBillTotals(base({ vatPct: 150, discountType: "amount", discountValue: -10 }));
    expect(t.vatAmount).toBe(150_000); // vatPct kẹp về 100
    expect(t.discountAmount).toBe(0);
  });
});
