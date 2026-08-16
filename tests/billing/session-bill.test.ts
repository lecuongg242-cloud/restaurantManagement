import { describe, it, expect } from "vitest";
import { pickSessionOpenBill, type SessionOpenBill } from "@/lib/billing/session-bill";

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
