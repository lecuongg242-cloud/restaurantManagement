import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import {
  giaiMaPng,
  thanhAnhDen,
  lenhInAnh,
  docCauHinhMayIn,
  dichInCua,
  DAI_ANH,
} from "../../scripts/print-bridge.mjs";
import { dungAnhPhieu, type PhieuAnh } from "@/lib/print/anh-phieu";

/**
 * PRINT-15 — cầu in đổi ảnh hóa đơn (PNG từ server) thành lệnh in ẢNH ESC/POS. Không dùng gói npm nào
 * (PERF-03): tự giải mã PNG bằng `zlib` có sẵn của Node. Sai một bit ở đây là tờ hóa đơn ra giấy rác —
 * nên kiểm từng bước bằng dữ liệu biết trước đáp án.
 */

/** Mã hóa PNG xám 8-bit với MỘT kiểu lọc cho mọi dòng — để kiểm bộ giải lọc. */
function pngXam(rong: number, cao: number, px: number[], loc: number): Buffer {
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const tho: number[] = [];
  for (let y = 0; y < cao; y++) {
    tho.push(loc);
    for (let x = 0; x < rong; x++) {
      const v = px[y * rong + x];
      const a = x > 0 ? px[y * rong + x - 1] : 0;
      const b = y > 0 ? px[(y - 1) * rong + x] : 0;
      const c = x > 0 && y > 0 ? px[(y - 1) * rong + x - 1] : 0;
      const du = [v, v - a, v - b, v - ((a + b) >> 1), v - paeth(a, b, c)][loc];
      tho.push((du + 256) & 0xff);
    }
  }
  const khoi = (loai: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(loai), data, Buffer.alloc(4)]); // CRC không kiểm
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(rong, 0);
  ihdr.writeUInt32BE(cao, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // xám
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    khoi("IHDR", ihdr),
    khoi("IDAT", zlib.deflateSync(Buffer.from(tho))),
    khoi("IEND", Buffer.alloc(0)),
  ]);
}

describe("giaiMaPng", () => {
  const px = [0, 10, 200, 255, 30, 60, 90, 120, 250, 5, 0, 128]; // 4×3
  for (const loc of [0, 1, 2, 3, 4]) {
    it(`giải đúng kiểu lọc ${loc}`, () => {
      const anh = giaiMaPng(pngXam(4, 3, px, loc));
      expect([anh.rong, anh.cao]).toEqual([4, 3]);
      // Xám → RGBA: R = G = B = giá trị, A = 255.
      expect(Array.from({ length: 12 }, (_, i) => anh.rgba[i * 4])).toEqual(px);
      expect(anh.rgba[3]).toBe(255);
    });
  }

  it("PNG hỏng → lỗi rõ ràng, không treo", () => {
    expect(() => giaiMaPng(Buffer.from("khong phai png"))).toThrow(/PNG/);
  });
});

describe("thanhAnhDen", () => {
  it("tối → bit 1, sáng → bit 0; điểm trái nhất là bit CAO; hàng lẻ 8 được đệm", () => {
    // 10 điểm: đen trắng đen trắng … → byte 1 = 1010_1010, byte 2 = 10 + đệm = 1000_0000
    const px = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? 0 : 255));
    const den = thanhAnhDen(giaiMaPng(pngXam(10, 1, px, 0)));
    expect(den.rongByte).toBe(2);
    expect(Array.from(den.bits)).toEqual([0b10101010, 0b10000000]);
  });

  it("cắt phần trắng ở đáy (ảnh server ước dư chiều cao)", () => {
    const px = [...Array(8).fill(0), ...Array(8 * 5).fill(255)]; // 8×6, chỉ dòng đầu có mực
    expect(thanhAnhDen(giaiMaPng(pngXam(8, 6, px, 1))).cao).toBe(1);
  });

  it("ảnh hóa đơn thật từ server: rộng 576 → 72 byte/dòng, có mực, đáy đã cắt", async () => {
    const p: PhieuAnh = {
      loai: "customer_ticket",
      gio: "12:00",
      phieu: {
        orderId: "x", kitchenNo: 3, tenantName: "Phở Việt", logoUrl: null, place: "Bàn T1", contactName: null,
        createdAt: null, ticketNo: "K3", items: [{ name: "Phở bò", qty: 1, modifiers: [], note: null, unitPrice: 50000 }], total: 50000,
      },
    };
    const png = Buffer.from(await dungAnhPhieu(p, "80").arrayBuffer());
    const goc = giaiMaPng(png);
    const den = thanhAnhDen(goc);
    expect(den.rongByte).toBe(72);
    expect(den.cao).toBeLessThan(goc.cao);
    expect(den.bits.some((b: number) => b !== 0)).toBe(true);
  }, 30_000);
});

describe("lenhInAnh", () => {
  it("khởi tạo, chia dải GS v 0 đúng kích thước, kết thúc bằng cắt giấy", () => {
    const den = { rongByte: 2, cao: DAI_ANH + 5, bits: Buffer.alloc(2 * (DAI_ANH + 5), 0xff) };
    const lenh = lenhInAnh(den);
    expect(Array.from(lenh.subarray(0, 2))).toEqual([0x1b, 0x40]);
    // Dải 1: GS v 0 m xL xH yL yH
    expect(Array.from(lenh.subarray(2, 10))).toEqual([0x1d, 0x76, 0x30, 0, 2, 0, DAI_ANH & 0xff, DAI_ANH >> 8]);
    const dai2 = 10 + 2 * DAI_ANH;
    expect(Array.from(lenh.subarray(dai2, dai2 + 8))).toEqual([0x1d, 0x76, 0x30, 0, 2, 0, 5, 0]);
    expect(Array.from(lenh.subarray(lenh.length - 4))).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });
});

describe("cấu hình máy in quầy + định tuyến", () => {
  it("đọc usb:/lan:, sai → null", () => {
    expect(docCauHinhMayIn("usb:XP-80C (copy 1)")).toEqual({ kieu: "usb", ten: "XP-80C (copy 1)" });
    expect(docCauHinhMayIn("lan:192.168.1.50")).toEqual({ kieu: "lan", host: "192.168.1.50", port: 9100 });
    expect(docCauHinhMayIn("lan:192.168.1.50:9101")).toEqual({ kieu: "lan", host: "192.168.1.50", port: 9101 });
    for (const sai of [undefined, "", "usb:", "lan:", "abc"]) expect(docCauHinhMayIn(sai)).toBeNull();
  });

  it("phiếu bếp → bếp; hóa đơn/phiếu khách → quầy nếu có khai, không thì bỏ qua", () => {
    expect(dichInCua("kitchen_ticket", true)).toBe("bep");
    expect(dichInCua("receipt", true)).toBe("quay");
    expect(dichInCua("customer_ticket", true)).toBe("quay");
    expect(dichInCua("receipt", false)).toBeNull();
    expect(dichInCua("la", true)).toBeNull();
  });
});
