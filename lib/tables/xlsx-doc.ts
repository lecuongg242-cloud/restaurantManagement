import { inflateRawSync } from "node:zlib";

/**
 * Đọc trang tính ĐẦU TIÊN của file `.xlsx` thành mảng dòng × ô (chuỗi) — dùng cho "Nhập Excel" bàn (P36, TABLE-08).
 * Không thư viện mới: `.xlsx` là zip (mục lưu thẳng hoặc nén deflate) chứa XML; giải nén bằng `zlib` của Node.
 * Hỗ trợ ô chuỗi dùng chung (sharedStrings — Excel ghi kiểu này), chuỗi tại chỗ (inlineStr — `taoXlsx` ghi), số, công thức.
 * Không hỗ trợ zip64 / file mã hóa (file như vậy → lỗi "không đọc được").
 */

function findEocd(zip: Buffer): number {
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("not a zip");
}

/** Mọi mục trong zip: tên → nội dung đã giải nén. */
function unzip(zip: Buffer): Map<string, Buffer> {
  const eocd = findEocd(zip);
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory");
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;

    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error("bad local header");
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + compSize);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, inflateRawSync(raw));
    // Phương thức khác: bỏ qua mục đó (không phải phần ta cần).
  }
  return files;
}

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    return String.fromCodePoint(k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });
}

/** Ghép mọi <t> trong một khối (chuỗi có định dạng chia thành nhiều <r><t>). */
function texts(xml: string): string {
  let s = "";
  for (const m of xml.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) s += decode(m[1] ?? "");
  return s;
}

/** "B" → 1, "AA" → 26. */
function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function firstSheetPath(files: Map<string, Buffer>): string {
  const wb = files.get("xl/workbook.xml")?.toString("utf8");
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  const rid = wb && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
  if (rid && rels) {
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      if (m[0].includes(`Id="${rid}"`)) {
        const target = /Target="([^"]+)"/.exec(m[0])?.[1];
        if (target) return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      }
    }
  }
  return "xl/worksheets/sheet1.xml";
}

export function readFirstSheet(buf: Buffer): string[][] {
  const files = unzip(buf);
  const sheet = files.get(firstSheetPath(files))?.toString("utf8");
  if (!sheet) throw new Error("no worksheet");

  const shared: string[] = [];
  const sst = files.get("xl/sharedStrings.xml")?.toString("utf8");
  if (sst) for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(texts(m[1]));

  const rows: string[][] = [];
  let nextRow = 0;
  for (const rm of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = /\br="(\d+)"/.exec(rm[1])?.[1];
    const ri = r ? Number(r) - 1 : nextRow;
    nextRow = ri + 1;
    const cells: string[] = [];
    let nextCol = 0;
    for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = /\br="([A-Z]+\d*)"/i.exec(attrs)?.[1];
      const ci = ref ? colIndex(ref) : nextCol;
      nextCol = ci + 1;
      const body = cm[2] ?? "";
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val = "";
      if (t === "s") val = v !== undefined ? (shared[Number(v)] ?? "") : "";
      else if (t === "inlineStr") val = texts(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
      else val = v !== undefined ? decode(v) : "";
      while (cells.length < ci) cells.push("");
      cells[ci] = val;
    }
    while (rows.length < ri) rows.push([]);
    rows[ri] = cells;
  }
  return rows;
}
