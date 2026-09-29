import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { dungAnhPhieu, uocLuongChieuCao, RONG, CO_PHIEU_KHACH, type PhieuAnh } from "@/lib/print/anh-phieu";
import { giaiMaPng, thanhAnhDen } from "../../scripts/print-bridge.mjs";

/**
 * PRINT-14 — hóa đơn có dấu dựng thành ảnh. Test không đọc được chữ trong ảnh, nên: kiểm kích thước +
 * định dạng, và GHI ẢNH MẪU ra `test-results/` để người xem bằng mắt (đủ dấu, đúng nhãn).
 */
const hoaDon: PhieuAnh = {
  loai: "receipt",
  gio: "12:34 27/09/2026",
  hoaDon: {
    tenantName: "Phở Việt — Đường Ướt Ẩm",
    logoUrl: null,
    billNo: 42,
    tableLabel: "Bàn T1",
    contactLine: null,
    dateTime: null,
    isChild: false,
    childNote: null,
    lines: [
      { name: "Phở bò tái nạm gầu gân sách đặc biệt", qty: 2, unitPrice: 65000, amount: 130000, modifiers: ["Lớn", "Thêm trứng"], note: "ít hành, không mì chính" },
      { name: "Chả giò", qty: 1, unitPrice: 40000, amount: 40000, modifiers: [], note: null },
      { name: "Trà đá", qty: 3, unitPrice: 5000, amount: 15000, modifiers: [], note: null },
    ],
    subtotal: 185000,
    discountAmount: 18500,
    serviceChargePct: 5,
    serviceChargeAmount: 8325,
    vatPct: 8,
    vatAmount: 13986,
    total: 188811,
    payment: { method: "cash", amount: 200000 },
    footer: "Cảm ơn quý khách — hẹn gặp lại! ăâđêôơư ÀÁẢÃẠ",
  },
};

const phieuKhach: PhieuAnh = {
  loai: "customer_ticket",
  gio: "12:30 27/09",
  phieu: {
    orderId: "o1",
    kitchenNo: 17,
    tenantName: "Phở Việt",
    logoUrl: null,
    place: "Mang về",
    contactName: "Chị Hương · 0901234567",
    createdAt: null,
    ticketNo: "K17",
    items: [{ name: "Bún bò Huế", qty: 1, modifiers: ["Vừa"], note: "cay nhiều", unitPrice: 60000 }],
    total: 60000,
  },
};

async function png(p: PhieuAnh, kho: "80" | "58") {
  const buf = Buffer.from(await dungAnhPhieu(p, kho).arrayBuffer());
  return { buf, rong: buf.readUInt32BE(16), cao: buf.readUInt32BE(20) };
}

describe("dungAnhPhieu", () => {
  it("hóa đơn 80 mm → PNG rộng 576 chấm, cao đúng ước lượng", async () => {
    const { buf, rong, cao } = await png(hoaDon, "80");
    expect(buf.subarray(1, 4).toString()).toBe("PNG");
    expect(rong).toBe(RONG["80"]);
    expect(cao).toBe(uocLuongChieuCao(hoaDon, "80"));
    fs.mkdirSync("test-results", { recursive: true });
    fs.writeFileSync(path.join("test-results", "mau-hoa-don-80.png"), buf);
  }, 30_000);

  it("58 mm → rộng 384 chấm", async () => {
    const { buf, rong } = await png(hoaDon, "58");
    expect(rong).toBe(RONG["58"]);
    fs.writeFileSync(path.join("test-results", "mau-hoa-don-58.png"), buf);
  }, 30_000);

  it("phiếu khách → PNG", async () => {
    const { buf, rong } = await png(phieuKhach, "80");
    expect(rong).toBe(576);
    fs.writeFileSync(path.join("test-results", "mau-phieu-khach-80.png"), buf);
  }, 30_000);

  it("phiếu khách: cỡ chữ như bản in trình duyệt trước đây (CustomerTicketDoc, px CSS × 203/96 chấm)", () => {
    // qt-food 30/09/2026: in qua cầu in ra chữ nhỏ hơn in trình duyệt. Bản trình duyệt: 80mm base 15 / tên món 17 /
    // tên quán 19 / số đơn 29 px; 58mm 14 / 15 / 16 / 26 px. 1 px CSS khi in = 1/96 inch; máy nhiệt 203 dpi.
    const cham = (px: number) => Math.round((px * 203) / 96);
    expect(CO_PHIEU_KHACH["80"]).toEqual({ chu: cham(15), ten: cham(17), quan: cham(19), so: cham(29) });
    expect(CO_PHIEU_KHACH["58"]).toEqual({ chu: cham(14), ten: cham(15), quan: cham(16), so: cham(26) });
  });

  it.each(["80", "58"] as const)("phiếu khách dài %s mm: không bị cắt đáy (ước lượng chiều cao đủ với chữ to)", async (kho) => {
    const mon = { name: "Phở bò tái nạm gầu gân sách đặc biệt thêm bánh", qty: 2, modifiers: ["Lớn", "Thêm trứng"], note: "ít hành, không mì chính", unitPrice: 65000 };
    const dai: PhieuAnh = { ...phieuKhach, phieu: { ...(phieuKhach as { phieu: object }).phieu, items: Array(12).fill(mon) } } as PhieuAnh;
    const { buf, cao } = await png(dai, kho);
    // Chữ cuối ("Vui lòng giữ phiếu…") phải nằm trọn trong ảnh: cầu in cắt trắng đáy, còn lại phải thấp hơn ảnh gốc.
    const den = thanhAnhDen(giaiMaPng(buf));
    expect(den.cao).toBeLessThan(cao - 8);
    fs.writeFileSync(path.join("test-results", `mau-phieu-khach-dai-${kho}.png`), buf);
  }, 30_000);
});
