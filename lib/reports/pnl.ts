/**
 * Báo cáo Kết quả kinh doanh (P20 / 20-04, REPORT-20, QD-027 D12, C9). Thuần — nhận số đã tổng hợp, trả các dòng báo cáo.
 * Dòng theo mẫu số đông đối thủ (Sapo FnB, KiotViet): Doanh thu thuần − Giá vốn = Lợi nhuận gộp − Chi phí + Thu nhập khác
 * = Lợi nhuận; thêm thuế ước tính do quán tự khai → Lợi nhuận sau thuế.
 */
import type { TaxLine } from "@/lib/tenant/settings";

export type PnlInput = {
  grossSales: number; // Σ tiền món (subtotal)
  discount: number;
  serviceCharge: number;
  vat: number; // VAT cộng vào hóa đơn (khách trả) — không phải doanh thu của quán
  kpiRevenue: number; // KPI "Doanh thu" (BILL-05)
  billCount: number;
  /** "closing" = quán khai định lượng → giá vốn món đã bán (REPORT-13); "purchase" = tiền mua theo phiếu nhập. */
  cogsMode: "closing" | "purchase";
  cogs: number; // giá vốn phần món ĐÃ có giá (chế độ closing)
  uncostedQty: number; // phần món chưa đủ giá — không vào giá vốn (QD-017 D6)
  provisionalQty: number; // phần món hôm nay tính tạm (chưa chốt sổ)
  purchaseCost: number;
  purchaseCount: number;
  expenses: { name: string; costGroup: string; amount: number; count: number }[];
  otherIncome: number;
  taxes: TaxLine[];
};

export type PnlTax = TaxLine & { amount: number };

export type PnlView = {
  grossSales: number;
  discount: number;
  netItemRevenue: number;
  serviceCharge: number;
  netRevenue: number;
  vat: number;
  kpiRevenue: number;
  /** Doanh thu thuần + VAT − KPI. Luôn 0 nếu số liệu nhất quán (đo trên DB thật: 0đ). */
  reconcileGap: number;
  cogsMode: PnlInput["cogsMode"];
  cogs: number;
  uncostedQty: number;
  provisionalQty: number;
  purchaseCount: number;
  grossProfit: number;
  expenses: { name: string; amount: number; count: number }[];
  totalExpenses: number;
  /** Chế độ giá vốn: phiếu chi mục a) (nguyên liệu) KHÔNG cộng thêm — đã nằm trong giá vốn. */
  excludedA: { count: number; amount: number };
  otherIncome: number;
  profit: number;
  taxes: PnlTax[];
  totalTax: number;
  profitAfterTax: number;
};

/** Làm tròn đồng, nửa lên (số dương) — như round() của Postgres. */
const dong = (n: number) => Math.round(n);

export function buildPnl(i: PnlInput): PnlView {
  const netItemRevenue = i.grossSales - i.discount;
  const netRevenue = netItemRevenue + i.serviceCharge;
  const cogs = i.cogsMode === "closing" ? i.cogs : i.purchaseCost;
  const grossProfit = netRevenue - cogs;

  const kept = i.cogsMode === "closing" ? i.expenses.filter((e) => e.costGroup !== "a") : i.expenses;
  const dropped = i.cogsMode === "closing" ? i.expenses.filter((e) => e.costGroup === "a") : [];
  const byName = new Map<string, { name: string; amount: number; count: number }>();
  for (const e of kept) {
    const cur = byName.get(e.name) ?? { name: e.name, amount: 0, count: 0 };
    cur.amount += e.amount;
    cur.count += e.count;
    byName.set(e.name, cur);
  }
  const expenses = [...byName.values()].sort((a, b) => b.amount - a.amount);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const profit = grossProfit - totalExpenses + i.otherIncome;

  const taxes = i.taxes.map((t) => ({
    ...t,
    amount: dong(((t.base === "revenue" ? netRevenue : Math.max(0, profit)) * t.pct) / 100),
  }));
  const totalTax = taxes.reduce((s, t) => s + t.amount, 0);

  return {
    grossSales: i.grossSales,
    discount: i.discount,
    netItemRevenue,
    serviceCharge: i.serviceCharge,
    netRevenue,
    vat: i.vat,
    kpiRevenue: i.kpiRevenue,
    reconcileGap: netRevenue + i.vat - i.kpiRevenue,
    cogsMode: i.cogsMode,
    cogs,
    uncostedQty: i.cogsMode === "closing" ? i.uncostedQty : 0,
    provisionalQty: i.cogsMode === "closing" ? i.provisionalQty : 0,
    purchaseCount: i.purchaseCount,
    grossProfit,
    expenses,
    totalExpenses,
    excludedA: { count: dropped.reduce((s, e) => s + e.count, 0), amount: dropped.reduce((s, e) => s + e.amount, 0) },
    otherIncome: i.otherIncome,
    profit,
    taxes,
    totalTax,
    profitAfterTax: profit - totalTax,
  };
}

/**
 * Gộp nhiều chi nhánh ("Tất cả chi nhánh"): mọi dòng = Σ từng chi nhánh; thuế tính theo cấu hình CỦA TỪNG chi nhánh rồi cộng
 * theo tên. Chế độ giá vốn: chi nhánh nào cũng "closing" thì giữ, lẫn lộn thì ghi "purchase" chỉ để đặt nhãn (số vẫn là
 * tổng của từng chi nhánh theo chế độ riêng).
 */
export function sumPnl(views: PnlView[]): PnlView {
  const sum = (f: (v: PnlView) => number) => views.reduce((s, v) => s + f(v), 0);
  const expenses = new Map<string, { name: string; amount: number; count: number }>();
  for (const e of views.flatMap((v) => v.expenses)) {
    const cur = expenses.get(e.name) ?? { name: e.name, amount: 0, count: 0 };
    expenses.set(e.name, { name: e.name, amount: cur.amount + e.amount, count: cur.count + e.count });
  }
  const taxes = new Map<string, PnlTax>();
  for (const t of views.flatMap((v) => v.taxes)) {
    const k = `${t.name}|${t.base}|${t.pct}`;
    taxes.set(k, { ...t, amount: (taxes.get(k)?.amount ?? 0) + t.amount });
  }
  return {
    grossSales: sum((v) => v.grossSales),
    discount: sum((v) => v.discount),
    netItemRevenue: sum((v) => v.netItemRevenue),
    serviceCharge: sum((v) => v.serviceCharge),
    netRevenue: sum((v) => v.netRevenue),
    vat: sum((v) => v.vat),
    kpiRevenue: sum((v) => v.kpiRevenue),
    reconcileGap: sum((v) => v.reconcileGap),
    cogsMode: views.every((v) => v.cogsMode === "closing") ? "closing" : "purchase",
    cogs: sum((v) => v.cogs),
    uncostedQty: sum((v) => v.uncostedQty),
    provisionalQty: sum((v) => v.provisionalQty),
    purchaseCount: sum((v) => v.purchaseCount),
    grossProfit: sum((v) => v.grossProfit),
    expenses: [...expenses.values()].sort((a, b) => b.amount - a.amount),
    totalExpenses: sum((v) => v.totalExpenses),
    excludedA: { count: sum((v) => v.excludedA.count), amount: sum((v) => v.excludedA.amount) },
    otherIncome: sum((v) => v.otherIncome),
    profit: sum((v) => v.profit),
    taxes: [...taxes.values()],
    totalTax: sum((v) => v.totalTax),
    profitAfterTax: sum((v) => v.profitAfterTax),
  };
}
