import { describe, it, expect } from "vitest";
import {
  collectBillableSessionItems,
  hasUnapprovedSessionItems,
  pickSessionOpenBill,
  planSessionItemAllocation,
  type SessionOpenBill,
  type SessionOrderForBill,
} from "@/lib/billing/session-bill";

/** Bill 'open' thường của phiên — ca mặc định; ghi đè `splitCount`/`splitParentId` khi cần. */
const bill = (id: string, createdAt: string, over: Partial<SessionOpenBill> = {}): SessionOpenBill => ({
  id,
  splitCount: null,
  splitParentId: null,
  createdAt,
  ...over,
});

describe("pickSessionOpenBill", () => {
  it("phiên chưa có bill 'open' → null (gọi bên ngoài sẽ mở bill mới)", () => {
    expect(pickSessionOpenBill([])).toBeNull();
  });

  it("một bill thường → chính nó", () => {
    expect(pickSessionOpenBill([bill("b1", "2026-08-16T09:00:00Z")])).toBe("b1");
  });

  it("bàn đã chia đều → trả VỎ, không trả con (vỏ mang món + nút Gỡ chia)", () => {
    const picked = pickSessionOpenBill([
      bill("vo", "2026-08-16T09:53:39Z", { splitCount: 3 }),
      bill("con1", "2026-08-16T09:57:25Z", { splitParentId: "vo" }),
      bill("con2", "2026-08-16T09:57:26Z", { splitParentId: "vo" }),
      bill("con3", "2026-08-16T09:57:27Z", { splitParentId: "vo" }),
    ]);
    expect(picked).toBe("vo");
  });

  it("chỉ còn hóa đơn con (vỏ đã chốt/đổi trạng thái) → null, không lấy nhầm con", () => {
    const picked = pickSessionOpenBill([
      bill("con1", "2026-08-16T09:57:25Z", { splitParentId: "vo" }),
      bill("con2", "2026-08-16T09:57:26Z", { splitParentId: "vo" }),
    ]);
    expect(picked).toBeNull();
  });

  it("đã tách theo món (2 bill thường) → lấy bill tạo sớm nhất, ổn định qua mọi thứ tự đầu vào", () => {
    const src = bill("nguon", "2026-08-16T09:00:00Z");
    const split = bill("tach", "2026-08-16T09:30:00Z");
    expect(pickSessionOpenBill([src, split])).toBe("nguon");
    expect(pickSessionOpenBill([split, src])).toBe("nguon");
  });

  it("vỏ thắng bill thường kể cả khi vỏ tạo SAU (vỏ mới là hóa đơn mang món)", () => {
    const picked = pickSessionOpenBill([
      bill("thuong", "2026-08-16T09:00:00Z"),
      bill("vo", "2026-08-16T09:30:00Z", { splitCount: 2 }),
      bill("con", "2026-08-16T09:31:00Z", { splitParentId: "vo" }),
    ]);
    expect(picked).toBe("vo");
  });

  it("hai vỏ (hi hữu, gộp bàn) → lấy vỏ sớm nhất, không phụ thuộc thứ tự đầu vào", () => {
    const a = bill("voA", "2026-08-16T09:00:00Z", { splitCount: 2 });
    const b = bill("voB", "2026-08-16T09:30:00Z", { splitCount: 3 });
    expect(pickSessionOpenBill([a, b])).toBe("voA");
    expect(pickSessionOpenBill([b, a])).toBe("voA");
  });

  it("trùng createdAt → chốt hòa bằng id để hai lần gọi ra cùng kết quả", () => {
    const x = bill("b-x", "2026-08-16T09:00:00Z");
    const y = bill("a-y", "2026-08-16T09:00:00Z");
    expect(pickSessionOpenBill([x, y])).toBe("a-y");
    expect(pickSessionOpenBill([y, x])).toBe("a-y");
  });

  it("không làm đổi thứ tự mảng đầu vào của bên gọi", () => {
    const input = [bill("b2", "2026-08-16T09:30:00Z"), bill("b1", "2026-08-16T09:00:00Z")];
    pickSessionOpenBill(input);
    expect(input.map((b) => b.id)).toEqual(["b2", "b1"]);
  });
});

/** Order của phiên; món mặc định 'queued' (đúng như DB đặt cho đơn vừa tạo). */
const order = (
  status: string,
  items: { id: string; unitPrice?: number; qty?: number; status?: string }[]
): SessionOrderForBill => ({
  status,
  items: items.map((i) => ({
    id: i.id,
    unitPrice: i.unitPrice ?? 50000,
    qty: i.qty ?? 1,
    status: i.status ?? "queued",
  })),
});

