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

/**
 * Hệ số quy đổi của các đơn vị quen (chủ dự án 29/09/2026: gõ tay dẫn tới "1 kg = 100.000 kg"). Trả số đơn vị gốc trong
 * MỘT đơn vị mua; null = đơn vị riêng của quán (vỉ, thùng, bao, bó…) → người dùng tự khai. Không phân biệt hoa thường / dấu.
 */
const GRAM: Record<string, number> = { g: 1, gam: 1, gram: 1, kg: 1000, ki: 1000, kilo: 1000, kilogam: 1000, lang: 100, ta: 100_000, yen: 10_000 };
const ML: Record<string, number> = { ml: 1, "mi li lit": 1, mililit: 1, l: 1000, lit: 1000 };

function khongDau(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase().trim().replace(/\.$/, "");
}

export function knownFactor(purchaseUnit: string, base: "g" | "ml" | "cai" | "kg" | "l"): number | null {
  const u = khongDau(purchaseUnit);
  if (!u) return null;
  if (base === "g" || base === "kg") {
    const g = GRAM[u];
    if (g === undefined) return null;
    return base === "g" ? g : g / 1000;
  }
  if (base === "ml" || base === "l") {
    const m = ML[u];
    if (m === undefined) return null;
    return base === "ml" ? m : m / 1000;
  }
  return ["cai", "qua", "chiec", "con", "lon", "chai"].includes(u) ? 1 : null;
}
