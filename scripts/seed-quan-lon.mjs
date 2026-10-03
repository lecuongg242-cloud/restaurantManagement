// scripts/seed-quan-lon.mjs — Dựng quán demo `pho-viet` QUY MÔ LỚN để thử giao diện quản lý order: ~210 bàn chia 5 khu,
// ~120 món, 150 bàn đang phục vụ CÙNG LÚC (giờ cao điểm tối) với đủ trạng thái: chờ duyệt QR, chưa in phiếu bếp, đang làm,
// xong chờ bưng, đã phục vụ, món hủy, ghi chú, gọi nhân viên, đặt bàn sắp tới, đơn mang về.
//
//   node scripts/seed-quan-lon.mjs
//
// XÓA SẠCH mọi đơn / hóa đơn / phiên bàn / phiếu in / gọi nhân viên / đặt bàn CŨ của quán (chủ dự án 03/10/2026: "bỏ hết các
// đơn cũ và đơn đang có đi để test mới"). Bàn, món, khu thêm theo tên (chạy lại không nhân đôi). CHỈ quán demo.
import crypto from "node:crypto";
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const SLUG = "pho-viet";
const DEMO = ["pho-viet", "bun-bo"];
if (!DEMO.includes(SLUG)) throw new Error("Chỉ chạy trên quán demo");
const LIVE_TABLES = 150;

const client = new pg.Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING.replace(/[?&]sslmode=[^&]*/, ""),
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const q = (sql, p) => client.query(sql, p);

let seed = 20261004;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const uuid = () => crypto.randomUUID();
const pad = (n, w = 2) => String(n).padStart(w, "0");

const T = (await q("select id from tenants where slug=$1", [SLUG])).rows[0].id;
const staff = (await q("select id, role from memberships where tenant_id=$1 and active", [T])).rows;
const waiters = staff.filter((s) => ["waiter", "cashier", "owner"].includes(s.role)).map((s) => s.id);
const now = Date.now();
const ago = (min) => new Date(now - min * 60_000).toISOString();

// ---- 1. Xóa đơn cũ ---------------------------------------------------------------------------------------------------
await q("begin");
await q("delete from print_jobs where tenant_id=$1", [T]);
await q("delete from staff_calls where tenant_id=$1", [T]);
await q("delete from reservations where tenant_id=$1", [T]);
await q("delete from bills where tenant_id=$1", [T]); // cascade bill_items, payments
await q("delete from orders where tenant_id=$1", [T]); // cascade order_items, modifiers
await q("delete from table_sessions where tenant_id=$1", [T]);
await q("update tables set status='available', group_session_id=null, updated_at=now() where tenant_id=$1", [T]);
await q("commit");
console.log("Đã xóa toàn bộ đơn / hóa đơn / phiên bàn cũ.");

// ---- 2. Khu + bàn ----------------------------------------------------------------------------------------------------
const AREAS = [
  { name: "Tầng 1", prefix: "A", n: 60, seats: [2, 4, 4, 6] },
  { name: "Tầng 2", prefix: "B", n: 60, seats: [4, 4, 6, 8] },
  { name: "Tầng 3", prefix: "C", n: 40, seats: [4, 6, 8, 10] },
  { name: "Sân vườn", prefix: "S", n: 30, seats: [4, 6] },
  { name: "Phòng VIP", prefix: "VIP", n: 12, seats: [10, 12, 15] },
];
let sort = 100;
for (const [ai, a] of AREAS.entries()) {
  let area = (await q("select id from areas where tenant_id=$1 and name=$2", [T, a.name])).rows[0];
  if (!area) area = (await q("insert into areas (tenant_id, name, sort_order) values ($1,$2,$3) returning id", [T, a.name, ai])).rows[0];
  for (let i = 1; i <= a.n; i++) {
    const name = a.prefix === "VIP" ? `VIP ${i}` : `${a.prefix}${pad(i)}`;
    await q(
      `insert into tables (tenant_id, area_id, name, seats, sort_order)
       select $1,$2,$3,$4,$5 where not exists (select 1 from tables where tenant_id=$1 and name=$3)`,
      [T, area.id, name, pick(a.seats), sort++]
    );
  }
}
const tables = (
  await q("select t.id, t.name, a.name area from tables t left join areas a on a.id=t.area_id where t.tenant_id=$1 order by t.sort_order", [T])
).rows;
console.log(`Bàn: ${tables.length}`);

