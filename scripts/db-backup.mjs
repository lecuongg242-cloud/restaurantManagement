// scripts/db-backup.mjs — Sao lưu / khôi phục dữ liệu Supabase, KHÔNG cần Docker hay pg_dump.
//
// VÌ SAO TỒN TẠI: `supabase db dump` cần Docker; máy dev không có Docker cũng không có pg_dump.
// Trước khi xóa bất kỳ project nào để lấy chỗ tạo project mới, dữ liệu phải có một bản nằm NGOÀI
// Supabase. Đây là công cụ làm việc đó, và cũng là công cụ dùng lại lúc di trú sang Singapore.
//
// Ghi ra JSONL (mỗi dòng một bản ghi) thay vì sinh câu INSERT: không phải tự escape chuỗi, không
// sợ dấu nháy trong tên món hay ghi chú tiếng Việt làm hỏng file. Khôi phục dùng
// `json_populate_recordset` để Postgres tự ép kiểu.
//
// Chạy:
//   node scripts/db-backup.mjs dump    <thu-muc>            # từ POSTGRES_URL_NON_POOLING
//   node scripts/db-backup.mjs restore <thu-muc> <db-url>   # nạp vào database ĐÍCH
//   node scripts/db-backup.mjs verify  <thu-muc> <db-url>   # đối chiếu số đếm
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { config } from "dotenv";
import { pathToFileURL } from "node:url";

config({ path: ".env.local" });

/**
 * `auth.users` BẮT BUỘC có mặt: nó giữ `encrypted_password`, mà mật khẩu nhân viên được suy dẫn từ
 * PIN bằng pepper (QD-009). Mất bảng này là toàn bộ nhân viên không đăng nhập được, và không có
 * cách nào dựng lại vì pepper chỉ sinh ra mật khẩu, không sinh ra hash.
 *
 * `storage.objects` là SIÊU DỮ LIỆU của tệp, không phải nội dung tệp — ảnh món phải chép riêng
 * qua Storage API.
 */
const SCHEMA_NGOAI = [
  { schema: "auth", bang: "users" },
  { schema: "auth", bang: "identities" },
  { schema: "storage", bang: "buckets" },
  { schema: "storage", bang: "objects" },
];

function ketNoi(url) {
  const cs = String(url).replace(/([?&])sslmode=[^&]*/, "$1").replace(/[?&]$/, "");
  return new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
}

