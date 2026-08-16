import { describe, it, expect } from "vitest";
import { planCancelledBillCleanup, type OpenBillLine } from "@/lib/billing/cancel-cleanup";

/** Dòng của một bill THƯỜNG (không chia đều) — ca mặc định của mọi test bên dưới. */
const line = (billItemId: string, billId: string, orderItemId: string): OpenBillLine => ({
  billItemId,
  billId,
  orderItemId,
  splitCount: null,
  splitParentId: null,
});

describe("planCancelledBillCleanup (BILL-06)", () => {
  it("xóa đúng dòng của món đã hủy, tính lại bill bị chạm", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [line("bi1", "b1", "oi1")],
      billLines: [
        { billItemId: "bi1", billId: "b1" },
        { billItemId: "bi2", billId: "b1" },
      ],
      billsWithPayments: [],
    });
    expect(plan.deleteBillItemIds).toEqual(["bi1"]);
    expect(plan.recomputeBillIds).toEqual(["b1"]);
    expect(plan.deleteBillIds).toEqual([]); // b1 vẫn còn bi2
  });

  it("bill rỗng sau khi xóa và chưa có payment → xóa luôn bill", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [line("bi1", "b1", "oi1")],
      billLines: [{ billItemId: "bi1", billId: "b1" }],
      billsWithPayments: [],
    });
    expect(plan.deleteBillIds).toEqual(["b1"]);
    expect(plan.recomputeBillIds).toEqual([]); // xóa rồi thì khỏi tính lại
  });

  it("bill rỗng nhưng ĐÃ có payment → giữ lại, chỉ tính lại", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [line("bi1", "b1", "oi1")],
      billLines: [{ billItemId: "bi1", billId: "b1" }],
      billsWithPayments: ["b1"],
    });
    expect(plan.deleteBillIds).toEqual([]);
    expect(plan.recomputeBillIds).toEqual(["b1"]);
  });

  it("nhiều bill bị chạm → gom không trùng", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [line("bi1", "b1", "oi1"), line("bi2", "b1", "oi2"), line("bi3", "b2", "oi3")],
      billLines: [
        { billItemId: "bi1", billId: "b1" },
        { billItemId: "bi2", billId: "b1" },
        { billItemId: "bi9", billId: "b1" },
        { billItemId: "bi3", billId: "b2" },
      ],
      billsWithPayments: [],
    });
    expect(plan.deleteBillItemIds.sort()).toEqual(["bi1", "bi2", "bi3"]);
    expect(plan.recomputeBillIds).toEqual(["b1"]); // b2 rỗng → nằm ở deleteBillIds
    expect(plan.deleteBillIds).toEqual(["b2"]);
  });

  it("không có dòng nào để xóa → kế hoạch rỗng", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [],
      billLines: [],
      billsWithPayments: [],
    });
    expect(plan).toEqual({ deleteBillItemIds: [], recomputeBillIds: [], deleteBillIds: [] });
  });

  // ---- Bill chia đều: KHÔNG ĐỤNG (xem bất biến 2 của cancel-cleanup.ts) --------
  // Vỏ chia đều vẫn mang status 'open' và vẫn giữ bill_items nên nó lọt qua bộ lọc 'open' của
  // tầng đọc. Xóa dòng của vỏ → cha ≠ Σ con; vỏ rỗng còn bị xóa và cascade cuốn theo con lẫn
  // payments của con — tiền đã thu biến mất.
  it("vỏ chia đều (splitCount != null) → không đụng gì", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [
        { billItemId: "bi1", billId: "shell", orderItemId: "oi1", splitCount: 3, splitParentId: null },
        { billItemId: "bi2", billId: "shell", orderItemId: "oi2", splitCount: 3, splitParentId: null },
      ],
      billLines: [
        { billItemId: "bi1", billId: "shell" },
        { billItemId: "bi2", billId: "shell" },
      ],
      billsWithPayments: [], // payment nằm ở BILL CON, không ở vỏ — đúng bẫy của kịch bản hỏng
    });
    expect(plan).toEqual({ deleteBillItemIds: [], recomputeBillIds: [], deleteBillIds: [] });
  });

  it("con chia đều (splitParentId != null) → không đụng gì", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [
        { billItemId: "bi1", billId: "child", orderItemId: "oi1", splitCount: null, splitParentId: "shell" },
      ],
      billLines: [{ billItemId: "bi1", billId: "child" }],
      billsWithPayments: [],
    });
    expect(plan).toEqual({ deleteBillItemIds: [], recomputeBillIds: [], deleteBillIds: [] });
  });

  it("cùng lượt hủy chạm cả bill thường lẫn vỏ chia đều → chỉ dọn bill thường", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [
        line("bi1", "b1", "oi1"),
        { billItemId: "bi2", billId: "shell", orderItemId: "oi1", splitCount: 2, splitParentId: null },
      ],
      billLines: [
        { billItemId: "bi1", billId: "b1" },
        { billItemId: "bi2", billId: "shell" },
      ],
      billsWithPayments: [],
    });
    expect(plan.deleteBillItemIds).toEqual(["bi1"]);
    expect(plan.deleteBillIds).toEqual(["b1"]); // b1 rỗng, chưa có payment
    expect(plan.recomputeBillIds).toEqual([]);
  });
});
