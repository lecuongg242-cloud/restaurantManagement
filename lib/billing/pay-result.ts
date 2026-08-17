/**
 * Đọc kết quả của RPC `pay_bill` (0035) thành thứ tầng UI dùng được. Thuần, không IO — `bill.ts` lo
 * phần gọi RPC, giống cặp `parseUnsplitResult` ↔ `unsplitBill`.
 *
 * VÌ SAO LUẬT NẰM Ở SQL CHỨ KHÔNG Ở ĐÂY: mọi điều kiện của lượt thu (hóa đơn còn mở không, đã có
 * tiền chưa, có phải vỏ chia đều không) phải được kiểm DƯỚI CÙNG MỘT KHÓA HÀNG với hai lệnh ghi,
 * nếu không thì giữa lúc kiểm và lúc ghi luôn còn một khe. Giữ bản TS song song là dựng hai nguồn
 * sự thật cho cùng một luật tiền. Bên TS chỉ còn việc nó làm tốt hơn SQL: dịch mã lỗi ra tiếng Việt.
 *
 * FAIL-CLOSED: hình dạng lạ (RPC đổi, mạng trả rác, `null`) → coi là THẤT BẠI. Thu tiền mà tưởng
 * xong trong khi chưa xong là mất tiền của quán, không sửa lại được từ dữ liệu.
 */

export type PayBillOutcome =
  | {
      ok: true;
      /** Tổng đọc DƯỚI KHÓA trong RPC — nguồn duy nhất để tính tiền thối, không lấy số app đọc trước. */
      total: number;
      /** Lượt này không ghi thêm dòng `payments` nào (gửi lại / chạy nốt phần dở của lượt trước). */
      replayed: boolean;
    }
  | { ok: false; error: string };

/**
 * Câu lỗi theo từng mã RPC — giữ NGUYÊN VĂN câu của bản trước để nhân viên không phải học lại.
 * Mã lạ rơi về câu chung (vẫn là thất bại).
 */
const MESSAGE_BY_CODE: Record<string, string> = {
  not_found: "Không tìm thấy hóa đơn.",
  not_open: "Hóa đơn đã đóng.",
  split_shell: "Hóa đơn đã chia — thu ở từng phần con.",
  empty_total: "Hóa đơn chưa có tiền để thu.",
};

const FALLBACK_ERROR = "Ghi nhận thanh toán thất bại. Vui lòng thử lại.";

export function parsePayBillResult(raw: unknown): PayBillOutcome {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, error: FALLBACK_ERROR };

  const row = raw as { ok?: unknown; code?: unknown; total?: unknown; replayed?: unknown };
  if (row.ok !== true) {
    const code = typeof row.code === "string" ? row.code : "";
    return { ok: false, error: MESSAGE_BY_CODE[code] ?? FALLBACK_ERROR };
  }

  // `total` phải là số nguyên DƯƠNG: RPC chỉ trả ok khi đã qua chốt `v_total > 0`, nên 0/âm/không
  // phải số nghĩa là kết quả không hiểu được — thà báo hỏng còn hơn tính tiền thối từ số rác.
  const total = typeof row.total === "number" ? row.total : NaN;
  if (!Number.isInteger(total) || total <= 0) return { ok: false, error: FALLBACK_ERROR };

  return { ok: true, total, replayed: row.replayed === true };
}

/**
 * Tiền trả lại khách. Tách ra khỏi `payBill` để có test: chỉ tiền MẶT mới có tiền thối, và số khách
 * đưa nhỏ hơn tổng (thu thiếu, hoặc đường chuyển khoản truyền `total`) không được ra số âm.
 */
export function changeToReturn(amountReceived: number, total: number): number {
  return Math.max(0, Math.round(amountReceived) - total);
}
