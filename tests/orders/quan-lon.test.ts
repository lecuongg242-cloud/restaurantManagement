import { describe, it, expect } from "vitest";
import { matchesTableFilter, needsAttention, tableFlags } from "@/lib/orders/table-flags";
import { orderStatusFromItems } from "@/lib/orders/status";
import { splitKdsColumns } from "@/lib/orders/kds-columns";
import type { KdsTicket } from "@/lib/orders/kds";

describe("tableFlags — dấu trên thẻ bàn (ORDER-24)", () => {
  const sessions = [
    {
      tableId: "B1",
      orders: [
        { table_id: null, items: [{ status: "ready", delivered: false }, { status: "ready", delivered: true }, { status: "queued", delivered: false }] },
        // Đơn gọi từ bàn phụ B3 của nhóm B1 (P23) → dấu ở B3.
        { table_id: "B3", items: [{ status: "ready", delivered: false }, { status: "cancelled", delivered: false }] },
      ],
    },
  ];
  const f = tableFlags({
    pending: [{ tableId: "A1" }, { tableId: "A1" }, { tableId: null }],
    unprinted: [{ tableId: "B1" }],
    calls: [{ tableId: "C2" }],
    sessions,
  });

  it("đếm chờ duyệt, chưa in, gọi theo bàn; đơn không bàn bỏ qua", () => {
    expect(f.get("A1")).toMatchObject({ pending: 2, unprinted: 0, calls: 0, ready: 0 });
    expect(f.get("B1")?.unprinted).toBe(1);
    expect(f.get("C2")?.calls).toBe(1);
  });

  it("món xong chờ mang ra = 'ready' chưa mang ra, theo bàn GỌI", () => {
    expect(f.get("B1")?.ready).toBe(1);
    expect(f.get("B3")?.ready).toBe(1);
  });

  it("cần xử lý = có ít nhất một việc", () => {
    expect(needsAttention(f.get("A1"))).toBe(true);
    expect(needsAttention(undefined)).toBe(false);
    expect(needsAttention({ pending: 0, unprinted: 0, calls: 0, ready: 0, payment: 0 })).toBe(false);
    expect(needsAttention({ pending: 0, unprinted: 0, calls: 0, ready: 0, payment: 1 })).toBe(true);
  });

  it("lọc Tất cả · Đang phục vụ · Trống · Cần xử lý", () => {
    const busy = { id: "B1", status: "occupied" as const };
    const free = { id: "Z9", status: "available" as const };
    const resv = { id: "R1", status: "reserved" as const };
    expect([busy, free, resv].filter((t) => matchesTableFilter(t, f.get(t.id), "all")).length).toBe(3);
    expect([busy, free, resv].filter((t) => matchesTableFilter(t, f.get(t.id), "busy")).map((t) => t.id)).toEqual(["B1"]);
    expect([busy, free, resv].filter((t) => matchesTableFilter(t, f.get(t.id), "free")).map((t) => t.id)).toEqual(["Z9"]);
    expect([busy, free, resv].filter((t) => matchesTableFilter(t, f.get(t.id), "attention")).map((t) => t.id)).toEqual(["B1"]);
    const g = tableFlags({ pending: [], unprinted: [], calls: [], sessions: [], payTableIds: ["B1"] });
    expect([busy, free].filter((t) => matchesTableFilter(t, g.get(t.id), "pay")).map((t) => t.id)).toEqual(["B1"]);
  });
});

describe("orderStatusFromItems — đơn tại bàn sau khi bếp bấm (QD-032 D4)", () => {
  const s = (...st: string[]) => st.map((status) => ({ status }));
  it("mọi món còn lại xong → ready; bỏ món hủy", () => {
    expect(orderStatusFromItems(s("ready", "ready", "cancelled"))).toBe("ready");
  });
  it("có món xong hoặc đang làm → preparing", () => {
    expect(orderStatusFromItems(s("ready", "queued"))).toBe("preparing");
    expect(orderStatusFromItems(s("preparing"))).toBe("preparing");
  });
  it("chưa món nào xong (kể cả bấm Trả lại hết) → confirmed", () => {
    expect(orderStatusFromItems(s("queued", "queued"))).toBe("confirmed");
  });
  it("không còn món nào → null (không đổi)", () => {
    expect(orderStatusFromItems(s("cancelled"))).toBeNull();
  });
});

describe("splitKdsColumns — Chờ chế biến / Đã xong – chờ mang ra (ORDER-04)", () => {
  const ticket = (orderId: string, items: [string, KdsTicket["items"][number]["status"]][]): KdsTicket => ({
    orderId, kitchenNo: 1, status: "confirmed", channel: "dine_in", confirmedAt: "2026-10-03T12:00:00Z", tableName: "B1", place: "Bàn B1",
    items: items.map(([id, status]) => ({ id, name: id, qty: 1, note: null, status, modifiers: [] })),
  });
  const { todo, done } = splitKdsColumns([
    ticket("o1", [["a", "queued"], ["b", "ready"]]),
    ticket("o2", [["c", "ready"]]),
    ticket("o3", [["d", "preparing"]]),
  ]);
  it("một đơn có thể nằm ở cả hai cột, mỗi cột chỉ món đúng trạng thái; giữ thứ tự", () => {
    expect(todo.map((t) => [t.orderId, t.items.map((i) => i.id)])).toEqual([["o1", ["a"]], ["o3", ["d"]]]);
    expect(done.map((t) => [t.orderId, t.items.map((i) => i.id)])).toEqual([["o1", ["b"]], ["o2", ["c"]]]);
  });
});
