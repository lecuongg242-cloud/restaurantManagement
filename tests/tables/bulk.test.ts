import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  bulkName,
  bulkNames,
  nextName,
  splitDuplicates,
  parseImportRows,
  clampSeats,
  listShort,
  MAX_IMPORT_ROWS,
} from "@/lib/tables/bulk";
import { readFirstSheet } from "@/lib/tables/xlsx-doc";
import { taoXlsx } from "@/lib/reports/xlsx";
import { crc32 } from "@/lib/print/zip-them";

describe("bulkName (TABLE-07)", () => {
  it("tên có chữ thường → cách một dấu cách", () => {
    expect(bulkNames("Bàn", 1, 3)).toEqual(["Bàn 1", "Bàn 2", "Bàn 3"]);
    expect(bulkName("Phòng VIP", 5)).toBe("Phòng VIP 5");
  });
  it("viết tắt chữ hoa → dính liền (B1, VIP1)", () => {
    expect(bulkName("B", 1)).toBe("B1");
    expect(bulkName("VIP", 12)).toBe("VIP12");
  });
  it("đã có dấu nối hoặc dấu cách cuối → giữ nguyên", () => {
    expect(bulkName("A-", 3)).toBe("A-3");
    expect(bulkName("T1.", 3)).toBe("T1.3");
    expect(bulkName("B ", 2)).toBe("B 2");
  });
  it("tên trống → chỉ số", () => {
    expect(bulkNames("", 10, 2)).toEqual(["10", "11"]);
  });
});

describe("nextName", () => {
  it("tăng số cuối, giữ số chữ số", () => {
    expect(nextName("Bàn 7")).toBe("Bàn 8");
    expect(nextName("B09")).toBe("B10");
    expect(nextName("B99")).toBe("B100");
  });
  it("không có số cuối → trống", () => {
    expect(nextName("Quầy bar")).toBe("");
  });
});

describe("splitDuplicates", () => {
  it("bỏ trùng với bàn đã có (không phân biệt hoa thường/khoảng trắng) và trùng trong cùng lượt", () => {
    const r = splitDuplicates(["Bàn 1", "Bàn 2", "bàn  2", "Bàn 3"], ["BÀN 1"]);
    expect(r.create).toEqual(["Bàn 2", "Bàn 3"]);
    expect(r.skipped).toEqual(["Bàn 1", "bàn  2"]);
  });
});

describe("clampSeats / listShort", () => {
  it("số ghế sai → mặc định 4, chặn trên 999", () => {
    expect(clampSeats("")).toBe(4);
    expect(clampSeats("0")).toBe(4);
    expect(clampSeats("6")).toBe(6);
    expect(clampSeats("5000")).toBe(999);
  });
  it("liệt kê gọn", () => {
    expect(listShort(["a", "b"])).toBe("a, b");
    expect(listShort(["1", "2", "3", "4", "5", "6", "7"])).toBe("1, 2, 3, 4, 5 và 2 bàn khác");
  });
});

describe("parseImportRows (TABLE-08)", () => {
  it("nhận cột theo tiêu đề (không dấu, thứ tự tùy ý), báo dòng thiếu tên", () => {
    const r = parseImportRows([
      ["So ghe", "Ten ban", "Khu vuc"],
      ["6", "Bàn 1", "Tầng 1"],
      ["", "", "Tầng 1"],
      [],
      ["x", "Bàn 2", ""],
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toEqual([
      { line: 2, name: "Bàn 1", area: "Tầng 1", seats: 6 },
      { line: 5, name: "Bàn 2", area: "", seats: 4 },
    ]);
    expect(r.skipped).toEqual([{ line: 3, reason: "thiếu tên bàn" }]);
  });
  it("thiếu cột Tên bàn → lỗi", () => {
    const r = parseImportRows([["A", "B"], ["1", "2"]]);
    expect(r).toEqual({ ok: false, error: 'Không thấy cột "Tên bàn". Hãy dùng file mẫu.' });
  });
  it("quá số dòng tối đa → lỗi", () => {
    const rows = [["Tên bàn"], ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [`B${i}`])];
    const r = parseImportRows(rows);
    expect(r.ok).toBe(false);
  });
});

/** Zip nén deflate + sharedStrings — giống file Excel thật lưu ra (taoXlsx chỉ ghi kiểu lưu thẳng + inlineStr). */
function excelLikeZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, "utf8");
    const comp = deflateRawSync(data);
    const nameBuf = Buffer.from(name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc32(data), 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc32(data), 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe("readFirstSheet (TABLE-08)", () => {
  it("đọc lại file do taoXlsx tạo (file mẫu)", () => {
    const buf = taoXlsx([
      {
        ten: "Bàn",
        cot: [{ nhan: "Tên bàn" }, { nhan: "Khu vực" }, { nhan: "Số ghế" }],
        dong: [
          ["Bàn 1", "Tầng 1", 4],
          ["A&B <1>", null, 2],
        ],
      },
    ]);
    expect(readFirstSheet(buf)).toEqual([
      ["Tên bàn", "Khu vực", "Số ghế"],
      ["Bàn 1", "Tầng 1", "4"],
      ["A&B <1>", "", "2"],
    ]);
  });

  it("đọc file kiểu Excel: nén deflate, sharedStrings, chuỗi nhiều đoạn, ô bỏ trống giữa dòng", () => {
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const buf = excelLikeZip({
      "xl/workbook.xml": `<workbook ${ns} xmlns:r="r"><sheets><sheet name="Bàn" sheetId="1" r:id="rId3"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId3" Type="ws" Target="worksheets/data.xml"/></Relationships>`,
      "xl/sharedStrings.xml": `<sst ${ns}><si><t>Tên bàn</t></si><si><r><t>Sân </t></r><r><t xml:space="preserve">vườn</t></r></si><si><t>Bàn &amp; 5</t></si></sst>`,
      "xl/worksheets/data.xml": `<worksheet ${ns}><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Số ghế</t></is></c></row><row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" t="s"><v>1</v></c><c r="C3"><v>6</v></c></row></sheetData></worksheet>`,
    });
    expect(readFirstSheet(buf)).toEqual([
      ["Tên bàn", "", "Số ghế"],
      [],
      ["Bàn & 5", "Sân vườn", "6"],
    ]);
  });

  it("không phải zip → ném lỗi", () => {
    expect(() => readFirstSheet(Buffer.from("Tên bàn,Khu vực\nB1,T1"))).toThrow();
  });
});