// ---- 3. Menu --------------------------------------------------------------------------------------------------------
const MENU = {
  "Phở": [["Phở bò tái", 55000], ["Phở bò chín", 55000], ["Phở tái lăn", 65000], ["Phở bò viên", 55000], ["Phở gầu", 60000],
    ["Phở nạm", 60000], ["Phở tái nạm gầu", 70000], ["Phở đặc biệt", 85000], ["Phở gà ta", 55000], ["Phở gà đùi", 65000],
    ["Phở xào bò", 70000], ["Phở cuốn (đĩa)", 75000], ["Phở trộn", 60000], ["Phở sốt vang", 75000]],
  "Bún – Miến": [["Bún bò Huế đặc biệt", 75000], ["Bún chả Hà Nội", 55000], ["Bún riêu cua", 50000], ["Bún mọc", 50000],
    ["Bún thang", 60000], ["Bún cá rô đồng", 55000], ["Miến lươn trộn", 65000], ["Miến lươn nước", 65000], ["Miến gà", 50000],
    ["Bún ốc", 50000], ["Bún đậu mắm tôm", 60000]],
  "Cơm": [["Cơm rang dưa bò", 65000], ["Cơm rang hải sản", 75000], ["Cơm sườn nướng", 60000], ["Cơm gà Hải Nam", 65000],
    ["Cơm bò lúc lắc", 85000], ["Cơm cá kho tộ", 70000], ["Cơm thịt kho trứng", 60000], ["Cơm chiên dương châu", 60000],
    ["Cơm tấm bì chả", 55000], ["Cơm niêu cá kho", 120000]],
  "Khai vị": [["Nem rán Hà Nội", 60000], ["Nem cua bể", 90000], ["Chả mực Hạ Long", 120000], ["Gỏi ngó sen tôm thịt", 85000],
    ["Nộm bò khô", 55000], ["Đậu phụ chiên giòn", 40000], ["Khoai tây chiên", 40000], ["Chả lá lốt", 60000], ["Bánh cuốn nóng", 50000],
    ["Quẩy (đĩa)", 15000], ["Trứng chần", 10000], ["Bò bía", 45000]],
  "Món nhậu": [["Bò lúc lắc khoai", 150000], ["Gà rang muối", 180000], ["Lẩu thái hải sản", 350000], ["Lẩu bò nhúng dấm", 320000],
    ["Mực chiên nước mắm", 160000], ["Tôm rang muối", 180000], ["Sườn sụn rang muối", 150000], ["Ếch chiên bơ tỏi", 140000],
    ["Ngao hấp sả", 120000], ["Ốc hương xào bơ", 180000], ["Cá lăng nướng", 220000], ["Dê tái chanh", 190000]],
  "Rau – Canh": [["Rau muống xào tỏi", 45000], ["Cải chíp xào nấm", 50000], ["Rau lang luộc", 35000], ["Canh cua rau đay", 50000],
    ["Canh chua cá", 70000], ["Ngồng cải xào", 50000], ["Su su xào trứng", 45000]],
  "Đồ uống": [["Trà chanh", 20000], ["Trà đào cam sả", 35000], ["Nước sấu", 25000], ["Nước mía", 20000], ["Sinh tố bơ", 40000],
    ["Sinh tố xoài", 40000], ["Nước dừa tươi", 35000], ["Coca-Cola", 20000], ["Pepsi", 20000], ["7Up", 20000], ["Sting", 20000],
    ["Nước suối", 12000], ["Trà đá (bình)", 10000], ["Cà phê đen", 20000], ["Bạc xỉu", 30000]],
  "Bia – Rượu": [["Bia Sài Gòn", 25000], ["Bia Tiger", 30000], ["Bia Heineken", 35000], ["Bia hơi Hà Nội (cốc)", 15000],
    ["Bia Trúc Bạch", 30000], ["Rượu nếp cái hoa vàng (chai)", 120000], ["Rượu ngô (bình 0,5 l)", 80000], ["Vang Đà Lạt", 250000]],
  "Tráng miệng": [["Chè thập cẩm", 30000], ["Chè khúc bạch", 35000], ["Sữa chua nếp cẩm", 30000], ["Hoa quả theo mùa", 60000],
    ["Kem dừa", 40000], ["Bánh flan", 25000]],
  "Thêm": [["Thêm bánh phở", 10000], ["Thêm thịt bò", 25000], ["Thêm rau thơm", 5000], ["Thêm trứng", 10000], ["Thêm bún", 10000]],
};
const cats = {};
let cSort = 10;
for (const name of Object.keys(MENU)) {
  let c = (await q("select id from menu_categories where tenant_id=$1 and name=$2", [T, name])).rows[0];
  if (!c) c = (await q("insert into menu_categories (tenant_id, name, sort_order) values ($1,$2,$3) returning id", [T, name, cSort++])).rows[0];
  cats[name] = c.id;
  let iSort = 0;
  for (const [item, price] of MENU[name]) {
    await q(
      `insert into menu_items (tenant_id, category_id, name, base_price, sort_order)
       select $1,$2,$3,$4,$5 where not exists (select 1 from menu_items where tenant_id=$1 and name=$3)`,
      [T, c.id, item, price, iSort++]
    );
  }
}
// Gắn nhóm tùy chọn cho phở / bún (Size, Topping) và đồ uống (Mức đá) như món cũ.
const groups = Object.fromEntries((await q("select id, name from modifier_groups where tenant_id=$1", [T])).rows.map((g) => [g.name, g.id]));
const items = (
  await q(
    `select m.id, m.name, m.base_price, c.name cat from menu_items m join menu_categories c on c.id=m.category_id
      where m.tenant_id=$1 and m.active`,
    [T]
  )
).rows;
for (const it of items) {
  const want = /^(Phở|Bún|Miến)/.test(it.name) ? ["Size", "Topping"] : ["Đồ uống"].includes(it.cat) && /Trà|Nước|Sinh tố|Cà phê|Bạc xỉu/.test(it.name) ? ["Mức đá"] : [];
  for (const g of want)
    if (groups[g])
      await q(
        `insert into menu_item_modifier_groups (tenant_id, item_id, group_id) select $1,$2,$3
          where not exists (select 1 from menu_item_modifier_groups where item_id=$2 and group_id=$3)`,
        [T, it.id, groups[g]]
      );
}
// 5 món đang hết (POS hiện "Hết").
await q("update menu_items set is_available=true where tenant_id=$1", [T]);
await q("update menu_items set is_available=false where tenant_id=$1 and name = any($2)", [T,
  ["Nem cua bể", "Cá lăng nướng", "Dê tái chanh", "Chè khúc bạch", "Vang Đà Lạt"]]);
