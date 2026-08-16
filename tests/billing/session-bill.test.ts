import { describe, it, expect } from "vitest";
import {
  collectBillableSessionItems,
  pickSessionOpenBill,
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

  it("chỉ có order chưa duyệt → rỗng (bên gọi báo 'bàn chưa có món để tính tiền')", () => {
    expect(collectBillableSessionItems([order("pending_confirm", [{ id: "oi1" }])])).toEqual([]);
  });
});
