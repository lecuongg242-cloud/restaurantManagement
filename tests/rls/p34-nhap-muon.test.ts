import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { signInAs, OWNER_A, OWNER_B, tenantIdBySlug } from "./setup";
import { adminClient } from "./fixtures";
import { addDays, businessDate } from "@/lib/inventory/day";
import { parseLockDetail } from "@/lib/inventory/lock";

/**
 * P34 (QD-034, INV-18/20/21) — nhập phiếu muộn trên DB thật, phiên owner thật. Đúng ví dụ thịt bò của P34:
 *   −50′ nhập 6 kg (280.000₫/kg) · −40′ bán 8 phần × 1 kg · −30′ mua thêm 3 kg (300.000₫/kg) nhưng CHƯA ghi phiếu
 *   bây giờ kiểm kê: sổ −2 kg, đếm 1 kg → lệch +3 kg
 *   ghi phiếu 3 kg giờ −30′ → BỊ CHẶN (vướng kiểm kê) → Hủy phiếu kiểm kê → ghi phiếu → Hoàn thành lại → lệch 0, tồn 1 kg.
 * Mọi mốc trong vòng 1 giờ trước lúc chạy (cùng ngày, trừ khi chạy lúc 00:00–00:50).
 */
const db = adminClient();
let owner: SupabaseClient;
let ownerB: SupabaseClient;
let tenant: string;

const TAG = `P34-${randomUUID().slice(0, 6)}`;
const ids = { cat: randomUUID(), item: randomUUID(), bo: randomUUID(), ga: randomUUID() };
const receipts: string[] = [];
const orders: string[] = [];
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const T_NHAP1 = ago(50);
const T_BAN = ago(40);
const T_NHAP2 = ago(30);

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

/** Phiếu nhập qua đúng RPC của app. `kg` theo đơn vị nhập, giá đ/kg. */
async function nhap(ingredient: string, kg: number, price: number | null, at: string | null, payNow = 0) {
  const total = price === null ? 0 : Math.round(kg * price);
  const r = await owner.rpc("save_purchase_receipt", {
    p_tenant: tenant,
    p_receipt: {
      supplier_id: null, discount: 0, pay_now: payNow || total, pay_fund: "cash", note: TAG, received_at: at,
      lines: [{ ingredient_id: ingredient, qty: kg, unit_price: price }],
    },
    p_complete: true,
  });
  if (r.data?.[0]) receipts.push((r.data[0] as { id: string }).id);
  return r;
}

async function onHand(ingredient: string, at?: string): Promise<number> {
  const { data } = await owner.rpc("inventory_on_hand", { p_tenant: tenant, ...(at ? { p_at: at } : {}) });
  const row = ((data ?? []) as { ingredient_id: string; on_hand: number }[]).find((r) => r.ingredient_id === ingredient);
  return Number(row?.on_hand ?? 0);
}

async function kiem(countedKg: number, redoOf: string | null = null) {
  return owner.rpc("complete_stock_count", {
    p_tenant: tenant,
    p_lines: [{ ingredient_id: ids.bo, counted_base: countedKg * 1000, unit: "purchase" }],
    p_redo_of: redoOf,
  });
}

beforeAll(async () => {
  tenant = await tenantIdBySlug(OWNER_A.slug);
  owner = await signInAs(OWNER_A.email, OWNER_A.password);
  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);
  const t = { tenant_id: tenant };
  await must(db.from("menu_categories").insert({ id: ids.cat, ...t, name: TAG, sort_order: 999 }));
  await must(db.from("menu_items").insert({ id: ids.item, ...t, category_id: ids.cat, name: `${TAG} Phở`, base_price: 50_000 }));
  await must(
    db.from("ingredients").insert([
      { id: ids.bo, ...t, name: `${TAG} bò`, base_unit: "g", purchase_unit: "kg", purchase_factor: 1000, must_count: true },
      { id: ids.ga, ...t, name: `${TAG} gà`, base_unit: "g", purchase_unit: "kg", purchase_factor: 1000, must_count: false },
    ])
  );
  await must(db.from("recipe_lines").insert({ ...t, menu_item_id: ids.item, ingredient_id: ids.bo, qty: 1000 }));
}, 120_000);

