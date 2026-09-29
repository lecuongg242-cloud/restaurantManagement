import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B, tenantIdBySlug } from "./setup";
import { adminClient } from "./fixtures";

/**
 * P20 / 20-02 (0077) trên DB thật, quán demo pho-viet (A): loại thu/chi mặc định, phiếu thu/chi tay, số dư đầu kỳ, tồn quỹ,
 * tiền bán hàng = report_payments, hủy = vô hiệu, chỉ chủ/quản lý.
 *
 * Tồn quỹ kiểm trên một tháng GIẢ năm 2001 — không có đơn / phiếu thật nào trước đó nên số đầu kỳ là số của test.
 */
const TAG = crypto.randomUUID().slice(0, 6);
const db = adminClient();
let tenantA = "";
let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let cashierA: SupabaseClient;
const users: string[] = [];
let catOut = ""; // "Chi khác" (e, hạch toán)
let catIn = ""; // "Thu khác"
let catRut = ""; // "Rút tiền" (không tính)
let nccA = "";
const ingredient = crypto.randomUUID();

const create = (c: SupabaseClient, v: Record<string, unknown>) =>
  c.rpc("create_cash_voucher", { p_tenant: tenantA, p_voucher: { note: `P20CB ${TAG}`, ...v } });
const summary = (fund: string, from: string, to: string) =>
  ownerA.rpc("cashbook_summary", { p_tenant: tenantA, p_fund: fund, p_from: from, p_to: to }).then((r) => {
    const x = (r.data as { opening: number; total_in: number; total_out: number; closing: number }[])[0];
    return { opening: Number(x.opening), in: Number(x.total_in), out: Number(x.total_out), closing: Number(x.closing) };
  });

beforeAll(async () => {
  tenantA = await tenantIdBySlug(OWNER_A.slug);
  ownerA = await signInAs(OWNER_A.email, OWNER_A.password);
  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);
  const email = `p20cb-cashier-${TAG}@test.local`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  users.push(data.user!.id);
  await db.from("memberships").insert({ tenant_id: tenantA, user_id: data.user!.id, role: "cashier", display_name: "P20CB", active: true });
  cashierA = await signInAs(email, password);

  const e = await ownerA.rpc("ensure_cash_categories", { p_tenant: tenantA });
  if (e.error) throw new Error(e.error.message);
  const { data: cats } = await db.from("cash_categories").select("id, name, direction").eq("tenant_id", tenantA);
  catOut = cats!.find((c) => c.name === "Chi khác")!.id;
  catIn = cats!.find((c) => c.name === "Thu khác")!.id;
  catRut = cats!.find((c) => c.name === "Rút tiền")!.id;
  const s = await ownerA.from("suppliers").insert({ tenant_id: tenantA, name: `P20CB ncc ${TAG}` }).select("id").single();
  nccA = s.data!.id as string;
  await db.from("ingredients").insert({ id: ingredient, tenant_id: tenantA, name: `P20CB ${TAG}`, base_unit: "g" });
}, 120_000);

afterAll(async () => {
  const { data: rs } = await db.from("purchase_receipts").select("id").eq("supplier_id", nccA);
  const ids = (rs ?? []).map((r) => r.id as string);
  await db.from("stock_entries").delete().in("purchase_receipt_id", ids);
  await db.from("cash_vouchers").delete().eq("tenant_id", tenantA).like("note", `%${TAG}%`);
  await db.from("cash_vouchers").delete().in("purchase_receipt_id", ids);
  await db.from("purchase_receipts").delete().in("id", ids);
  await db.from("suppliers").delete().eq("id", nccA);
  await db.from("ingredients").delete().eq("id", ingredient);
  await db.from("cash_categories").delete().eq("tenant_id", tenantA).like("name", `%${TAG}%`);
  await db.from("memberships").delete().in("user_id", users);
  for (const id of users) await db.auth.admin.deleteUser(id);
}, 120_000);

