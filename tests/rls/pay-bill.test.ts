import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { payBill } from "@/lib/billing/bill";
import { adminClient } from "./fixtures";
import { tenantIdBySlug, OWNER_B } from "./setup";

/**
 * LƯỚI AN TOÀN cho đường tiền, viết TRƯỚC khi tối ưu `payBill`.
 *
 * `payBill` có 17 lượt `await` nối tiếp và không một `Promise.all` nào. Sắp gộp lại cho song song,
 * mà đây là đoạn code chạm vào tiền của nhà hàng — không có test khẳng định trạng thái cuối thì
 * việc tối ưu chỉ là đánh cược.
 *
 * Test dựng dữ liệu riêng trên tenant demo `bun-bo` (không phải quán đang hoạt động), thu tiền
 * thật, rồi kiểm từng hệ quả mà hàm cam kết.
 */
const P = "f6000000-0000-4000-8000-0000000000";
const ID = {
  cat: P + "01",
  item: P + "02",
  area: P + "03",
  table: P + "04",
  session: P + "05",
  order: P + "06",
  orderItem: P + "07",
  bill: P + "08",
  billItem: P + "09",
};

let tenantId = "";
const admin = adminClient();

async function dungDuLieu() {
  const t = { tenant_id: tenantId };
  await admin.from("menu_categories").upsert({ id: ID.cat, ...t, name: "PAYBILL-TEST" });
  await admin.from("menu_items").upsert({ id: ID.item, ...t, category_id: ID.cat, name: "PAYBILL-TEST", base_price: 50_000 });
  await admin.from("areas").upsert({ id: ID.area, ...t, name: "PAYBILL-TEST" });
  await admin.from("tables").upsert({ id: ID.table, ...t, area_id: ID.area, name: "PAYBILL-TEST", qr_token: "paybill-test" });
  await admin.from("table_sessions").upsert({ id: ID.session, ...t, table_id: ID.table, status: "open" });
  await admin.from("orders").upsert({ id: ID.order, ...t, table_session_id: ID.session, channel: "dine_in", source: "staff", status: "confirmed" });
  await admin.from("order_items").upsert({ id: ID.orderItem, ...t, order_id: ID.order, menu_item_id: ID.item, name_snapshot: "PAYBILL-TEST", unit_price_snapshot: 50_000, qty: 1, status: "ready" });
  await admin.from("bills").upsert({ id: ID.bill, ...t, table_session_id: ID.session, status: "open", subtotal: 50_000, total: 50_000 });
  await admin.from("bill_items").upsert({ id: ID.billItem, ...t, bill_id: ID.bill, order_item_id: ID.orderItem, qty_allocated: 1, unit_price_snapshot: 50_000, amount: 50_000 });
}

async function don() {
  await admin.from("payments").delete().eq("bill_id", ID.bill);
  await admin.from("bill_items").delete().eq("id", ID.billItem);
  await admin.from("bills").delete().eq("id", ID.bill);
  await admin.from("order_items").delete().eq("id", ID.orderItem);
  await admin.from("orders").delete().eq("id", ID.order);
  await admin.from("table_sessions").delete().eq("id", ID.session);
  await admin.from("tables").delete().eq("id", ID.table);
  await admin.from("areas").delete().eq("id", ID.area);
  await admin.from("menu_items").delete().eq("id", ID.item);
  await admin.from("menu_categories").delete().eq("id", ID.cat);
}

beforeAll(async () => {
  tenantId = await tenantIdBySlug(OWNER_B.slug);
  await don();
  await dungDuLieu();
}, 120_000);

afterAll(async () => {
  await don();
}, 120_000);

describe("payBill — trạng thái cuối sau khi thu tiền", () => {
  it("thu đủ tiền → mọi hệ quả xảy ra đúng trong MỘT lượt gọi", async () => {
    const t0 = Date.now();
    const kq = await payBill(
      tenantId,
      ID.bill,
      { method: "cash", amountReceived: 100_000 },
      null,
      {},
      admin
    );
    const ms = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[payBill] ${ms} ms`);

    expect(kq, "thu tiền thất bại").toMatchObject({ ok: true });
    expect((kq as { change: number }).change, "tiền thối sai").toBe(50_000);

    const { data: bill } = await admin.from("bills").select("status, paid_at").eq("id", ID.bill).maybeSingle();
    expect(bill!.status, "hóa đơn chưa chuyển 'paid'").toBe("paid");
    expect(bill!.paid_at, "thiếu mốc tiền về").toBeTruthy();

    const { data: tra } = await admin.from("payments").select("method, amount").eq("bill_id", ID.bill);
    expect(tra ?? [], "không ghi dòng thanh toán nào").toHaveLength(1);
    expect(tra![0]).toMatchObject({ method: "cash", amount: 50_000 });

    const { data: oi } = await admin.from("order_items").select("status").eq("id", ID.orderItem).maybeSingle();
    expect(oi!.status, "món đã thu đủ phải rời KDS ('served')").toBe("served");

    const { data: o } = await admin.from("orders").select("status").eq("id", ID.order).maybeSingle();
    expect(o!.status, "mọi món đã served thì đơn phải 'served'").toBe("served");

    const { data: ss } = await admin.from("table_sessions").select("status").eq("id", ID.session).maybeSingle();
    expect(ss!.status, "thu hết thì phiên bàn phải đóng (TABLE-02)").toBe("closed");

    const { data: ban } = await admin.from("tables").select("status").eq("id", ID.table).maybeSingle();
    expect(ban!.status, "bàn phải về trống sau khi đóng phiên").toBe("available");
  }, 120_000);

  it("KHÔNG có khóa idempotent → lượt thu thứ hai bị TỪ CHỐI (bảo vệ tiền)", async () => {
    const kq = await payBill(
      tenantId,
      ID.bill,
      { method: "cash", amountReceived: 100_000 },
      null,
      {},
      admin
    );
    expect(kq, "hóa đơn đã đóng mà vẫn thu thêm được").toMatchObject({
      error: expect.stringContaining("đã đóng"),
    });

    const { data: tra } = await admin.from("payments").select("id").eq("bill_id", ID.bill);
    expect(tra ?? [], "đã thu tiền hai lần").toHaveLength(1);
  }, 120_000);

  it("CÙNG khóa idempotent → gửi lại không thu thêm đồng nào", async () => {
    // Dựng lại một hóa đơn mở để thử riêng đường idempotent.
    await admin.from("payments").delete().eq("bill_id", ID.bill);
    await admin
      .from("bills")
      .update({ status: "open", paid_at: null })
      .eq("id", ID.bill);

    // `p_idem` của RPC là kiểu uuid — chuỗi tự đặt sẽ bị normalizeIdempotencyKey loại bỏ,
    // và lượt hai lại rơi vào nhánh "hóa đơn đã đóng".
    const khoa = crypto.randomUUID();
    const dauVao = { method: "cash" as const, amountReceived: 100_000, idempotencyKey: khoa };

    const lan1 = await payBill(tenantId, ID.bill, dauVao, null, {}, admin);
    const lan2 = await payBill(tenantId, ID.bill, dauVao, null, {}, admin);

    expect(lan1).toMatchObject({ ok: true });
    expect(lan2, "gửi lại cùng khóa phải được chấp nhận, không báo lỗi").toMatchObject({ ok: true });

    const { data: tra } = await admin.from("payments").select("id").eq("bill_id", ID.bill);
    expect(tra ?? [], "cùng khóa mà vẫn thu tiền hai lần").toHaveLength(1);
  }, 120_000);
});
