// scripts/seed-kho-demo.mjs — Dữ liệu KHO 7 ngày cho quán demo `pho-viet`: nguyên liệu, định lượng, nhà cung cấp, đơn bán,
// phiếu nhập (kể cả nhập nhầm → hủy → sao chép, phiếu tạm sửa hôm sau, nhập bổ sung khác giá, phiếu không giá), mẻ nước
// dùng hụt, xuất hủy, kiểm kê cuối ngày (kể cả gõ nhầm rồi đếm lại) — để thử luồng nhập kho → bán → hao hụt từ đầu tới cuối.
//
//   node scripts/seed-kho-demo.mjs --out kho-demo.json      7 ngày tính tới HÔM NAY − 7 (giờ VN), đáp án ra kho-demo.json
//   node scripts/seed-kho-demo.mjs --den 2026-10-02         7 ngày kết thúc ngày chỉ định
//   node scripts/doi-chieu-kho-demo.mjs kho-demo.json       đối chiếu bản chốt sổ với đáp án (sau khi mở khu Kho hàng)
//
// Kịch bản từng ngày + cách đọc kết quả: docs/40-KiemTra/KichBan-Kho-PhoViet.md.
//
// "Kho thật" được MÔ PHỎNG song song (bếp múc dư, gà lọc xương, mất bia, giò hỏng không ghi…) — số đếm kiểm kê lấy từ kho
// thật, nên hệ thống phải tự tìm ra hao hụt. Đáp án (sổ từng ngày tính ĐỘC LẬP bằng JS) ghi ra file JSON (tham số --out) để
// đối chiếu với bản chốt sổ sau khi app tự chốt.
//
// Phiếu nhập / mẻ đi qua ĐÚNG RPC của app (save_purchase_receipt, cancel_purchase_receipt, copy_purchase_receipt,
// update_purchase_receipt_meta, record_batch) dưới danh nghĩa chủ quán, rồi lùi ngày giờ về ngày mô phỏng (RPC chỉ nhận thời
// gian nhập trong 7 ngày gần nhất). Lùi ngày = đặt `occurred_at` (P34, 0085): `business_date` do trigger tính từ nó.
// Chạy lại = xóa sạch dữ liệu kho của quán + đơn KHO_DEMO rồi sinh lại.
//
// CHỈ chạy trên quán demo. Cần POSTGRES_URL_NON_POOLING (.env.local).
import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const SLUG = "pho-viet";
const MARK = "KHO_DEMO";
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const OUT = arg("--out");
// 7 ngày kết thúc HÔM NAY − 7 (giờ VN): sổ kho để mở 7 ngày (P34, QD-034 D4) nên chỉ ngày ≤ hôm nay − 7 mới tự chốt — app
// chốt đủ 7 ngày mô phỏng; 7 ngày gần nhất còn trống cho thao tác tay / E2E kho-thuc-te.
const addDay = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const END = arg("--den") ?? addDay(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), -7);
const DAYS = [-6, -5, -4, -3, -2, -1, 0].map((n) => addDay(END, n));
// Sự kiện đặt theo THỨ TỰ ngày (N1…N7), không theo ngày lịch — chạy hôm nào kịch bản cũng như nhau.
const [N1, N2, , N4, N5, N6, N7] = DAYS;

const client = new pg.Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING.replace(/[?&]sslmode=[^&]*/, ""),
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const q = (sql, params) => client.query(sql, params);

const tenant = (await q("select id from tenants where slug=$1", [SLUG])).rows[0];
if (!tenant) throw new Error(`Không thấy quán ${SLUG}`);
const T = tenant.id;
const owner = (
  await q("select m.id, m.user_id from memberships m where m.tenant_id=$1 and m.role='owner' and m.active limit 1", [T])
).rows[0];

// ---- PRNG cố định ------------------------------------------------------------------------------------------------
let seed = 20261003;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pickW = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
};
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const uuid = () => crypto.randomUUID();
const r3 = (n) => Math.round(n * 1000) / 1000;
const pad = (n) => String(n).padStart(2, "0");
/** Mốc UTC ISO của giờ VN trong ngày `day`. */
const at = (day, h, m = 0, s = 0) => new Date(`${day}T${pad(h)}:${pad(m)}:${pad(s)}+07:00`).toISOString();

// ---- Danh mục -----------------------------------------------------------------------------------------------------
// real: lượng thật bếp dùng / định lượng khai (ẩn với hệ thống). step: độ chính xác khi đếm (đơn vị gốc).
const ING = [
  { k: "bo", name: "Thịt bò thăn", base: "g", pu: "kg", f: 1000, price: 280000, count: true, real: 1.12, noise: 0.02, step: 50 },
  { k: "ngua", name: "Thịt ngựa", base: "g", pu: "kg", f: 1000, price: 250000, count: true, real: 1.0, noise: 0.01, step: 50 },
  { k: "banhpho", name: "Bánh phở", base: "g", pu: "kg", f: 1000, price: 18000, count: true, real: 1.03, noise: 0.03, step: 100 },
  { k: "bun", name: "Bún tươi", base: "g", pu: "kg", f: 1000, price: 15000, count: false, real: 1.05, noise: 0.03 },
  { k: "xuong", name: "Xương ống bò", base: "kg", pu: "kg", f: 1, price: 45000, count: false, real: 1.0, noise: 0 },
  { k: "hanh", name: "Hành tây", base: "g", pu: "kg", f: 1000, price: 25000, count: false, real: 1.0, noise: 0 },
  { k: "gio", name: "Giò heo", base: "g", pu: "kg", f: 1000, price: 95000, count: true, real: 1.0, noise: 0.04, step: 50 },
  { k: "ga", name: "Gà ta", base: "g", pu: "kg", f: 1000, price: 130000, count: true, real: 1 / 0.85, noise: 0.02, step: 100 },
  { k: "gao", name: "Gạo tám", base: "g", pu: "kg", f: 1000, price: 20000, count: false, real: 1.0, noise: 0.02 },
  { k: "rau", name: "Rau thơm", base: "g", pu: "kg", f: 1000, price: 40000, count: false, real: 1.2, noise: 0.1 },
  { k: "tom", name: "Tôm sú", base: "g", pu: "kg", f: 1000, price: 220000, count: true, real: 1.02, noise: 0.02, step: 50 },
  { k: "banhtrang", name: "Bánh tráng", base: "cai", pu: "xấp", f: 50, price: 25000, count: false, real: 1.05, noise: 0.05 },
  { k: "bia", name: "Bia Hà Nội", base: "cai", pu: "thùng", f: 24, price: 360000, count: true, real: 1.0, noise: 0, step: 1 },
  { k: "cam", name: "Cam sành", base: "g", pu: "kg", f: 1000, price: 30000, count: false, real: 1.1, noise: 0.05 },
  // Bán thành phẩm: 1 mẻ = 30 lít; bếp múc thật 0,42 l/bát thay vì 0,4.
  { k: "nuocdung", name: "Nước dùng phở", base: "l", pu: null, f: 1, kind: "prepared", batch: 30, count: true, real: 1.05, noise: 0.01, step: 0.5 },
];
const byK = Object.fromEntries(ING.map((i) => [i.k, i]));

