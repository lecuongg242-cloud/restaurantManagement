import { describe, it, expect } from "vitest";
import { isPaymentCall, paymentMethodOf, paymentQueue } from "@/lib/orders/payment-queue";

const item = (status: string, unit_price: number, qty = 1) => ({ status, unit_price, qty });
const sess = (id: string, tableId: string, items: ReturnType<typeof item>[], bill: { total: number; created_at: string } | null = null, members: string[] = []) => ({
  id, tableId, memberTableIds: members, opened_at: "2026-10-03T12:00:00Z",
  orders: [{ items }],
  openBill: bill,
});

describe("hàng chờ thanh toán (P27 ORDER-26)", () => {
  it("nhận ra lượt gọi thanh toán của khách QR (ghi chú mở đầu 'Thanh toán')", () => {
    expect(isPaymentCall("Thanh toán · Chuyển khoản")).toBe(true);
    expect(isPaymentCall("Thêm bát/đũa")).toBe(false);
    expect(isPaymentCall(null)).toBe(false);
    expect(paymentMethodOf("Thanh toán · Chuyển khoản · nhanh giúp")).toBe("Chuyển khoản");
    expect(paymentMethodOf("Thanh toán")).toBeNull();
  });

  it("bàn vào hàng chờ khi khách gọi thanh toán HOẶC đã bấm Tính tiền; chờ lâu nhất lên đầu", () => {
    const rows = paymentQueue({
      sessions: [
        sess("s1", "B1", [item("queued", 50000, 2), item("cancelled", 99000)]),
        sess("s2", "B2", [item("ready", 30000)], { total: 33000, created_at: "2026-10-03T13:05:00Z" }),
        sess("s3", "B3", [item("queued", 10000)]),
      ],
      calls: [
        { id: "c1", tableId: "B1", note: "Thanh toán · Tiền mặt", created_at: "2026-10-03T13:10:00Z" },
        { id: "c2", tableId: "B3", note: "Thêm bát/đũa", created_at: "2026-10-03T13:00:00Z" },
      ],
      tableName: (id) => id,
    });
    expect(rows.map((r) => r.tableId)).toEqual(["B2", "B1"]);
    expect(rows[0]).toMatchObject({ total: 33000, billOpen: true, method: null, callIds: [] });
    expect(rows[1]).toMatchObject({ total: 100000, billOpen: false, method: "Tiền mặt", callIds: ["c1"] });
  });

  it("đã Tính tiền rồi khách gọi thêm → đếm phần món chưa lên hóa đơn (bỏ món hủy, đơn chờ duyệt); lên hết → 0", () => {
    const moi = (id: string, status: string, qty: number) => ({ id, status, unit_price: 25000, qty });
    const phien = (billedItemIds: string[]) => ({
      tableId: "B1",
      memberTableIds: [],
      orders: [
        { status: "confirmed", items: [moi("i1", "served", 2)] },
        { status: "confirmed", items: [moi("i2", "queued", 3), moi("i3", "cancelled", 1)] },
        { status: "pending_confirm", items: [moi("i4", "queued", 5)] },
      ],
      openBill: { total: 55000, created_at: "2026-10-03T13:10:00Z", billedItemIds },
    });
    const [row] = paymentQueue({ sessions: [phien(["i1"])], calls: [], tableName: (id) => id });
    expect(row).toMatchObject({ total: 55000, newItems: 3 });
    const [du] = paymentQueue({ sessions: [phien(["i1", "i2"])], calls: [], tableName: (id) => id });
    expect(du.newItems).toBe(0);
  });

  it("gọi từ bàn phụ trong nhóm (P23) → vào hàng của bàn chính; gọi ở bàn không còn phiên thì không vào", () => {
    const rows = paymentQueue({
      sessions: [sess("s1", "V1", [item("queued", 50000)], null, ["V2"])],
      calls: [
        { id: "c1", tableId: "V2", note: "Thanh toán", created_at: "2026-10-03T13:10:00Z" },
        { id: "c9", tableId: "Z9", note: "Thanh toán", created_at: "2026-10-03T13:00:00Z" },
      ],
      tableName: (id) => id,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tableId: "V1", callIds: ["c1"] });
  });
});
