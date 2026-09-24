import { describe, it, expect } from "vitest";
import { dayUnitCost, daysToClose, buildDailyClose, type DayRow } from "@/lib/inventory/close";
import type { Ingredient } from "@/lib/inventory/types";

function ing(p: Partial<Ingredient> & Pick<Ingredient, "id" | "name">): Ingredient {
  return {
    kind: "purchased", base_unit: "g", purchase_unit: null, purchase_factor: 1, yield_pct: 100,
    must_count: false, batch_output_qty: null, last_unit_cost: null, last_cost_at: null, active: true, ...p,
  };
}

const D = "2026-09-20";

describe("giá theo ngày (QD-017 D6)", () => {
  it("bình quân gia quyền 2 lần nhập (1 kg 250k + 2 kg 280k → 270đ/g)", () => {
    const r = dayUnitCost(
      [
        { business_date: D, qty: 1000, unit_cost: 250 },
        { business_date: D, qty: 2000, unit_cost: 280 },
      ],
      D,
      null
    );
    expect(r).toEqual({ cost: 270, source: "today" });
  });

  it("nhập không giá không kéo bình quân (chỉ các lần có giá được truyền vào)", () => {
    expect(dayUnitCost([{ business_date: D, qty: 1000, unit_cost: 300 }], D, null).cost).toBe(300);
  });

  it("ngày không nhập → giá của lần có giá gần nhất, kèm ngày", () => {
    const r = dayUnitCost(
      [
        { business_date: "2026-09-15", qty: 1000, unit_cost: 260 },
        { business_date: "2026-09-18", qty: 1000, unit_cost: 275 },
      ],
      D,
      null
    );
    expect(r).toEqual({ cost: 275, source: "stale:2026-09-18" });
  });

  it("lần nhập SAU ngày chốt không được dùng", () => {
    const r = dayUnitCost([{ business_date: "2026-09-25", qty: 1000, unit_cost: 999 }], D, null);
    expect(r).toEqual({ cost: null, source: "none" });
  });

  it("chưa có lần nhập có giá → giá khai tay nếu khai trước ngày chốt", () => {
    expect(dayUnitCost([], D, { cost: 280, date: "2026-09-10" })).toEqual({ cost: 280, source: "stale:2026-09-10" });
    expect(dayUnitCost([], D, { cost: 280, date: "2026-09-22" })).toEqual({ cost: null, source: "none" });
  });

  it("chưa từng có giá → null", () => {
    expect(dayUnitCost([], D, null)).toEqual({ cost: null, source: "none" });
  });
});

describe("những ngày cần chốt (INV-09)", () => {
  it("bỏ hôm nay: hôm nay còn đang bán", () => {
    expect(daysToClose(null, "2026-09-22", "2026-09-24")).toEqual(["2026-09-22", "2026-09-23"]);
  });

  it("tiếp nối sau bản chốt gần nhất", () => {
    expect(daysToClose("2026-09-22", "2026-09-01", "2026-09-24")).toEqual(["2026-09-23"]);
  });

  it("đã chốt tới hôm qua → không còn gì", () => {
    expect(daysToClose("2026-09-23", "2026-09-01", "2026-09-24")).toEqual([]);
  });

  it("chưa từng có dòng sổ → không chốt gì", () => {
    expect(daysToClose(null, null, "2026-09-24")).toEqual([]);
  });

  it("chặn 60 ngày một lượt", () => {
    const days = daysToClose(null, "2026-01-01", "2026-09-24");
    expect(days).toHaveLength(60);
    expect(days[0]).toBe("2026-01-01");
  });
});

describe("dựng bản chốt (INV-09)", () => {
  const bo = ing({ id: "bo", name: "Thịt bò", last_unit_cost: 999, last_cost_at: "2026-09-30T00:00:00Z" });
  const muoi = ing({ id: "muoi", name: "Muối" });
  const row = (id: string, p: Partial<DayRow> = {}): DayRow => ({
    ingredient_id: id, opening: 0, receipts: 0, batch_in: 0, batch_out: 0,
    waste_hong: 0, waste_do_bo: 0, waste_com_nv: 0, waste_khac: 0, adjust: 0, counted: false,
    order_usage: 0, cancel_usage: 0, batch_shortfall: 0, closing: 0, ...p,
  });

  const payload = buildDailyClose({
    day: D,
    rows: [row("bo", { receipts: 1000, order_usage: 400, adjust: -50, counted: true, closing: 550 })],
    ingredients: [bo, muoi],
    byItem: new Map([
      ["pho", [{ ingredient_id: "bo", qty: 100 }]],
      ["com", [{ ingredient_id: "bo", qty: 50 }, { ingredient_id: "muoi", qty: 2 }]],
    ]),
    byOption: new Map(),
    byParent: new Map(),
    items: [{ id: "pho", name: "Phở bò" }, { id: "com", name: "Cơm bò" }],
    options: [],
    prices: new Map([["bo", [{ business_date: D, qty: 1000, unit_cost: 280 }]]]),
  });

  it("closing gồm adjust, giữ cờ đã kiểm", () => {
    expect(payload.ingredients[0]).toMatchObject({ id: "bo", closing: 550, adjust: -50, counted: true });
  });

  it("giá ngày thắng giá gần nhất trên danh mục (giá danh mục ghi SAU ngày chốt)", () => {
    expect(payload.ingredients[0]).toMatchObject({ unit_cost: 280, cost_source: "today" });
    expect(payload.items.find((i) => i.menu_item_id === "pho")!.portion_cost).toBe(28_000);
  });

  it("payload món giữ tên thiếu giá", () => {
    const com = payload.items.find((i) => i.menu_item_id === "com")!;
    expect(com.portion_cost).toBeNull();
    expect(com.missing).toEqual(["Muối"]);
    expect(com.name).toBe("Cơm bò");
  });

  it("chụp tên nguyên liệu vào bản chốt", () => {
    expect(payload.ingredients[0].name).toBe("Thịt bò");
  });
});
