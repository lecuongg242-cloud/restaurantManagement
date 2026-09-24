import { VN_OFFSET_MS } from "@/lib/billing/report-range";

/**
 * Ngày kinh doanh = ngày theo giờ Việt Nam, cắt lúc 00:00 — giống `bill_no` và mọi báo cáo hiện có
 * (QD-017, cạm bẫy 10-03). Luôn tính ở SERVER, không nhận ngày từ máy nhân viên.
 *
 * Việt Nam không có giờ mùa hè nên cộng cố định +7 giờ là đúng quanh năm.
 */
export function businessDate(now: Date = new Date()): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** "2026-09-30" + 1 → "2026-10-01". Tính trên UTC nửa đêm nên không dính múi giờ máy chạy. */
export function addDays(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Mốc bắt đầu (UTC ISO) của một ngày kinh doanh — 00:00 giờ VN. */
export function dayStartUtc(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - VN_OFFSET_MS).toISOString();
}
