/**
 * Quy đổi đơn vị nhập ↔ đơn vị gốc. Người ở quán nghĩ theo "kg", "vỉ"; hệ thống trừ tồn theo
 * "g", "cái". Chỉ đổi ở biên (form nhập, form giá) — bên trong mọi thứ là đơn vị gốc.
 */

function assertFactor(factor: number): void {
  if (!(factor > 0) || !Number.isFinite(factor)) {
    throw new Error("Hệ số quy đổi phải lớn hơn 0.");
  }
}

/** Làm tròn 6 chữ số lẻ để 0,35 × 1000 ra 350 chứ không phải 349,99999999999994. */
function clean(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** 2 (kg) × 1000 → 2000 (g). */
export function toBaseQty(qty: number, factor: number): number {
  assertFactor(factor);
  return clean(qty * factor);
}

/** 280.000đ / kg với 1 kg = 1000 g → 280đ / g. Không làm tròn: 0,15đ/g của muối phải còn. */
export function unitCostFromPurchase(price: number, factor: number): number {
  assertFactor(factor);
  return clean(price / factor);
}

/** Ngược lại của `unitCostFromPurchase`, để hiện giá trên form theo đơn vị nhập. */
export function purchasePrice(unitCost: number | null, factor: number): number | null {
  if (unitCost === null) return null;
  return Math.round(unitCost * factor);
}

/**
 * Đọc số lượng người gõ: nhận "0,5" (kiểu Việt) lẫn "0.5". Chỉ số dương — lượng 0 hay âm trên
 * form định lượng/nhập hàng luôn là gõ nhầm. Không dùng cho tiền (tiền đi qua `MoneyField`).
 */
export function parseQty(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}
