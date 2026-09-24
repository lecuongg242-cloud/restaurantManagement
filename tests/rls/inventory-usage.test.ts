import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { signInAs, OWNER_A, OWNER_B, tenantIdBySlug } from "./setup";
import { adminClient } from "./fixtures";

/**
 * INV-06 — tồn lý thuyết & số phần tính từ đơn hàng thật trên DB (QD-017 D2, D4). Dựng một thực
 * đơn riêng trên tenant DEMO, mỗi trạng thái đơn một dòng, rồi đọc qua RPC bằng phiên owner thật.
 *
 * Định lượng: Món M = 100 g bò (dùng được 80% → 125 g thô) + 10 g muối + 200 ml nước dùng.
 *             Món M2 = 50 g bò (62,5 g thô). Tùy chọn O "thêm trứng" = 1 quả.
 * Sổ: nhập 1.000 g bò, 10 quả trứng, ra mẻ 1.000 ml nước dùng. Muối KHÔNG BAO GIỜ nhập.
 */

const db = adminClient();
let owner: SupabaseClient;
let ownerB: SupabaseClient;
let tenant: string;

const id = () => randomUUID();
const ids = {
  cat: id(), m: id(), m2: id(), group: id(), opt: id(),
  bo: id(), muoi: id(), trung: id(), nd: id(), ndBatch: id(),
};
const orders: string[] = [];
const jobs: string[] = [];

// Mọi mốc ở QUÁ KHỨ: RPC chỉ tính đơn trước now(), và mốc gốc là dòng sổ đầu tiên (đặt ở phút 0).
const T0 = Date.now() - 60 * 60_000;
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

/** Một đơn một món. `cancelledAt` null = món còn; `prints` = các mốc in phiếu bếp (phút). */
async function order(o: {
  item: string;
  qty: number;
  confirmed: string | null;
  cancelledAt?: string | null;
  orderCancelled?: boolean;
  prints?: number[];
  withOption?: boolean;
}) {
  const orderId = id();
  orders.push(orderId);
  await must(
    db.from("orders").insert({
      id: orderId,
      tenant_id: tenant,
      channel: "takeaway",
      source: "staff",
      status: o.orderCancelled ? "cancelled" : o.confirmed ? "confirmed" : "pending_confirm",
      confirmed_at: o.confirmed,
      note: "INV-06-TEST",
    })
  );
  const itemId = id();
  await must(
    db.from("order_items").insert({
      id: itemId,
      tenant_id: tenant,
      order_id: orderId,
      menu_item_id: o.item,
      name_snapshot: "INV-06",
      unit_price_snapshot: 50_000,
      qty: o.qty,
      status: o.cancelledAt ? "cancelled" : "queued",
      cancelled_at: o.cancelledAt ?? null,
    })
  );
  if (o.withOption) {
    await must(
      db.from("order_item_modifiers").insert({
        tenant_id: tenant, order_item_id: itemId, option_id: ids.opt, name_snapshot: "Thêm trứng",
      })
    );
  }
  for (const m of o.prints ?? []) {
    const j = id();
    jobs.push(j);
    await must(
      db.from("print_jobs").insert({
        id: j, tenant_id: tenant, type: "kitchen_ticket", payload: { orderId }, status: "printed", created_at: at(m),
      })
    );
  }
}

