import { describe, it, expect } from "vitest";
import { planUnsplit, type SplitChild } from "@/lib/billing/unsplit";

/** Con chia đều CHƯA thu đồng nào — ca mặc định của các test bên dưới. */
const child = (id: string, over: Partial<SplitChild> = {}): SplitChild => ({
  id,
  status: "open",
  paymentCount: 0,
  ...over,
});

describe("planUnsplit (BILL-06)", () => {
  it("không có con nào → không phải hóa đơn đã chia", () => {
    const plan = planUnsplit([]);
    expect(plan).toEqual({ ok: false, error: "Hóa đơn chưa chia." });
  });

  it("mọi con chưa thu → gỡ được, xóa hết con", () => {
    const plan = planUnsplit([child("c1"), child("c2"), child("c3")]);
    expect(plan).toEqual({ ok: true, deleteChildIds: ["c1", "c2", "c3"] });
  });

  it("một con đã 'paid' → chặn (xóa con là cascade xóa payments)", () => {
    const plan = planUnsplit([child("c1"), child("c2", { status: "paid", paymentCount: 1 })]);
    expect(plan.ok).toBe(false);
    if (!plan.ok)
      expect(plan.error).toBe("Đã thu một phần — không gỡ chia được. Hoàn tiền phần đã thu trước.");
  });

  it("con còn 'open' nhưng đã có payment (thu chưa đủ) → vẫn chặn", () => {
    const plan = planUnsplit([child("c1"), child("c2", { paymentCount: 1 })]);
    expect(plan.ok).toBe(false);
    if (!plan.ok)
      expect(plan.error).toBe("Đã thu một phần — không gỡ chia được. Hoàn tiền phần đã thu trước.");
  });

  it("nhiều con hỗn hợp: chỉ cần 1 con dính tiền là chặn cả lượt", () => {
    const plan = planUnsplit([
      child("c1"),
      child("c2"),
      child("c3", { status: "paid", paymentCount: 1 }),
      child("c4"),
    ]);
    expect(plan.ok).toBe(false);
    expect(plan).not.toHaveProperty("deleteChildIds");
  });
});
