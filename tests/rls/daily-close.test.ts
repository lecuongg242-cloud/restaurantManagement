import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { signInAs, OWNER_A, OWNER_B, tenantIdBySlug } from "./setup";
import { adminClient } from "./fixtures";
import { ensureClosedThrough } from "@/lib/inventory/close-server";
import { businessDate, addDays, dayStartUtc } from "@/lib/inventory/day";
import type { DailyClosePayload } from "@/lib/inventory/close";

/**
 * INV-08/09 — chốt sổ ngày trên DB thật, bằng phiên owner thật. Kịch bản 3 ngày trước hôm nay:
 *   D1: nhập 1.000 g bò giá 250đ/g, bán 3 phần (100 g/phần)          → tồn cuối 700
 *   D2: nhập 1.000 g bò giá 300đ/g, bán 4 phần, kiểm kê lệch −50 g   → tồn cuối 1.250, đã kiểm
 *   D3: không có gì                                                   → tồn 1.250, giá cũ của D2
 */
const db = adminClient();
let owner: SupabaseClient;
let ownerB: SupabaseClient;
let tenant: string;

const today = businessDate();
const D1 = addDays(today, -3);
const D2 = addDays(today, -2);
const D3 = addDays(today, -1);
const at = (day: string, hours: number) => new Date(Date.parse(dayStartUtc(day)) + hours * 3_600_000).toISOString();

const ids = { cat: randomUUID(), item: randomUUID(), bo: randomUUID() };
const orders: string[] = [];

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function sell(day: string, qty: number) {
  const id = randomUUID();
  orders.push(id);
  await must(db.from("orders").insert({
    id, tenant_id: tenant, channel: "takeaway", source: "staff", status: "completed", confirmed_at: at(day, 12), note: "CLOSE-TEST",
  }));
  await must(db.from("order_items").insert({
    tenant_id: tenant, order_id: id, menu_item_id: ids.item, name_snapshot: "CLOSE", unit_price_snapshot: 50_000, qty, status: "served",
  }));
}

async function closeOf(day: string): Promise<DailyClosePayload | null> {
  const { data } = await owner.from("daily_closes").select("payload").eq("tenant_id", tenant).eq("business_date", day);
  return (data?.[0]?.payload as DailyClosePayload) ?? null;
}

beforeAll(async () => {
  tenant = await tenantIdBySlug(OWNER_A.slug);
  owner = await signInAs(OWNER_A.email, OWNER_A.password);
  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);
  // Tenant demo: bắt đầu từ sổ sạch để mốc gốc là D1.
  await db.from("daily_closes").delete().eq("tenant_id", tenant);
  const { count } = await db.from("stock_entries").select("id", { count: "exact", head: true }).eq("tenant_id", tenant);
  if (count) throw new Error(`pho-viet còn ${count} dòng sổ từ lần chạy trước — dọn trước khi test chốt sổ.`);

  const t = { tenant_id: tenant };
  await must(db.from("menu_categories").insert({ id: ids.cat, ...t, name: "CLOSE-TEST", sort_order: 999 }));
  await must(db.from("menu_items").insert({ id: ids.item, ...t, category_id: ids.cat, name: "CLOSE Phở", base_price: 50_000 }));
  await must(db.from("ingredients").insert({ id: ids.bo, ...t, name: `CLOSE bò ${ids.bo.slice(0, 6)}`, base_unit: "g" }));
  await must(db.from("recipe_lines").insert({ ...t, menu_item_id: ids.item, ingredient_id: ids.bo, qty: 100 }));

  const entry = (day: string, h: number, kind: string, qty: number, unit_cost: number | null = null) => ({
    ...t, business_date: day, ingredient_id: ids.bo, kind, qty, unit_cost, created_at: at(day, h),
  });
  for (const e of [
    entry(D1, 8, "receipt", 1000, 250),
    entry(D2, 8, "receipt", 1000, 300),
    entry(D2, 22, "count_adjust", -50),
  ]) {
    await must(db.from("stock_entries").insert(e));
  }
  await sell(D1, 3);
  await sell(D2, 4);
}, 120_000);

