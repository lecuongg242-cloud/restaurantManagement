import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, tenantIdBySlug } from "./setup";
import { adminClient } from "./fixtures";

/**
 * P20 / 20-03 (0078) trên DB thật, quán demo pho-viet: thanh toán nợ NCC phân bổ phiếu cũ trước / theo phiếu tích chọn,
 * trả dư thành trả trước, hủy gỡ phân bổ, điều chỉnh nợ, phiếu chi tay ở sổ quỹ tự phân bổ. Sau MỖI kịch bản kiểm bất biến:
 *   Nợ (supplier_summaries) = Σ còn nợ từng phiếu + Σ điều chỉnh − trả trước.
 */
const TAG = crypto.randomUUID().slice(0, 6);
const db = adminClient();
let tenantA = "";
let ownerA: SupabaseClient;
let cashierA: SupabaseClient;
const users: string[] = [];
const ing = crypto.randomUUID();
let ncc = "";
let ncc2 = "";
const r: string[] = []; // 3 phiếu 1tr / 2tr / 3tr, cũ → mới

type Bal = { receipt_id: string; total: number; paid: number; remaining: number };
const balances = async (supplier = ncc): Promise<Map<string, Bal>> => {
  const { data } = await ownerA.rpc("supplier_receipt_balances", { p_supplier: supplier });
  return new Map(((data ?? []) as Bal[]).map((b) => [b.receipt_id, { ...b, paid: Number(b.paid), remaining: Number(b.remaining) }]));
};
const debt = async (supplier = ncc) =>
  Number(((await ownerA.rpc("supplier_summaries", { p_tenant: tenantA })).data as { supplier_id: string; debt: number }[])
    .find((x) => x.supplier_id === supplier)!.debt);

/** Bất biến QD-027 D11 — tính lại từ bảng gốc bằng service role. */
async function invariant(supplier = ncc) {
  const bal = [...(await balances(supplier)).values()];
  const { data: vs } = await db.from("cash_vouchers").select("id, amount").eq("supplier_id", supplier).eq("status", "active").eq("direction", "out");
  const ids = (vs ?? []).map((v) => v.id as string);
  const { data: al } = ids.length ? await db.from("cash_voucher_allocations").select("amount").in("voucher_id", ids) : { data: [] };
  const { data: adj } = await db.from("supplier_debt_adjustments").select("amount").eq("supplier_id", supplier).eq("status", "active");
  const prepaid = (vs ?? []).reduce((s, v) => s + v.amount, 0) - (al ?? []).reduce((s, a) => s + a.amount, 0);
  const expected = bal.reduce((s, b) => s + b.remaining, 0) + (adj ?? []).reduce((s, a) => s + a.amount, 0) - prepaid;
  expect(await debt(supplier), "bất biến nợ NCC").toBe(expected);
  for (const b of bal) expect(b.remaining, "không phiếu nào bị trả quá").toBeGreaterThanOrEqual(0);
  return { prepaid };
}

const pay = (amount: number, receipts: string[] | null = null, supplier = ncc) =>
  ownerA.rpc("pay_supplier", {
    p_supplier: supplier, p_amount: amount, p_fund: "cash", p_at: null, p_receipts: receipts, p_note: `P20D ${TAG}`,
  });

async function nhap(total: number, docDate: string, supplier = ncc, payNow = 0) {
  const { data, error } = await ownerA.rpc("save_purchase_receipt", {
    p_tenant: tenantA,
    p_receipt: { supplier_id: supplier, doc_date: docDate, pay_now: payNow, note: `P20D ${TAG}`, lines: [{ ingredient_id: ing, qty: 1, unit_price: total }] },
    p_complete: true,
  });
  if (error) throw new Error(error.message);
  return (data![0] as { id: string }).id;
}

beforeAll(async () => {
  tenantA = await tenantIdBySlug(OWNER_A.slug);
  ownerA = await signInAs(OWNER_A.email, OWNER_A.password);
  const email = `p20d-cashier-${TAG}@test.local`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  users.push(data.user!.id);
  await db.from("memberships").insert({ tenant_id: tenantA, user_id: data.user!.id, role: "cashier", display_name: "P20D", active: true });
  cashierA = await signInAs(email, password);
  await db.from("ingredients").insert({ id: ing, tenant_id: tenantA, name: `P20D ${TAG}`, base_unit: "g" });
  ncc = (await ownerA.from("suppliers").insert({ tenant_id: tenantA, name: `P20D mối ${TAG}` }).select("id").single()).data!.id;
  ncc2 = (await ownerA.from("suppliers").insert({ tenant_id: tenantA, name: `P20D mối 2 ${TAG}` }).select("id").single()).data!.id;
  r.push(await nhap(1_000_000, "2026-09-01"), await nhap(2_000_000, "2026-09-02"), await nhap(3_000_000, "2026-09-03"));
}, 120_000);

