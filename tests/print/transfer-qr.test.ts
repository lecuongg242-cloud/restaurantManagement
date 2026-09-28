import { describe, it, expect } from "vitest";
import { dungTransferQr } from "@/lib/billing/transfer-qr";
import { parseSettings } from "@/lib/tenant/settings";
import { computeBillTotals } from "@/lib/billing/compute";
import type { BillStatus } from "@/lib/billing/types";

/**
 * PAY-03 — QR chuyển khoản trên hóa đơn chỉ có ở ĐÚNG một ô: quán có tài khoản, bật in QR, bill còn mở.
 * Số tiền trong chuỗi QR phải bằng `total` in trên giấy.
 */
const BANK = { bin: "970436", account_no: "0123456789", account_name: "NGUYEN VAN A" };

function qr(o: { bank?: boolean; bat?: boolean; status?: BillStatus; total?: number; container?: boolean; billNo?: number | null }) {
  return dungTransferQr({
    settings: parseSettings({ ...(o.bank !== false ? { bank: BANK } : {}), print_qr_on_receipt: o.bat ?? true }),
    status: o.status ?? "open",
    isSplitContainer: o.container ?? false,
    total: o.total ?? 188811,
    billNo: o.billNo === undefined ? 12 : o.billNo,
    createdAt: "2026-09-27T16:30:00Z", // 23:30 giờ VN 27/09
  });
}

/** Giá trị tag 54 (số tiền) trong chuỗi EMVCo. */
function soTien(payload: string): number {
  const i = payload.indexOf("5303704") + 7;
  expect(payload.slice(i, i + 2)).toBe("54");
  const len = Number(payload.slice(i + 2, i + 4));
  return Number(payload.slice(i + 4, i + 4 + len));
}

describe("dungTransferQr — khi nào có QR", () => {
  const O = [
    { bank: true, bat: true, status: "open" as const, co: true },
    { bank: true, bat: true, status: "paid" as const, co: false },
    { bank: true, bat: false, status: "open" as const, co: false },
    { bank: true, bat: false, status: "paid" as const, co: false },
    { bank: false, bat: true, status: "open" as const, co: false },
    { bank: false, bat: true, status: "paid" as const, co: false },
    { bank: false, bat: false, status: "open" as const, co: false },
    { bank: false, bat: false, status: "paid" as const, co: false },
  ];
  it.each(O)("bank=$bank bật=$bat bill=$status → có QR: $co", ({ bank, bat, status, co }) => {
    expect(Boolean(qr({ bank, bat, status }))).toBe(co);
  });

  it("bill đã hủy (void) → không QR", () => expect(qr({ status: "void" })).toBeUndefined());
  it("bill vỏ chứa của lần chia đều → không QR (thu ở bill con)", () => expect(qr({ container: true })).toBeUndefined());
  it("tổng 0đ → không QR", () => expect(qr({ total: 0 })).toBeUndefined());
  it("chưa có số bill → không QR", () => expect(qr({ billNo: null })).toBeUndefined());
});

describe("dungTransferQr — nội dung QR", () => {
  it("mang tên ngân hàng, số TK, tên chủ TK, nội dung theo ngày giờ VN", () => {
    const q = qr({})!;
    expect(q.bankShortName).toBe("Vietcombank");
    expect(q.accountNo).toBe(BANK.account_no);
    expect(q.accountName).toBe(BANK.account_name);
    expect(q.content).toBe("HD12 2709");
    expect(q.payload).toContain("0809HD12 2709");
  });

  it("bill có giảm giá + phí phục vụ + VAT → số tiền QR = total đã tính", () => {
    const t = computeBillTotals({
      lines: [{ amount: 130000 }, { amount: 40000 }, { amount: 15000 }],
      discountType: "percent",
      discountValue: 10,
      serviceChargePct: 5,
      vatPct: 8,
    });
    expect(soTien(qr({ total: t.total })!.payload)).toBe(t.total);
  });

  it("bill con của lần chia đều → số tiền là tổng BILL CON", () => {
    expect(soTien(qr({ total: 62937 })!.payload)).toBe(62937);
  });

  it("in lại sau khi đổi giảm giá → QR mang số tiền mới", () => {
    const truoc = qr({ total: 200000 })!.payload;
    const sau = qr({ total: 180000 })!.payload;
    expect(soTien(truoc)).toBe(200000);
    expect(soTien(sau)).toBe(180000);
    expect(sau).not.toBe(truoc);
  });
});
