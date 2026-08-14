/**
 * Mốc "tiền về lúc nào" của một lần thu — THUẦN HÀM, không chạm DB.
 * Tách riêng khỏi `bill.ts` (có "server-only") để unit test được bằng vitest, giống cách
 * `report-range.ts` tách khỏi `reports.ts`.
 */

/** Lùi ngày tối đa khi thu bù. Quá mốc này là chuyện của kế toán, không phải của màn POS. */
export const BACKDATE_MAX_DAYS = 7;

/** Lệch đồng hồ máy trạm coi như không đáng kể — không đòi quyền, không chặn. */
const CLOCK_SKEW_MS = 5 * 60_000;

/**
 * Chốt mốc tiền về cho một lần thu.
 *
 * Bình thường = bây giờ. Nhưng khi nhân viên đã cầm tiền hôm trước mà quên bấm (hoặc mất mạng
 * lúc bấm), ghi mốc "bây giờ" là sai CẢ HAI chiều: sai doanh thu (món phục vụ hôm trước) lẫn sai
 * két (tối hôm trước đếm tiền đã thừa đúng khoản đó). Nên phải ghi lại được đúng thời điểm thật.
 *
 * Vì lùi ngày = sửa được doanh thu, chỉ chủ/quản lý mới được dùng, và không lùi quá
 * `BACKDATE_MAX_DAYS` ngày. Mốc tương lai luôn bị từ chối.
 */
export function resolveReceivedAt(
  receivedAt: string | null | undefined,
  canBackdate: boolean,
  now: Date = new Date()
): { at: string } | { error: string } {
  if (!receivedAt) return { at: now.toISOString() };

  const at = new Date(receivedAt);
  if (Number.isNaN(at.getTime())) return { error: "Thời điểm nhận tiền không hợp lệ." };

  const drift = at.getTime() - now.getTime();
  if (drift > CLOCK_SKEW_MS) return { error: "Không ghi nhận thời điểm ở tương lai." };
  if (-drift > BACKDATE_MAX_DAYS * 86_400_000)
    return { error: `Chỉ được ghi lùi tối đa ${BACKDATE_MAX_DAYS} ngày.` };
  if (Math.abs(drift) > CLOCK_SKEW_MS && !canBackdate)
    return { error: "Chỉ chủ quán hoặc quản lý được ghi lùi thời điểm nhận tiền." };

  return { at: at.toISOString() };
}