beforeAll(async () => {
  tenant = await tenantIdBySlug(OWNER_A.slug);
  owner = await signInAs(OWNER_A.email, OWNER_A.password);
  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);
  const t = { tenant_id: tenant };

  await must(db.from("menu_categories").insert({ id: ids.cat, ...t, name: "INV-06-TEST", sort_order: 999 }));
  await must(
    db.from("menu_items").insert([
      { id: ids.m, ...t, category_id: ids.cat, name: "INV-06 M", base_price: 50_000 },
      { id: ids.m2, ...t, category_id: ids.cat, name: "INV-06 M2", base_price: 30_000 },
    ])
  );
  await must(db.from("modifier_groups").insert({ id: ids.group, ...t, name: "INV-06" }));
  await must(db.from("modifier_options").insert({ id: ids.opt, ...t, group_id: ids.group, name: "Thêm trứng" }));
  // Chèn TỪNG dòng: chèn nhiều dòng một lệnh thì PostgREST điền null (không phải giá trị mặc định)
  // cho cột mà dòng khác có còn dòng này không.
  for (const row of [
    { id: ids.bo, name: `INV-06 bò ${ids.bo.slice(0, 6)}`, base_unit: "g", yield_pct: 80 },
    { id: ids.muoi, name: `INV-06 muối ${ids.muoi.slice(0, 6)}`, base_unit: "g" },
    { id: ids.trung, name: `INV-06 trứng ${ids.trung.slice(0, 6)}`, base_unit: "cai" },
    { id: ids.nd, name: `INV-06 nước dùng ${ids.nd.slice(0, 6)}`, base_unit: "ml", kind: "prepared", batch_output_qty: 1000 },
  ]) {
    await must(db.from("ingredients").insert({ ...t, ...row }));
  }

  await must(
    db.from("recipe_lines").insert([
      { ...t, menu_item_id: ids.m, ingredient_id: ids.bo, qty: 100 },
      { ...t, menu_item_id: ids.m, ingredient_id: ids.muoi, qty: 10 },
      { ...t, menu_item_id: ids.m, ingredient_id: ids.nd, qty: 200 },
      { ...t, menu_item_id: ids.m2, ingredient_id: ids.bo, qty: 50 },
      { ...t, modifier_option_id: ids.opt, ingredient_id: ids.trung, qty: 1 },
    ])
  );
  const today = new Date().toISOString().slice(0, 10);
  await must(
    db.from("production_batches").insert({
      id: ids.ndBatch, ...t, business_date: today, ingredient_id: ids.nd, batch_count: 1, expected_qty: 1000, actual_qty: 1000,
    })
  );
  await must(
    db.from("stock_entries").insert([
      { ...t, business_date: today, ingredient_id: ids.bo, kind: "receipt", qty: 1000, batch_id: null, created_at: at(0) },
      { ...t, business_date: today, ingredient_id: ids.trung, kind: "receipt", qty: 10, batch_id: null, created_at: at(0) },
      { ...t, business_date: today, ingredient_id: ids.nd, kind: "batch_in", qty: 1000, batch_id: ids.ndBatch, created_at: at(0) },
    ])
  );

  // 1. QR chưa duyệt → không tính
  await order({ item: ids.m, qty: 1, confirmed: null });
  // 2. Đã xác nhận, 2 phần, có thêm trứng → tính: bò 250, nước dùng 400, trứng 2
  await order({ item: ids.m, qty: 2, confirmed: at(1), withOption: true });
  // 3. Hủy TRƯỚC khi in (không có phiếu bếp) → không tính
  await order({ item: ids.m, qty: 1, confirmed: at(1), cancelledAt: at(2) });
  // 4. Hủy SAU khi in → tính (bò 125, nước dùng 200) và vào cancel_usage
  await order({ item: ids.m, qty: 1, confirmed: at(1), cancelledAt: at(3), prints: [2] });
  // 5. In hai lần (2' và 10'), hủy lúc 5' → mốc in SỚM NHẤT → hủy sau in → tính
  await order({ item: ids.m, qty: 1, confirmed: at(1), cancelledAt: at(5), prints: [10, 2] });
  // 6. Hủy CẢ ĐƠN sau khi in → món cũng 'cancelled' → tính
  await order({ item: ids.m, qty: 1, confirmed: at(1), cancelledAt: at(4), prints: [2], orderCancelled: true });
  // 7. Đơn từ trước mốc gốc (năm 2020) → không tính
  await order({ item: ids.m, qty: 5, confirmed: "2020-01-01T00:00:00Z" });
}, 120_000);

