import { describe, expect, it } from "vitest";
import { groupTableName, kitchenTableName, type GroupTableRef } from "@/lib/orders/place-label";
import { groupCandidates } from "@/lib/orders/group-candidates";
import type { PosOrder, PosPending, PosSession, PosTable } from "@/lib/orders/pos";

/**
 * Ghép bàn (P23, QD-029 D4–D6). Phiếu bếp ghi bàn GỌI kèm nhóm để bưng đúng bàn; hóa đơn ghi "bàn chính +N" như
 * Sapo. Bàn không ghép KHÔNG được đổi chữ — mọi quán đang chạy in y như cũ.
 */
const refs = (rows: [string, string, string | null][]) =>
  new Map<string, GroupTableRef>(rows.map(([id, name, g]) => [id, { id, name, group_session_id: g }]));

// B1 chính của phiên S; B2, B3 ghép vào S; B9 bàn thường có phiên riêng.
const T = refs([
  ["b1", "B1", null],
  ["b2", "B2", "S"],
  ["b3", "B3", "S"],
  ["b9", "B9", null],
]);

describe("kitchenTableName — phiếu bếp / màn bếp", () => {
  it("bàn không ghép: giữ nguyên tên bàn", () => {
    expect(kitchenTableName({ sessionId: "S9", mainTableId: "b9", orderTableId: null, tables: T })).toBe("B9");
    expect(kitchenTableName({ sessionId: "S9", mainTableId: "b9", orderTableId: "b9", tables: T })).toBe("B9");
  });

  it("đơn gọi từ bàn phụ: bàn gọi kèm nhóm", () => {
    expect(kitchenTableName({ sessionId: "S", mainTableId: "b1", orderTableId: "b3", tables: T })).toBe("B3 (nhóm B1)");
  });

  it("đơn gọi chung từ bàn chính (hoặc đơn cũ không ghi bàn) trong nhóm: vẫn ghi nhóm", () => {
    expect(kitchenTableName({ sessionId: "S", mainTableId: "b1", orderTableId: "b1", tables: T })).toBe("B1 (nhóm B1)");
    expect(kitchenTableName({ sessionId: "S", mainTableId: "b1", orderTableId: null, tables: T })).toBe("B1 (nhóm B1)");
  });

  it("in lại sau khi bàn đã bỏ ghép: đơn của B3 vẫn ghi đúng B3", () => {
    const sau = refs([["b1", "B1", null], ["b3", "B3", null]]);
    expect(kitchenTableName({ sessionId: "S", mainTableId: "b1", orderTableId: "b3", tables: sau })).toBe("B3 (nhóm B1)");
  });

  it("không tra ra bàn chính ⇒ null (nơi gọi tự rơi về chữ cũ)", () => {
    expect(kitchenTableName({ sessionId: "S", mainTableId: "zz", orderTableId: "b3", tables: T })).toBeNull();
  });
});

describe("groupTableName — hóa đơn / phiếu khách", () => {
  it("bàn không ghép: tên bàn", () => {
    expect(groupTableName({ sessionId: "S9", mainTableId: "b9", tables: T })).toBe("B9");
  });

  it("nhóm đang mở: bàn chính +số bàn phụ", () => {
    expect(groupTableName({ sessionId: "S", mainTableId: "b1", tables: T })).toBe("B1 +2");
  });

  it("phiên đã đóng (không bàn nào còn trỏ về): đếm theo bàn gọi của các đơn, không đếm trùng", () => {
    const sau = refs([["b1", "B1", null], ["b2", "B2", null], ["b3", "B3", null]]);
    expect(
      groupTableName({ sessionId: "S", mainTableId: "b1", orderTableIds: ["b3", "b3", null, "b1", "b2"], tables: sau })
    ).toBe("B1 +2");
  });
});

