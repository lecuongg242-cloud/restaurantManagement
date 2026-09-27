import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { crc32, tenCacMuc, themFileVaoZip } from "@/lib/print/zip-them";

/** Zip rỗng: chỉ có EOCD. */
const zipRong = () => {
  const b = Buffer.alloc(22);
  b.writeUInt32LE(0x06054b50, 0);
  return b;
};

/** Đọc lại nội dung một mục theo central directory (store hoặc deflate) — độc lập với code đang test. */
function docMuc(zip: Buffer, ten: string): Buffer {
  let eocd = zip.length - 22;
  while (zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < zip.readUInt16LE(eocd + 10); i++) {
    const dai = zip.readUInt16LE(p + 28);
    const t = zip.subarray(p + 46, p + 46 + dai).toString("utf8");
    if (t === ten) {
      const local = zip.readUInt32LE(p + 42);
      expect(zip.readUInt32LE(local)).toBe(0x04034b50);
      const bd = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const raw = zip.subarray(bd, bd + zip.readUInt32LE(p + 20));
      const data = zip.readUInt16LE(p + 10) === 8 ? zlib.inflateRawSync(raw) : raw;
      expect(crc32(data)).toBe(zip.readUInt32LE(p + 16));
      return data;
    }
    p += 46 + dai + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  throw new Error(`không thấy ${ten}`);
}

describe("zip-them", () => {
  it("crc32 đúng chuẩn (vector '123456789' = CBF43926)", () => {
    expect(crc32(Buffer.from("123456789")).toString(16)).toBe("cbf43926");
  });

  it("thêm hai file liên tiếp → cả hai đọc lại đúng, mục cũ giữ nguyên", () => {
    const a = themFileVaoZip(zipRong(), "CAI-DAT.bat", Buffer.from("@echo off\r\n"));
    const b = themFileVaoZip(a, "bo-cai/ma-kich-hoat.txt", Buffer.from("K7M2P9QX\r\n"));
    expect(tenCacMuc(b)).toEqual(["CAI-DAT.bat", "bo-cai/ma-kich-hoat.txt"]);
    expect(docMuc(b, "CAI-DAT.bat").toString()).toBe("@echo off\r\n");
    expect(docMuc(b, "bo-cai/ma-kich-hoat.txt").toString()).toBe("K7M2P9QX\r\n");
  });

  it("zip của PowerShell 5.1 (tên dùng '\\') → mục mới cũng dùng '\\'", () => {
    const ps = themFileVaoZip(zipRong(), "bo-cai\\print-setup.ps1", Buffer.from("#"));
    const moi = themFileVaoZip(ps, "bo-cai/ma-kich-hoat.txt", Buffer.from("X"));
    expect(tenCacMuc(moi)).toContain("bo-cai\\ma-kich-hoat.txt");
  });

  it("giữ nguyên mục NÉN (deflate) có sẵn", () => {
    // Tự dựng một mục deflate bằng cách thay dữ liệu của mục store — đủ để chắc code không đụng byte mục cũ.
    const goc = Buffer.from("xin chào ".repeat(50));
    const nen = zlib.deflateRawSync(goc);
    const z = themFileVaoZip(zipRong(), "a.txt", nen);
    // Đổi method của mục a.txt sang deflate + kích thước giải nén thật.
    const cd = z.readUInt32LE(z.length - 22 + 16);
    z.writeUInt16LE(8, cd + 10);
    z.writeUInt32LE(crc32(goc), cd + 16);
    z.writeUInt32LE(goc.length, cd + 24);
    const moi = themFileVaoZip(z, "b.txt", Buffer.from("B"));
    expect(docMuc(moi, "a.txt").toString()).toBe(goc.toString());
    expect(docMuc(moi, "b.txt").toString()).toBe("B");
  });

  it("không phải zip / đã có file đó → báo lỗi rõ", () => {
    expect(() => themFileVaoZip(Buffer.from("không phải zip".repeat(3)), "x", Buffer.from("1"))).toThrow(/EOCD/);
    const a = themFileVaoZip(zipRong(), "x", Buffer.from("1"));
    expect(() => themFileVaoZip(a, "x", Buffer.from("2"))).toThrow(/đã có/);
  });
});
