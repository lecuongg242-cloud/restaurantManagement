import { describe, it, expect } from "vitest";
import { planCancelledBillCleanup } from "@/lib/billing/cancel-cleanup";

describe("planCancelledBillCleanup (BILL-06)", () => {
  it("xóa đúng dòng của món đã hủy, tính lại bill bị chạm", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [{ billItemId: "bi1", billId: "b1", orderItemId: "oi1" }],
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
      cancelledLines: [{ billItemId: "bi1", billId: "b1", orderItemId: "oi1" }],
      billLines: [{ billItemId: "bi1", billId: "b1" }],
      billsWithPayments: [],
    });
    expect(plan.deleteBillIds).toEqual(["b1"]);
    expect(plan.recomputeBillIds).toEqual([]); // xóa rồi thì khỏi tính lại
  });

  it("bill rỗng nhưng ĐÃ có payment → giữ lại, chỉ tính lại", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [{ billItemId: "bi1", billId: "b1", orderItemId: "oi1" }],
      billLines: [{ billItemId: "bi1", billId: "b1" }],
      billsWithPayments: ["b1"],
    });
    expect(plan.deleteBillIds).toEqual([]);
    expect(plan.recomputeBillIds).toEqual(["b1"]);
  });

  it("nhiều bill bị chạm → gom không trùng", () => {
    const plan = planCancelledBillCleanup({
      cancelledLines: [
        { billItemId: "bi1", billId: "b1", orderItemId: "oi1" },
        { billItemId: "bi2", billId: "b1", orderItemId: "oi2" },
        { billItemId: "bi3", billId: "b2", orderItemId: "oi3" },
      ],
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
});