afterAll(async () => {
  await db.from("daily_closes").delete().eq("tenant_id", tenant);
  await db.from("orders").delete().in("id", orders);
  await db.from("stock_entries").delete().eq("ingredient_id", ids.bo);
  await db.from("recipe_lines").delete().eq("ingredient_id", ids.bo);
  await db.from("ingredients").delete().eq("id", ids.bo);
  await db.from("menu_items").delete().eq("id", ids.item);
  await db.from("menu_categories").delete().eq("id", ids.cat);
}, 120_000);

describe("tự chốt sổ (INV-09)", () => {
  it("chốt đúng 3 ngày D1..D3, không chốt hôm nay", async () => {
    const r = await ensureClosedThrough(owner, tenant, today);
    expect(r.closed).toEqual([D1, D2, D3]);
    expect(await closeOf(today)).toBeNull();
  });

  it("D1: nhập 1.000, dùng 300 → tồn cuối 700; giá 250đ/g → phở 25.000đ", async () => {
    const p = (await closeOf(D1))!;
    expect(p.ingredients[0]).toMatchObject({ opening: 0, receipts: 1000, order_usage: 300, closing: 700, unit_cost: 250, cost_source: "today" });
    expect(p.items[0]).toMatchObject({ menu_item_id: ids.item, portion_cost: 25_000 });
  });

  it("D2: tồn đầu = tồn cuối D1; có kiểm kê → closing gồm độ lệch", async () => {
    const p = (await closeOf(D2))!;
    expect(p.ingredients[0]).toMatchObject({ opening: 700, receipts: 1000, order_usage: 400, adjust: -50, counted: true, closing: 1250, unit_cost: 300 });
    expect(p.items[0].portion_cost).toBe(30_000);
  });

  it("D3: không phát sinh → tồn giữ nguyên, giá cũ kèm ngày", async () => {
    const p = (await closeOf(D3))!;
    expect(p.ingredients[0]).toMatchObject({ opening: 1250, closing: 1250, counted: false, cost_source: `stale:${D2}` });
  });

  it("tồn hiện tại lấy mốc gốc từ bản chốt gần nhất", async () => {
    const { data } = await owner.rpc("inventory_on_hand", { p_tenant: tenant });
    const row = (data as { ingredient_id: string; opening: number; on_hand: number }[]).find((r) => r.ingredient_id === ids.bo)!;
    expect(Number(row.opening)).toBe(1250);
    expect(Number(row.on_hand)).toBe(1250);
  });

  it("chạy lại không tạo bản thứ hai", async () => {
    expect((await ensureClosedThrough(owner, tenant, today)).closed).toEqual([]);
    const { count } = await db.from("daily_closes").select("id", { count: "exact", head: true }).eq("tenant_id", tenant);
    expect(count).toBe(3);
  });
});

describe("bản chốt bất biến (INV-09)", () => {
  it("sửa định lượng sau khi chốt → bản chốt D2 không đổi một đồng", async () => {
    await must(db.from("recipe_lines").update({ qty: 200 }).eq("menu_item_id", ids.item));
    expect((await closeOf(D2))!.items[0].portion_cost).toBe(30_000);
  });

  it("owner update payload → 0 dòng đổi", async () => {
    const { data, error } = await owner
      .from("daily_closes")
      .update({ payload: { hacked: true } })
      .eq("tenant_id", tenant)
      .eq("business_date", D2)
      .select("id");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    expect((await closeOf(D2))!.items[0].portion_cost).toBe(30_000);
  });

  it("owner delete → 0 dòng xóa", async () => {
    const { data } = await owner.from("daily_closes").delete().eq("tenant_id", tenant).select("id");
    expect(data ?? []).toHaveLength(0);
    const { count } = await db.from("daily_closes").select("id", { count: "exact", head: true }).eq("tenant_id", tenant);
    expect(count).toBe(3);
  });

  it("tenant B không đọc được bản chốt của A", async () => {
    const { data } = await ownerB.from("daily_closes").select("id").eq("tenant_id", tenant);
    expect(data ?? []).toHaveLength(0);
  });
});