console.log(`Món: ${items.length} (5 món đang hết)`);

// ---- 4. 150 bàn đang phục vụ -----------------------------------------------------------------------------------------
const sellable = items.filter((i) => !["Nem cua bể", "Cá lăng nướng", "Dê tái chanh", "Chè khúc bạch", "Vang Đà Lạt"].includes(i.name));
const byCat = (re) => sellable.filter((i) => re.test(i.cat));
const MAIN = byCat(/Phở|Bún|Cơm/);
const SIDE = byCat(/Khai vị|Rau|Món nhậu/);
const DRINK = byCat(/Đồ uống|Bia/);
const NOTES = ["Không hành", "Ít cay", "Nhiều rau", "Không mì chính", "Mang ra trước", "Bánh mềm", "Để riêng nước", "Không đá"];
const linksByItem = new Map();
for (const r of (await q("select item_id, group_id from menu_item_modifier_groups where tenant_id=$1", [T])).rows)
  linksByItem.set(r.item_id, [...(linksByItem.get(r.item_id) ?? []), r.group_id]);
const optsByGroup = new Map();
for (const r of (await q("select id, group_id, name, price_delta from modifier_options where tenant_id=$1", [T])).rows)
  optsByGroup.set(r.group_id, [...(optsByGroup.get(r.group_id) ?? []), r]);

const rows = { sessions: [], orders: [], items: [], mods: [], jobs: [], calls: [] };
const shuffled = [...tables].sort(() => rnd() - 0.5);
const live = shuffled.slice(0, LIVE_TABLES);
const orderMeta = []; // để gán kitchen_no theo thời gian xác nhận

