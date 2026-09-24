import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { signInAs, OWNER_A, OWNER_B, tenantIdBySlug } from "./setup";
import { adminClient } from "./fixtures";
import { allocateDiscount } from "@/lib/billing/net-revenue";
import { businessDate, addDays, dayStartUtc } from "@/lib/inventory/day";

/**
 * REPORT-13 — lãi gộp theo món trên DB thật. qt-food chưa từng giảm giá hay chia đều bill (đối soát
 * 24/09/2026: 5.392 bill, lệch 0đ), nên hai nhánh đó CHỈ được kiểm ở đây, bằng dữ liệu dựng sẵn:
 *   bill1 hôm qua: giảm 10% — Phở 60.000 + Cơm 40.000 (Phở có "thêm trứng")
 *   bill2 hôm qua: giảm 20.000đ — Cơm 20.000 + Phở 50.000 → [14.285, 35.715]
 *   bill3 hôm qua: vỏ chia đều 2 phần — Phở ×2 100.000, phí phục vụ 5.000; hai bill con không mang món
 *   bill4 hôm qua: món đã xóa khỏi thực đơn (menu_item_id null)
 *   bill5 HÔM NAY (chưa chốt): Phở ×1 — vào "tạm tính"
 * Bản chốt hôm qua: Phở 20.000đ/phần, Cơm 10.000đ/phần, thêm trứng 3.000đ.
 */
const db = adminClient();
let owner: SupabaseClient;
let ownerB: SupabaseClient;
let tenant: string;

const today = businessDate();
const D = addDays(today, -1);
const at = (day: string, h: number) => new Date(Date.parse(dayStartUtc(day)) + h * 3_600_000).toISOString();
const P_FROM = dayStartUtc(D);
const P_TO = dayStartUtc(addDays(today, 1));

const ids = {
  cat: randomUUID(), pho: randomUUID(), com: randomUUID(), gone: randomUUID(), group: randomUUID(), trung: randomUUID(),
  close: randomUUID(),
};
const bills: Record<string, string> = {};
const orderIds: string[] = [];
const lineOf: Record<string, string> = {}; // nhãn → bill_item id

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function bill(
  key: string,
  b: { day: string; subtotal: number; discount?: number; service?: number; total: number; split_count?: number; parent?: string },
  lines: { label: string; item: string | null; qty: number; amount: number; egg?: boolean }[]
) {
  const billId = randomUUID();
  bills[key] = billId;
  await must(db.from("bills").insert({
    id: billId, tenant_id: tenant, status: "paid", subtotal: b.subtotal,
    discount_type: b.discount ? "amount" : "none", discount_value: b.discount ?? 0, discount_amount: b.discount ?? 0,
    service_charge_amount: b.service ?? 0, total: b.total, paid_at: at(b.day, 13),
    split_count: b.split_count ?? null, split_parent_id: b.parent ?? null, note: "MARGIN-TEST",
  }));
  if (lines.length === 0) return;
  const orderId = randomUUID();
  orderIds.push(orderId);
  await must(db.from("orders").insert({
    id: orderId, tenant_id: tenant, channel: "takeaway", source: "staff", status: "completed", confirmed_at: at(b.day, 12), note: "MARGIN-TEST",
  }));
  for (const l of lines) {
    const oi = randomUUID();
    await must(db.from("order_items").insert({
      id: oi, tenant_id: tenant, order_id: orderId, menu_item_id: l.item, name_snapshot: l.label,
      unit_price_snapshot: l.amount / l.qty, qty: l.qty, status: "served",
    }));
    if (l.egg) {
      await must(db.from("order_item_modifiers").insert({
        tenant_id: tenant, order_item_id: oi, option_id: ids.trung, name_snapshot: "Thêm trứng", price_delta_snapshot: 0,
      }));
    }
    const bi = randomUUID();
    lineOf[`${key}:${l.label}`] = bi;
    await must(db.from("bill_items").insert({
      id: bi, tenant_id: tenant, bill_id: billId, order_item_id: oi, qty_allocated: l.qty, unit_price_snapshot: l.amount / l.qty, amount: l.amount,
    }));
  }
}

