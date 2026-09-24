// scripts/schema-snapshot.mjs — Chốt chặn lệch schema, KHÔNG cần Docker (OPS-07, QD-013 §3).
//
// VẤN ĐỀ: ngày 23–24/09/2026 phát hiện production có view `bills_revenue`, 9 hàm báo cáo và một
// trigger mà repo không hề mô tả. `supabase db push` vẫn báo "up to date" vì sổ cái migration
// khớp — lệch nằm ở chỗ khác. Dựng môi trường mới từ repo sẽ ra SỐ DOANH THU KHÁC.
//
// `supabase db diff` giải được bài này nhưng cần Docker để dựng shadow DB. Máy dev không có Docker,
// nên không ai chạy thử được trước khi đẩy lên CI — mà một cổng chặn chưa ai chạy thử thì không
// đáng tin.
//
// CÁCH NÀY: chụp "dấu vân tay" schema production vào `supabase/schema-snapshot.json` và commit.
// CI so DB thật với snapshot. Khác nhau ⇒ đỏ, kèm tên từng object đã đổi.
//
// Bắt được cả hai loại lệch đã vấp:
//   • object thừa/thiếu  — view, hàm, policy, trigger, index, bảng, cột
//   • THÂN hàm/view bị sửa — thứ mà so-tên-object không thấy, và chính là cách report_summary
//     lệch đi mà không ai biết
//
// Chạy:
//   node scripts/schema-snapshot.mjs --write   → ghi lại snapshot (sau khi đã chép đổi thành migration)
//   node scripts/schema-snapshot.mjs           → kiểm; lệch thì exit 1
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { config } from "dotenv";
import { pathToFileURL } from "node:url";

config({ path: ".env.local" });

const SNAPSHOT = path.join(process.cwd(), "supabase", "schema-snapshot.json");
const GHI = process.argv.includes("--write");

const raw = process.env.POSTGRES_URL_NON_POOLING || process.env.SUPABASE_DB_URL;
if (!raw) {
  console.error("Thiếu POSTGRES_URL_NON_POOLING (hoặc SUPABASE_DB_URL).");
  process.exit(1);
}
// pg v9 coi sslmode=require là verify-full; Supabase dùng chứng chỉ tự ký nên phải gỡ ra.
const connectionString = raw.replace(/([?&])sslmode=[^&]*/, "$1").replace(/[?&]$/, "");

/** Gộp khoảng trắng để khác biệt về xuống dòng/thụt lề không bị báo là lệch. */
const chuan = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

async function chup(client) {
  const q = async (sql) => (await client.query(sql)).rows;

  const cot = await q(`
    select table_name, column_name, data_type, is_nullable, coalesce(column_default,'') as dft
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position`);

  const view = await q(`
    select table_name, view_definition
    from information_schema.views where table_schema = 'public' order by table_name`);

  // Bỏ hàm do extension cài (citext, pgcrypto…) — chúng đổi theo phiên bản nền tảng, không phải việc của repo.
  const ham = await q(`
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
           pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by 1`);

  // Policy của CẢ public lẫn storage: sự cố has_role nằm ở storage.objects, và lần đầu tôi rà
  // thiếu schema đó nên suýt xoá một hàm đang được dùng.
  const policy = await q(`
    select n.nspname || '.' || c.relname || '.' || pol.polname as ten,
           pol.polcmd::text as cmd,
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') as qual,
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as wc
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'storage')
    order by 1`);

  const idx = await q(`
    select indexname, indexdef from pg_indexes where schemaname = 'public' order by indexname`);

  const trg = await q(`
    select t.tgname || ' on ' || n.nspname || '.' || c.relname as ten,
           pg_get_triggerdef(t.oid) as def
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname in ('public', 'auth')
    order by 1`);

  const rb = await q(`
    select conrelid::regclass::text || '.' || conname as ten, pg_get_constraintdef(oid) as def
    from pg_constraint
    where connamespace = 'public'::regnamespace and contype in ('c','u','f')
    order by 1`);

  const snap = { bang: {}, view: {}, ham: {}, policy: {}, index: {}, trigger: {}, rangBuoc: {} };
  for (const c of cot) {
    (snap.bang[c.table_name] ??= []).push(
      `${c.column_name} ${c.data_type} ${c.is_nullable === "YES" ? "null" : "not null"} ${chuan(c.dft)}`.trim()
    );
  }
  for (const v of view) snap.view[v.table_name] = chuan(v.view_definition);
  for (const f of ham) snap.ham[f.sig] = chuan(f.def);
  for (const p of policy) snap.policy[p.ten] = chuan(`${p.cmd} | ${p.qual} | ${p.wc}`);
  for (const i of idx) snap.index[i.indexname] = chuan(i.indexdef);
  for (const t of trg) snap.trigger[t.ten] = chuan(t.def);
  for (const r of rb) snap.rangBuoc[r.ten] = chuan(r.def);
  return snap;
}

/** So hai snapshot theo từng nhóm, trả danh sách khác biệt đọc được bằng mắt. */
export function soSanh(cu, moi) {
  const lech = [];
  for (const nhom of Object.keys(moi)) {
    const a = cu?.[nhom] ?? {};
    const b = moi[nhom];
    for (const ten of Object.keys(b)) {
      if (!(ten in a)) lech.push(`[${nhom}] THỪA trên DB, repo không mô tả: ${ten}`);
      else if (JSON.stringify(a[ten]) !== JSON.stringify(b[ten]))
        lech.push(`[${nhom}] ĐỊNH NGHĨA KHÁC snapshot: ${ten}`);
    }
    for (const ten of Object.keys(a)) {
      if (!(ten in b)) lech.push(`[${nhom}] THIẾU trên DB, snapshot có: ${ten}`);
    }
  }
  return lech;
}

// Import tệp này vào test mà không có guard thì nó nối vào DB và chạy luôn — đúng cái bẫy đã vấp
// với print-bridge.mjs. `soSanh` là hàm thuần, phải test được mà không đụng mạng.
const laEntry = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (!laEntry) {
  // Được import: chỉ xuất `soSanh`, không làm gì thêm.
} else {

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
const moi = await chup(client);
await client.end();

if (GHI) {
  fs.writeFileSync(SNAPSHOT, JSON.stringify(moi, null, 1) + "\n");
  const dem = Object.entries(moi).map(([k, v]) => `${k}=${Object.keys(v).length}`).join(" ");
  console.log(`Đã ghi ${path.relative(process.cwd(), SNAPSHOT)} — ${dem}`);
  process.exit(0);
}

if (!fs.existsSync(SNAPSHOT)) {
  console.error(`Chưa có ${SNAPSHOT}. Chạy: node scripts/schema-snapshot.mjs --write`);
  process.exit(1);
}

const lech = soSanh(JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")), moi);
if (lech.length === 0) {
  console.log("Schema khớp snapshot.");
  process.exit(0);
}

console.error(`LỆCH SCHEMA — ${lech.length} khác biệt:\n`);
for (const l of lech) console.error("  " + l);
console.error(
  `
Nghĩa là production và repo đang mô tả hai schema khác nhau (QD-013).
  • Nếu thay đổi là CỐ Ý: chép nó thành migration mới, áp lên, rồi chạy
    \`node scripts/schema-snapshot.mjs --write\` và commit snapshot kèm migration.
  • Nếu KHÔNG cố ý: có người sửa thẳng trên SQL editor. Tìm hiểu trước khi ghi đè snapshot —
    ghi đè là xoá dấu vết, không phải sửa lỗi.`
);
process.exit(1);

} // hết khối `if (laEntry)`