describe("collectBillableSessionItems", () => {
  it("phiên chưa có order → rỗng", () => {
    expect(collectBillableSessionItems([])).toEqual([]);
  });

  it("order đã duyệt → lấy món, giữ nguyên giá và số lượng", () => {
    const got = collectBillableSessionItems([order("confirmed", [{ id: "oi1", unitPrice: 45000, qty: 3 }])]);
    expect(got).toEqual([{ id: "oi1", unit: 45000, qty: 3 }]);
  });

  it("BỎ toàn bộ món của order chưa duyệt, dù món mang trạng thái 'queued' bình thường", () => {
    const got = collectBillableSessionItems([
      order("confirmed", [{ id: "oi1" }]),
      order("pending_confirm", [{ id: "oi2" }, { id: "oi3" }]),
    ]);
    expect(got.map((i) => i.id)).toEqual(["oi1"]);
  });

  it("BỎ món của order đã hủy (kể cả khi món chưa kịp đánh dấu hủy)", () => {
    const got = collectBillableSessionItems([order("cancelled", [{ id: "oi1", status: "queued" }])]);
    expect(got).toEqual([]);
  });

  it("BỎ món đã hủy lẻ trong order đã duyệt, giữ món còn lại", () => {
    const got = collectBillableSessionItems([
      order("confirmed", [{ id: "oi1" }, { id: "oi2", status: "cancelled" }]),
    ]);
    expect(got.map((i) => i.id)).toEqual(["oi1"]);
  });

  it("mọi trạng thái order sau khi duyệt đều tính tiền (đang làm/xong/đã phục vụ)", () => {
    const got = collectBillableSessionItems([
      order("preparing", [{ id: "oi1" }]),
      order("ready", [{ id: "oi2" }]),
      order("served", [{ id: "oi3" }]),
      order("completed", [{ id: "oi4" }]),
    ]);
    expect(got.map((i) => i.id)).toEqual(["oi1", "oi2", "oi3", "oi4"]);
  });

  it("chỉ có order chưa duyệt → rỗng (bên gọi báo 'chưa có món ĐÃ DUYỆT')", () => {
    expect(collectBillableSessionItems([order("pending_confirm", [{ id: "oi1" }])])).toEqual([]);
  });
});

describe("planSessionItemAllocation", () => {
  const item = (id: string, unit = 50000, qty = 1) => ({ id, unit, qty });
  const plan = (over: Partial<Parameters<typeof planSessionItemAllocation>[0]> = {}) =>
    planSessionItemAllocation({
      billableItems: [item("oi1"), item("oi2")],
      allocatedItemIds: [],
      openBills: [bill("b1", "2026-08-16T09:00:00Z")],
      targetBillId: "b1",
      ...over,
    });

  it("bill thường → chèn mọi món chưa phân bổ", () => {
    expect(plan().map((i) => i.id)).toEqual(["oi1", "oi2"]);
  });

  it("bỏ món đã nằm trong bill open|paid khác (không tính tiền hai lần)", () => {
    expect(plan({ allocatedItemIds: ["oi1"] }).map((i) => i.id)).toEqual(["oi2"]);
  });

  it("đã phân bổ hết → rỗng, không chèn dòng nào", () => {
    expect(plan({ allocatedItemIds: ["oi1", "oi2"] })).toEqual([]);
  });

  it("bill đích là VỎ chia đều → RỖNG, dù món chưa phân bổ (giữ Σ con = vỏ)", () => {
    const got = plan({
      openBills: [bill("vo", "2026-08-16T09:00:00Z", { splitCount: 3 })],
      targetBillId: "vo",
    });
    expect(got).toEqual([]);
  });

  it("bill đích là hóa đơn CON → RỖNG (con chỉ mang số tiền phần chia, không mang món)", () => {
    const got = plan({
      openBills: [bill("con1", "2026-08-16T09:00:00Z", { splitParentId: "vo" })],
      targetBillId: "con1",
    });
    expect(got).toEqual([]);
  });

  it("bill VỪA TẠO (chưa có trong danh sách) → chèn bình thường, không thể là vỏ", () => {
    expect(plan({ openBills: [], targetBillId: "bill-moi" }).map((i) => i.id)).toEqual(["oi1", "oi2"]);
  });

  it("phiên có vỏ nhưng ghi vào bill thường khác → vẫn chèn (chỉ chặn đúng bill đích)", () => {
    const got = plan({
      openBills: [
        bill("vo", "2026-08-16T09:00:00Z", { splitCount: 2 }),
        bill("thuong", "2026-08-16T09:30:00Z"),
      ],
      targetBillId: "thuong",
    });
    expect(got.map((i) => i.id)).toEqual(["oi1", "oi2"]);
  });

  it("giữ nguyên giá/số lượng của món để bên gọi tính amount", () => {
    const got = plan({ billableItems: [item("oi9", 45000, 3)] });
    expect(got).toEqual([{ id: "oi9", unit: 45000, qty: 3 }]);
  });
});

describe("hasUnapprovedSessionItems", () => {
  it("phiên chưa có order → false (bàn trống thật, giữ câu 'bàn chưa có món')", () => {
    expect(hasUnapprovedSessionItems([])).toBe(false);
  });

  it("chỉ có order chưa duyệt → true (nhân viên đang nhìn thấy món, cần bảo họ duyệt đơn)", () => {
    expect(hasUnapprovedSessionItems([order("pending_confirm", [{ id: "oi1" }])])).toBe(true);
  });

  it("order chưa duyệt nhưng món đã hủy hết → false (không có gì để duyệt)", () => {
    expect(
      hasUnapprovedSessionItems([order("pending_confirm", [{ id: "oi1", status: "cancelled" }])])
    ).toBe(false);
  });

  it("chỉ có order đã duyệt → false", () => {
    expect(hasUnapprovedSessionItems([order("confirmed", [{ id: "oi1" }])])).toBe(false);
  });

  it("order đã hủy (không phải chưa duyệt) → false, duyệt đơn không cứu được ca này", () => {
    expect(hasUnapprovedSessionItems([order("cancelled", [{ id: "oi1" }])])).toBe(false);
  });

  it("vừa có món đã duyệt vừa có đơn chờ duyệt → true (bên gọi chỉ hỏi khi danh sách tính tiền rỗng)", () => {
    expect(
      hasUnapprovedSessionItems([order("confirmed", [{ id: "oi1" }]), order("pending_confirm", [{ id: "oi2" }])])
    ).toBe(true);
  });
});
