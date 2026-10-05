import { gioNgayVn } from "@/lib/time/vn";
import { VN_OFFSET_MS } from "@/lib/billing/report-range";

/**
 * Kiểm kê là MỐC KHÓA (P34, QD-034 D2 — như iPOS): phiếu kiểm kê đã cân bằng lúc T chặn mọi thay đổi có thời gian ≤ T của
 * cùng nguyên liệu. Hàm SQL `assert_no_lock` ném `vuong_kiem_ke` kèm `detail` = mảng JSON các phiếu vướng.
 */
export type LockConflict = { ingredient: string; count_id: string; code: string; at: string };

/** Dòng của RPC `inventory_lock_conflicts`. */
export type LockRow = { ingredient_id: string; ingredient_name: string; count_id: string; count_code: string; counted_at: string };

export const toConflicts = (rows: LockRow[]): LockConflict[] =>
  rows.map((r) => ({ ingredient: r.ingredient_name, count_id: r.count_id, code: r.count_code, at: r.counted_at }));

/** `detail` của lỗi `vuong_kiem_ke` → danh sách; không phải lỗi đó / không đọc được → null. */
export function parseLockDetail(message: string | undefined | null, details: string | undefined | null): LockConflict[] | null {
  if (!message?.includes("vuong_kiem_ke") || !details) return null;
  try {
    const arr = JSON.parse(details) as LockConflict[];
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
  } catch {
    return null;
  }
}

/** "Thịt bò thăn — đã kiểm kê lúc 21:45 05/10 (phiếu KK000012)", gộp nguyên liệu cùng phiếu. */
export function lockLines(conflicts: LockConflict[]): string[] {
  const byCount = new Map<string, { code: string; at: string; names: string[] }>();
  for (const c of conflicts) {
    const g = byCount.get(c.count_id) ?? { code: c.code, at: c.at, names: [] };
    if (!g.names.includes(c.ingredient)) g.names.push(c.ingredient);
    byCount.set(c.count_id, g);
  }
  return [...byCount.values()].map((g) => `${g.names.join(", ")} — đã kiểm kê lúc ${gioNgayVn(g.at)} (phiếu ${g.code})`);
}

export const LOCK_HOWTO =
  "Cách làm: Hủy phiếu kiểm kê → ghi phiếu này → Hoàn thành lại phiếu kiểm kê (giữ số đã đếm).";

/** Một câu cho thông báo góc màn. */
export function lockMessage(conflicts: LockConflict[], what: string): string {
  return `${what}: ${lockLines(conflicts).join("; ")}. ${LOCK_HOWTO}`;
}

/**
 * Ô "Thời gian nhập" gửi "2026-10-05T14:00" theo GIỜ VN (không phụ thuộc múi giờ máy chủ / máy nhân viên) → ISO UTC.
 * Trống / sai → null (= lúc bấm Hoàn thành).
 */
export function parseVnDateTime(raw: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(raw ?? "").trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const t = Date.UTC(y, mo - 1, d, h, mi) - VN_OFFSET_MS;
  const back = new Date(t + VN_OFFSET_MS);
  // 2026-02-31 → Date.UTC tự tràn sang tháng 3: coi là sai.
  if (back.getUTCDate() !== d || back.getUTCMonth() !== mo - 1 || back.getUTCHours() !== h) return null;
  return new Date(t).toISOString();
}

/** ISO → "2026-10-05T14:00" giờ VN, để điền lại ô datetime-local. */
export function toVnDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + VN_OFFSET_MS).toISOString().slice(0, 16);
}
