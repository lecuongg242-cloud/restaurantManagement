import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { signInAs, OWNER_A, tenantIdBySlug } from "./setup";
import { adminClient } from "./fixtures";
import { businessDate, addDays, dayStartUtc } from "@/lib/inventory/day";

/**
 * REPORT-15 / CUST-01 — migration 0056 trên DB thật.
 *  • Xóa bàn (và khu) sau khi đã bán → "Khu vực & bàn" vẫn ra đúng tên cũ, không rơi vào "Không gắn bàn".
 *  • Chuyển món sang nhóm khác sau khi đã bán → doanh thu cũ vẫn ở nhóm cũ.
 *  • normalize_vn_phone cùng quy tắc với phoneForStorage.
 * Dữ liệu dựng riêng (nhãn SNAP-TEST), dọn ở afterAll.
 */
const db = adminClient();
let owner: SupabaseClient;
let tenant: string;

const today = businessDate();
const P_FROM = dayStartUtc(addDays(today, -1));
const P_TO = dayStartUtc(addDays(today, 1));

const ids = {
  area: randomUUID(), table: randomUUID(), session: randomUUID(),
  catOld: randomUUID(), catNew: randomUUID(), item: randomUUID(),
  order: randomUUID(), orderItem: randomUUID(), bill: randomUUID(),
};

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

beforeAll(async () => {
  tenant = await tenantIdBySlug(OWNER_A.slug);
  owner = await signInAs(OWNER_A.email, OWNER_A.password);
  const t = { tenant_id: tenant };

  await must(db.from("areas").insert({ id: ids.area, ...t, name: "SNAP-TEST Sân vườn" }));
  await must(db.from("tables").insert({ id: ids.table, ...t, area_id: ids.area, name: "SNAP-TEST B9" }));
  await must(db.from("table_sessions").insert({ id: ids.session, ...t, table_id: ids.table, status: "closed" }));
  await must(db.from("menu_categories").insert({ id: ids.catOld, ...t, name: "SNAP-TEST Nhóm cũ", sort_order: 999 }));
  await must(db.from("menu_categories").insert({ id: ids.catNew, ...t, name: "SNAP-TEST Nhóm mới", sort_order: 999 }));
  await must(db.from("menu_items").insert({ id: ids.item, ...t, category_id: ids.catOld, name: "SNAP-TEST Phở", base_price: 50_000 }));

  await must(db.from("orders").insert({
    id: ids.order, ...t, table_session_id: ids.session, channel: "dine_in", source: "staff", status: "completed", note: "SNAP-TEST",
  }));
  await must(db.from("order_items").insert({
    id: ids.orderItem, ...t, order_id: ids.order, menu_item_id: ids.item, name_snapshot: "SNAP-TEST Phở",
    unit_price_snapshot: 50_000, qty: 1, status: "served",
  }));
  await must(db.from("bills").insert({
    id: ids.bill, ...t, table_session_id: ids.session, status: "paid", subtotal: 50_000, total: 50_000,
    paid_at: new Date().toISOString(), note: "SNAP-TEST",
  }));
  await must(db.from("bill_items").insert({
    tenant_id: tenant, bill_id: ids.bill, order_item_id: ids.orderItem, qty_allocated: 1, unit_price_snapshot: 50_000, amount: 50_000,
  }));
}, 120_000);

afterAll(async () => {
  await db.from("bill_items").delete().eq("bill_id", ids.bill);
  await db.from("bills").delete().eq("id", ids.bill);
  await db.from("orders").delete().eq("id", ids.order);
  await db.from("tables").delete().eq("id", ids.table);
  await db.from("areas").delete().eq("id", ids.area);
  await db.from("menu_items").delete().eq("id", ids.item);
  await db.from("menu_categories").delete().in("id", [ids.catOld, ids.catNew]);
}, 60_000);

describe("0056 — snapshot tên bàn/khu/nhóm", () => {
  it("tạo bill/món tự ghi tên bàn, khu, nhóm lúc bán", async () => {
    const bill = await must(db.from("bills").select("table_label, area_label").eq("id", ids.bill).single());
    expect(bill).toEqual({ table_label: "SNAP-TEST B9", area_label: "SNAP-TEST Sân vườn" });
    const oi = await must(db.from("order_items").select("category_name").eq("id", ids.orderItem).single());
    expect(oi?.category_name).toBe("SNAP-TEST Nhóm cũ");
  });

  it("chuyển món sang nhóm khác → doanh thu đã bán vẫn ở nhóm cũ", async () => {
    await must(db.from("menu_items").update({ category_id: ids.catNew }).eq("id", ids.item));
    const rows = await must(owner.rpc("report_by_category", { p_tenant: tenant, p_from: P_FROM, p_to: P_TO }));
    const names = (rows as { name: string; revenue: number }[]).map((r) => r.name);
    expect(names).toContain("SNAP-TEST Nhóm cũ");
    expect(names).not.toContain("SNAP-TEST Nhóm mới");
  });

  it("xóa bàn (phiên bị xóa theo) → báo cáo vẫn đúng tên bàn và khu cũ", async () => {
    await must(db.from("tables").delete().eq("id", ids.table));
    const bill = await must(db.from("bills").select("table_session_id, table_label, area_label").eq("id", ids.bill).single());
    expect(bill?.table_session_id).toBeNull();
    expect(bill?.table_label).toBe("SNAP-TEST B9"); // trigger không xóa nhãn khi phiên về NULL

    const rows = await must(owner.rpc("report_by_area", { p_tenant: tenant, p_from: P_FROM, p_to: P_TO }));
    const mine = (rows as { area_name: string; table_name: string; revenue: number }[]).find(
      (r) => r.table_name === "SNAP-TEST B9"
    );
    expect(mine).toMatchObject({ area_name: "SNAP-TEST Sân vườn", revenue: 50_000 });
  });
});

describe("0056 — normalize_vn_phone", () => {
  it("cùng quy tắc với phoneForStorage cho SĐT hợp lệ", async () => {
    for (const [raw, want] of [
      ["+84 912 345 678", "0912345678"],
      ["84912345678", "0912345678"],
      ["0912.345.678", "0912345678"],
      ["028 3822 1234", "02838221234"],
    ]) {
      const got = await must(owner.rpc("normalize_vn_phone", { p_raw: raw }));
      expect(got).toBe(want);
    }
  });
});
