/**
 * Logic thuần cho thêm bàn hàng loạt / nhập Excel (P36, TABLE-07/08). Không đụng DB — action gọi vào đây rồi mới ghi.
 */

export const MAX_BULK = 200;
export const MAX_IMPORT_ROWS = 500;
export const NAME_MAX = 40;
export const DEFAULT_SEATS = 4;

/** Khóa so trùng tên: bỏ khoảng trắng thừa, không phân biệt hoa thường. "Bàn  1" ≡ "bàn 1". */
export function nameKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

/** Bỏ dấu + thường hóa — chỉ để nhận tên cột trong file Excel ("Tên bàn" ≡ "ten ban"). */
function plain(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tên bàn thứ n: "Bàn" → "Bàn 1" (tên có chữ thường thì cách một dấu cách), "B" / "VIP" → "B1" / "VIP1" (kiểu viết tắt
 * quán hay dùng), "A-" / "T1." → "A-1" (đã có dấu nối), "" → "1".
 */
export function bulkName(prefix: string, n: number): string {
  const p = prefix.replace(/\s+/g, " ").trimStart();
  if (p === "") return String(n);
  if (/\s$/.test(p) || /[^\p{L}\p{N}]$/u.test(p)) return `${p}${n}`;
  return /\p{Ll}/u.test(p) ? `${p} ${n}` : `${p}${n}`;
}

export function bulkNames(prefix: string, start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => bulkName(prefix, start + i));
}

/** "Bàn 7" → "Bàn 8", "B09" → "B10" (giữ số chữ số), không có số cuối → "" (để trống cho người dùng gõ). */
export function nextName(name: string): string {
  const m = /^(.*?)(\d+)$/.exec(name.trim());
  if (!m) return "";
  const next = String(Number(m[2]) + 1).padStart(m[2].length, "0");
  return m[1] + next;
}

/** Tách tên muốn tạo thành [tạo, bỏ qua vì trùng] — trùng với bàn đã có HOẶC trùng một tên đứng trước trong cùng lượt. */
export function splitDuplicates(names: string[], existing: Iterable<string>): { create: string[]; skipped: string[] } {
  const seen = new Set(Array.from(existing, nameKey));
  const create: string[] = [];
  const skipped: string[] = [];
  for (const n of names) {
    const k = nameKey(n);
    if (seen.has(k)) skipped.push(n);
    else {
      seen.add(k);
      create.push(n);
    }
  }
  return { create, skipped };
}

export function clampSeats(v: unknown): number {
  const n = parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SEATS;
  return Math.min(n, 999);
}

/** Liệt kê gọn: "Bàn 1, Bàn 2, Bàn 3 và 5 bàn khác". */
export function listShort(names: string[], max = 5): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} và ${names.length - max} bàn khác`;
}

export type ImportRow = { line: number; name: string; area: string; seats: number };
export type ImportSkip = { line: number; reason: string };

/**
 * Đọc các dòng của trang tính (mảng ô dạng chuỗi) theo file mẫu: dòng tiêu đề có cột "Tên bàn", "Khu vực", "Số ghế"
 * (thứ tự cột tùy ý, không phân biệt dấu). `line` = số dòng như Excel hiện (bắt đầu 1).
 */
export function parseImportRows(
  rows: string[][]
): { ok: true; rows: ImportRow[]; skipped: ImportSkip[] } | { ok: false; error: string } {
  const headerIdx = rows.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIdx === -1) return { ok: false, error: "File không có dữ liệu." };
  const header = rows[headerIdx].map(plain);
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const cName = col("ten ban", "ten phong ban", "ten phong/ban", "ten");
  const cArea = col("khu vuc", "khu", "nhom");
  const cSeats = col("so ghe", "ghe");
  if (cName === -1) return { ok: false, error: 'Không thấy cột "Tên bàn". Hãy dùng file mẫu.' };

  const body = rows.slice(headerIdx + 1);
  const dataCount = body.filter((r) => r.some((c) => c.trim() !== "")).length;
  if (dataCount > MAX_IMPORT_ROWS) {
    return { ok: false, error: `File có ${dataCount} dòng, tối đa ${MAX_IMPORT_ROWS} dòng mỗi lần nhập.` };
  }

  const out: ImportRow[] = [];
  const skipped: ImportSkip[] = [];
  body.forEach((r, i) => {
    const line = headerIdx + 2 + i;
    if (!r.some((c) => c.trim() !== "")) return;
    const name = (r[cName] ?? "").trim().replace(/\s+/g, " ");
    if (!name) return skipped.push({ line, reason: "thiếu tên bàn" });
    if (name.length > NAME_MAX) return skipped.push({ line, reason: `tên dài quá ${NAME_MAX} ký tự` });
    out.push({
      line,
      name,
      area: cArea === -1 ? "" : (r[cArea] ?? "").trim().replace(/\s+/g, " "),
      seats: cSeats === -1 ? DEFAULT_SEATS : clampSeats(r[cSeats]),
    });
  });
  return { ok: true, rows: out, skipped };
}