const RECIPES = {
  "Phở bò tái": { banhpho: 150, bo: 80, nuocdung: 0.4, rau: 20 },
  "Phở ngựa": { banhpho: 150, ngua: 80, nuocdung: 0.4, rau: 20 },
  "Bún bò Huế": { bun: 150, gio: 120, bo: 40, rau: 20 },
  "Cơm gà xối mỡ": { gao: 120, ga: 200 },
  "Gỏi cuốn": { banhtrang: 2, tom: 40, bun: 30, rau: 10 },
  Bia: { bia: 1 },
  "Nước cam": { cam: 400 },
};
const OPTION_RECIPES = { "Thêm thịt": { bo: 50 }, "Thêm bánh": { banhpho: 100 } };
const BATCH_RECIPE = { nuocdung: { xuong: 8, hanh: 800 } };

const SUPPLIERS = [
  { k: "thit", name: "Thanh Tuấn", phone: null, note: "Thịt bò, thịt ngựa" },
  { k: "cho", name: "Chợ Long Biên – cô Hoa", phone: "0912000111", note: "Bánh phở, bún, rau, cam" },
  { k: "ga", name: "Gà ta Sóc Sơn – anh Bình", phone: "0988000222", note: "Gà, giò, tôm, xương, gạo" },
  { k: "bia", name: "Đại lý bia Hà Nội", phone: "0243000333", note: "Giao bia thùng" },
];
const SUP_OF = { bo: "thit", ngua: "thit", banhpho: "cho", bun: "cho", rau: "cho", cam: "cho", hanh: "cho", banhtrang: "cho",
  ga: "ga", gio: "ga", tom: "ga", xuong: "ga", gao: "ga", bia: "bia" };
// Giá theo ngày (đ / đơn vị nhập) — thịt bò lên giá từ N5, tôm từ N6.
const PRICE_ON = (k, day) => {
  const base = byK[k].price;
  if (k === "bo") return day >= N5 ? 285000 : base;
  if (k === "tom") return day >= N6 ? 230000 : base;
  return base;
};

// ---- 1. Dọn dữ liệu cũ (chỉ quán này) -----------------------------------------------------------------------------
console.log("Dọn dữ liệu kho cũ của", SLUG);
await q("begin");
await q("delete from daily_closes where tenant_id=$1", [T]);
await q("delete from stock_entries where tenant_id=$1", [T]);
await q("delete from stock_counts where tenant_id=$1", [T]);
await q("delete from production_batches where tenant_id=$1", [T]);
await q("delete from cash_voucher_allocations where tenant_id=$1", [T]);
await q("delete from cash_vouchers where tenant_id=$1 and (purchase_receipt_id is not null or source in ('purchase','supplier_payment'))", [T]);
await q("update purchase_receipts set copied_from=null where tenant_id=$1", [T]);
await q("delete from purchase_receipts where tenant_id=$1", [T]);
await q("delete from recipe_lines where tenant_id=$1", [T]);
await q("delete from ingredients where tenant_id=$1", [T]);
const oldSessions = (
  await q("select distinct table_session_id id from orders where tenant_id=$1 and note=$2 and table_session_id is not null", [T, MARK])
).rows.map((r) => r.id);
await q("delete from print_jobs where tenant_id=$1 and payload->>'mark'=$2", [T, MARK]);
await q("delete from bills where tenant_id=$1 and note=$2", [T, MARK]);
await q("delete from orders where tenant_id=$1 and note=$2", [T, MARK]);
if (oldSessions.length) await q("delete from table_sessions where id = any($1::uuid[])", [oldSessions]);
await q("commit");