describe("loại thu/chi", () => {
  it("danh mục mặc định tạo một lần; gọi lại không nhân đôi", async () => {
    const { count: c1 } = await db.from("cash_categories").select("id", { count: "exact", head: true }).eq("tenant_id", tenantA);
    await ownerA.rpc("ensure_cash_categories", { p_tenant: tenantA });
    const { count: c2 } = await db.from("cash_categories").select("id", { count: "exact", head: true }).eq("tenant_id", tenantA);
    expect(c2).toBe(c1);
    const { data } = await db.from("cash_categories").select("name, cost_group, default_in_pnl").eq("tenant_id", tenantA).eq("name", "Nộp thuế");
    expect(data![0]).toEqual({ name: "Nộp thuế", cost_group: "none", default_in_pnl: false });
  });

  it("loại tự tạo trùng tên (không phân biệt hoa thường) → lỗi; quản lý sửa mục chi phí được", async () => {
    const a = await ownerA.from("cash_categories").insert({ tenant_id: tenantA, direction: "out", name: `Quảng cáo ${TAG}`, cost_group: "e" }).select("id").single();
    expect(a.error).toBeNull();
    const b = await ownerA.from("cash_categories").insert({ tenant_id: tenantA, direction: "out", name: `QUẢNG CÁO ${TAG}` });
    expect(b.error?.code).toBe("23505");
    await ownerA.from("cash_categories").update({ cost_group: "d", default_in_pnl: false }).eq("id", a.data!.id);
    const { data } = await db.from("cash_categories").select("cost_group, default_in_pnl").eq("id", a.data!.id).single();
    expect(data).toEqual({ cost_group: "d", default_in_pnl: false });
  });
});