async function danhSachBangPublic(client) {
  const { rows } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name`);
  return rows.map((r) => r.table_name);
}

async function dump(thuMuc, url) {
  const client = ketNoi(url);
  await client.connect();
  fs.mkdirSync(thuMuc, { recursive: true });

  const bangPublic = (await danhSachBangPublic(client)).map((b) => ({ schema: "public", bang: b }));
  const tatCa = [...bangPublic, ...SCHEMA_NGOAI];
  const tomTat = {};

  for (const { schema, bang } of tatCa) {
    const ten = `${schema}.${bang}`;
    let rows;
    try {
      ({ rows } = await client.query(`select to_jsonb(t) as r from ${schema}."${bang}" t`));
    } catch (err) {
      // Bảng hệ thống có thể không đọc được — ghi lại rồi đi tiếp, đừng làm hỏng cả bản sao lưu.
      console.error(`  BỎ QUA ${ten}: ${err.message}`);
      tomTat[ten] = { loi: err.message };
      continue;
    }
    const tep = path.join(thuMuc, `${schema}__${bang}.jsonl`);
    fs.writeFileSync(tep, rows.map((x) => JSON.stringify(x.r)).join("\n") + (rows.length ? "\n" : ""));
    tomTat[ten] = { so_dong: rows.length };
    console.log(`  ${ten}: ${rows.length} dòng`);
  }

  fs.writeFileSync(
    path.join(thuMuc, "_tom-tat.json"),
    JSON.stringify({ luc: new Date().toISOString(), bang: tomTat }, null, 1) + "\n"
  );
  await client.end();
  console.log(`\nĐã sao lưu ${tatCa.length} bảng vào ${thuMuc}`);
  console.log("LƯU Ý: ảnh trong Storage KHÔNG nằm ở đây — chép riêng bằng `node scripts/db-backup.mjs anh <thư-mục>`.");
}

/** Chép nội dung tệp trong bucket `menu-images` về đĩa. */
async function chepAnh(thuMuc) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const dich = path.join(thuMuc, "storage-menu-images");
  fs.mkdirSync(dich, { recursive: true });

  const client = ketNoi(process.env.POSTGRES_URL_NON_POOLING);
  await client.connect();
  const { rows } = await client.query(`select name from storage.objects where bucket_id = 'menu-images'`);
  await client.end();

  let xong = 0;
  for (const r of rows) {
    const { data, error } = await sb.storage.from("menu-images").download(r.name);
    if (error) {
      console.error(`  LỖI tải ${r.name}: ${error.message}`);
      continue;
    }
    const tep = path.join(dich, r.name.replace(/[/\\]/g, "__"));
    fs.writeFileSync(tep, Buffer.from(await data.arrayBuffer()));
    xong += 1;
  }
  console.log(`Đã chép ${xong}/${rows.length} tệp ảnh vào ${dich}`);
}

async function restore(thuMuc, url) {
  const client = ketNoi(url);
  await client.connect();
  const tep = fs.readdirSync(thuMuc).filter((f) => f.endsWith(".jsonl"));

  // public trước (không phụ thuộc auth), rồi auth/storage.
  tep.sort((a, b) => (a.startsWith("public__") ? -1 : 1) - (b.startsWith("public__") ? -1 : 1));

  for (const f of tep) {
    const [schema, bang] = f.replace(/\.jsonl$/, "").split("__");
    const dong = fs.readFileSync(path.join(thuMuc, f), "utf8").split("\n").filter(Boolean);
    if (dong.length === 0) continue;
    const dl = "[" + dong.join(",") + "]";
    try {
      await client.query(
        `insert into ${schema}."${bang}" select * from json_populate_recordset(null::${schema}."${bang}", $1::json) on conflict do nothing`,
        [dl]
      );
      console.log(`  ${schema}.${bang}: ${dong.length} dòng`);
    } catch (err) {
      console.error(`  LỖI ${schema}.${bang}: ${err.message}`);
    }
  }
  await client.end();
}

/** Đối chiếu số đếm giữa bản sao lưu và database đích — thứ duy nhất chứng minh nạp đủ. */
async function verify(thuMuc, url) {
  const tomTat = JSON.parse(fs.readFileSync(path.join(thuMuc, "_tom-tat.json"), "utf8"));
  const client = ketNoi(url);
  await client.connect();
  let lech = 0;
  for (const [ten, v] of Object.entries(tomTat.bang)) {
    if (v.loi) continue;
    const [schema, bang] = ten.split(".");
    const { rows } = await client.query(`select count(*)::int n from ${schema}."${bang}"`);
    const dich = rows[0].n;
    const ok = dich === v.so_dong;
    if (!ok) lech += 1;
    console.log(`  ${ok ? "OK  " : "LỆCH"} ${ten}: sao lưu ${v.so_dong} / đích ${dich}`);
  }
  await client.end();
  console.log(lech === 0 ? "\nMọi bảng khớp." : `\n${lech} bảng LỆCH — dừng lại, đừng chuyển tiếp.`);
  if (lech > 0) process.exit(1);
}

const laEntry = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (laEntry) {
  const [lenh, thuMuc, dbUrl] = process.argv.slice(2);
  const nguon = process.env.POSTGRES_URL_NON_POOLING;
  if (lenh === "dump") await dump(thuMuc, nguon);
  else if (lenh === "anh") await chepAnh(thuMuc);
  else if (lenh === "restore") await restore(thuMuc, dbUrl);
  else if (lenh === "verify") await verify(thuMuc, dbUrl);
  else {
    console.error("Dùng: node scripts/db-backup.mjs dump|anh|restore|verify <thư-mục> [db-url]");
    process.exit(1);
  }
}

export { dump, restore, verify };