afterAll(async () => {
  await db.from("stock_counts").delete().eq("tenant_id", tenant).in("id",
    ((await db.from("stock_count_lines").select("count_id").in("ingredient_id", [ids.bo, ids.ga])).data ?? []).map((r) => r.count_id));
  await db.from("stock_entries").delete().in("ingredient_id", [ids.bo, ids.ga]);
  if (receipts.length) {
    await db.from("cash_voucher_allocations").delete().in("receipt_id", receipts);
    await db.from("cash_vouchers").delete().in("purchase_receipt_id", receipts);
    await db.from("purchase_receipt_lines").delete().in("receipt_id", receipts);
    await db.from("purchase_receipts").delete().in("id", receipts);
  }
  await db.from("orders").delete().in("id", orders);
  await db.from("recipe_lines").delete().eq("menu_item_id", ids.item);
  await db.from("ingredients").delete().in("id", [ids.bo, ids.ga]);
  await db.from("menu_items").delete().eq("id", ids.item);
  await db.from("menu_categories").delete().eq("id", ids.cat);
}, 120_000);

describe("P34 — nhập phiếu muộn, kiểm kê là mốc khóa (ví dụ thịt bò)", () => {
  let k1: string;
  let k1Code: string;

  it("INV-18: phiếu sáng 6 kg giờ −50′; bán 8 kg → sổ −2 kg (cho âm, không chặn)", async () => {
    const r = await nhap(ids.bo, 6, 280_000, T_NHAP1);
    expect(r.error).toBeNull();
    const id = randomUUID();
    orders.push(id);
    await must(db.from("orders").insert({
      id, tenant_id: tenant, channel: "takeaway", source: "staff", status: "completed", confirmed_at: T_BAN, note: TAG,
    }));
    await must(db.from("order_items").insert({
      tenant_id: tenant, order_id: id, menu_item_id: ids.item, name_snapshot: TAG, unit_price_snapshot: 50_000, qty: 8, status: "served",
    }));
    expect(await onHand(ids.bo)).toBe(-2000);
    // Dòng sổ mang thời gian nhập, không phải giờ bấm; ngày = ngày VN của thời gian nhập.
    const { data } = await db.from("stock_entries").select("occurred_at, business_date").eq("ingredient_id", ids.bo).single();
    expect(Date.parse(data!.occurred_at as string)).toBe(Date.parse(T_NHAP1));
    expect(data!.business_date).toBe(businessDate(new Date(T_NHAP1)));
  });

  it("kiểm kê lúc này: sổ −2 kg, đếm 1 kg → phiếu KK, lệch +3 kg, phiếu nhập cuối = phiếu sáng", async () => {
    const r = await kiem(1);
    expect(r.error).toBeNull();
    ({ id: k1, code: k1Code } = r.data![0] as { id: string; code: string });
    expect(k1Code).toMatch(/^KK\d{6}$/);
    const { data: line } = await db.from("stock_count_lines").select("theoretical, diff, counted_base").eq("count_id", k1).single();
    expect(line).toMatchObject({ theoretical: -2000, diff: 3000, counted_base: 1000 });
    const { data: doc } = await db.from("stock_counts").select("last_receipt_id").eq("id", k1).single();
    expect(doc!.last_receipt_id).toBe(receipts[0]);
    expect(await onHand(ids.bo)).toBe(1000);
  });

  it("INV-20: phiếu 3 kg giờ −30′ (trước lúc kiểm) → bị chặn, nêu phiếu KK; 0 dòng sổ mới", async () => {
    const before = (await db.from("stock_entries").select("id").eq("ingredient_id", ids.bo)).data!.length;
    const r = await nhap(ids.bo, 3, 300_000, T_NHAP2);
    expect(r.error?.message).toContain("vuong_kiem_ke");
    const c = parseLockDetail(r.error?.message, r.error?.details);
    expect(c?.[0]).toMatchObject({ code: k1Code, count_id: k1, ingredient: `${TAG} bò` });
    expect((await db.from("stock_entries").select("id").eq("ingredient_id", ids.bo)).data!.length).toBe(before);
    expect(await onHand(ids.bo)).toBe(1000);
  });

  it("INV-20: Hủy bỏ phiếu sáng (trước lúc kiểm) → bị chặn; phiếu vẫn 'done'", async () => {
    const r = await owner.rpc("cancel_purchase_receipt", { p_receipt: receipts[0], p_cancel_vouchers: true });
    expect(r.error?.message).toContain("vuong_kiem_ke");
    const { data } = await db.from("purchase_receipts").select("status").eq("id", receipts[0]).single();
    expect(data!.status).toBe("done");
  });

  it("INV-20: phiếu hủy / mẻ có giờ trước lúc kiểm → mốc khóa trả phiếu KK; giờ sau lúc kiểm → rỗng", async () => {
    const before = await owner.rpc("inventory_lock_conflicts", { p_tenant: tenant, p_ingredients: [ids.bo], p_at: T_NHAP2 });
    expect((before.data as { count_code: string }[]).map((x) => x.count_code)).toEqual([k1Code]);
    const after = await owner.rpc("inventory_lock_conflicts", {
      p_tenant: tenant, p_ingredients: [ids.bo], p_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(after.data).toEqual([]);
    // Nguyên liệu không có trong phiếu kiểm kê thì không vướng.
    const ga = await owner.rpc("inventory_lock_conflicts", { p_tenant: tenant, p_ingredients: [ids.ga], p_at: T_NHAP2 });
    expect(ga.data).toEqual([]);
  });

  it("INV-21: Hủy phiếu kiểm kê → dòng lệch mất, tồn về sổ −2 kg; dòng số đếm giữ lại", async () => {
    const r = await owner.rpc("cancel_stock_count", { p_count: k1 });
    expect(r.error).toBeNull();
    expect(await onHand(ids.bo)).toBe(-2000);
    const { data } = await db.from("stock_counts").select("status").eq("id", k1).single();
    expect(data!.status).toBe("cancelled");
    expect((await db.from("stock_count_lines").select("id").eq("count_id", k1)).data).toHaveLength(1);
    expect((await db.from("stock_entries").select("id").eq("count_id", k1)).data).toHaveLength(0);
  });

  it("INV-18: giờ đã mở khóa → ghi phiếu 3 kg giờ −30′; tồn trước giờ đó không có, sau giờ đó có; phiếu chi cùng giờ", async () => {
    const r = await nhap(ids.bo, 3, 300_000, T_NHAP2);
    expect(r.error).toBeNull();
    const id = (r.data![0] as { id: string }).id;
    expect(await onHand(ids.bo, new Date(Date.parse(T_NHAP2) - 60_000).toISOString())).toBe(-2000);
    expect(await onHand(ids.bo, new Date(Date.parse(T_NHAP2) + 60_000).toISOString())).toBe(1000);
    const { data: pr } = await db.from("purchase_receipts").select("received_at, doc_date, stock_date").eq("id", id).single();
    expect(Date.parse(pr!.received_at as string)).toBe(Date.parse(T_NHAP2));
    expect(pr!.stock_date).toBe(businessDate(new Date(T_NHAP2)));
    expect(pr!.doc_date).toBe(pr!.stock_date);
    const { data: v } = await db.from("cash_vouchers").select("occurred_at, amount").eq("purchase_receipt_id", id).single();
    expect(Date.parse(v!.occurred_at as string)).toBe(Date.parse(T_NHAP2));
    expect(v!.amount).toBe(900_000);
  });

  it("INV-21: Hoàn thành lại → giữ giờ kiểm cũ, lệch 0, tồn 1 kg; không hoàn thành lại lần hai", async () => {
    const { data: old } = await db.from("stock_counts").select("counted_at").eq("id", k1).single();
    const r = await kiem(1, k1);
    expect(r.error).toBeNull();
    const k2 = (r.data![0] as { id: string }).id;
    const { data: doc } = await db.from("stock_counts").select("counted_at, redo_of, last_receipt_id").eq("id", k2).single();
    expect(Date.parse(doc!.counted_at as string)).toBe(Date.parse(old!.counted_at as string));
    expect(doc!.redo_of).toBe(k1);
    expect(doc!.last_receipt_id).toBe(receipts[1]); // phiếu 3 kg giờ −30′ giờ đã nằm trước lúc đếm
    const { data: line } = await db.from("stock_count_lines").select("theoretical, diff").eq("count_id", k2).single();
    expect(line).toMatchObject({ theoretical: 1000, diff: 0 });
    expect(await onHand(ids.bo)).toBe(1000);

    const again = await kiem(1, k1);
    expect(again.error?.message).toContain("da_hoan_thanh_lai");
  });

  it("ngày hôm nay: nhập 9 kg, dùng 8 kg, lệch 0 (đã kiểm), tồn cuối 1 kg — không còn 'dư không giải thích'", async () => {
    const day = businessDate(new Date(T_NHAP1));
    if (day !== businessDate(new Date(Date.now()))) return; // chạy lúc 00:00–00:50: các mốc rơi vào hai ngày
    const { data } = await owner.rpc("inventory_day", { p_tenant: tenant, p_date: day });
    const row = ((data ?? []) as Record<string, unknown>[]).find((r) => r.ingredient_id === ids.bo)!;
    expect(row).toMatchObject({ receipts: 9000, order_usage: 8000, adjust: 0, counted: true, closing: 1000 });
  });

  it("phiếu kiểm kê sau → phiếu trước không hủy được nữa (mốc khóa giữa hai lần kiểm)", async () => {
    const later = await kiem(1);
    expect(later.error).toBeNull();
    const { data: prev } = await db.from("stock_counts").select("id").eq("redo_of", k1).single();
    const r = await owner.rpc("cancel_stock_count", { p_count: prev!.id });
    expect(r.error?.message).toContain("vuong_kiem_ke");
    // Phiếu sau cùng thì hủy được.
    expect((await owner.rpc("cancel_stock_count", { p_count: (later.data![0] as { id: string }).id })).error).toBeNull();
  });
});

describe("P34 — thời gian nhập: giới hạn và giá gần nhất (INV-18)", () => {
  it("giờ ở tương lai → thoi_gian_tuong_lai", async () => {
    const r = await nhap(ids.ga, 1, 130_000, new Date(Date.now() + 10 * 60_000).toISOString());
    expect(r.error?.message).toContain("thoi_gian_tuong_lai");
  });

  it("lùi quá 7 ngày (ngày sẽ / đã chốt) → ngay_da_chot", async () => {
    const r = await nhap(ids.ga, 1, 130_000, `${addDays(businessDate(), -7)}T05:00:00.000Z`);
    expect(r.error?.message).toContain("ngay_da_chot");
  });

  it("phiếu lùi giờ cũ hơn lần có giá gần nhất → không ghi đè 'Giá gần nhất'", async () => {
    expect((await nhap(ids.ga, 1, 130_000, ago(10))).error).toBeNull();
    expect((await nhap(ids.ga, 1, 120_000, ago(20))).error).toBeNull();
    const { data } = await db.from("ingredients").select("last_unit_cost").eq("id", ids.ga).single();
    expect(Number(data!.last_unit_cost)).toBe(130);
  });

  it("phiếu tạm để trống giờ → giờ = lúc bấm Hoàn thành", async () => {
    const draft = await owner.rpc("save_purchase_receipt", {
      p_tenant: tenant,
      p_receipt: { pay_now: 0, pay_fund: "cash", note: TAG, received_at: null, lines: [{ ingredient_id: ids.ga, qty: 1, unit_price: null }] },
      p_complete: false,
    });
    const id = (draft.data![0] as { id: string }).id;
    receipts.push(id);
    const t0 = Date.now();
    const done = await owner.rpc("save_purchase_receipt", {
      p_tenant: tenant,
      p_receipt: { id, pay_now: 0, pay_fund: "cash", note: TAG, received_at: null, lines: [{ ingredient_id: ids.ga, qty: 1, unit_price: null }] },
      p_complete: true,
    });
    expect(done.error).toBeNull();
    const { data } = await db.from("purchase_receipts").select("received_at").eq("id", id).single();
    expect(Math.abs(Date.parse(data!.received_at as string) - t0)).toBeLessThan(60_000);
  });

  it("tenant B không đọc được phiếu kiểm kê của A, không gọi được hàm kiểm kê cho A", async () => {
    const { data } = await ownerB.from("stock_counts").select("id").eq("tenant_id", tenant);
    expect(data ?? []).toHaveLength(0);
    const r = await ownerB.rpc("complete_stock_count", {
      p_tenant: tenant, p_lines: [{ ingredient_id: ids.bo, counted_base: 0, unit: "base" }], p_redo_of: null,
    });
    expect(r.error?.message).toContain("khong du quyen");
  });
});
