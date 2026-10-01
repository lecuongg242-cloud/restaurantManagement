import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { payBill } from "@/lib/billing/bill";
import { createStaffOrder } from "@/lib/orders/create-order";
import { adminClient } from "./fixtures";
import { tenantIdBySlug, signInAs, OWNER_A, OWNER_B } from "./setup";

/**
 * Ghép bàn (P23, QD-029, TABLE-03..06) ở tầng DB — RPC `set_table_group` chạy dưới phiên chủ quán (RLS bật).
 * Dữ liệu riêng trên quán demo `bun-bo` (không đụng qt-food). Nghiệm thu 23-01: #1, #4, #5, #7, #8, #9.
 */
const P = "f7000000-0000-4000-8000-0000000000";
const ID = {
  cat: P + "01",
  item: P + "02",
  area: P + "03",
  g: [P + "11", P + "12", P + "13", P + "14", P + "15", P + "16", P + "17"], // G1..G7
  s4: P + "21", // phiên riêng của G4 (có món, chưa hóa đơn)
  s5: P + "22", // phiên riêng của G5 (có hóa đơn)
  s7: P + "23", // phiên riêng của G7 (bàn chính nhóm thứ hai)
  o4: P + "31",
  oi4a: P + "32",
  oi4b: P + "33",
  o5: P + "34",
  oi5: P + "35",
  b5: P + "36",
  bill: P + "41",
};
const [G1, G2, G3, G4, G5, G6, G7] = ID.g;

let tenantId = "";
let staffId = "";
let owner: SupabaseClient;
let ownerA: SupabaseClient;
const admin = adminClient();

type RpcRes = { ok: boolean; code?: string; session_id?: string; tables?: { id: string; reason: string; count?: number }[] };
const ghep = async (client: SupabaseClient, main: string, tables: string[], tenant = tenantId): Promise<RpcRes> => {
  const { data, error } = await client.rpc("set_table_group", { p_tenant: tenant, p_main: main, p_tables: tables });
  if (error) throw new Error(error.message);
  return data as RpcRes;
};
const bang = async (id: string) =>
  (await admin.from("tables").select("status, group_session_id").eq("id", id).single()).data as {
    status: string;
    group_session_id: string | null;
  };

async function don() {
  const { data: sess } = await admin.from("table_sessions").select("id").in("table_id", ID.g);
  const sIds = (sess ?? []).map((s) => s.id as string);
  if (sIds.length) {
    const { data: bills } = await admin.from("bills").select("id").in("table_session_id", sIds);
    const bIds = (bills ?? []).map((b) => b.id as string);
    if (bIds.length) {
      await admin.from("payments").delete().in("bill_id", bIds);
      await admin.from("bill_items").delete().in("bill_id", bIds);
      await admin.from("bills").delete().in("id", bIds);
    }
    await admin.from("orders").delete().in("table_session_id", sIds);
  }
  await admin.from("tables").update({ group_session_id: null }).in("id", ID.g);
  if (sIds.length) await admin.from("table_sessions").delete().in("id", sIds);
  await admin.from("tables").delete().in("id", ID.g);
  await admin.from("areas").delete().eq("id", ID.area);
  await admin.from("menu_items").delete().eq("id", ID.item);
  await admin.from("menu_categories").delete().eq("id", ID.cat);
}

async function dung() {
  const t = { tenant_id: tenantId };
  await admin.from("menu_categories").upsert({ id: ID.cat, ...t, name: "GHEPBAN-TEST" });
  await admin.from("menu_items").upsert({ id: ID.item, ...t, category_id: ID.cat, name: "GHEPBAN-TEST", base_price: 50_000 });
  await admin.from("areas").upsert({ id: ID.area, ...t, name: "GHEPBAN-TEST" });
  for (const [i, id] of ID.g.entries())
    await admin.from("tables").upsert({ id, ...t, area_id: ID.area, name: `GB${i + 1}`, qr_token: `ghepban-test-${i + 1}` });
  // G4: phiên riêng, 2 món chưa vào hóa đơn.
  await admin.from("table_sessions").upsert({ id: ID.s4, ...t, table_id: G4, status: "open" });
  await admin.from("orders").upsert({ id: ID.o4, ...t, table_session_id: ID.s4, channel: "dine_in", source: "staff", status: "confirmed" });
  for (const id of [ID.oi4a, ID.oi4b])
    await admin.from("order_items").upsert({ id, ...t, order_id: ID.o4, menu_item_id: ID.item, name_snapshot: "GHEPBAN-TEST", unit_price_snapshot: 50_000, qty: 1, status: "queued" });
  // G5: phiên riêng có hóa đơn mở.
  await admin.from("table_sessions").upsert({ id: ID.s5, ...t, table_id: G5, status: "open" });
  await admin.from("orders").upsert({ id: ID.o5, ...t, table_session_id: ID.s5, channel: "dine_in", source: "staff", status: "confirmed" });
  await admin.from("order_items").upsert({ id: ID.oi5, ...t, order_id: ID.o5, menu_item_id: ID.item, name_snapshot: "GHEPBAN-TEST", unit_price_snapshot: 50_000, qty: 1, status: "queued" });
  await admin.from("bills").upsert({ id: ID.b5, ...t, table_session_id: ID.s5, status: "open", subtotal: 50_000, total: 50_000 });
  // G7: phiên riêng, trống (sẽ làm bàn chính của nhóm thứ hai).
  await admin.from("table_sessions").upsert({ id: ID.s7, ...t, table_id: G7, status: "open" });
}

