/**
 * Thêm MỘT file (không nén) vào một zip có sẵn — dùng để chèn mã kích hoạt vào bộ cài cầu in lúc tải
 * (PRINT-17). Không cần thư viện: cắt zip ở chỗ bắt đầu central directory, chèn mục mới, viết lại central
 * directory + EOCD. Các mục cũ giữ nguyên byte và vị trí.
 *
 * Chỉ hỗ trợ zip thường (không zip64, không chú thích EOCD) — đúng loại `print-pack.ps1` tạo ra.
 */

const BANG_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = BANG_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function timEocd(zip: Buffer): number {
  // EOCD dài 22 byte + chú thích ≤ 65535; quét ngược từ cuối.
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("Không phải file zip (không thấy EOCD).");
}

/** Tên các mục trong zip (đúng như ghi trong central directory). */
export function tenCacMuc(zip: Buffer): string[] {
  const eocd = timEocd(zip);
  const soMuc = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const ten: string[] = [];
  for (let i = 0; i < soMuc; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("Central directory hỏng.");
    const dai = zip.readUInt16LE(p + 28);
    ten.push(zip.subarray(p + 46, p + 46 + dai).toString("utf8"));
    p += 46 + dai + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return ten;
}

/**
 * Zip mới = zip cũ + file `ten` (đường dẫn dùng "/"). Nếu zip cũ ghi tên bằng "\" (Compress-Archive của
 * PowerShell 5.1) thì mục mới cũng dùng "\" — trộn hai kiểu, Explorer có thể hiện hai thư mục trùng tên.
 */
export function themFileVaoZip(zip: Buffer, ten: string, noiDung: Buffer, luc = new Date()): Buffer {
  const eocd = timEocd(zip);
  if (zip.readUInt16LE(eocd + 20) !== 0) throw new Error("Zip có chú thích — không hỗ trợ.");
  const soMuc = zip.readUInt16LE(eocd + 10);
  const cdSize = zip.readUInt32LE(eocd + 12);
  const cdOffset = zip.readUInt32LE(eocd + 16);
  if (soMuc === 0xffff || cdOffset === 0xffffffff) throw new Error("Zip64 — không hỗ trợ.");

  const cu = tenCacMuc(zip);
  if (cu.some((t) => t.includes("\\"))) ten = ten.replace(/\//g, "\\");
  if (cu.includes(ten)) throw new Error(`Zip đã có ${ten}.`);

  const tenBuf = Buffer.from(ten, "utf8");
  const crc = crc32(noiDung);
  const gioDos = (luc.getHours() << 11) | (luc.getMinutes() << 5) | Math.floor(luc.getSeconds() / 2);
  const ngayDos = ((luc.getFullYear() - 1980) << 9) | ((luc.getMonth() + 1) << 5) | luc.getDate();

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(0, 8); // method: store
  local.writeUInt16LE(gioDos, 10);
  local.writeUInt16LE(ngayDos, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(noiDung.length, 18);
  local.writeUInt32LE(noiDung.length, 22);
  local.writeUInt16LE(tenBuf.length, 26);
  local.writeUInt16LE(0, 28);
  const mucLocal = Buffer.concat([local, tenBuf, noiDung]);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4); // version made by
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(0, 10);
  cd.writeUInt16LE(gioDos, 12);
  cd.writeUInt16LE(ngayDos, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(noiDung.length, 20);
  cd.writeUInt32LE(noiDung.length, 24);
  cd.writeUInt16LE(tenBuf.length, 28);
  // extra, comment, disk, internal attr = 0; external attr = 0
  cd.writeUInt32LE(cdOffset, 42); // mục mới nằm đúng chỗ central directory cũ bắt đầu
  const mucCd = Buffer.concat([cd, tenBuf]);

  const eocdMoi = Buffer.alloc(22);
  zip.copy(eocdMoi, 0, eocd, eocd + 22);
  eocdMoi.writeUInt16LE(soMuc + 1, 8);
  eocdMoi.writeUInt16LE(soMuc + 1, 10);
  eocdMoi.writeUInt32LE(cdSize + mucCd.length, 12);
  eocdMoi.writeUInt32LE(cdOffset + mucLocal.length, 16);

  return Buffer.concat([
    zip.subarray(0, cdOffset),
    mucLocal,
    zip.subarray(cdOffset, cdOffset + cdSize),
    mucCd,
    eocdMoi,
  ]);
}
