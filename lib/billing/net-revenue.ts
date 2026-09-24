/**
 * Doanh thu THUẦN của từng dòng món trong một bill (QD-017 D8, REPORT-13).
 *
 * `bill_items.amount` là giá niêm yết × số lượng — CHƯA trừ giảm giá; giảm giá nằm ở cấp bill.
 * Chia giảm giá theo tỷ lệ tiền, làm tròn xuống từng dòng, phần dư dồn vào dòng tiền lớn nhất
 * (bằng nhau thì dòng đứng trước) để Σ đúng bằng `subtotal − discount`.
 *
 * Hàm SQL `report_gross_margin` (0048) làm ĐÚNG phép này bằng window function; test so hai bản.
 */
export function allocateDiscount(lines: number[], subtotal: number, discount: number): number[] {
  const net = subtotal - discount;
  if (!(subtotal > 0)) return lines.map(() => 0);
  const out = lines.map((a) => Math.floor((a * net) / subtotal));
  let top = 0;
  for (let i = 1; i < lines.length; i++) if (lines[i] > lines[top]) top = i;
  if (lines.length > 0) out[top] += net - out.reduce((s, x) => s + x, 0);
  return out;
}
