// scripts/seed-demo-data.mjs — Dữ liệu vận hành mẫu cho tenant DEMO (mặc định `pho-viet`).
//
// Dùng để chụp ảnh sản phẩm cho trang giới thiệu (MKT-01) và để demo cho khách xem: POS/KDS/
// báo cáo có nội dung thật thay vì màn trống. KHÔNG bao giờ chạy trên tenant của khách hàng
// thật — script từ chối nếu slug không nằm trong DEMO_SLUGS.
//
//   node scripts/seed-demo-data.mjs [slug]
//
// Idempotent: mọi bản ghi mang note='DEMO_DATA'; chạy lại sẽ xóa lứa cũ rồi sinh lại. PRNG có
// hạt giống cố định nên số liệu giữa các lần chạy giống nhau (ảnh chụp lại vẫn khớp).
//
// Cần env (.env.local): POSTGRES_URL_NON_POOLING.
import crypto from "node:crypto";
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const MARK = "DEMO_DATA";
const DEMO_SLUGS = ["pho-viet", "bun-bo"];
const DAYS = 45;

const slug = process.argv[2] ?? "pho-viet";
if (!DEMO_SLUGS.includes(slug)) {
  console.error(`Từ chối: "${slug}" không phải tenant demo. Chỉ cho phép: ${DEMO_SLUGS.join(", ")}.`);
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL_NON_POOLING;
if (!connectionString) {
  console.error("Thiếu POSTGRES_URL_NON_POOLING trong .env.local");
  process.exit(1);
}

const DAY_MS = 86_400_000;
const VN_OFFSET = 7 * 3600 * 1000;

/** PRNG hạt giống cố định — chạy lại cho ra cùng bộ số. */
let seed = 20260812;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const uuid = () => crypto.randomUUID();
// PRNG RIÊNG cho phần nhân viên / hủy / giảm giá (P16) — không rút số từ `rnd` nên lịch bán, món, tiền của các
// lần chạy trước giữ nguyên thứ tự.
let seed2 = 20260928;
const rnd2 = () => ((seed2 = (seed2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick2 = (a) => (a.length ? a[Math.floor(rnd2() * a.length)] : null);

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const tenant = (await client.query("select id from tenants where slug=$1", [slug])).rows[0];
if (!tenant) {
  console.error(`Không tìm thấy tenant "${slug}". Chạy \`npm run seed\` trước.`);
  process.exit(1);
}
const tenantId = tenant.id;

const tables = (await client.query("select id, name from tables where tenant_id=$1 order by sort_order", [tenantId])).rows;
const items = (await client.query("select id, name, base_price from menu_items where tenant_id=$1 and active", [tenantId])).rows;
// Nhân viên để quy đơn / tiền / hủy / giảm giá (báo cáo Nhân viên P16). Không có ai → để trống như trước.
const staff = (
  await client.query("select id, role from memberships where tenant_id=$1 and active and role in ('owner','manager','cashier','waiter')", [tenantId])
).rows;
const nhanDon = staff.filter((m) => ["waiter", "cashier", "owner"].includes(m.role)).map((m) => m.id);
const thuTien = staff.filter((m) => ["cashier", "owner", "manager"].includes(m.role)).map((m) => m.id);
const LY_DO_HUY = ["Khách đổi món", "Hết món", "Gọi nhầm", "Khách chờ lâu"];
if (tables.length === 0 || items.length === 0) {
  console.error("Tenant demo chưa có bàn hoặc món. Chạy `npm run seed` trước.");
  process.exit(1);
}

// ---- 1. Dọn lứa dữ liệu mẫu cũ -----------------------------------------------
// table_sessions không có cột note nên thu id qua orders/bills trước khi xóa chúng.
await client.query("begin");
const oldSessions = (
  await client.query(
    `select distinct ts.id from table_sessions ts
       left join bills  b on b.table_session_id = ts.id and b.note = $2
       left join orders o on o.table_session_id = ts.id and o.note = $2
      where ts.tenant_id = $1 and (b.id is not null or o.id is not null)`,
    [tenantId, MARK]
  )
).rows.map((r) => r.id);

await client.query("delete from bills  where tenant_id=$1 and note=$2", [tenantId, MARK]); // cascade bill_items + payments
// Hóa đơn thử tay trên POS gom món của đơn demo (không mang dấu MARK) — phải xóa trước, không thì đơn demo không xóa được.
await client.query(
  `delete from bills where tenant_id=$1 and id in (
     select bi.bill_id from bill_items bi join order_items oi on oi.id = bi.order_item_id
       join orders o on o.id = oi.order_id where o.tenant_id=$1 and o.note=$2)`,
  [tenantId, MARK]
);
await client.query("delete from orders where tenant_id=$1 and note=$2", [tenantId, MARK]); // cascade order_items
if (oldSessions.length) {
  await client.query("delete from table_sessions where tenant_id=$1 and id = any($2::uuid[])", [tenantId, oldSessions]);
}

// Tên món demo hay bị gõ vội thành chữ thường ("phở ngựa") — viết hoa chữ đầu cho tử tế,
// vì màn POS và thực đơn của tenant demo được dùng làm ảnh trang giới thiệu.
await client.query(
  `update menu_items set name = upper(left(name, 1)) || substr(name, 2)
    where tenant_id = $1 and name <> upper(left(name, 1)) || substr(name, 2)`,
  [tenantId]
);

// ---- 2. Gom bản ghi trong bộ nhớ rồi insert hàng loạt ------------------------
const rows = { sessions: [], orders: [], orderItems: [], bills: [], billItems: [], payments: [] };

/** Một lượt khách trọn vẹn: mở phiên → gọi món → thanh toán → đóng phiên. */
function makePaidVisit(paidAtMs, billNo) {
  const at = new Date(paidAtMs).toISOString();
  const openedAt = new Date(paidAtMs - int(20, 70) * 60_000).toISOString();
  // Chủ yếu ăn tại quán; một phần mang về/giao để báo cáo có đủ 3 kênh.
  const roll = rnd();
  const channel = roll < 0.72 ? "dine_in" : roll < 0.9 ? "takeaway" : "delivery";
  const source = channel === "dine_in" && rnd() < 0.55 ? "qr" : "staff";
  // Chỉ đơn ăn tại chỗ mới gắn bàn; mang về / giao tận nơi không có phiên bàn (giống thật,
  // và để khối "Theo nơi phục vụ" của báo cáo phân loại đúng).
  let sessionId = null;
  if (channel === "dine_in") {
    sessionId = uuid();
    rows.sessions.push([sessionId, tenantId, pick(tables).id, "closed", openedAt, at]);
  }

  const orderId = uuid();
  const createdBy = source === "staff" ? pick2(nhanDon) : null;
  const confirmedBy = source === "qr" && rnd2() < 0.6 ? pick2(nhanDon) : null;
  rows.orders.push([orderId, tenantId, sessionId, channel, source, "completed", MARK, openedAt, at, null, null, createdBy, confirmedBy]);

  let subtotal = 0;
  const lines = [];
  const lineCount = int(1, 4);
  const used = new Set();
  for (let k = 0; k < lineCount; k++) {
    const mi = pick(items);
    if (used.has(mi.id)) continue;
    used.add(mi.id);
    const qty = int(1, 3);
    const amount = mi.base_price * qty;
    subtotal += amount;
    const oiId = uuid();
    rows.orderItems.push([oiId, tenantId, orderId, mi.id, mi.name, mi.base_price, qty, "served", openedAt, at, null, null, null]);
    lines.push({ oiId, qty, price: mi.base_price, amount });
  }
  // ~8% lượt có một món bị hủy (không vào hóa đơn), ghi người hủy + lý do.
  if (rnd2() < 0.08) {
    const mi = items[Math.floor(rnd2() * items.length)];
    const huyLuc = new Date(Date.parse(openedAt) + 5 * 60_000).toISOString();
    rows.orderItems.push([uuid(), tenantId, orderId, mi.id, mi.name, mi.base_price, 1, "cancelled", openedAt, null, pick2([...nhanDon, ...thuTien]), huyLuc, pick2(LY_DO_HUY)]);
  }
  // ~10% hóa đơn giảm 10% (làm tròn nghìn), ghi người duyệt.
  const giam = rnd2() < 0.1 && thuTien.length ? Math.round((subtotal * 0.1) / 1000) * 1000 : 0;
  const total = subtotal - giam;
  const giamBy = giam ? pick2(thuTien) : null;

  const billId = uuid();
  rows.bills.push([billId, tenantId, billNo, sessionId, "paid", subtotal, total, MARK, at, openedAt,
    giam ? "percent" : "none", giam ? 10 : 0, giam, giamBy, giam ? at : null]);
  for (const l of lines) {
    rows.billItems.push([uuid(), tenantId, billId, l.oiId, l.qty, l.price, l.amount]);
  }
  rows.payments.push([uuid(), tenantId, billId, rnd() < 0.7 ? "cash" : "transfer", total, at, MARK, pick2(thuTien)]);
}

// Lịch sử 45 ngày. Cuối tuần đông hơn; giờ dồn quanh trưa 11–13h và tối 18–21h.
const nowMs = Date.now();
for (let d = DAYS - 1; d >= 0; d--) {
  const vnMidnight = Math.floor((nowMs - d * DAY_MS + VN_OFFSET) / DAY_MS) * DAY_MS - VN_OFFSET;
  const dow = new Date(vnMidnight + VN_OFFSET).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  const count = int(weekend ? 16 : 9, weekend ? 26 : 18);

  let billNo = 0;
  for (let i = 0; i < count; i++) {
    const hour = rnd() < 0.42 ? int(11, 13) : int(18, 21);
    const paidAt = vnMidnight + hour * 3600_000 + int(0, 59) * 60_000;
    if (paidAt > nowMs) continue; // chưa tới giờ đó của hôm nay
    makePaidVisit(paidAt, ++billNo);
  }
}

// ---- 3. Trạng thái ĐANG DIỄN RA cho ảnh POS/KDS ------------------------------
// Dọn đơn treo từ những lần thử tay trước đó: đơn để quá 6 tiếng mà vẫn "đang làm" thì
// KDS hiện vé với đồng hồ hàng nghìn giờ và nhãn TRỄ đỏ lòm — hỏng cả ảnh lẫn buổi demo.
// Chỉ đụng tới tenant demo (đã chặn ở đầu file) và chỉ đóng đơn, không xóa gì.
const STALE_HOURS = 6;
const stale = await client.query(
  `update orders set status='completed', updated_at=now()
    where tenant_id=$1
      and status in ('pending_confirm','confirmed','preparing','ready')
      and created_at < now() - interval '${STALE_HOURS} hours'`,
  [tenantId]
);
const staleSessions = await client.query(
  `update table_sessions set status='closed', closed_at=now()
    where tenant_id=$1 and status='open' and opened_at < now() - interval '${STALE_HOURS} hours'`,
  [tenantId]
);
if (stale.rowCount || staleSessions.rowCount) {
  console.log(`Đã đóng ${stale.rowCount} đơn treo và ${staleSessions.rowCount} phiên bàn bỏ quên.`);
}

// Mỗi bàn chỉ 1 phiên mở (uniq_table_session_open). Bỏ qua bàn vẫn còn phiên mở gần đây —
// đó có thể là phiên ai đó đang thao tác thật, script không giành bàn.
const busy = new Set(
  (await client.query("select table_id from table_sessions where tenant_id=$1 and status='open'", [tenantId])).rows.map(
    (r) => r.table_id
  )
);
const liveTables = tables.filter((t) => !busy.has(t.id)).slice(0, 4);
if (liveTables.length < 4) {
  console.warn(`Chỉ còn ${liveTables.length} bàn trống → sinh bấy nhiêu đơn đang chạy.`);
}
const GUESTS = ["Chị Hằng", "Anh Dũng", "Chị Mai", "Anh Tuấn"];

/** Đơn đang chạy: chưa thanh toán, món còn ở bếp → hiện trên KDS và panel POS. */
function makeLiveOrder({ table, guest, itemStatuses, kitchenNo, minutesAgo, orderStatus }) {
  const createdAt = new Date(nowMs - minutesAgo * 60_000).toISOString();
  const confirmedAt = orderStatus === "pending_confirm" ? null : createdAt;

  const sessionId = uuid();
  rows.sessions.push([sessionId, tenantId, table.id, "open", createdAt, null]);

  const orderId = uuid();
  rows.orders.push([
    orderId,
    tenantId,
    sessionId,
    "dine_in",
    "qr",
    orderStatus,
    MARK,
    createdAt,
    confirmedAt,
    kitchenNo,
    JSON.stringify({ name: guest }),
    null,
    null,
  ]);

  itemStatuses.forEach((st, idx) => {
    const mi = items[(idx * 3 + (kitchenNo ?? 0)) % items.length];
    rows.orderItems.push([uuid(), tenantId, orderId, mi.id, mi.name, mi.base_price, int(1, 2), st, createdAt, null, null, null, null]);
  });
}

// minutesAgo phải < 10 (ngưỡng TRỄ của KDS) để vé demo không bị gắn nhãn đỏ.
const LIVE = [
  { orderStatus: "confirmed", itemStatuses: ["queued", "queued", "queued"], kitchenNo: 12, minutesAgo: 2 },
  { orderStatus: "preparing", itemStatuses: ["preparing", "preparing"], kitchenNo: 13, minutesAgo: 5 },
  { orderStatus: "confirmed", itemStatuses: ["ready", "queued"], kitchenNo: 14, minutesAgo: 1 },
  // Đơn khách gọi qua QR còn chờ duyệt → POS hiện banner "Đơn chờ duyệt" (ORDER-12).
  { orderStatus: "pending_confirm", itemStatuses: ["queued", "queued"], kitchenNo: null, minutesAgo: 1 },
];
liveTables.forEach((table, i) => makeLiveOrder({ table, guest: GUESTS[i], ...LIVE[i] }));

// ---- 4. Insert hàng loạt ----------------------------------------------------
/** Chèn nhiều dòng bằng một câu lệnh (chia lô) — nhanh hơn hẳn insert từng dòng qua mạng. */
async function bulkInsert(table, cols, data, chunk = 300) {
  for (let i = 0; i < data.length; i += chunk) {
    const slice = data.slice(i, i + chunk);
    const values = slice
      .map((row, r) => `(${row.map((_, c) => `$${r * cols.length + c + 1}`).join(",")})`)
      .join(",");
    await client.query(`insert into ${table} (${cols.join(",")}) values ${values}`, slice.flat());
  }
}

await bulkInsert("table_sessions", ["id", "tenant_id", "table_id", "status", "opened_at", "closed_at"], rows.sessions);
await bulkInsert(
  "orders",
  ["id", "tenant_id", "table_session_id", "channel", "source", "status", "note", "created_at", "confirmed_at", "kitchen_no", "customer_contact", "created_by", "confirmed_by"],
  rows.orders
);
await bulkInsert(
  "order_items",
  ["id", "tenant_id", "order_id", "menu_item_id", "name_snapshot", "unit_price_snapshot", "qty", "status", "created_at", "prepared_at", "cancelled_by", "cancelled_at", "cancel_reason"],
  rows.orderItems
);
await bulkInsert(
  "bills",
  ["id", "tenant_id", "bill_no", "table_session_id", "status", "subtotal", "total", "note", "paid_at", "created_at",
    "discount_type", "discount_value", "discount_amount", "discount_by", "discount_at"],
  rows.bills
);
await bulkInsert(
  "bill_items",
  ["id", "tenant_id", "bill_id", "order_item_id", "qty_allocated", "unit_price_snapshot", "amount"],
  rows.billItems
);
await bulkInsert("payments", ["id", "tenant_id", "bill_id", "method", "amount", "received_at", "note", "received_by"], rows.payments);

await client.query("commit");

const revenue = rows.bills.reduce((s, b) => s + b[6], 0);
console.log(
  `Tenant "${slug}": ${rows.bills.length} hóa đơn / ${revenue.toLocaleString("vi-VN")}đ trong ${DAYS} ngày, ` +
    `${rows.orderItems.length} dòng món, 4 đơn đang chạy (1 chờ duyệt).`
);
await client.end();