// ---- 2. Danh mục: nguyên liệu, định lượng, NCC ---------------------------------------------------------------------
const setupAt = at(addDay(N1, -1), 20, 0);
const ingId = {};
for (const i of ING) {
  const id = uuid();
  ingId[i.k] = id;
  await q(
    `insert into ingredients (id, tenant_id, name, kind, base_unit, purchase_unit, purchase_factor, yield_pct, must_count,
       batch_output_qty, last_unit_cost, last_cost_at, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,100,$8,$9,$10,$11,$12,$12)`,
    [id, T, i.name, i.kind ?? "purchased", i.base, i.pu, i.f, i.count, i.batch ?? null,
      i.kind === "prepared" ? null : Math.round((i.price / i.f) * 1e6) / 1e6, i.kind === "prepared" ? null : setupAt, setupAt]
  );
}
const items = (await q("select id, name, base_price from menu_items where tenant_id=$1 and active", [T])).rows;
const itemByName = Object.fromEntries(items.map((m) => [m.name, m]));
const opts = (
  await q(
    `select o.id, o.name, o.price_delta, g.name grp, g.required from modifier_options o join modifier_groups g on g.id=o.group_id
      where o.tenant_id=$1`,
    [T]
  )
).rows;
const optByName = Object.fromEntries(opts.map((o) => [o.name, o]));
const itemGroups = new Map();
for (const r of (
  await q(
    "select x.item_id, g.name from menu_item_modifier_groups x join modifier_groups g on g.id=x.group_id where x.tenant_id=$1",
    [T]
  )
).rows) itemGroups.set(r.item_id, [...(itemGroups.get(r.item_id) ?? []), r.name]);

const recipeOfItem = {}; // menu_item_id → {k: qty}
const recipeOfOption = {};
for (const [name, lines] of Object.entries(RECIPES)) {
  const mi = itemByName[name];
  if (!mi) throw new Error(`Không có món ${name}`);
  recipeOfItem[mi.id] = lines;
  for (const [k, qty] of Object.entries(lines))
    await q("insert into recipe_lines (tenant_id, ingredient_id, qty, menu_item_id, created_at) values ($1,$2,$3,$4,$5)", [T, ingId[k], qty, mi.id, setupAt]);
}
for (const [name, lines] of Object.entries(OPTION_RECIPES)) {
  const o = optByName[name];
  recipeOfOption[o.id] = lines;
  for (const [k, qty] of Object.entries(lines))
    await q("insert into recipe_lines (tenant_id, ingredient_id, qty, modifier_option_id, created_at) values ($1,$2,$3,$4,$5)", [T, ingId[k], qty, o.id, setupAt]);
}
for (const [pk, lines] of Object.entries(BATCH_RECIPE))
  for (const [k, qty] of Object.entries(lines))
    await q("insert into recipe_lines (tenant_id, ingredient_id, qty, parent_ingredient_id, created_at) values ($1,$2,$3,$4,$5)", [T, ingId[k], qty, ingId[pk], setupAt]);

const supId = {};
for (const s of SUPPLIERS) {
  const ex = (await q("select id from suppliers where tenant_id=$1 and name=$2", [T, s.name])).rows[0];
  if (ex) {
    supId[s.k] = ex.id;
    await q("update suppliers set active=true, note=$2 where id=$1", [ex.id, s.note]);
  } else {
    // Mã NCC000xxx do trigger cấp, trigger đòi người thao tác là chủ/quản lý.
    supId[s.k] = await asOwner(async () =>
      (await q("insert into suppliers (tenant_id, name, phone, note, created_at) values ($1,$2,$3,$4,$5) returning id", [T, s.name, s.phone, s.note, setupAt])).rows[0].id
    );
  }
}

// ---- 3. Công cụ ghi qua RPC dưới danh nghĩa chủ quán ---------------------------------------------------------------
async function asOwner(fn) {
  await q("begin");
  try {
    await q("set local role authenticated");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: owner.user_id, role: "authenticated" })]);
    const r = await fn();
    await q("commit");
    return r;
  } catch (e) {
    await q("rollback");
    throw e;
  }
}

/** Kho THẬT (đơn vị gốc) — hệ thống không thấy. */
const phys = Object.fromEntries(ING.map((i) => [i.k, 0]));
/** Sổ kỳ vọng từng ngày, tính độc lập. */
const book = {};
const dayBook = (day) =>
  (book[day] ??= Object.fromEntries(
    ING.map((i) => [i.k, { receipts: 0, batch_in: 0, batch_out: 0, waste_hong: 0, waste_do_bo: 0, waste_com_nv: 0, waste_khac: 0,
      adjust: 0, counted: false, order_usage: 0, cancel_usage: 0, batch_shortfall: 0, prices: [] }])
  ));
const log = [];

async function receipt(day, h, m, { sup, lines, discount = 0, payNow = "all", fund = "cash", note = null, draft = false, id = null, createdDay = null }) {
  const payLines = lines.map(([k, qty, price]) => ({ ingredient_id: ingId[k], qty, unit_price: price ?? null }));
  const subtotal = lines.reduce((s, [, qty, price]) => s + (price == null ? 0 : Math.round(qty * price)), 0);
  const total = subtotal - discount;
  const pay = payNow === "all" ? total : payNow;
  const saved = await asOwner(async () =>
    (await q("select * from save_purchase_receipt($1, $2::jsonb, $3)", [T, JSON.stringify({ id, supplier_id: sup ? supId[sup] : null,
      discount, pay_now: pay, pay_fund: fund, note, lines: payLines }), !draft])).rows[0]
  );
  const ts = at(day, h, m);
  if (!id) await q("update purchase_receipts set created_at=$2, doc_date=$3 where id=$1", [saved.id, at(createdDay ?? day, h, m), createdDay ?? day]);
  if (!draft) {
    await q("update purchase_receipts set doc_date=$3, stock_date=$3, received_at=$2, completed_at=$2, updated_at=$2 where id=$1", [saved.id, ts, day]);
    await q("update stock_entries set occurred_at=$2, created_at=$2 where purchase_receipt_id=$1", [saved.id, ts]);
    await q("update cash_vouchers set occurred_at=$2, created_at=$2 where purchase_receipt_id=$1", [saved.id, ts]);
    await q("update ingredients set last_cost_at=$2 where tenant_id=$1 and last_cost_at > now() - interval '1 hour'", [T, ts]);
    const ratio = subtotal > 0 ? total / subtotal : 1;
    for (const [k, qty, price] of lines) {
      const baseQty = r3(qty * byK[k].f);
      dayBook(day)[k].receipts = r3(dayBook(day)[k].receipts + baseQty);
      if (price != null) dayBook(day)[k].prices.push({ qty: baseQty, cost: (price / byK[k].f) * ratio });
    }
  }
  log.push(`${day} ${pad(h)}:${pad(m)} ${draft ? "Lưu tạm" : "Hoàn thành"} ${saved.code} (${SUPPLIERS.find((s) => s.k === sup)?.name ?? "không NCC"}): ` +
    lines.map(([k, qty, price]) => `${byK[k].name} ${qty} ${byK[k].pu ?? byK[k].base}${price == null ? " (không giá)" : ` × ${price.toLocaleString("vi-VN")}`}`).join(", ") +
    (discount ? `, giảm ${discount.toLocaleString("vi-VN")}` : "") + `, trả ${pay.toLocaleString("vi-VN")}/${total.toLocaleString("vi-VN")}`);
  return saved;
}