describe("phiếu thu / chi", () => {
  it("phiếu chi: mã PC, hạch toán theo loại, ghi đè được; phiếu thu: mã PT", async () => {
    const c = await create(ownerA, { direction: "out", fund: "cash", amount: 850_000, category_id: catOut });
    expect(c.error).toBeNull();
    const pc = c.data![0] as { id: string; code: string };
    expect(pc.code).toMatch(/^PC\d{6}$/);
    expect((await db.from("cash_vouchers").select("in_pnl, source").eq("id", pc.id).single()).data).toEqual({ in_pnl: true, source: "manual" });
    const k = await create(ownerA, { direction: "out", fund: "cash", amount: 1, category_id: catOut, in_pnl: false });
    expect((await db.from("cash_vouchers").select("in_pnl").eq("id", (k.data![0] as { id: string }).id).single()).data!.in_pnl).toBe(false);
    const r = await create(ownerA, { direction: "out", fund: "bank", amount: 1, category_id: catRut });
    expect((await db.from("cash_vouchers").select("in_pnl").eq("id", (r.data![0] as { id: string }).id).single()).data!.in_pnl).toBe(false);
    const t = await create(ownerA, { direction: "in", fund: "cash", amount: 5, category_id: catIn });
    expect((t.data![0] as { code: string }).code).toMatch(/^PT\d{6}$/);
  });

  it("chặn: số tiền ≤ 0, loại sai chiều, NCC trên phiếu thu, ngày tương lai", async () => {
    expect((await create(ownerA, { direction: "out", fund: "cash", amount: 0, category_id: catOut })).error).not.toBeNull();
    expect((await create(ownerA, { direction: "in", fund: "cash", amount: 1, category_id: catOut })).error?.message).toContain("loai_khong_hop_le");
    expect((await create(ownerA, { direction: "in", fund: "cash", amount: 1, category_id: catIn, supplier_id: nccA })).error?.message).toContain("ncc_khong_hop_le");
    const future = new Date(Date.now() + 3 * 86400e3).toISOString();
    expect((await create(ownerA, { direction: "out", fund: "cash", amount: 1, category_id: catOut, occurred_at: future })).error?.message).toContain("ngay_tuong_lai");
  });

  it("phiếu chi tay cho NCC → giảm nợ NCC (supplier_summaries)", async () => {
    const debt = async () =>
      Number(((await ownerA.rpc("supplier_summaries", { p_tenant: tenantA })).data as { supplier_id: string; debt: number }[])
        .find((x) => x.supplier_id === nccA)!.debt);
    const d0 = await debt();
    await create(ownerA, { direction: "out", fund: "cash", amount: 70_000, category_id: catOut, supplier_id: nccA });
    expect(await debt()).toBe(d0 - 70_000);
  });

  it("hủy = vô hiệu (còn dòng, trạng thái Đã hủy); hủy hai lần → lỗi; phiếu tự sinh từ phiếu nhập không hủy ở đây", async () => {
    const c = await create(ownerA, { direction: "out", fund: "cash", amount: 9, category_id: catOut });
    const id = (c.data![0] as { id: string }).id;
    expect((await ownerA.rpc("cancel_cash_voucher", { p_voucher: id })).error).toBeNull();
    expect((await db.from("cash_vouchers").select("status").eq("id", id).single()).data!.status).toBe("cancelled");
    expect((await ownerA.rpc("cancel_cash_voucher", { p_voucher: id })).error?.message).toContain("da_huy");

    const pr = await ownerA.rpc("save_purchase_receipt", {
      p_tenant: tenantA,
      p_receipt: { supplier_id: nccA, pay_now: 10_000, lines: [{ ingredient_id: ingredient, qty: 1, unit_price: 10_000 }] },
      p_complete: false,
    });
    expect(pr.error).toBeNull();
    // Nguyên liệu `ingredient` là "purchased" mặc định → Hoàn thành được.
    const done = await ownerA.rpc("save_purchase_receipt", {
      p_tenant: tenantA,
      p_receipt: { id: (pr.data![0] as { id: string }).id, supplier_id: nccA, pay_now: 10_000, lines: [{ ingredient_id: ingredient, qty: 1, unit_price: 10_000 }] },
      p_complete: true,
    });
    expect(done.error).toBeNull();
    const { data: v } = await db.from("cash_vouchers").select("id").eq("purchase_receipt_id", (pr.data![0] as { id: string }).id).single();
    expect((await ownerA.rpc("cancel_cash_voucher", { p_voucher: v!.id })).error?.message).toContain("huy_tu_phieu_nhap");
  });

  it("sửa ghi chú + thời gian", async () => {
    const c = await create(ownerA, { direction: "out", fund: "cash", amount: 3, category_id: catOut });
    const id = (c.data![0] as { id: string }).id;
    const at = "2026-09-01T03:00:00.000Z";
    expect((await ownerA.rpc("update_cash_voucher_meta", { p_voucher: id, p_note: `sửa ${TAG}`, p_occurred_at: at })).error).toBeNull();
    const { data } = await db.from("cash_vouchers").select("note, occurred_at").eq("id", id).single();
    expect(data!.note).toBe(`sửa ${TAG}`);
    expect(new Date(data!.occurred_at as string).toISOString()).toBe(at);
  });
});

describe("tồn quỹ (tháng giả 01/2001)", () => {
  beforeAll(async () => {
    await create(ownerA, { kind: "opening", direction: "in", fund: "cash", amount: 2_000_000, occurred_at: "2001-01-01T01:00:00Z" });
    await create(ownerA, { direction: "out", fund: "cash", amount: 850_000, category_id: catOut, occurred_at: "2001-01-05T03:00:00Z" });
    const huy = await create(ownerA, { direction: "out", fund: "cash", amount: 50_000, category_id: catOut, occurred_at: "2001-01-06T03:00:00Z" });
    await ownerA.rpc("cancel_cash_voucher", { p_voucher: (huy.data![0] as { id: string }).id });
    await create(ownerA, { direction: "in", fund: "cash", amount: 100_000, category_id: catIn, occurred_at: "2001-01-20T03:00:00Z" });
    await create(ownerA, { direction: "out", fund: "bank", amount: 30_000, category_id: catOut, occurred_at: "2001-01-21T03:00:00Z" });
  });

  it("đầu kỳ + thu − chi = tồn; phiếu hủy không tính", async () => {
    expect(await summary("cash", "2001-01-01T00:00:00Z", "2001-01-16T00:00:00Z")).toEqual({
      opening: 0, in: 2_000_000, out: 850_000, closing: 1_150_000,
    });
  });

  it("tồn cuối kỳ trước = đầu kỳ sau", async () => {
    const k2 = await summary("cash", "2001-01-16T00:00:00Z", "2001-02-01T00:00:00Z");
    expect(k2).toEqual({ opening: 1_150_000, in: 100_000, out: 0, closing: 1_250_000 });
  });

  it("Tổng quỹ = Tiền mặt + Ngân hàng", async () => {
    const [cash, bank, all] = await Promise.all([
      summary("cash", "2001-01-01T00:00:00Z", "2001-02-01T00:00:00Z"),
      summary("bank", "2001-01-01T00:00:00Z", "2001-02-01T00:00:00Z"),
      summary("all", "2001-01-01T00:00:00Z", "2001-02-01T00:00:00Z"),
    ]);
    expect(bank).toEqual({ opening: 0, in: 0, out: 30_000, closing: -30_000 });
    expect(all.closing).toBe(cash.closing + bank.closing);
    expect(all.in).toBe(cash.in + bank.in);
  });
});

