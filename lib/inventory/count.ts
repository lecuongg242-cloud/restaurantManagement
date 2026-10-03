import { parseQty, toBaseQty } from "./units";

/**
 * Lệch kiểm kê (INV-11, P25). Số đếm luôn là số đúng — không chặn đếm dư hay đếm thiếu (như KiotViet "Kiểm kho"), nhưng
 * người đếm phải THẤY lệch bao nhiêu trước khi ghi, và lệch lớn thì phải xác nhận (gõ 82 thay vì 8,2).
 * Mọi số ở đây theo đơn vị nhập (kg), giá theo đơn vị nhập (đ/kg).
 */

/** Lệch quá tỉ lệ này của tồn sổ thì hỏi lại. */
export const BIG_DIFF_RATIO = 0.5;

/** Thực tế − tồn sổ, 3 chữ số lẻ (0,8 − 1 ra −0,2 chứ không phải −0,19999…). */
export function countDiff(theoretical: number, counted: number): number {
  return Math.round((counted - theoretical) * 1000) / 1000;
}

/** Lệch lớn = |lệch| quá 50% |tồn sổ|. Sổ 0 thì đếm được gì cũng là lệch lớn. */
export function isBigDiff(theoretical: number, counted: number): boolean {
  return Math.abs(countDiff(theoretical, counted)) > BIG_DIFF_RATIO * Math.abs(theoretical);
}

export type CountLine = { theoretical: number; counted: number; unitPrice: number | null };

export type CountSummary = {
  matched: number;
  up: { count: number; value: number };
  down: { count: number; value: number };
  /** Dòng lệch mà nguyên liệu chưa có giá — không tính được tiền. */
  unpriced: number;
};

/** Tổng "Lệch tăng / Lệch giảm" cuối phiếu kiểm. Giá trị lệch giảm là số âm. */
export function countSummary(lines: CountLine[]): CountSummary {
  const s: CountSummary = { matched: 0, up: { count: 0, value: 0 }, down: { count: 0, value: 0 }, unpriced: 0 };
  for (const l of lines) {
    const diff = countDiff(l.theoretical, l.counted);
    if (diff === 0) {
      s.matched++;
      continue;
    }
    const side = diff > 0 ? s.up : s.down;
    side.count++;
    if (l.unitPrice === null) s.unpriced++;
    else side.value += Math.round(diff * l.unitPrice);
  }
  return s;
}

/**
 * Ô "Thực tế" (P26). Trống = chưa đếm (null). "0" = đếm hết hàng. Gõ sai (số âm, chữ) = KHÔNG hợp lệ — dùng chung cho form
 * và server, để màn hình không coi là "chưa đếm" trong khi server từ chối cả phiếu.
 */
export function parseCount(raw: string): { ok: true; value: number } | { ok: false } | null {
  const s = raw.trim();
  if (!s) return null;
  if (s === "0") return { ok: true, value: 0 };
  const n = parseQty(s);
  return n === null ? { ok: false } : { ok: true, value: n };
}

/** Đơn vị người đếm chọn trên dòng: đơn vị nhập (thùng, kg) hoặc đơn vị trừ kho (chai, g) — như KiotViet. */
export type CountUnit = "purchase" | "base";

/** Số đếm → đơn vị gốc. Đếm thẳng theo đơn vị trừ kho thì không nhân, nên 69 chai không thành 69,12. */
export function countToBase(value: number, unit: CountUnit, factor: number): number {
  return unit === "base" ? value : toBaseQty(value, factor);
}