async function cancelReceipt(day, h, m, rec, cancelVouchers, physicallyArrived) {
  // Dòng sổ bị xóa (chưa chốt) → bỏ khỏi sổ kỳ vọng.
  const lines = (await q("select ingredient_id, qty, unit_cost from stock_entries where purchase_receipt_id=$1", [rec.id])).rows;
  await asOwner(() => q("select cancel_purchase_receipt($1, $2)", [rec.id, cancelVouchers]));
  await q("update purchase_receipts set cancelled_at=$2, updated_at=$2 where id=$1", [rec.id, at(day, h, m)]);
  await q("update cash_vouchers set cancelled_at=$2 where purchase_receipt_id=$1 and status='cancelled'", [rec.id, at(day, h, m)]);
  const still = (await q("select count(*)::int n from stock_entries where purchase_receipt_id=$1", [rec.id])).rows[0].n;
  if (still) throw new Error("Hủy phiếu chưa chốt mà dòng sổ còn — sai QD-027 D5");
  for (const l of lines) {
    const k = Object.keys(ingId).find((x) => ingId[x] === l.ingredient_id);
    const b = dayBook(day)[k];
    b.receipts = r3(b.receipts - Number(l.qty));
    const idx = b.prices.findIndex((p) => Math.abs(p.qty - Number(l.qty)) < 1e-6);
    if (idx >= 0) b.prices.splice(idx, 1);
    if (!physicallyArrived) phys[k] = r3(phys[k] - Number(l.qty));
  }
  log.push(`${day} ${pad(h)}:${pad(m)} Hủy bỏ ${rec.code}${cancelVouchers ? " (hủy luôn phiếu chi)" : ""}`);
}

async function copyReceipt(day, h, m, rec) {
  const c = await asOwner(async () => (await q("select * from copy_purchase_receipt($1)", [rec.id])).rows[0]);
  await q("update purchase_receipts set created_at=$2, doc_date=$3 where id=$1", [c.id, at(day, h, m), day]);
  log.push(`${day} ${pad(h)}:${pad(m)} Sao chép ${rec.code} → phiếu tạm ${c.code}`);
  return c;
}

function physReceive(lines) {
  for (const [k, qty] of lines) phys[k] = r3(phys[k] + qty * byK[k].f);
}

async function batch(day, h, m, count, actual) {
  const prepared = byK.nuocdung;
  const consume = Object.entries(BATCH_RECIPE.nuocdung).map(([k, qty]) => ({ ingredient_id: ingId[k], qty: r3(qty * count) }));
  const costs = (await q("select id, last_unit_cost from ingredients where id = any($1::uuid[])", [consume.map((c) => c.ingredient_id)])).rows;
  const costOf = Object.fromEntries(costs.map((c) => [c.id, Number(c.last_unit_cost)]));
  const costTotal = Math.round(consume.reduce((s, c) => s + c.qty * costOf[c.ingredient_id], 0));
  const expected = r3(prepared.batch * count);
  const batchId = await asOwner(async () =>
    (await q("select record_batch($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) id", [T, day, ingId.nuocdung, count, expected, actual, costTotal,
      costTotal / actual, owner.id, JSON.stringify(consume)])).rows[0].id
  );
  const ts = at(day, h, m);
  await q("update production_batches set created_at=$2 where id=$1", [batchId, ts]);
  await q("update stock_entries set occurred_at=$2, created_at=$2 where batch_id=$1", [batchId, ts]);
  const b = dayBook(day);
  b.nuocdung.batch_in = r3(b.nuocdung.batch_in + actual);
  b.nuocdung.batch_shortfall = r3(b.nuocdung.batch_shortfall + expected - actual);
  b.nuocdung.prices.push({ qty: actual, cost: costTotal / actual });
  for (const [k, qty] of Object.entries(BATCH_RECIPE.nuocdung)) {
    b[k].batch_out = r3(b[k].batch_out + qty * count);
    phys[k] = r3(phys[k] - qty * count);
  }
  phys.nuocdung = r3(phys.nuocdung + actual);
  log.push(`${day} ${pad(h)}:${pad(m)} Chế biến ${count} mẻ nước dùng: dự kiến ${expected} l, thực ${actual} l`);
}

const REASON_COL = { hong: "waste_hong", do_bo: "waste_do_bo", com_nhan_vien: "waste_com_nv", khac: "waste_khac" };
async function waste(day, h, m, k, baseQty, reason, note = null) {
  await q(
    `insert into stock_entries (tenant_id, business_date, ingredient_id, kind, qty, reason, note, created_by, created_at, occurred_at)
     values ($1,$2,$3,'waste',$4,$5,$6,$7,$8,$8)`,
    [T, day, ingId[k], -baseQty, reason, note, owner.id, at(day, h, m)]
  );
  dayBook(day)[k][REASON_COL[reason]] = r3(dayBook(day)[k][REASON_COL[reason]] + baseQty);
  phys[k] = r3(phys[k] - baseQty);
  log.push(`${day} ${pad(h)}:${pad(m)} Xuất hủy ${byK[k].name} ${baseQty} ${byK[k].base} (${reason})`);
}