afterAll(async () => {
  await db.from("print_jobs").delete().in("id", jobs);
  await db.from("orders").delete().in("id", orders); // order_items + modifiers cascade
  await db.from("stock_entries").delete().in("ingredient_id", [ids.bo, ids.trung, ids.nd, ids.muoi]);
  await db.from("production_batches").delete().eq("id", ids.ndBatch);
  await db.from("recipe_lines").delete().in("ingredient_id", [ids.bo, ids.trung, ids.nd, ids.muoi]);
  await db.from("ingredients").delete().in("id", [ids.bo, ids.trung, ids.nd, ids.muoi]);
  await db.from("modifier_options").delete().eq("id", ids.opt);
  await db.from("modifier_groups").delete().eq("id", ids.group);
  await db.from("menu_items").delete().in("id", [ids.m, ids.m2]);
  await db.from("menu_categories").delete().eq("id", ids.cat);
}, 120_000);

type OnHand = { ingredient_id: string; order_usage: number; cancel_usage: number; on_hand: number };
async function onHand(): Promise<Map<string, OnHand>> {
  const { data, error } = await owner.rpc("inventory_on_hand", { p_tenant: tenant });
  expect(error).toBeNull();
  return new Map(
    (data as OnHand[]).map((r) => [
      r.ingredient_id,
      { ...r, order_usage: Number(r.order_usage), cancel_usage: Number(r.cancel_usage), on_hand: Number(r.on_hand) },
    ])
  );
}

describe("lượng dùng theo đơn (INV-06, QD-017 D2)", () => {
  // Bò thô/phần = 125 g. Tính: đơn 2 (2 phần) + 4 + 5 + 6 = 5 phần = 625 g.
  it("bò: chỉ đơn đã xác nhận, món chưa hủy hoặc hủy sau in, trong mốc gốc → 625 g", async () => {
    const r = (await onHand()).get(ids.bo)!;
    expect(r.order_usage).toBe(625);
    expect(r.on_hand).toBe(375);
  });

  it("hủy sau in vào cancel_usage (đơn 4, 5, 6 = 375 g)", async () => {
    expect((await onHand()).get(ids.bo)!.cancel_usage).toBe(375);
  });

  it("nước dùng không chia yield: 5 phần × 200 ml = 1.000 ml → tồn 0", async () => {
    const r = (await onHand()).get(ids.nd)!;
    expect(r.order_usage).toBe(1000);
    expect(r.on_hand).toBe(0);
  });

  it("tùy chọn thêm trứng trừ theo qty dòng: 2 quả", async () => {
    expect((await onHand()).get(ids.trung)!.on_hand).toBe(8);
  });
});

describe("số phần dự đoán (INV-06, QD-017 D4)", () => {
  type P = { menu_item_id: string | null; modifier_option_id: string | null; portions: number };
  async function portions(): Promise<P[]> {
    const { data, error } = await owner.rpc("menu_portions", { p_tenant: tenant });
    expect(error).toBeNull();
    return data as P[];
  }

  it("bán thành phẩm chỉ tính tồn đã chế biến: nước dùng hết → M = 0 dù còn bò", async () => {
    expect((await portions()).find((p) => p.menu_item_id === ids.m)?.portions).toBe(0);
  });

  it("nguyên liệu dùng chung hai món lấy đúng: M2 = floor(375 ÷ 62,5) = 6", async () => {
    expect((await portions()).find((p) => p.menu_item_id === ids.m2)?.portions).toBe(6);
  });

  it("option có số phần riêng: thêm trứng = 8", async () => {
    expect((await portions()).find((p) => p.modifier_option_id === ids.opt)?.portions).toBe(8);
  });

  it("muối chưa từng nhập không kéo số phần về 0 (không tham gia)", async () => {
    // Nếu muối tham gia, M2 không đổi nhưng M sẽ bị muối kéo xuống — kiểm trực tiếp: đổi nước dùng
    // thành đủ dùng thì M phải ra theo bò, không phải 0 vì muối.
    const today = new Date().toISOString().slice(0, 10);
    await must(db.from("stock_entries").insert({
      tenant_id: tenant, business_date: today, ingredient_id: ids.nd, kind: "receipt", qty: 10_000,
    }));
    expect((await portions()).find((p) => p.menu_item_id === ids.m)?.portions).toBe(3); // 375 ÷ 125
  });

  it("tenant B gọi với p_tenant của A → 0 dòng", async () => {
    const { data, error } = await ownerB.rpc("menu_portions", { p_tenant: tenant });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