function addOrder({ sessionId, tableId, channel, source, createdMin, pending, contact }) {
  const orderId = uuid();
  const created = ago(createdMin);
  const lines = [];
  const nMain = channel === "takeaway" ? int(1, 3) : int(1, 4);
  for (let i = 0; i < nMain; i++) lines.push([pick(MAIN), int(1, 3)]);
  if (rnd() < 0.5) lines.push([pick(SIDE), int(1, 2)]);
  if (rnd() < 0.8) lines.push([pick(DRINK), int(1, 6)]);
  // Trạng thái món theo luồng P27 (QD-032): bếp bấm "Xong" → 'ready'; phục vụ bấm "Mang ra" → delivered_at. Chưa thanh toán
  // nên không có 'served' (= đã thu tiền). Mới gọi → chờ làm; 5–15 phút → nửa xong; 15–25 phút → phần lớn đã mang ra; lâu hơn
  // → gần hết đã mang ra, thỉnh thoảng còn món xong chưa bưng.
  const itemStatus = () => {
    if (pending || createdMin < 5) return { st: "queued", delivered: false };
    if (createdMin < 15) return rnd() < 0.5 ? { st: "ready", delivered: false } : { st: "queued", delivered: false };
    if (createdMin < 25) {
      const r = rnd();
      return r < 0.7 ? { st: "ready", delivered: true } : r < 0.9 ? { st: "ready", delivered: false } : { st: "queued", delivered: false };
    }
    return rnd() < 0.97 ? { st: "ready", delivered: true } : { st: "ready", delivered: false };
  };
  const sts = [];
  for (const [mi, qty] of lines) {
    const oiId = uuid();
    const tt = itemStatus();
    let st = tt.st;
    let cancelledAt = null;
    if (!pending && rnd() < 0.03) {
      st = "cancelled";
      cancelledAt = ago(Math.max(0, createdMin - 2));
    }
    sts.push(st);
    const chosen = [];
    for (const g of linksByItem.get(mi.id) ?? []) {
      const opts = optsByGroup.get(g) ?? [];
      if (!opts.length) continue;
      const gname = Object.keys(groups).find((k) => groups[k] === g);
      if (gname === "Size" || gname === "Mức đá") chosen.push(pick(opts));
      else if (rnd() < 0.3) chosen.push(pick(opts));
    }
    const unit = mi.base_price + chosen.reduce((s, o) => s + o.price_delta, 0);
    rows.items.push([oiId, T, orderId, mi.id, mi.name, unit, qty, rnd() < 0.12 ? pick(NOTES) : null, st,
      st === "cancelled" ? "Khách đổi món" : null, st === "cancelled" ? pick(waiters) : null,
      ["ready", "served"].includes(st) ? ago(Math.max(0, createdMin - int(3, 10))) : null, created, cancelledAt,
      st === "ready" && tt.delivered ? ago(Math.max(0, createdMin - int(10, 15))) : null]);
    for (const o of chosen) rows.mods.push([uuid(), T, oiId, o.id, o.name, o.price_delta]);
  }
  const alive = sts.filter((s) => s !== "cancelled");
  // Đơn mang về giữ trạng thái đơn (QD-032 D4: chỉ đơn tại bàn tự đổi theo món).
  const status = pending ? "pending_confirm"
    : channel !== "dine_in" ? "confirmed"
    : alive.every((s) => s === "served") ? "served"
    : alive.every((s) => s === "served" || s === "ready") ? "ready"
    : alive.some((s) => s !== "queued") ? "preparing" : "confirmed";
  rows.orders.push([orderId, T, sessionId, channel, source, status, pending ? null : created, pending ? null : (source === "staff" ? pick(waiters) : null),
    source === "staff" ? pick(waiters) : null, created, created, contact ? JSON.stringify(contact) : null, tableId]);
  if (!pending) orderMeta.push({ orderId, created, createdMin });
  return orderId;
}

let unprinted = 0;
for (const [i, t] of live.entries()) {
  const openedMin = int(3, 110);
  const sessionId = uuid();
  rows.sessions.push([sessionId, T, t.id, "open", ago(openedMin), pick(waiters)]);
  // Lượt gọi: lần đầu lúc mở bàn, gọi thêm cách nhau 10–30 phút.
  let m = openedMin;
  const rounds = openedMin > 60 ? int(1, 3) : openedMin > 25 ? int(1, 2) : 1;
  for (let r = 0; r < rounds && m >= 0; r++) {
    const isLast = r === rounds - 1;
    // ~6% bàn: lượt cuối khách tự gọi qua QR, đang CHỜ DUYỆT.
    const pending = isLast && i % 17 === 5;
    const source = pending || rnd() < 0.35 ? "qr" : "staff";
    const id = addOrder({ sessionId, tableId: t.id, channel: "dine_in", source, createdMin: m, pending });
    // Phiếu bếp: đơn đã xác nhận thì đã in, trừ ~10 đơn mới nhất (POS hiện "Đơn cần in phiếu").
    if (!pending) {
      if (m < 10 && unprinted < 10 && rnd() < 0.6) unprinted++;
      else rows.jobs.push([uuid(), T, "kitchen_ticket", "kitchen", JSON.stringify({ orderId: id }), "printed", ago(Math.max(0, m - 0.5)), ago(Math.max(0, m - 0.5))]);
    }
    m -= int(10, 30);
  }
  // Ghi chú đúng như khách gửi từ QR (CallStaffSheet): gọi thanh toán mở đầu "Thanh toán" → vào hàng chờ thanh toán (ORDER-26).
  if (i % 13 === 3)
    rows.calls.push([uuid(), T, t.id, t.name, "pending",
      pick(["Thanh toán · Tiền mặt", "Thanh toán · Chuyển khoản", "Thanh toán", "Thêm bát/đũa", "Khăn giấy", null]), ago(int(1, 9))]);
}
// Mang về: 12 đơn không gắn bàn.
const GUESTS = ["Anh Nam", "Chị Thu", "Grab - 0912", "Anh Hoàng", "Chị Linh", "ShopeeFood - 0988", "Anh Quân", "Chị Vy", "Anh Tú", "Chị Hà", "Anh Long", "Chị Ngọc"];
for (const g of GUESTS) {
  const id = addOrder({ sessionId: null, tableId: null, channel: "takeaway", source: "staff", createdMin: int(1, 35), pending: false, contact: { name: g } });
  rows.jobs.push([uuid(), T, "kitchen_ticket", "kitchen", JSON.stringify({ orderId: id }), "printed", ago(1), ago(1)]);
}
// Số bếp theo thứ tự xác nhận trong ngày.
orderMeta.sort((a, b) => b.createdMin - a.createdMin);
const kno = new Map(orderMeta.map((o, i) => [o.orderId, i + 1]));
for (const o of rows.orders) {
  const k = kno.get(o[0]);
  o.push(k ?? null);
}