/** Kiểm kê như recordCounts: độ lệch = số đếm − tồn lý thuyết lúc ghi (RPC inventory_on_hand). */
async function count(day, h, m, k, countedBase, label) {
  const ts = at(day, h, m);
  const oh = Number((await q("select on_hand from inventory_on_hand($1, $2) where ingredient_id=$3", [T, ts, ingId[k]])).rows[0]?.on_hand ?? 0);
  const diff = r3(countedBase - oh);
  await q(
    `insert into stock_entries (tenant_id, business_date, ingredient_id, kind, qty, note, created_by, created_at, occurred_at)
     values ($1,$2,$3,'count_adjust',$4,$5,$6,$7,$7)`,
    [T, day, ingId[k], diff, `đếm ${countedBase}`, owner.id, ts]
  );
  dayBook(day)[k].adjust = r3(dayBook(day)[k].adjust + diff);
  dayBook(day)[k].counted = true;
  log.push(`${day} ${pad(h)}:${pad(m)} Kiểm kê ${byK[k].name}: đếm ${countedBase} ${byK[k].base}, sổ ${oh} → lệch ${diff}${label ? ` (${label})` : ""}`);
  return { oh, diff };
}

// ---- 4. Đơn bán ---------------------------------------------------------------------------------------------------
const tables = (await q("select id from tables where tenant_id=$1 order by sort_order", [T])).rows;
const MAINS = [["Phở bò tái", 32], ["Phở ngựa", 14], ["Bún bò Huế", 18], ["Cơm gà xối mỡ", 14], ["Mì Quảng", 8]];
const STARTERS = [["Gỏi cuốn", 50], ["Chả giò", 30], ["Nem nướng", 20]];
const DRINKS = [["Trà đá", 40], ["Bia", 25], ["Nước cam", 15], ["Cà phê sữa", 20]];
let billNo = 900;

async function makeOrders(day) {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  const visits = dow === 0 || dow === 6 ? 95 : 70;
  const rows = { sessions: [], orders: [], items: [], mods: [], bills: [], billItems: [], payments: [], jobs: [] };
  for (let v = 0; v < visits; v++) {
    const lunch = rnd() < 0.45;
    const minute = lunch ? int(10 * 60 + 30, 13 * 60 + 30) : int(17 * 60, 21 * 60);
    const created = at(day, Math.floor(minute / 60), minute % 60, int(0, 59));
    const paid = new Date(Date.parse(created) + int(25, 60) * 60_000).toISOString();
    const channel = rnd() < 0.75 ? "dine_in" : "takeaway";
    let session = null;
    if (channel === "dine_in") {
      session = uuid();
      rows.sessions.push([session, T, tables[int(0, tables.length - 1)].id, "closed", created, paid]);
    }
    const orderId = uuid();
    rows.orders.push([orderId, T, session, channel, "staff", "completed", MARK, created, created]);
    const lines = [];
    const nMain = 1 + (rnd() < 0.35 ? 1 : 0);
    for (let i = 0; i < nMain; i++) lines.push([pickW(MAINS), 1 + (rnd() < 0.3 ? 1 : 0)]);
    if (rnd() < 0.3) lines.push([pickW(STARTERS), 1]);
    if (rnd() < 0.7) {
      const d = pickW(DRINKS);
      lines.push([d, d === "Bia" ? int(2, 4) : int(1, 2)]);
    }
    // Hủy: sau khi in bếp (đã làm, có phiếu in) / trước khi in (chưa làm, không phiếu in).
    const afterPrint = rnd() < 0.05;
    let subtotal = 0;
    const billLines = [];
    lines.forEach(([name, qty], idx) => {
      const mi = itemByName[name];
      const oiId = uuid();
      const groups = itemGroups.get(mi.id) ?? [];
      const chosen = [];
      if (groups.includes("Topping") && (name.startsWith("Phở") || name === "Bún bò Huế")) {
        if (rnd() < 0.18) chosen.push(optByName["Thêm thịt"]);
        if (name.startsWith("Phở") && rnd() < 0.1) chosen.push(optByName["Thêm bánh"]);
      }
      const unit = mi.base_price + chosen.reduce((s, o) => s + o.price_delta, 0);
      const cancelAfter = afterPrint && idx === 0;
      const cancelBefore = !afterPrint && rnd() < 0.035;
      const status = cancelAfter || cancelBefore ? "cancelled" : "served";
      const cancelledAt = cancelAfter
        ? new Date(Date.parse(created) + 12 * 60_000).toISOString()
        : cancelBefore ? new Date(Date.parse(created) + 2 * 60_000).toISOString() : null;
      rows.items.push([oiId, T, orderId, mi.id, name, unit, qty, status, created, status === "served" ? paid : null, cancelledAt,
        cancelAfter ? "Khách đổi món" : cancelBefore ? "Gọi nhầm" : null, cancelledAt ? owner.id : null]);
      for (const o of chosen) rows.mods.push([uuid(), T, oiId, o.id, o.name, o.price_delta]);
      if (status === "served") {
        subtotal += unit * qty;
        billLines.push([oiId, qty, unit]);
      }
    });
    if (afterPrint)
      rows.jobs.push([uuid(), T, "kitchen_ticket", "kitchen", JSON.stringify({ orderId, mark: MARK }), "printed",
        new Date(Date.parse(created) + 60_000).toISOString(), new Date(Date.parse(created) + 61_000).toISOString()]);
    if (billLines.length) {
      const billId = uuid();
      rows.bills.push([billId, T, ++billNo, session, "paid", subtotal, subtotal, MARK, paid, created]);
      for (const [oiId, qty, unit] of billLines) rows.billItems.push([uuid(), T, billId, oiId, qty, unit, qty * unit]);
      rows.payments.push([uuid(), T, billId, rnd() < 0.6 ? "cash" : "transfer", subtotal, paid, MARK]);
    }
  }
  const bulk = async (table, cols, data, chunk = 200) => {
    for (let i = 0; i < data.length; i += chunk) {
      const s = data.slice(i, i + chunk);
      await q(`insert into ${table} (${cols.join(",")}) values ${s.map((r, ri) => `(${r.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(",")})`).join(",")}`, s.flat());
    }
  };
  await bulk("table_sessions", ["id", "tenant_id", "table_id", "status", "opened_at", "closed_at"], rows.sessions);
  await bulk("orders", ["id", "tenant_id", "table_session_id", "channel", "source", "status", "note", "created_at", "confirmed_at"], rows.orders);
  await bulk("order_items", ["id", "tenant_id", "order_id", "menu_item_id", "name_snapshot", "unit_price_snapshot", "qty", "status", "created_at",
    "prepared_at", "cancelled_at", "cancel_reason", "cancelled_by"], rows.items);
  await bulk("order_item_modifiers", ["id", "tenant_id", "order_item_id", "option_id", "name_snapshot", "price_delta_snapshot"], rows.mods);
  await bulk("print_jobs", ["id", "tenant_id", "type", "target_station", "payload", "status", "created_at", "printed_at"], rows.jobs);
  await bulk("bills", ["id", "tenant_id", "bill_no", "table_session_id", "status", "subtotal", "total", "note", "paid_at", "created_at"], rows.bills);
  await bulk("bill_items", ["id", "tenant_id", "bill_id", "order_item_id", "qty_allocated", "unit_price_snapshot", "amount"], rows.billItems);
  await bulk("payments", ["id", "tenant_id", "bill_id", "method", "amount", "received_at", "note"], rows.payments);
  return visits;
}