afterAll(async () => {
  const { data: rs } = await db.from("purchase_receipts").select("id").in("supplier_id", [ncc, ncc2]);
  const ids = (rs ?? []).map((x) => x.id as string);
  await db.from("stock_entries").delete().in("purchase_receipt_id", ids);
  await db.from("cash_vouchers").delete().in("supplier_id", [ncc, ncc2]);
  await db.from("cash_vouchers").delete().in("purchase_receipt_id", ids);
  await db.from("supplier_debt_adjustments").delete().in("supplier_id", [ncc, ncc2]);
  await db.from("purchase_receipts").delete().in("id", ids);
  await db.from("suppliers").delete().in("id", [ncc, ncc2]);
  await db.from("ingredients").delete().eq("id", ing);
  await db.from("memberships").delete().in("user_id", users);
  for (const id of users) await db.auth.admin.deleteUser(id);
}, 120_000);

describe("thanh toán nợ NCC (tuần tự trên cùng 3 phiếu)", () => {
  it("ban đầu: nợ = 6tr, mỗi phiếu còn nguyên", async () => {
    expect(await debt()).toBe(6_000_000);
    const b = await balances();
    expect(r.map((id) => b.get(id)!.remaining)).toEqual([1_000_000, 2_000_000, 3_000_000]);
    await invariant();
  });

  it("trả 2,5tr không chọn phiếu → phiếu cũ trước: 0 / 0,5tr / 3tr; phiếu chi PC nguồn trả nợ", async () => {
    const { data, error } = await pay(2_500_000);
    expect(error).toBeNull();
    expect((data![0] as { code: string }).code).toMatch(/^PC\d{6}$/);
    const b = await balances();
    expect(r.map((id) => b.get(id)!.remaining)).toEqual([0, 500_000, 3_000_000]);
    const { data: v } = await db.from("cash_vouchers").select("source, in_pnl, supplier_id").eq("id", (data![0] as { id: string }).id).single();
    expect(v).toEqual({ source: "supplier_payment", in_pnl: false, supplier_id: ncc });
    await invariant();
  });

  it("tích chọn phiếu 3, trả 1tr → chỉ phiếu 3 giảm", async () => {
    expect((await pay(1_000_000, [r[2]])).error).toBeNull();
    const b = await balances();
    expect(r.map((id) => b.get(id)!.remaining)).toEqual([0, 500_000, 2_000_000]);
    await invariant();
  });

  it("trả dư 7tr → hết cả ba, trả trước 4,5tr; nợ âm", async () => {
    expect((await pay(7_000_000)).error).toBeNull();
    const b = await balances();
    expect(r.map((id) => b.get(id)!.remaining)).toEqual([0, 0, 0]);
    expect(await debt()).toBe(-4_500_000);
    expect((await invariant()).prepaid).toBe(4_500_000);
  });

  it("hủy phiếu chi 7tr ở sổ quỹ → phân bổ biến mất, nợ quay lại 2,5tr", async () => {
    const { data: v } = await db.from("cash_vouchers").select("id").eq("supplier_id", ncc).eq("amount", 7_000_000).single();
    expect((await ownerA.rpc("cancel_cash_voucher", { p_voucher: v!.id })).error).toBeNull();
    expect((await db.from("cash_voucher_allocations").select("id").eq("voucher_id", v!.id)).data).toHaveLength(0);
    expect(await debt()).toBe(2_500_000);
    await invariant();
  });

  it("điều chỉnh +5tr (nợ đầu kỳ) → nợ 7,5tr; hủy điều chỉnh → 2,5tr; điều chỉnh không vào sổ quỹ", async () => {
    const { data: id, error } = await ownerA.rpc("adjust_supplier_debt", { p_supplier: ncc, p_amount: 5_000_000, p_note: `Công nợ tồn đầu kỳ ${TAG}` });
    expect(error).toBeNull();
    expect(await debt()).toBe(7_500_000);
    await invariant();
    const { count } = await db.from("cash_vouchers").select("id", { count: "exact", head: true }).eq("supplier_id", ncc).eq("amount", 5_000_000);
    expect(count).toBe(0);
    expect((await ownerA.rpc("cancel_supplier_adjustment", { p_id: id })).error).toBeNull();
    expect(await debt()).toBe(2_500_000);
    await invariant();
  });

  it("hủy phiếu nhập đã trả một phần mà không hủy phiếu chi → tiền đã trả thành trả trước", async () => {
    // Phiếu 2 đã nhận 1,5tr từ lần trả 2,5tr. Hủy phiếu 2 (giữ phiếu chi) → nợ = phiếu 3 còn 2tr − trả trước 1,5tr = 0,5tr.
    expect((await ownerA.rpc("cancel_purchase_receipt", { p_receipt: r[1], p_cancel_vouchers: false })).error).toBeNull();
    expect((await db.from("cash_voucher_allocations").select("id").eq("receipt_id", r[1])).data).toHaveLength(0);
    expect(await debt()).toBe(500_000);
    expect((await invariant()).prepaid).toBe(1_500_000);
  });
});

