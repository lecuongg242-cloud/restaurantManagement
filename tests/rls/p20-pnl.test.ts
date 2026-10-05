import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B, tenantIdBySlug } from "./setup";
import { adminClient } from "./fixtures";

/**
 * P20 / 20-04 (0079) trên DB thật, quán demo pho-viet (A): report_pnl khớp KPI doanh thu; chi phí chỉ gồm phiếu chi tay có
 * "Hạch toán" (không gồm trả tiền phiếu nhập / trả nợ / số dư đầu kỳ / phiếu hủy); tiền mua theo ngày chứng từ; CHỈ CHỦ:
 * quản lý, thu ngân, quán khác → 0 dòng.
 *
 * Chi phí / thu nhập / tiền mua kiểm trên tháng GIẢ 02/2001 — không có số thật nào ở đó.
 */
const TAG = crypto.randomUUID().slice(0, 6);
const db = adminClient();
let tenantA = "";
let tenantB = "";
let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let managerA: SupabaseClient;
let cashierA: SupabaseClient;
const users: string[] = [];
const ing = crypto.randomUUID();
let ncc = "";
const K = { p_from: "2001-01-31T17:00:00Z", p_to: "2001-02-28T17:00:00Z" }; // tháng 02/2001 giờ VN

async function user(role: "manager" | "cashier") {
  const email = `p20pnl-${role}-${TAG}@test.local`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  users.push(data.user!.id);
  await db.from("memberships").insert({ tenant_id: tenantA, user_id: data.user!.id, role, display_name: `P20PNL ${role}`, active: true });
  return signInAs(email, password);
}

beforeAll(async () => {
  tenantA = await tenantIdBySlug(OWNER_A.slug);
  tenantB = await tenantIdBySlug(OWNER_B.slug);
  ownerA = await signInAs(OWNER_A.email, OWNER_A.password);
  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);
  managerA = await user("manager");
  cashierA = await user("cashier");

  await ownerA.rpc("ensure_cash_categories", { p_tenant: tenantA });
  const { data: cats } = await db.from("cash_categories").select("id, name").eq("tenant_id", tenantA);
  const cat = (n: string) => cats!.find((c) => c.name === n)!.id;
  await db.from("ingredients").insert({ id: ing, tenant_id: tenantA, name: `P20PNL ${TAG}`, base_unit: "g" });
  ncc = (await ownerA.from("suppliers").insert({ tenant_id: tenantA, name: `P20PNL ${TAG}` }).select("id").single()).data!.id;

  const v = (x: Record<string, unknown>) =>
    ownerA.rpc("create_cash_voucher", { p_tenant: tenantA, p_voucher: { note: `P20PNL ${TAG}`, fund: "cash", ...x } });
  await v({ direction: "out", amount: 5_000_000, category_id: cat("Thuê mặt bằng"), occurred_at: "2001-02-05T03:00:00Z" });
  await v({ direction: "out", amount: 3_000_000, category_id: cat("Lương nhân viên"), occurred_at: "2001-02-10T03:00:00Z" });
  await v({ direction: "out", amount: 700_000, category_id: cat("Đi chợ"), occurred_at: "2001-02-11T03:00:00Z" });
  await v({ direction: "out", amount: 999_000, category_id: cat("Rút tiền"), occurred_at: "2001-02-12T03:00:00Z" }); // không hạch toán
  await v({ direction: "out", amount: 111_000, category_id: cat("Chi khác"), in_pnl: false, occurred_at: "2001-02-13T03:00:00Z" });
  const huy = await v({ direction: "out", amount: 222_000, category_id: cat("Chi khác"), occurred_at: "2001-02-14T03:00:00Z" });
  await ownerA.rpc("cancel_cash_voucher", { p_voucher: (huy.data![0] as { id: string }).id });
  await v({ direction: "in", amount: 400_000, category_id: cat("Thu khác"), occurred_at: "2001-02-15T03:00:00Z" });
  await v({ direction: "in", amount: 888_000, category_id: cat("Nộp tiền vào quỹ"), occurred_at: "2001-02-16T03:00:00Z" }); // không hạch toán
  await v({ kind: "opening", direction: "in", amount: 9_000_000, occurred_at: "2001-02-01T00:00:00Z" });
  await v({ direction: "out", amount: 4_000_000, category_id: cat("Chi khác"), occurred_at: "2001-03-02T03:00:00Z" }); // ngoài kỳ

  // Phiếu nhập: 1 đã nhập trong kỳ (trả ngay 200k → phiếu chi "purchase"), 1 phiếu tạm, 1 đã hủy.
  // P34: ngày chứng từ = ngày của Thời gian nhập, chỉ lùi được trong 7 ngày → đặt ngày tháng giả bằng service role sau khi
  // ghi qua đúng RPC (như phiếu cũ đã có trong DB).
  const pn = async (doc: string, total: number, complete: boolean, pay = 0) => {
    const r = await ownerA.rpc("save_purchase_receipt", {
      p_tenant: tenantA,
      p_receipt: { supplier_id: ncc, pay_now: pay, note: `P20PNL ${TAG}`, lines: [{ ingredient_id: ing, qty: 1, unit_price: total }] },
      p_complete: complete,
    });
    if (r.data?.[0]) await db.from("purchase_receipts").update({ doc_date: doc }).eq("id", (r.data[0] as { id: string }).id);
    return r;
  };
  await pn("2001-02-20", 1_500_000, true, 200_000);
  await pn("2001-02-21", 7_000_000, false);
  const h = await pn("2001-02-22", 8_000_000, true);
  await ownerA.rpc("cancel_purchase_receipt", { p_receipt: (h.data![0] as { id: string }).id, p_cancel_vouchers: true });
  // Trả nợ NCC trong kỳ — KHÔNG phải chi phí.
  await ownerA.rpc("pay_supplier", { p_supplier: ncc, p_amount: 300_000, p_fund: "cash", p_at: "2001-02-25T03:00:00Z", p_receipts: null, p_note: `P20PNL ${TAG}` });
}, 180_000);