// ---- Hộp "Ghép bàn" ----------------------------------------------------------------------------------------------
const table = (id: string, groupSessionId: string | null = null): PosTable => ({
  id,
  name: id.toUpperCase(),
  area_id: null,
  status: "available",
  seats: 4,
  groupSessionId,
});
const order = (table_id: string | null, statuses: PosOrder["items"][number]["status"][]): PosOrder => ({
  id: `o-${table_id}-${statuses.join("")}`,
  kitchen_no: 1,
  status: "confirmed",
  source: "staff",
  note: null,
  customer_contact: null,
  created_at: "2026-10-01T11:00:00Z",
  table_session_id: null,
  table_id,
  items: statuses.map((status, i) => ({
    id: `i${i}`,
    name: "Phở",
    qty: 1,
    note: null,
    status,
    unit_price: 50000,
    modifiers: [],
    cancel_reason: null,
  })),
});
const session = (id: string, tableId: string, extra: Partial<PosSession> = {}): PosSession => ({
  id,
  tableId,
  memberTableIds: [],
  opened_at: "2026-10-01T11:00:00Z",
  orders: [],
  openBill: null,
  ...extra,
});

describe("groupCandidates — trạng thái từng ô bàn", () => {
  const tables = [
    table("b1"),
    table("b2", "S"),
    table("b3", "S"),
    table("b4"),
    table("b5"),
    table("b6"),
    table("b7", "S8"),
    table("b8"),
  ];
  const sessions = [
    session("S", "b1", {
      memberTableIds: ["b2", "b3"],
      orders: [order(null, ["queued"]), order("b3", ["queued", "served", "cancelled"]), order("b2", ["served"])],
    }),
    session("S5", "b5", { orders: [order(null, ["queued", "queued", "cancelled"])] }),
    session("S6", "b6", { openBill: { id: "x", bill_no: 3, total: 100000, splitCount: null } }),
    session("S8", "b8", { memberTableIds: ["b7"] }),
  ];
  const pending: PosPending[] = [];
  const byId = new Map(
    groupCandidates({ mainTableId: "b1", tables, sessions, pending }).map((c) => [c.table.id, c])
  );

  it("bàn chính: tích sẵn + khóa", () => {
    expect(byId.get("b1")).toMatchObject({ checked: true, locked: true, note: "Bàn chính" });
  });
  it("bàn phụ đã thu hết: tích sẵn, bỏ tích được", () => {
    expect(byId.get("b2")).toMatchObject({ checked: true, locked: false });
  });
  it("bàn phụ còn món chưa thu: khóa, ghi số món", () => {
    expect(byId.get("b3")).toMatchObject({ checked: true, locked: true, note: "còn 1 món chưa thu" });
  });
  it("bàn trống: tích được, không nhãn", () => {
    expect(byId.get("b4")).toMatchObject({ checked: false, locked: false, note: null });
  });
  it("bàn có món chưa mở hóa đơn: tích được, báo món sẽ chuyển (không đếm món đã hủy)", () => {
    expect(byId.get("b5")).toMatchObject({ checked: false, locked: false, note: "2 món — chuyển vào nhóm" });
  });
  it("bàn đang có hóa đơn: mờ + khóa", () => {
    expect(byId.get("b6")).toMatchObject({ locked: true, muted: true, note: "Đang có hóa đơn" });
  });
  it("bàn phụ và bàn chính của nhóm khác: mờ + khóa, ghi nhóm", () => {
    expect(byId.get("b7")).toMatchObject({ locked: true, muted: true, note: "Nhóm B8" });
    expect(byId.get("b8")).toMatchObject({ locked: true, muted: true, note: "Nhóm B8" });
  });
  it("đơn QR chờ duyệt gọi từ bàn phụ cũng tính là chưa thu", () => {
    const withPending = groupCandidates({
      mainTableId: "b1",
      tables,
      sessions,
      pending: [{ id: "p", tableId: "b2", tableName: "B2", customer_contact: null, created_at: "", items: order(null, ["queued"]).items }],
    });
    expect(withPending.find((c) => c.table.id === "b2")).toMatchObject({ locked: true, note: "còn 1 món chưa thu" });
  });
});