describe("phân bổ tự động từ phiếu nhập và sổ quỹ (NCC 2)", () => {
  it("trả ngay trên phiếu nhập → phân bổ vào đúng phiếu đó", async () => {
    const a = await nhap(400_000, "2026-09-10", ncc2);
    const b = await nhap(300_000, "2026-09-11", ncc2, 300_000);
    const bal = await balances(ncc2);
    expect([bal.get(a)!.remaining, bal.get(b)!.remaining]).toEqual([400_000, 0]);
    await invariant(ncc2);
  });

  it("phiếu chi tay ở sổ quỹ cho NCC → phân bổ phiếu cũ trước", async () => {
    await ownerA.rpc("ensure_cash_categories", { p_tenant: tenantA });
    const { data: cat } = await db.from("cash_categories").select("id").eq("tenant_id", tenantA).eq("name", "Chi khác").single();
    const c = await ownerA.rpc("create_cash_voucher", {
      p_tenant: tenantA,
      p_voucher: { direction: "out", fund: "cash", amount: 150_000, category_id: cat!.id, supplier_id: ncc2, note: `P20D ${TAG}` },
    });
    expect(c.error).toBeNull();
    const bal = [...(await balances(ncc2)).values()];
    expect(bal.map((x) => x.remaining)).toEqual([250_000, 0]);
    await invariant(ncc2);
  });
});

describe("chặn", () => {
  it("số tiền ≤ 0; phiếu của NCC khác / phiếu tạm / phiếu đã hủy → lỗi, không sinh phiếu chi", async () => {
    const { count: c0 } = await db.from("cash_vouchers").select("id", { count: "exact", head: true }).eq("supplier_id", ncc);
    expect((await pay(0)).error).not.toBeNull();
    const { data: khac } = await db.from("purchase_receipts").select("id").eq("supplier_id", ncc2).limit(1).single();
    expect((await pay(1, [khac!.id])).error?.message).toContain("phieu_khong_hop_le");
    expect((await pay(1, [r[1]])).error?.message).toContain("phieu_khong_hop_le"); // phiếu 2 đã hủy
    const tam = await ownerA.rpc("save_purchase_receipt", {
      p_tenant: tenantA, p_receipt: { supplier_id: ncc, note: `P20D ${TAG}`, lines: [{ ingredient_id: ing, qty: 1, unit_price: 1 }] }, p_complete: false,
    });
    expect((await pay(1, [(tam.data![0] as { id: string }).id])).error?.message).toContain("phieu_khong_hop_le");
    const { count: c1 } = await db.from("cash_vouchers").select("id", { count: "exact", head: true }).eq("supplier_id", ncc);
    expect(c1).toBe(c0);
  });

  it("hai lần trả đồng thời trên cùng phiếu → tổng phân bổ không vượt cần trả", async () => {
    const x = await nhap(1_000_000, "2026-09-20", ncc2);
    const [p1, p2] = await Promise.all([pay(800_000, [x], ncc2), pay(800_000, [x], ncc2)]);
    expect(p1.error).toBeNull();
    expect(p2.error).toBeNull();
    const b = (await balances(ncc2)).get(x)!;
    expect(b.paid).toBe(1_000_000);
    expect(b.remaining).toBe(0);
    await invariant(ncc2);
  });

  it("thu ngân: không đọc phân bổ / điều chỉnh, không trả nợ được", async () => {
    expect((await cashierA.from("cash_voucher_allocations").select("id").eq("tenant_id", tenantA)).data ?? []).toHaveLength(0);
    expect((await cashierA.from("supplier_debt_adjustments").select("id").eq("tenant_id", tenantA)).data ?? []).toHaveLength(0);
    expect((await cashierA.rpc("pay_supplier", { p_supplier: ncc, p_amount: 1, p_fund: "cash", p_at: null, p_receipts: null, p_note: null })).error?.code).toBe("42501");
    expect((await cashierA.rpc("adjust_supplier_debt", { p_supplier: ncc, p_amount: 1, p_note: null })).error?.code).toBe("42501");
  });
});