afterAll(async () => {
  const { data: rs } = await db.from("purchase_receipts").select("id").eq("supplier_id", ncc);
  const ids = (rs ?? []).map((x) => x.id as string);
  await db.from("stock_entries").delete().in("purchase_receipt_id", ids);
  await db.from("cash_vouchers").delete().eq("tenant_id", tenantA).like("note", `%${TAG}%`);
  await db.from("cash_vouchers").delete().eq("supplier_id", ncc);
  await db.from("cash_vouchers").delete().in("purchase_receipt_id", ids);
  await db.from("purchase_receipts").delete().in("id", ids);
  await db.from("suppliers").delete().eq("id", ncc);
  await db.from("ingredients").delete().eq("id", ing);
  await db.from("memberships").delete().in("user_id", users);
  for (const id of users) await db.auth.admin.deleteUser(id);
}, 120_000);

type Pnl = { tenant_id: string; gross_sales: number; discount: number; service_charge: number; vat: number; kpi_revenue: number; purchase_cost: number; purchase_count: number; other_income: number };

describe("report_pnl — doanh thu khớp KPI (dữ liệu thật của quán demo, 30 ngày)", () => {
  it("tiền món − giảm giá + phí phục vụ + VAT = KPI = report_summary", async () => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 30 * 86400e3).toISOString();
    const { data, error } = await ownerA.rpc("report_pnl", { p_tenants: [tenantA], p_from: from, p_to: to });
    expect(error).toBeNull();
    const r = (data as Pnl[])[0];
    const n = (x: number) => Number(x);
    expect(n(r.gross_sales) - n(r.discount) + n(r.service_charge) + n(r.vat)).toBe(n(r.kpi_revenue));
    const { data: s } = await ownerA.rpc("report_summary", { p_tenant: tenantA, p_from: from, p_to: to });
    expect(n(r.kpi_revenue)).toBe(Number((s as { total_revenue: number }[])[0].total_revenue));
    expect(n(r.kpi_revenue)).toBeGreaterThan(0);
  });
});

describe("chi phí, thu nhập khác, tiền mua (tháng giả 02/2001)", () => {
  it("chi phí = phiếu chi tay có hạch toán, còn hiệu lực, trong kỳ — gom theo loại", async () => {
    const { data } = await ownerA.rpc("report_pnl_expenses", { p_tenants: [tenantA], ...K });
    const m = Object.fromEntries((data as { name: string; amount: number; cost_group: string }[]).map((e) => [e.name, [Number(e.amount), e.cost_group]]));
    expect(m).toEqual({ "Thuê mặt bằng": [5_000_000, "d"], "Lương nhân viên": [3_000_000, "b"], "Đi chợ": [700_000, "a"] });
  });

  it("thu nhập khác = phiếu thu tay có hạch toán; tiền mua = phiếu đã nhập theo ngày chứng từ", async () => {
    const { data } = await ownerA.rpc("report_pnl", { p_tenants: [tenantA], ...K });
    const r = (data as Pnl[])[0];
    expect(Number(r.other_income)).toBe(400_000);
    expect(Number(r.purchase_cost)).toBe(1_500_000);
    expect(Number(r.purchase_count)).toBe(1);
  });
});

describe("chỉ chủ quán (QD-027 C5)", () => {
  it("quản lý, thu ngân → 0 dòng cả hai hàm", async () => {
    for (const c of [managerA, cashierA]) {
      expect((await c.rpc("report_pnl", { p_tenants: [tenantA], ...K })).data ?? []).toHaveLength(0);
      expect((await c.rpc("report_pnl_expenses", { p_tenants: [tenantA], ...K })).data ?? []).toHaveLength(0);
    }
  });

  it("quản lý vẫn đọc được sổ quỹ (chỉ lãi lỗ bị chặn)", async () => {
    const { data } = await managerA.rpc("cashbook_flows", { p_tenant: tenantA, p_fund: "all", ...K });
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("chủ A hỏi cả [A, B] → chỉ ra A; chủ B hỏi A → 0 dòng", async () => {
    const { data } = await ownerA.rpc("report_pnl", { p_tenants: [tenantA, tenantB], ...K });
    expect((data as Pnl[]).map((r) => r.tenant_id)).toEqual([tenantA]);
    expect((await ownerB.rpc("report_pnl", { p_tenants: [tenantA], ...K })).data ?? []).toHaveLength(0);
  });
});
