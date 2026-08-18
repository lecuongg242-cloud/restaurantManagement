/**
 * Chữ nghĩa cho chỉ số "hủy sau khi đã in phiếu bếp" (REPORT-11). Thuần, không JSX — vitest không
 * parse .tsx (tsconfig để `jsx: preserve`), nên phần quyết định phải nằm ngoài component.
 *
 * GIỌNG VĂN: đây là số liệu để chủ quán TỰ XEM XÉT, không phải lời buộc tội. Mô tả sự kiện, không
 * phán xét động cơ — một lượt hủy sau khi in hoàn toàn có thể chính đáng (khách đổi ý sau khi món
 * đã làm là chuyện thật). Không dùng chữ "gian lận", "nghi vấn", "vi phạm" ở bất kỳ đâu.
 */
import { cancelRateLabel } from "./cancel-format";

export type AfterPrintSummary = {
  afterQty: number;
  afterAmount: number;
  /** Mẫu số: món hủy có mốc giờ THẬT (đã loại dòng backfill của 0028). */
  comparableQty: number;
  comparableAmount: number;
  /** Món hủy chưa xét được vì mốc giờ chỉ là ước lượng. */
  approxQty: number;
};

/**
 * Một dòng hủy nằm ở phía nào của mốc in?
 *
 * `unknown_time` phải đứng TRƯỚC `not_printed`: dòng backfill của 0028 mang mốc GỌI MÓN chứ không
 * phải mốc hủy, nên dù đơn có in hay không thì cũng không kết luận được gì về thứ tự. Đảo hai
 * nhánh này sẽ dán nhãn "hủy trước khi in" cho một đống dòng cũ mà thực tế không ai biết.
 */
export type AfterPrintVerdict = "after" | "before" | "not_printed" | "unknown_time";

export function afterPrintVerdict(row: {
  printedAt: string | null;
  afterPrint: boolean | null;
  timeApprox: boolean;
}): AfterPrintVerdict {
  if (row.timeApprox) return "unknown_time";
  if (row.printedAt === null) return "not_printed";
  return row.afterPrint ? "after" : "before";
}

/** Chữ hiện ở cột "Đã in lúc" khi không có mốc để in ra. */
export const VERDICT_EMPTY: Record<AfterPrintVerdict, string> = {
  after: "",
  before: "",
  not_printed: "Chưa in",
  unknown_time: "—",
};

/**
 * Dòng chú thích dưới KPI. Nói thẳng phần dữ liệu CHƯA xét được thay vì im lặng gộp nó vào mẫu số:
 * 13 món hủy trong đó 9 món không có mốc giờ thật thì "0%" là con số dễ đọc nhầm nhất trên trang.
 *
 * Trả chuỗi rỗng khi không có gì cần cảnh báo — người xem đỡ phải đọc dòng thừa.
 */
export function afterPrintNote(s: AfterPrintSummary): string {
  if (s.approxQty <= 0) return "";
  return `Chưa xét được ${s.approxQty} món: mốc giờ hủy trước 16/08/2026 lấy theo giờ gọi món nên không so được với giờ in phiếu.`;
}

/**
 * Dòng phụ của KPI: giá trị · tỷ lệ · mẫu số đã dùng.
 *
 * Mẫu số là `comparableQty` (món hủy có mốc giờ THẬT) chứ không phải tổng số món hủy: dòng
 * backfill của 0028 không so được với mốc in, đưa vào mẫu số thì tỷ lệ bị pha loãng bởi đúng
 * những dòng ta không biết gì về chúng. In luôn mẫu số ra chữ để không ai phải đoán vì sao con số
 * này khác KPI "Số món bị hủy" bên cạnh.
 */
export function afterPrintHint(s: AfterPrintSummary, formatMoney: (n: number) => string): string {
  if (s.comparableQty <= 0) return "Kỳ này chưa có món hủy nào có mốc giờ đối chiếu được";
  return `${formatMoney(s.afterAmount)} · ${cancelRateLabel(s.afterQty, s.comparableQty)} trên ${s.comparableQty} món hủy có mốc giờ đối chiếu được`;
}