describe("tiền bán hàng = report_payments (dữ liệu thật của quán demo)", () => {
  it("Σ theo phương thức 30 ngày khớp; từng ngày khớp", async () => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86400e3);
    const { data: flows } = await ownerA.rpc("cashbook_flows", {
      p_tenant: tenantA, p_fund: "all", p_from: from.toISOString(), p_to: to.toISOString(),
    });
    const sales = (flows as { kind: string; fund: string; amount: number; occurred_at: string }[]).filter((f) => f.kind === "sales");
    const { data: rp } = await ownerA.rpc("report_payments", { p_tenant: tenantA, p_from: from.toISOString(), p_to: to.toISOString() });
    const byMethod = new Map((rp as { method: string; amount: number }[]).map((r) => [r.method, Number(r.amount)]));
    const sum = (fund: string) => sales.filter((s) => s.fund === fund).reduce((a, s) => a + Number(s.amount), 0);
    expect(sum("cash")).toBe(byMethod.get("cash") ?? 0);
    expect(sum("bank")).toBe(byMethod.get("transfer") ?? 0);
    expect(sum("cash") + sum("bank")).toBeGreaterThan(0); // quán demo có dữ liệu bán — test không rỗng

    // Ba ngày có bán: dòng của sổ quỹ = report_payments trong đúng ngày VN đó.
    for (const s of sales.slice(0, 3)) {
      const d0 = new Date(s.occurred_at);
      const d1 = new Date(d0.getTime() + 86400e3);
      const { data: r } = await ownerA.rpc("report_payments", { p_tenant: tenantA, p_from: d0.toISOString(), p_to: d1.toISOString() });
      const m = (r as { method: string; amount: number }[]).find((x) => (x.method === "cash" ? "cash" : "bank") === s.fund);
      expect(Number(s.amount)).toBe(Number(m?.amount ?? 0));
    }
  });
});

describe("quyền", () => {
  it("thu ngân: 0 dòng sổ quỹ, không đọc loại, không lập phiếu; quán khác cũng vậy", async () => {
    const r = { p_tenant: tenantA, p_fund: "all", p_from: "2000-01-01T00:00:00Z", p_to: new Date().toISOString() };
    expect((await cashierA.rpc("cashbook_flows", r)).data ?? []).toHaveLength(0);
    expect((await ownerB.rpc("cashbook_flows", r)).data ?? []).toHaveLength(0);
    expect((await cashierA.from("cash_categories").select("id").eq("tenant_id", tenantA)).data ?? []).toHaveLength(0);
    expect((await create(cashierA, { direction: "out", fund: "cash", amount: 1, category_id: catOut })).error?.code).toBe("42501");
    expect((await cashierA.rpc("ensure_cash_categories", { p_tenant: tenantA })).error?.code).toBe("42501");
  });

  it("chủ quán không xóa được loại (ngừng dùng thay cho xóa)", async () => {
    await ownerA.from("cash_categories").delete().eq("id", catRut);
    expect((await db.from("cash_categories").select("id").eq("id", catRut)).data).toHaveLength(1);
  });
});