beforeAll(async () => {
  tenant = await tenantIdBySlug(OWNER_A.slug);
  owner = await signInAs(OWNER_A.email, OWNER_A.password);
  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);
  const t = { tenant_id: tenant };
  await must(db.from("menu_categories").insert({ id: ids.cat, ...t, name: "MARGIN-TEST", sort_order: 999 }));
  for (const [id, name] of [[ids.pho, "MG Phở"], [ids.com, "MG Cơm"], [ids.gone, "MG Món đã xóa"]]) {
    await must(db.from("menu_items").insert({ id, ...t, category_id: ids.cat, name, base_price: 50_000 }));
  }
  await must(db.from("modifier_groups").insert({ id: ids.group, ...t, name: "MG" }));
  await must(db.from("modifier_options").insert({ id: ids.trung, ...t, group_id: ids.group, name: "MG trứng" }));

  await must(db.from("daily_closes").insert({
    id: ids.close, ...t, business_date: D,
    payload: {
      version: 1,
      ingredients: [{
        id: randomUUID(), name: "MG bò", unit_cost: 300, counted: true, cancel_usage: 10, batch_shortfall: 0,
        waste_hong: 5, waste_do_bo: 0, waste_com_nv: 0, waste_khac: 0, adjust: -20,
      }],
      items: [
        { menu_item_id: ids.pho, name: "MG Phở", portion_cost: 20_000, missing: [] },
        { menu_item_id: ids.com, name: "MG Cơm", portion_cost: 10_000, missing: [] },
      ],
      options: [{ modifier_option_id: ids.trung, name: "MG trứng", cost: 3_000 }],
    },
  }));

  await bill("b1", { day: D, subtotal: 100_000, discount: 10_000, total: 90_000 }, [
    { label: "pho", item: ids.pho, qty: 1, amount: 60_000, egg: true },
    { label: "com", item: ids.com, qty: 1, amount: 40_000 },
  ]);
  await bill("b2", { day: D, subtotal: 70_000, discount: 20_000, total: 50_000 }, [
    { label: "com", item: ids.com, qty: 1, amount: 20_000 },
    { label: "pho", item: ids.pho, qty: 1, amount: 50_000 },
  ]);
  await bill("b3", { day: D, subtotal: 100_000, service: 5_000, total: 105_000, split_count: 2 }, [
    { label: "pho", item: ids.pho, qty: 2, amount: 100_000 },
  ]);
  await bill("b3a", { day: D, subtotal: 0, total: 52_500, parent: bills.b3 }, []);
  await bill("b3b", { day: D, subtotal: 0, total: 52_500, parent: bills.b3 }, []);
  await bill("b4", { day: D, subtotal: 30_000, total: 30_000 }, [{ label: "gone", item: ids.gone, qty: 1, amount: 30_000 }]);
  // Món đã xóa: order_item còn, menu_item_id về null (ON DELETE SET NULL)
  await must(db.from("menu_items").delete().eq("id", ids.gone));
  await bill("b5", { day: today, subtotal: 50_000, total: 50_000 }, [{ label: "pho", item: ids.pho, qty: 1, amount: 50_000 }]);
}, 180_000);

afterAll(async () => {
  await db.from("bill_items").delete().in("bill_id", Object.values(bills));
  await db.from("bills").delete().in("id", Object.values(bills));
  await db.from("orders").delete().in("id", orderIds);
  await db.from("daily_closes").delete().eq("id", ids.close);
  await db.from("modifier_options").delete().eq("id", ids.trung);
  await db.from("modifier_groups").delete().eq("id", ids.group);
  await db.from("menu_items").delete().in("id", [ids.pho, ids.com, ids.gone]);
  await db.from("menu_categories").delete().eq("id", ids.cat);
}, 120_000);

type Line = { bill_item_id: string; net_revenue: number };
async function lines(): Promise<Map<string, number>> {
  const { data, error } = await owner.rpc("report_margin_lines", { p_tenant: tenant, p_from: P_FROM, p_to: P_TO });
  expect(error).toBeNull();
  return new Map((data as Line[]).map((l) => [l.bill_item_id, Number(l.net_revenue)]));
}

describe("doanh thu thuần của món (REPORT-13, QD-017 D8)", () => {
  it("SQL phân bổ giảm giá = allocateDiscount (giảm 10% và giảm tiền)", async () => {
    const m = await lines();
    expect([m.get(lineOf["b1:pho"]), m.get(lineOf["b1:com"])]).toEqual(allocateDiscount([60_000, 40_000], 100_000, 10_000));
    expect([m.get(lineOf["b2:com"]), m.get(lineOf["b2:pho"])]).toEqual([14_285, 35_715]);
  });

  it("Σ doanh thu thuần = Σ (subtotal − discount) của bill paid mang bill_items — đối chiếu truy vấn thẳng", async () => {
    const m = await lines();
    const net = [...m.values()].reduce((s, x) => s + x, 0);
    const { data: bs } = await db
      .from("bills")
      .select("id, subtotal, discount_amount, bill_items!inner(id)")
      .eq("tenant_id", tenant)
      .eq("status", "paid")
      .gte("paid_at", P_FROM)
      .lt("paid_at", P_TO);
    const direct = (bs ?? []).reduce((s, b) => s + b.subtotal - b.discount_amount, 0);
    expect(net).toBe(direct);
  });

  it("dòng nối: món thuần + phí phục vụ + VAT = KPI doanh thu (vỏ chia đều không đếm hai lần)", async () => {
    const { data } = await owner.rpc("report_margin_reconcile", { p_tenant: tenant, p_from: P_FROM, p_to: P_TO });
    const r = (data as Record<string, number>[])[0];
    expect(Number(r.net_item_revenue) + Number(r.service_charge) + Number(r.vat)).toBe(Number(r.kpi_revenue));
  });
});

