import { themFileVaoZip } from "@/lib/print/zip-them";

/**
 * Tạo file Excel `.xlsx` nhiều trang tính (P16 16-04, REPORT-19) — KHÔNG thư viện mới: `.xlsx` là một zip chứa vài
 * tệp XML (chuẩn Office Open XML), ghi bằng bộ zip có sẵn của cầu in (`lib/print/zip-them.ts`, không nén).
 *
 * Chọn `.xlsx` thay CSV: Excel bản Việt đặt dấu phân cách vùng là `;` nên CSV phân cách `,` mở ra dồn một cột; `.xlsx`
 * mở đúng ở mọi máy, giữ số là SỐ (cộng được), và gộp được mọi khối vào MỘT file nhiều trang tính.
 *
 * Số → ô số (không dấu phân cách, Excel tự định dạng); chuỗi → ô chữ (inline string); null/"" → ô trống.
 */
export type Cot = { nhan: string; rong?: number };
export type TrangTinh = { ten: string; cot: Cot[]; dong: (string | number | null | undefined)[][] };

const XML_KHONG_HOP_LE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function esc(s: string): string {
  return s
    .replace(XML_KHONG_HOP_LE, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function tenCot(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Tên trang tính hợp lệ: ≤ 31 ký tự, không `[]:*?/\`, không trùng. */
function tenTrang(ten: string, daDung: Set<string>): string {
  let t = ten.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Trang";
  for (let n = 2; daDung.has(t.toLowerCase()); n++) t = `${t.slice(0, 28)} ${n}`;
  daDung.add(t.toLowerCase());
  return t;
}

function o(ref: string, v: string | number | null | undefined, s = 0): string {
  const st = s ? ` s="${s}"` : "";
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
  return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

function xmlTrang(tt: TrangTinh): string {
  const cols = tt.cot
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.rong ?? Math.min(40, Math.max(10, c.nhan.length + 2))}" customWidth="1"/>`)
    .join("");
  const dau = `<row r="1">${tt.cot.map((c, i) => o(`${tenCot(i)}1`, c.nhan, 1)).join("")}</row>`;
  const than = tt.dong
    .map((d, r) => `<row r="${r + 2}">${d.map((v, i) => o(`${tenCot(i)}${r + 2}`, v)).join("")}</row>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    // Cố định dòng tiêu đề khi cuộn.
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${dau}${than}</sheetData></worksheet>`
  );
}

export function taoXlsx(trang: TrangTinh[], luc = new Date()): Buffer {
  if (trang.length === 0) throw new Error("Cần ít nhất một trang tính.");
  const daDung = new Set<string>();
  const ten = trang.map((t) => tenTrang(t.ten, daDung));
  const tep: [string, string][] = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        trang.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        `</Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        ten.map((t, i) => `<sheet name="${esc(t)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        `</sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        trang.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${trang.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      "xl/styles.xml",
      // Kiểu 0 = thường; kiểu 1 = chữ đậm (dòng tiêu đề).
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `</styleSheet>`,
    ],
    ...trang.map((t, i) => [`xl/worksheets/sheet${i + 1}.xml`, xmlTrang(t)] as [string, string]),
  ];
  // Zip rỗng = chỉ bản ghi EOCD (22 byte), rồi thêm từng tệp.
  let zip: Buffer = Buffer.alloc(22);
  zip.writeUInt32LE(0x06054b50, 0);
  for (const [path, xml] of tep) zip = themFileVaoZip(zip, path, Buffer.from(xml, "utf8"), luc);
  return zip;
}

/** Tên file không dấu: `qt-food_bao-cao_2026-09-01_2026-09-27.xlsx`. */
export function tenFileXuat(slug: string, khoi: string, tu: string, den: string): string {
  const sach = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `${sach(slug)}_${sach(khoi)}_${tu}_${den}.xlsx`;
}
