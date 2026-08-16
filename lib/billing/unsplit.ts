/**
 * Đọc kết quả của RPC `unsplit_bill_evenly` (0031) thành thứ tầng UI dùng được. Thuần, không IO —
 * `bill.ts` lo phần gọi RPC, giống cặp `planSplitByItems` ↔ `splitBillByItems`.
 *
 * VÌ SAO CHỈ CÒN PHẦN ĐỌC KẾT QUẢ: luật "con đã thu thì không gỡ" trước đây nằm ở hàm thuần
 * `planUnsplit`, nhưng nó chốt ở thời điểm ĐỌC rồi mới ghi ở 2-3 lượt gọi mạng sau — lượt thu tiền
 * chen vào giữa vẫn lọt. 0031 dời luật đó xuống một Postgres function chạy trong MỘT transaction
 * có khóa hàng, tức là chốt và lệnh ghi không còn tách rời được nữa. Giữ lại bản TS song song là
 * dựng hai nguồn sự thật cho cùng một luật tiền — lệch nhau một nhịp là chặn nhầm hoặc lọt lưới.
 * Nên bên TS chỉ còn đúng việc nó làm tốt hơn SQL: dịch mã lỗi ra câu tiếng Việt cho thu ngân.
 *
 * FAIL-CLOSED: hình dạng lạ (RPC đổi, mạng trả rác, `null`) → coi là THẤT BẠI, không bao giờ suy
 * ra "chắc là xong rồi". Gỡ chia mà tưởng xong trong khi chưa xong là bàn kẹt cứng không thu được.
 */

export type UnsplitOutcome = { ok: true; voided: number } | { ok: false; error: string };

/** Câu lỗi theo từng mã RPC. Mã lạ rơi về câu chung (vẫn là thất bại). */
const MESSAGE_BY_CODE: Record<string, string> = {
  not_found: "Không tìm thấy hóa đơn.",
  not_split: "Hóa đơn này chưa chia đều.",
  has_payment: "Đã thu một phần — không gỡ chia được. Hoàn tiền phần đã thu trước.",
};

const FALLBACK_ERROR = "Không gỡ được chia đều. Vui lòng thử lại.";

export function parseUnsplitResult(raw: unknown): UnsplitOutcome {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: FALLBACK_ERROR };

  const row = raw as { ok?: unknown; code?: unknown; voided?: unknown };
  if (row.ok !== true) {
    const code = typeof row.code === "string" ? row.code : "";
    return { ok: false, error: MESSAGE_BY_CODE[code] ?? FALLBACK_ERROR };
  }

  // `voided = 0` là ca HỢP LỆ: vỏ mồ côi (còn cờ chia đều nhưng 0 con) — RPC bỏ cờ và không void
  // dòng nào. Số âm/không phải số nguyên = kết quả không hiểu được → thất bại.
  const voided = typeof row.voided === "number" ? row.voided : NaN;
  if (!Number.isInteger(voided) || voided < 0) return { ok: false, error: FALLBACK_ERROR };
  return { ok: true, voided };
}
