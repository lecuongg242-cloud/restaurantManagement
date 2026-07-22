/**
 * Tính tổng bill (§3.5) — THUẦN, không I/O, deterministic, integer VND. Nguồn sự thật duy nhất
 * cho công thức tiền (chống lệch doanh thu — có test ở tests/billing/compute.test.ts).
 *
 * Thứ tự áp:
 *   subtotal = Σ lines.amount
 *   discount = amount ? min(value, subtotal) : percent ? round(subtotal*value/100) : 0
 *   service_charge = round((subtotal - discount) * service_charge_pct/100)
 *   vat            = round((subtotal - discount + service_charge) * vat_pct/100)
 *   total          = subtotal - discount + service_charge + vat   (kẹp ≥ 0)
 */
import type { BillTotals, ComputeBillInput } from "./types";

/** Làm tròn nửa lên, trả integer (mọi đầu vào ≥ 0 nên Math.round là nửa-lên). */
function roundHalfUp(n: number): number {
  return Math.round(n);
}

/** Kẹp [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function computeBillTotals(input: ComputeBillInput): BillTotals {
  const subtotal = input.lines.reduce((s, l) => s + Math.max(0, Math.round(l.amount)), 0);

  const serviceChargePct = clamp(Math.round(input.serviceChargePct), 0, 100);
  const vatPct = clamp(Math.round(input.vatPct), 0, 100);
  const discountValue = Math.max(0, Math.round(input.discountValue));

  let discountAmount = 0;
  if (input.discountType === "amount") {
    discountAmount = Math.min(discountValue, subtotal);
  } else if (input.discountType === "percent") {
    discountAmount = roundHalfUp((subtotal * clamp(discountValue, 0, 100)) / 100);
  }
  discountAmount = clamp(discountAmount, 0, subtotal);

  const afterDiscount = subtotal - discountAmount;
  const serviceChargeAmount = roundHalfUp((afterDiscount * serviceChargePct) / 100);
  const vatAmount = roundHalfUp(((afterDiscount + serviceChargeAmount) * vatPct) / 100);
  const total = Math.max(0, afterDiscount + serviceChargeAmount + vatAmount);

  return { subtotal, discountAmount, serviceChargeAmount, vatAmount, total };
}