describe("giá vốn theo món (REPORT-13)", () => {
  type Row = { menu_item_id: string | null; name: string; qty: number; net_revenue: number; costed_revenue: number; cost_total: number; costed_qty: number; uncosted_qty: number };
  async function margin(): Promise<Row[]> {
    const { data, error } = await owner.rpc("report_gross_margin", { p_tenant: tenant, p_from: P_FROM, p_to: P_TO });
    expect(error).toBeNull();
    return data as Row[];
  }

  it("Phở: giá vốn đúng ngày chốt, option cộng vào giá vốn dòng; phần hôm nay chưa chốt vào uncosted", async () => {
    const pho = (await margin()).find((r) => r.menu_item_id === ids.pho)!;
    // b1: (20.000 + 3.000 trứng) × 1 · b2: 20.000 × 1 · b3: 20.000 × 2 → 83.000; b5 hôm nay chưa chốt
    expect(Number(pho.cost_total)).toBe(83_000);
    expect(Number(pho.costed_qty)).toBe(4);
    expect(Number(pho.uncosted_qty)).toBe(1);
    expect(Number(pho.qty)).toBe(5);
    // Doanh thu của phần đã có giá vốn: b1 54.000 + b2 35.715 + b3 100.000 (không gồm b5 hôm nay)
    expect(Number(pho.costed_revenue)).toBe(54_000 + 35_715 + 100_000);
  });

  it("Cơm: 2 phần × 10.000", async () => {
    const com = (await margin()).find((r) => r.menu_item_id === ids.com)!;
    expect(Number(com.cost_total)).toBe(20_000);
    expect(Number(com.net_revenue)).toBe(36_000 + 14_285);
  });

  it("món đã xóa vào uncosted, giữ tên", async () => {
    // Tên lấy từ name_snapshot của dòng đơn (món đã xóa thì không còn tên trong thực đơn).
    const gone = (await margin()).find((r) => r.name === "gone")!;
    expect(gone.menu_item_id).toBeNull();
    expect(Number(gone.uncosted_qty)).toBe(1);
    expect(Number(gone.costed_qty)).toBe(0);
  });

  it("dòng ngày chưa chốt trả về để server tạm tính, kèm option đã chọn", async () => {
    const { data } = await owner.rpc("report_margin_open_lines", { p_tenant: tenant, p_from: P_FROM, p_to: P_TO, p_day: today });
    const mine = (data as { menu_item_id: string; qty: number }[]).filter((r) => r.menu_item_id === ids.pho);
    expect(mine).toHaveLength(1);
    expect(mine[0].qty).toBe(1);
    expect(Number((mine[0] as { net_revenue?: number }).net_revenue)).toBe(50_000);
  });
});

describe("hao hụt đọc từ bản chốt (REPORT-14)", () => {
  it("trả đúng số của bản chốt", async () => {
    const { data } = await owner.rpc("report_waste", { p_tenant: tenant, p_from: P_FROM, p_to: P_TO });
    const r = (data as Record<string, unknown>[]).find((x) => x.name === "MG bò")!;
    expect(r).toMatchObject({ business_date: D, counted: true });
    expect(Number(r.cancel_usage)).toBe(10);
    expect(Number(r.adjust)).toBe(-20);
  });
});

describe("cách ly", () => {
  it("tenant B gọi RPC với p_tenant của A → 0 dòng", async () => {
    for (const fn of ["report_gross_margin", "report_waste"]) {
      const { data, error } = await ownerB.rpc(fn, { p_tenant: tenant, p_from: P_FROM, p_to: P_TO });
      expect(error, fn).toBeNull();
      expect(data ?? [], fn).toHaveLength(0);
    }
  });

  it("anon không gọi được", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await anon.rpc("report_gross_margin", { p_tenant: tenant, p_from: P_FROM, p_to: P_TO });
    expect(error).not.toBeNull();
  });
});