beforeAll(async () => {
  tenantId = await tenantIdBySlug(OWNER_B.slug);
  owner = await signInAs(OWNER_B.email, OWNER_B.password);
  ownerA = await signInAs(OWNER_A.email, OWNER_A.password);
  const { data: m } = await admin
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .limit(1)
    .single();
  staffId = m!.id as string;
  await don();
  await dung();
}, 120_000);

afterAll(async () => {
  await don();
}, 120_000);

describe("set_table_group — ghép bàn khi mở", () => {
  let S = "";

  it("#1 ghép 2 bàn trống vào bàn trống: mở phiên trên bàn chính, mọi bàn 'occupied' + trỏ nhóm", async () => {
    const r = await ghep(owner, G1, [G2, G3]);
    expect(r.ok).toBe(true);
    S = r.session_id!;
    const { data: s } = await admin.from("table_sessions").select("table_id, status").eq("id", S).single();
    expect(s).toMatchObject({ table_id: G1, status: "open" });
    expect(await bang(G1)).toMatchObject({ status: "occupied", group_session_id: null });
    expect(await bang(G2)).toMatchObject({ status: "occupied", group_session_id: S });
    expect(await bang(G3)).toMatchObject({ status: "occupied", group_session_id: S });
  });

  it("gửi lại cùng danh sách: không đổi gì", async () => {
    const r = await ghep(owner, G1, [G3, G2, G2]);
    expect(r).toMatchObject({ ok: true, session_id: S });
    expect(await bang(G2)).toMatchObject({ group_session_id: S });
  });

  it("#4 ghép bàn đang có món: món chuyển vào nhóm giữ bàn gọi, phiên cũ đóng, không mất/nhân đôi món", async () => {
    const r = await ghep(owner, G1, [G2, G3, G4]);
    expect(r.ok).toBe(true);
    const { data: o } = await admin.from("orders").select("table_session_id, table_id").eq("id", ID.o4).single();
    expect(o).toEqual({ table_session_id: S, table_id: G4 });
    const { data: s4 } = await admin.from("table_sessions").select("status").eq("id", ID.s4).single();
    expect(s4!.status).toBe("closed");
    const { count } = await admin.from("order_items").select("id", { count: "exact", head: true }).eq("order_id", ID.o4);
    expect(count).toBe(2);
  });

  it("#5 bàn có hóa đơn bị từ chối — và KHÔNG ghi phần nào (G6 xin cùng lượt cũng không vào)", async () => {
    const r = await ghep(owner, G1, [G2, G3, G4, G5, G6]);
    expect(r).toMatchObject({ ok: false, code: "rejected" });
    expect(r.tables).toEqual([expect.objectContaining({ id: G5, reason: "has_bill" })]);
    expect(await bang(G6)).toMatchObject({ group_session_id: null });
  });

  it("#5 hai nhóm tranh một bàn cùng lúc: đúng một bên thắng", async () => {
    const [a, b] = await Promise.all([ghep(owner, G1, [G2, G3, G4, G6]), ghep(owner, G7, [G6])]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const g6 = await bang(G6);
    expect(g6.group_session_id).toBe(a.ok ? S : ID.s7);
    // Trả G6 về trạng thái cũ cho các bước sau.
    if (a.ok) expect((await ghep(owner, G1, [G2, G3, G4])).ok).toBe(true);
    else expect((await ghep(owner, G7, [])).ok).toBe(true);
    expect(await bang(G6)).toMatchObject({ group_session_id: null, status: "available" });
  });

  it("bàn đang thuộc nhóm khác / bàn chính của nhóm khác: từ chối", async () => {
    expect((await ghep(owner, G7, [G6])).ok).toBe(true);
    const r = await ghep(owner, G1, [G2, G3, G4, G6, G7]);
    expect(r).toMatchObject({ ok: false, code: "rejected" });
    expect(r.tables?.map((t) => [t.id, t.reason]).sort()).toEqual([[G6, "other_group"], [G7, "other_group"]].sort());
    expect((await ghep(owner, G7, [])).ok).toBe(true);
  });

  it("bàn phụ không làm bàn chính được", async () => {
    expect(await ghep(owner, G2, [G6])).toMatchObject({ ok: false, code: "main_is_member" });
  });

  it("gọi món từ bàn phụ đi vào phiên nhóm và ghi bàn gọi (không mở phiên thứ hai)", async () => {
    const r = await createStaffOrder({
      tenantId,
      tableId: G3,
      lines: [{ itemId: ID.item, qty: 2, note: "", optionIds: [] }],
      actingStaffId: staffId,
    });
    expect("orderId" in r).toBe(true);
    const orderId = (r as { orderId: string }).orderId;
    const { data: o } = await admin.from("orders").select("table_session_id, table_id").eq("id", orderId).single();
    expect(o).toEqual({ table_session_id: S, table_id: G3 });
    const { count } = await admin
      .from("table_sessions")
      .select("id", { count: "exact", head: true })
      .eq("table_id", G3)
      .eq("status", "open");
    expect(count).toBe(0);
  });

  it("#8 bỏ ghép bàn còn món chưa thu: từ chối, báo số món", async () => {
    const r = await ghep(owner, G1, [G2, G4]);
    expect(r).toMatchObject({ ok: false, code: "rejected" });
    expect(r.tables).toEqual([expect.objectContaining({ id: G3, reason: "unpaid", count: 1 })]);
    expect(await bang(G3)).toMatchObject({ group_session_id: S });
  });

  it("#7 bỏ ghép bàn đã thu hết: bàn về trống, nhóm còn lại giữ nguyên", async () => {
    const r = await ghep(owner, G1, [G3, G4]);
    expect(r.ok).toBe(true);
    expect(await bang(G2)).toMatchObject({ status: "available", group_session_id: null });
    expect(await bang(G3)).toMatchObject({ group_session_id: S });
    expect(await bang(G4)).toMatchObject({ group_session_id: S });
  });

  it("không xóa được bàn PHỤ đang trong nhóm (trigger 0074 mở rộng ở 0082)", async () => {
    const { error } = await admin.from("tables").delete().eq("id", G4);
    expect(error?.message).toContain("đang có khách");
    expect(await bang(G4)).toMatchObject({ group_session_id: S });
  });

  it("quán khác không đụng được bàn của quán", async () => {
    const r = await ghep(ownerA, G1, [], tenantId);
    expect(r).toMatchObject({ ok: false, code: "not_found" });
    expect(await bang(G3)).toMatchObject({ group_session_id: S });
  });

  it("#9 thu đủ hóa đơn nhóm: phiên đóng, MỌI bàn về trống, không còn bàn trỏ về phiên", async () => {
    const { data: items } = await admin
      .from("order_items")
      .select("id, unit_price_snapshot, qty, orders!inner(table_session_id)")
      .eq("orders.table_session_id", S)
      .neq("status", "cancelled");
    const lines = (items ?? []).map((it) => ({
      id: it.id as string,
      amount: (it.unit_price_snapshot as number) * (it.qty as number),
      qty: it.qty as number,
      price: it.unit_price_snapshot as number,
    }));
    const total = lines.reduce((s, l) => s + l.amount, 0);
    await admin.from("bills").upsert({ id: ID.bill, tenant_id: tenantId, table_session_id: S, status: "open", subtotal: total, total });
    await admin.from("bill_items").insert(
      lines.map((l) => ({
        tenant_id: tenantId,
        bill_id: ID.bill,
        order_item_id: l.id,
        qty_allocated: l.qty,
        unit_price_snapshot: l.price,
        amount: l.amount,
      }))
    );
    const kq = await payBill(tenantId, ID.bill, { method: "cash", amountReceived: total }, null, {}, admin);
    expect("error" in kq).toBe(false);

    const { data: s } = await admin.from("table_sessions").select("status").eq("id", S).single();
    expect(s!.status).toBe("closed");
    for (const id of [G1, G3, G4]) expect(await bang(id)).toMatchObject({ status: "available", group_session_id: null });
    const { count } = await admin
      .from("tables")
      .select("id", { count: "exact", head: true })
      .eq("group_session_id", S);
    expect(count).toBe(0);
  });
});