/**
 * Lượng dùng theo đơn của MỌI đơn trong ngày (cả đơn có sẵn của quán demo), tính ĐỘC LẬP bằng JS theo QD-017 D2: đơn đã
 * xác nhận; món chưa hủy, hoặc hủy SAU phiếu in bếp sớm nhất. Yield = 100% (chưa có lần chốt nào để tự tính).
 * Trả các dòng có thời điểm để mô phỏng kho thật theo thứ tự thời gian.
 */
async function dayUsageLines(day) {
  const { rows } = await q(
    `select oi.id, oi.menu_item_id, oi.qty::numeric qty, oi.status, oi.cancelled_at, o.confirmed_at,
            (select min(j.created_at) from print_jobs j where j.tenant_id=$1 and j.type='kitchen_ticket' and j.payload->>'orderId' = o.id::text) printed_at,
            coalesce((select array_agg(m.option_id) from order_item_modifiers m where m.order_item_id = oi.id), '{}') opts
       from order_items oi join orders o on o.id = oi.order_id
      where oi.tenant_id=$1 and o.tenant_id=$1 and o.confirmed_at is not null and o.confirmed_at >= $2 and o.confirmed_at < $3`,
    [T, at(day, 0), at(nextDay(day), 0)]
  );
  const out = [];
  for (const r of rows) {
    const cancelledAfter = r.status === "cancelled" && r.printed_at && new Date(r.cancelled_at) > new Date(r.printed_at);
    if (r.status === "cancelled" && !cancelledAfter) continue;
    const use = {};
    for (const [k, qty] of Object.entries(recipeOfItem[r.menu_item_id] ?? {})) use[k] = (use[k] ?? 0) + qty * Number(r.qty);
    for (const oid of r.opts) for (const [k, qty] of Object.entries(recipeOfOption[oid] ?? {})) use[k] = (use[k] ?? 0) + qty * Number(r.qty);
    if (Object.keys(use).length) out.push({ t: new Date(r.confirmed_at).getTime(), use, cancelled: !!cancelledAfter });
  }
  return out.sort((a, b) => a.t - b.t);
}
function nextDay(d) {
  return new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}
const consumed = new Set();
/** Kho thật trừ các dòng bán tới thời điểm `untilMs`. */
function physSell(lines, untilMs) {
  for (const [i, l] of lines.entries()) {
    if (consumed.has(l) || l.t >= untilMs) continue;
    consumed.add(l);
    for (const [k, qty] of Object.entries(l.use)) {
      const ing = byK[k];
      const noise = ing.noise ? 1 + (rnd() * 2 - 1) * ing.noise : 1;
      phys[k] = r3(phys[k] - qty * ing.real * noise);
    }
    void i;
  }
}
const roundStep = (k, v) => {
  const s = byK[k].step;
  return r3(Math.max(0, Math.round(v / s) * s));
};

