/**
 * Gộp lịch sử in của MỘT loại phiếu thành trạng thái chip trên POS. Thuần hàm — tách khỏi
 * `app/r/[slug]/print/actions.ts` vì tệp "use server" chỉ được export hàm async, không test được.
 */
import type { TicketPrintState } from "@/lib/print/adapter";
import { phieuQuaHan } from "@/lib/print/cau-in";

export type JobRow = { type: string; status: string; created_at: string; printed_at: string | null };

/**
 * Một lượt in phiếu bếp tách theo bếp/bar (P37) ghi nhiều dòng CÙNG `created_at` (một lệnh insert) → gộp thành một lượt:
 * còn phiếu hỏng thì lượt hỏng; còn phiếu chờ thì lượt chờ; đủ cả mới là đã in (mốc in = phiếu ra sau cùng).
 */
function gopLuot(rows: JobRow[]): JobRow[] {
  const out: JobRow[] = [];
  for (const r of rows) {
    const prev = out[out.length - 1];
    if (!prev || prev.created_at !== r.created_at) {
      out.push({ ...r });
      continue;
    }
    if (r.status === "failed" || prev.status === "failed") prev.status = "failed";
    else if (r.status === "pending" || prev.status === "pending") prev.status = "pending";
    if (r.printed_at && (!prev.printed_at || r.printed_at > prev.printed_at)) prev.printed_at = r.printed_at;
  }
  return out;
}

/** Chưa in lần nào. */
export const CHUA_IN: TicketPrintState = { status: "none", at: null, count: 0 };

/**
 * `rows` sắp mới → cũ.
 *
 * - Lượt `superseded` bị BỎ QUA: nó đã được thay bằng lượt in lại, nhân viên cần thấy lượt mới.
 * - Lượt mới nhất còn `pending` quá ngưỡng → `stuck` (PRINT-06). Trước 09-03 chip quay "Đang gửi
 *   bếp…" mãi, kể cả khi cầu in đã chết từ sáng.
 */
export function toState(rows: JobRow[], now: number): TicketPrintState {
  const conHieuLuc = gopLuot(rows.filter((r) => r.status !== "superseded"));
  if (conHieuLuc.length === 0) return CHUA_IN;

  const latest = conHieuLuc[0];
  const printed = conHieuLuc.filter((r) => r.status === "printed");
  const status: TicketPrintState["status"] =
    latest.status === "pending" && phieuQuaHan(latest.created_at, now)
      ? "stuck"
      : (latest.status as TicketPrintState["status"]);

  return {
    status,
    // Mốc giờ lấy của lần IN THÀNH CÔNG gần nhất — lần đang chờ/hỏng chưa ra tờ phiếu nào.
    at: printed[0] ? printed[0].printed_at ?? printed[0].created_at : latest.created_at,
    count: printed.length,
  };
}
