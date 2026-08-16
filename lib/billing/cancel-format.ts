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