// ---- 5. Bảy ngày --------------------------------------------------------------------------------------------------
const plan = {}; // gợi ý mua: lượng dùng dự kiến trong ngày theo đơn (kho thật)
for (const day of DAYS) {
  const visits = await makeOrders(day);
  const lines = await dayUsageLines(day);
  const need = {};
  for (const l of lines) for (const [k, qty] of Object.entries(l.use)) need[k] = (need[k] ?? 0) + qty * byK[k].real;
  plan[day] = need;
  const b = dayBook(day);
  for (const l of lines)
    for (const [k, qty] of Object.entries(l.use)) {
      b[k].order_usage = r3(b[k].order_usage + qty);
      if (l.cancelled) b[k].cancel_usage = r3(b[k].cancel_usage + qty);
    }

  // Mua sáng: đủ dùng × 1,2 trừ tồn thật (người mua nhìn kho), làm tròn 0,5 đơn vị nhập.
  const buy = (k, extra = 1.2) => {
    const want = (need[k] ?? 0) * extra - phys[k];
    if (want <= 0) return 0;
    return Math.ceil(want / byK[k].f / 0.5) * 0.5;
  };
  const brothBowls = (need.nuocdung ?? 0);
  const batches = Math.max(1, Math.ceil((brothBowls * 1.1 - phys.nuocdung) / 29));

  if (day === DAYS[0]) {
    // Mở sổ: quán đã có sẵn 30 chai bia → khai "Tồn hiện có" ở form nguyên liệu (P26): dòng `receipt` không phiếu nhập,
    // ghi chú "Tồn đầu kỳ", giá 15.000₫/chai — như createIngredient/updateIngredient ghi. Không phải kiểm kê nên không vào hao hụt.
    phys.bia = 30;
    await q(
      `insert into stock_entries (tenant_id, business_date, ingredient_id, kind, qty, unit_cost, note, created_by, created_at, occurred_at)
       values ($1,$2,$3,'receipt',30,15000,'Tồn đầu kỳ',$4,$5,$5)`,
      [T, day, ingId.bia, owner.id, at(day, 6, 0)]
    );
    dayBook(day).bia.receipts += 30;
    dayBook(day).bia.prices.push({ qty: 30, cost: 15000 });
    log.push(`${day} 06:00 Tồn đầu kỳ Bia Hà Nội 30 chai × 15.000`);
  }

  // Thịt — Thanh Tuấn, nợ một phần.
  const thit = [["bo", buy("bo"), PRICE_ON("bo", day)], ["ngua", buy("ngua"), PRICE_ON("ngua", day)]].filter((l) => l[1] > 0);
  if (day === N2) {
    // E1: gõ 45 thay 4,5 kg → phát hiện lúc 06:50 → Hủy bỏ (hủy luôn phiếu chi) → Sao chép → sửa → Hoàn thành.
    const real = thit.find((l) => l[0] === "bo");
    const wrongLines = thit.map((l) => (l[0] === "bo" ? ["bo", real[1] * 10, l[2]] : l));
    const wrong = await receipt(day, 6, 30, { sup: "thit", lines: wrongLines, payNow: 2000000, note: "Nhập sáng" });
    physReceive(thit);
    await cancelReceipt(day, 6, 50, wrong, true, true);
    // physReceive đã cộng đúng lượng thật; cancelReceipt(physicallyArrived=true) không trừ.
    const copy = await copyReceipt(day, 6, 52, wrong);
    await receipt(day, 6, 55, { id: copy.id, sup: "thit", lines: thit, payNow: 1000000, note: "Nhập sáng (sửa SL thịt bò)" });
  } else if (thit.length) {
    const total = thit.reduce((s, [, q2, p]) => s + Math.round(q2 * p), 0);
    const disc = day === N4 ? Math.round(total * 0.02 / 1000) * 1000 : 0;
    const rec = await receipt(day, 6, 30, { sup: "thit", lines: thit, discount: disc, payNow: Math.round((total - disc) / 2 / 1000) * 1000, note: "Nhập sáng" });
    physReceive(thit);
    if (day === N6) {
      // E3: sửa thông tin phiếu đã nhập — thêm ghi chú. Thời gian nhập không sửa được (P34, QD-034 D1) — RPC bỏ qua ngày.
      await asOwner(() => q("select update_purchase_receipt_meta($1, $2, $3, $4)", [rec.id, "HĐ số 0012 của Thanh Tuấn", null, null]));
      log.push(`${day} 09:00 Sửa thông tin ${rec.code}: ghi chú "HĐ số 0012"`);
    }
  }

  // Chợ — trả đủ tiền mặt. E2: phiếu tạm tối N4 cho sáng N5, sáng N5 sửa số rồi Hoàn thành.
  const choLines = [["banhpho", buy("banhpho"), PRICE_ON("banhpho", day)], ["bun", buy("bun"), PRICE_ON("bun", day)],
    ["rau", buy("rau", 1.3), PRICE_ON("rau", day)], ["cam", buy("cam"), PRICE_ON("cam", day)],
    ["hanh", phys.hanh < 800 * batches ? Math.ceil((800 * batches * 1.5 - phys.hanh) / 1000) : 0, PRICE_ON("hanh", day)],
    ["banhtrang", phys.banhtrang < (need.banhtrang ?? 0) * 1.1 ? Math.ceil(((need.banhtrang ?? 0) * 1.5 - phys.banhtrang) / 50) : 0, PRICE_ON("banhtrang", day)]].filter((l) => l[1] > 0);
  if (day === N5) {
    const draftLines = choLines.map(([k, q2, p]) => [k, Math.max(0.5, q2 - 1), p]).filter(([k]) => k !== "cam");
    const draft = await receipt(N4, 20, 0, { sup: "cho", lines: draftLines, payNow: 0, note: "Đặt trước cho sáng mai", draft: true });
    await receipt(day, 6, 15, { id: draft.id, sup: "cho", lines: choLines, note: "Đặt trước cho sáng mai — đã sửa SL khi hàng về" });
  } else if (day === N7) {
    // E6: cô Hoa cho thêm 0,5 kg rau, không tính tiền → dòng không giá.
    await receipt(day, 6, 15, { sup: "cho", lines: [...choLines, ["rau", 0.5, null]], note: "Nhập sáng (cô Hoa cho thêm 0,5 kg rau)" });
  } else {
    await receipt(day, 6, 15, { sup: "cho", lines: choLines, note: "Nhập sáng" });
  }
  physReceive(choLines);
  if (day === N7) phys.rau = r3(phys.rau + 500);

  // Gà, giò, tôm, xương, gạo — anh Bình, ghi nợ hết.
  const gaLines = [["ga", buy("ga", 1.25), PRICE_ON("ga", day)], ["gio", buy("gio"), PRICE_ON("gio", day)], ["tom", buy("tom"), PRICE_ON("tom", day)],
    ["xuong", 8 * batches + 2 > phys.xuong ? 8 * batches + 2 - Math.floor(phys.xuong) : 0, PRICE_ON("xuong", day)],
    ["gao", phys.gao < (need.gao ?? 0) * 1.5 + 600 ? 10 : 0, PRICE_ON("gao", day)]].filter((l) => l[1] > 0);
  if (gaLines.length) {
    await receipt(day, 7, 0, { sup: "ga", lines: gaLines, payNow: 0, note: "Nhập sáng" });
    physReceive(gaLines);
  }

  // Bia — chuyển khoản, khi còn dưới 2 thùng.
  if (phys.bia < 48) {
    const thung = Math.ceil((60 - phys.bia) / 24);
    await receipt(day, 9, 0, { sup: "bia", lines: [["bia", thung, PRICE_ON("bia", day)]], fund: "bank", note: "Giao bia" });
    physReceive([["bia", thung]]);
  }

  // Nước dùng: nấu sáng 7:00; thực ra ít hơn công thức 0,5–1,5 lít mỗi mẻ.
  const actual = r3(batches * 30 - batches * (0.5 + rnd()));
  await batch(day, 7, 30, batches, Math.round(actual * 2) / 2);

  // Bán buổi trưa.
  physSell(lines, Date.parse(at(day, 15, 0)));

  // E5: thịt bò hết sớm chiều N6 → nhập bổ sung 2 kg giá cao hơn (bình quân gia quyền trong ngày).
  if (day === N6) {
    await receipt(day, 15, 30, { sup: "thit", lines: [["bo", 2, 300000]], payNow: "all", note: "Nhập bổ sung buổi chiều" });
    physReceive([["bo", 2]]);
  }

  // Bán buổi tối.
  physSell(lines, Date.parse(at(day, 21, 40)));

  // Xuất hủy có lý do.
  await waste(day, 14, 0, "ga", 500, "com_nhan_vien", "Cơm trưa nhân viên");
  await waste(day, 14, 0, "gao", 600, "com_nhan_vien", "Cơm trưa nhân viên");
  const rauHong = int(2, 4) * 100;
  if (phys.rau >= rauHong) await waste(day, 21, 30, "rau", rauHong, "hong", "Rau héo cuối ngày");
  if (day === DAYS[2]) await waste(day, 19, 10, "bia", 1, "do_bo", "Khách làm vỡ chai");
  if (day === N4) await waste(day, 21, 30, "tom", 300, "hong", "Tôm ươn");

  // Hao hụt KHÔNG ghi: mất 3 chai bia (N5), giò hỏng đổ bỏ không ghi phiếu (N6).
  if (day === N5) phys.bia -= 3;
  if (day === N6) phys.gio = r3(phys.gio - 800);

  // Kiểm kê cuối ngày 21:45 — nguyên liệu "cần kiểm". E4: N5 gõ 82 kg thịt bò (thay 8,2) rồi đếm lại.
  for (const i of ING.filter((x) => x.count)) {
    const real = roundStep(i.k, phys[i.k]);
    if (day === N5 && i.k === "bo") {
      await count(day, 21, 45, "bo", r3(real * 10), "gõ nhầm dấu phẩy");
      await count(day, 21, 50, "bo", real, "đếm lại, sửa số");
    } else {
      await count(day, 21, 45, i.k, real);
    }
  }
  // Sau kiểm kê không còn bán (quán đóng 21:30) — đơn cũ trễ hơn của quán demo, nếu có, vẫn trừ kho thật.
  physSell(lines, Infinity);
  console.log(`${day}: ${visits} lượt khách, ${batches} mẻ nước dùng`);
}