async function bulk(table, cols, data, chunk = 200) {
  for (let i = 0; i < data.length; i += chunk) {
    const s = data.slice(i, i + chunk);
    await q(`insert into ${table} (${cols.join(",")}) values ${s.map((r, ri) => `(${r.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(",")})`).join(",")}`, s.flat());
  }
}
await q("begin");
await bulk("table_sessions", ["id", "tenant_id", "table_id", "status", "opened_at", "opened_by"], rows.sessions);
await bulk("orders", ["id", "tenant_id", "table_session_id", "channel", "source", "status", "confirmed_at", "confirmed_by", "created_by", "created_at",
  "updated_at", "customer_contact", "table_id", "kitchen_no"], rows.orders);
await bulk("order_items", ["id", "tenant_id", "order_id", "menu_item_id", "name_snapshot", "unit_price_snapshot", "qty", "note", "status",
  "cancel_reason", "cancelled_by", "prepared_at", "created_at", "cancelled_at", "delivered_at"], rows.items);
await bulk("order_item_modifiers", ["id", "tenant_id", "order_item_id", "option_id", "name_snapshot", "price_delta_snapshot"], rows.mods);
await bulk("print_jobs", ["id", "tenant_id", "type", "target_station", "payload", "status", "created_at", "printed_at"], rows.jobs);
await bulk("staff_calls", ["id", "tenant_id", "table_id", "table_name", "status", "note", "created_at"], rows.calls);
await q("update tables set status='occupied', updated_at=now() where id = any($1::uuid[])", [live.map((t) => t.id)]);
// Đặt bàn tối nay trên 6 bàn còn trống.
const free = shuffled.slice(LIVE_TABLES, LIVE_TABLES + 6);
for (const [i, t] of free.entries()) {
  await q(
    `insert into reservations (tenant_id, customer_name, customer_phone, party_size, reserved_at, status, table_id)
     values ($1,$2,$3,$4,$5,'confirmed',$6)`,
    [T, ["Anh Minh", "Chị Lan", "Công ty ABC", "Anh Đức", "Chị Phương", "Anh Khoa"][i], `09${int(10000000, 99999999)}`, int(4, 12),
      new Date(now + (30 + i * 20) * 60_000).toISOString(), t.id]
  );
}
await q("commit");

const st = (await q(
  `select o.status, count(*) n from orders o where o.tenant_id=$1 group by 1 order by 1`, [T])).rows;
const its = (await q(`select status, count(*) n, sum(qty) q from order_items where tenant_id=$1 group by 1 order by 1`, [T])).rows;
console.log(`Bàn đang phục vụ: ${live.length}, đơn: ${rows.orders.length} (mang về ${GUESTS.length}), dòng món: ${rows.items.length}, chưa in: ${unprinted}, gọi NV: ${rows.calls.length}, đặt bàn: ${free.length}`);
console.log("Đơn theo trạng thái:", st.map((r) => `${r.status} ${r.n}`).join(", "));
console.log("Món theo trạng thái:", its.map((r) => `${r.status} ${r.n} dòng/${r.q} phần`).join(", "));
await client.end();
