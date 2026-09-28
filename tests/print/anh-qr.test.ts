import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { giaiMaPng, thanhAnhDen } from "../../scripts/print-bridge.mjs";
import { dungAnhPhieu, kichThuocQr, RONG, uocLuongChieuCao, type Kho, type PhieuAnh } from "@/lib/print/anh-phieu";
import { dungTransferQr } from "@/lib/billing/transfer-qr";
import { parseSettings } from "@/lib/tenant/settings";
import { LE_QR } from "@/lib/payments/qr-matrix";
import type { ReceiptView } from "@/lib/billing/receipt-view";

/**
 * PAY-03 — QR trên ảnh hóa đơn cầu in phải đọc được trên giấy nhiệt: mỗi ô là một khối chấm ĐẶC, số
 * nguyên chấm, không có chấm xám nào (cầu in cắt ngưỡng chấm xám thành ô to ô nhỏ). Test giải mã ảnh
 * bằng CHÍNH bộ giải mã của cầu in rồi so từng ô với ma trận QR.
 */
const transferQr = dungTransferQr({
  settings: parseSettings({ bank: { bin: "970436", account_no: "0123456789", account_name: "NGUYEN VAN A" } }),
  status: "open",
  isSplitContainer: false,
  total: 188811,
  billNo: 42,
  createdAt: "2026-09-27T05:34:00Z",
})!;

const hoaDon: ReceiptView = {
  tenantName: "Phở Việt — Đường Ướt Ẩm",
  logoUrl: null,
  billNo: 42,
  tableLabel: "Bàn T1",
  contactLine: null,
  dateTime: null,
  isChild: false,
  childNote: null,
  lines: [
    { name: "Phở bò tái nạm gầu gân sách đặc biệt", qty: 2, unitPrice: 65000, amount: 130000, modifiers: ["Lớn"], note: null },
    { name: "Chả giò", qty: 1, unitPrice: 40000, amount: 40000, modifiers: [], note: null },
  ],
  subtotal: 170000,
  discountAmount: 0,
  serviceChargePct: 5,
  serviceChargeAmount: 8500,
  vatPct: 8,
  vatAmount: 14280,
  total: 188811,
  payment: null,
  footer: "Cảm ơn quý khách!",
  transferQr,
};

async function giaiMa(p: PhieuAnh, kho: Kho) {
  const buf = Buffer.from(await dungAnhPhieu(p, kho).arrayBuffer());
  return { buf, anh: giaiMaPng(buf) as { rong: number; cao: number; rgba: Uint8Array } };
}

/** Tìm góc trên-trái vùng QR (kể cả lề) bằng cách khớp TOÀN BỘ ma trận — trả null nếu không thấy. */
function timQr(anh: { rong: number; cao: number; rgba: Uint8Array }, kho: Kho) {
  const { m, cham, px } = kichThuocQr(transferQr.payload, kho);
  const den = (x: number, y: number) => anh.rgba[(y * anh.rong + x) * 4] < 128;
  const khop = (x0: number, y0: number) => {
    for (let j = 0; j < m.n; j++) {
      for (let i = 0; i < m.n; i++) {
        const x = x0 + (i + LE_QR) * cham;
        const y = y0 + (j + LE_QR) * cham;
        if (den(x, y) !== m.den(i, j)) return false;
      }
    }
    return true;
  };
  for (let y0 = 0; y0 + px <= anh.cao; y0++) {
    for (let x0 = 0; x0 + px <= anh.rong; x0++) {
      // Lọc nhanh: góc ô finder trên-trái phải đen.
      if (!den(x0 + LE_QR * cham, y0 + LE_QR * cham)) continue;
      if (khop(x0, y0)) return { x0, y0, m, cham, px };
    }
  }
  return null;
}

describe.each(["80", "58"] as const)("ảnh hóa đơn có QR — khổ %s mm", (kho) => {
  it("QR nằm trọn trong khổ, lề trắng ≥ 4 ô, mỗi ô là khối chấm đặc số nguyên, không chấm xám", async () => {
    const { buf, anh } = await giaiMa({ loai: "receipt", hoaDon, gio: "12:34 27/09/2026" }, kho);
    fs.mkdirSync("test-results", { recursive: true });
    fs.writeFileSync(path.join("test-results", `mau-hoa-don-qr-${kho}.png`), buf);

    expect(anh.rong).toBe(RONG[kho]);
    expect(anh.cao).toBe(uocLuongChieuCao({ loai: "receipt", hoaDon, gio: "" }, kho));

    const qr = timQr(anh, kho);
    expect(qr, "không tìm thấy mã QR khớp ma trận trong ảnh").not.toBeNull();
    const { x0, y0, m, cham, px } = qr!;
    expect(Number.isInteger(cham)).toBe(true);
    expect(cham).toBeGreaterThanOrEqual(kho === "80" ? 4 : 3);
    expect(x0 + px).toBeLessThanOrEqual(RONG[kho]);

    // Mọi chấm trong vùng QR (kể cả lề 4 ô): đen tuyệt đối hoặc trắng tuyệt đối, và đúng màu ô của nó.
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        const k = ((y0 + y) * anh.rong + (x0 + x)) * 4;
        const v = anh.rgba[k];
        expect(v === 0 || v === 255, `chấm xám ${v} tại (${x},${y})`).toBe(true);
        const i = Math.floor(x / cham) - LE_QR;
        const j = Math.floor(y / cham) - LE_QR;
        const moiO = i >= 0 && j >= 0 && i < m.n && j < m.n && m.den(i, j);
        if ((v === 0) !== moiO) throw new Error(`ô (${i},${j}) sai màu tại chấm (${x},${y})`);
      }
    }

    // Cầu in cắt ngưỡng đúng như khi in thật: QR không bị cắt mất ở đáy.
    const bits = thanhAnhDen(anh);
    expect(bits.cao).toBeGreaterThanOrEqual(y0 + (m.n + LE_QR) * cham);
  }, 60_000);
});

describe("hóa đơn đã thanh toán", () => {
  it("không có transferQr → ảnh không có QR (chiều cao như công thức cũ)", async () => {
    const daTra: ReceiptView = { ...hoaDon, payment: { method: "transfer", amount: 188811 } };
    delete daTra.transferQr;
    const { anh } = await giaiMa({ loai: "receipt", hoaDon: daTra, gio: "" }, "80");
    expect(timQr(anh, "80")).toBeNull();
  }, 60_000);
});