// ---- 6. Đáp án: sổ từng ngày + giá ngày + hao hụt theo tiền ---------------------------------------------------------
const expected = {};
let opening = Object.fromEntries(ING.map((i) => [i.k, 0]));
let lastPrice = Object.fromEntries(ING.map((i) => [i.k, null]));
for (const day of DAYS) {
  const b = book[day];
  expected[day] = {};
  for (const i of ING) {
    const r = b[i.k];
    if (r.prices.length) {
      const qty = r.prices.reduce((s, p) => s + p.qty, 0);
      lastPrice[i.k] = r.prices.reduce((s, p) => s + p.qty * p.cost, 0) / qty;
    }
    const waste = r.waste_hong + r.waste_do_bo + r.waste_com_nv + r.waste_khac;
    const closing = r3(opening[i.k] + r.receipts + r.batch_in - r.batch_out - waste + r.adjust - r.order_usage);
    const c = lastPrice[i.k];
    expected[day][i.name] = {
      opening: r3(opening[i.k]), receipts: r.receipts, batch_in: r.batch_in, batch_out: r.batch_out,
      waste_hong: r.waste_hong, waste_do_bo: r.waste_do_bo, waste_com_nv: r.waste_com_nv, waste_khac: r.waste_khac,
      adjust: r.adjust, counted: r.counted, order_usage: r.order_usage, cancel_usage: r.cancel_usage, batch_shortfall: r.batch_shortfall,
      closing, unit_cost: c,
      vnd: c === null ? null : {
        cancel: Math.round(r.cancel_usage * c), shortfall: Math.round(r.batch_shortfall * c), waste: Math.round(waste * c),
        unexplained: r.counted ? Math.round(-r.adjust * c) : 0,
      },
    };
    opening[i.k] = closing;
  }
}
const physEnd = Object.fromEntries(ING.map((i) => [i.name, phys[i.k]]));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ tenant: T, days: DAYS, ingredients: ING.map((i) => ({ ...i, id: ingId[i.k] })), expected, physEnd, log }, null, 1));
console.log(log.join("\n"));
await client.end();
