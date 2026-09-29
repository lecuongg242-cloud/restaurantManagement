import { describe, it, expect } from "vitest";
import { buildPnl, sumPnl, type PnlInput } from "@/lib/reports/pnl";

const base: PnlInput = {
  grossSales: 110_000_000,
  discount: 10_000_000,
  serviceCharge: 0,
  vat: 0,
  kpiRevenue: 100_000_000,
  billCount: 1000,
  cogsMode: "closing",
  cogs: 35_000_000,
  uncostedQty: 0,
  provisionalQty: 0,
  purchaseCost: 0,
  purchaseCount: 0,
  expenses: [
    { name: "Thuê mặt bằng", costGroup: "d", amount: 15_000_000, count: 1 },
    { name: "Lương nhân viên", costGroup: "b", amount: 20_000_000, count: 4 },
  ],
  otherIncome: 1_000_000,
  taxes: [],
};

describe("buildPnl — dòng báo cáo (REPORT-20)", () => {
  it("DT thuần − giá vốn = LN gộp − chi phí + thu nhập khác = lợi nhuận", () => {
    const v = buildPnl(base);
    expect(v.netRevenue).toBe(100_000_000);
    expect(v.grossProfit).toBe(65_000_000);
    expect(v.totalExpenses).toBe(35_000_000);
    expect(v.profit).toBe(31_000_000);
    expect(v.expenses.map((e) => e.name)).toEqual(["Lương nhân viên", "Thuê mặt bằng"]);
  });

  it("dòng nối: DT thuần + VAT = KPI (phí phục vụ vào doanh thu, VAT không)", () => {
    const v = buildPnl({ ...base, serviceCharge: 5_000_000, vat: 8_400_000, kpiRevenue: 113_400_000 });
    expect(v.netRevenue).toBe(105_000_000);
    expect(v.reconcileGap).toBe(0);
  });

  it("chế độ giá vốn: phiếu chi mục a) (đi chợ) KHÔNG cộng thêm, đếm số phiếu bị loại", () => {
    const v = buildPnl({ ...base, expenses: [...base.expenses, { name: "Đi chợ", costGroup: "a", amount: 3_000_000, count: 5 }] });
    expect(v.totalExpenses).toBe(35_000_000);
    expect(v.excludedA).toEqual({ count: 5, amount: 3_000_000 });
  });

  it("chế độ tiền mua: giá vốn = tiền mua theo phiếu nhập; phiếu chi mục a) CÓ vào chi phí", () => {
    const v = buildPnl({
      ...base, cogsMode: "purchase", cogs: 999, purchaseCost: 30_000_000, purchaseCount: 12, uncostedQty: 7,
      expenses: [...base.expenses, { name: "Đi chợ", costGroup: "a", amount: 3_000_000, count: 5 }],
    });
    expect(v.cogs).toBe(30_000_000);
    expect(v.totalExpenses).toBe(38_000_000);
    expect(v.excludedA.count).toBe(0);
    expect(v.uncostedQty).toBe(0);
  });

  it("thuế: 10% doanh thu trên DT thuần 100tr → 10tr; lợi nhuận sau thuế", () => {
    const v = buildPnl({ ...base, taxes: [{ name: "Thuế", pct: 10, base: "revenue" }] });
    expect(v.taxes[0].amount).toBe(10_000_000);
    expect(v.profitAfterTax).toBe(21_000_000);
  });

  it("thuế: GTGT 3% + TNCN 1,5% → hai dòng; % lẻ làm tròn đồng", () => {
    const v = buildPnl({
      ...base, grossSales: 100_000_333, discount: 0, kpiRevenue: 100_000_333,
      taxes: [{ name: "GTGT", pct: 3, base: "revenue" }, { name: "TNCN", pct: 1.5, base: "revenue" }],
    });
    expect(v.taxes.map((t) => t.amount)).toEqual([3_000_010, 1_500_005]);
  });

  it("thuế theo lợi nhuận khi lỗ → 0đ; chưa khai thuế → không dòng thuế, lợi nhuận giữ nguyên", () => {
    const lo = buildPnl({ ...base, cogs: 90_000_000, taxes: [{ name: "TNCN", pct: 17, base: "profit" }] });
    expect(lo.profit).toBeLessThan(0);
    expect(lo.taxes[0].amount).toBe(0);
    const none = buildPnl(base);
    expect(none.taxes).toEqual([]);
    expect(none.profitAfterTax).toBe(none.profit);
  });
});

describe("sumPnl — Tất cả chi nhánh", () => {
  it("mọi dòng = Σ từng chi nhánh; thuế theo cấu hình từng chi nhánh", () => {
    const a = buildPnl({ ...base, taxes: [{ name: "Thuế", pct: 10, base: "revenue" }] });
    const b = buildPnl({ ...base, grossSales: 50_000_000, discount: 0, kpiRevenue: 50_000_000, cogs: 10_000_000, expenses: [], otherIncome: 0, taxes: [] });
    const s = sumPnl([a, b]);
    expect(s.netRevenue).toBe(a.netRevenue + b.netRevenue);
    expect(s.profit).toBe(a.profit + b.profit);
    expect(s.totalTax).toBe(10_000_000);
    expect(s.profitAfterTax).toBe(a.profitAfterTax + b.profitAfterTax);
    expect(s.expenses.reduce((x, e) => x + e.amount, 0)).toBe(s.totalExpenses);
  });
});
