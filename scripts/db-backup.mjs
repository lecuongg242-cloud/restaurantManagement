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
//   node scripts/db-backup.mjs day-du  <thu-muc>            # dump + ảnh + tự kiểm — lệnh để ĐẶT LỊCH
//   node scripts/db-backup.mjs kiem    <thu-muc>            # tự kiểm: đọc chính tệp dữ liệu
//   node scripts/db-backup.mjs tuoi    <thu-muc-cha> [giờ]  # bản mới nhất bao giờ; quá hạn/không có → mã 1
import crypto from "node:crypto";
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
    const noiDung = rows.map((x) => JSON.stringify(x.r)).join("\n") + (rows.length ? "\n" : "");
    fs.writeFileSync(tep, noiDung);
    // Mã băm để `kiem` bắt được tệp bị sửa mà vẫn đủ số dòng (OPS-09).
    tomTat[ten] = { so_dong: rows.length, sha256: bam(noiDung) };
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
  const co = new Set(fs.readdirSync(thuMuc).filter((f) => f.endsWith(".jsonl")));

  /**
   * Thứ tự nạp: `auth` trước vì `public.profiles` và `public.memberships` trỏ vào `auth.users`;
   * `storage.buckets` trước `storage.objects`.
   *
   * Trong `public` thì các bảng trỏ chằng chịt vào nhau (bill_items → bills → table_sessions → …),
   * nên thay vì tự xếp thứ tự — việc sẽ sai ngay khi ai đó thêm bảng — TẮT kiểm khóa ngoại trong
   * phiên nạp rồi bật lại. Đây đúng là cách `pg_restore` làm.
   */
  const thuTu = [
    "auth__users.jsonl",
    "auth__identities.jsonl",
    "storage__buckets.jsonl",
    ...[...co].filter((f) => f.startsWith("public__")).sort(),
    "storage__objects.jsonl",
  ].filter((f) => co.has(f));

  await client.query("set session_replication_role = replica");
  let loi = 0;
  try {
    for (const f of thuTu) {
      const [schema, bang] = f.replace(/\.jsonl$/, "").split("__");
      const dong = fs.readFileSync(path.join(thuMuc, f), "utf8").split(String.fromCharCode(10)).filter(Boolean);
      if (dong.length === 0) {
        console.log(`  ${schema}.${bang}: 0 dòng (bỏ qua)`);
        continue;
      }
      try {
        // Bỏ cột SINH TỰ ĐỘNG (auth.users.confirmed_at, auth.identities.email,
        // storage.objects.path_tokens…): Postgres từ chối chèn thẳng vào chúng. Liệt kê cột
        // tường minh thay vì `select *`.
        const { rows: cot } = await client.query(
          `select column_name from information_schema.columns
           where table_schema = $1 and table_name = $2 and is_generated <> 'ALWAYS'
           order by ordinal_position`,
          [schema, bang]
        );
        const ds = cot.map((c) => `"${c.column_name}"`).join(", ");
        await client.query(
          `insert into ${schema}."${bang}" (${ds})
           select ${ds} from json_populate_recordset(null::${schema}."${bang}", $1::json)
           on conflict do nothing`,
          ["[" + dong.join(",") + "]"]
        );
        console.log(`  ${schema}.${bang}: ${dong.length} dòng`);
      } catch (err) {
        loi += 1;
        console.error(`  LỖI ${schema}.${bang}: ${err.message}`);
      }
    }
  } finally {
    // Bật lại DÙ CÓ LỖI: để chế độ replica sót lại là database im lặng bỏ qua mọi khóa ngoại về sau.
    await client.query("set session_replication_role = DEFAULT");
  }
  await client.end();
  if (loi > 0) {
    console.error(`${loi} bảng nạp LỖI — đừng chuyển tiếp, xem lại trước.`);
    process.exit(1);
  }
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

function bam(noiDung) {
  return crypto.createHash("sha256").update(noiDung).digest("hex");
}

/**
 * Tự kiểm một bản sao lưu bằng cách đọc CHÍNH tệp dữ liệu (OPS-09). Không cần database.
 *
 * VÌ SAO: `verify` đối chiếu tệp TÓM TẮT với database đích, không đọc tệp dữ liệu — bản dump bị cắt
 * cụt mà tóm tắt còn nguyên vẫn "Mọi bảng khớp". Và `chepAnh` gặp ảnh tải lỗi chỉ ghi log rồi đi
 * tiếp. Bản sao lưu hỏng mà trông như lành còn tệ hơn không có: nó tạo cảm giác an toàn giả, và chỉ
 * lộ ra đúng ngày cần khôi phục.
 *
 * Kiểm: mọi bảng dump được · đủ tệp · đúng số dòng · mọi dòng là JSON · mã băm khớp (bản cũ chưa có
 * mã băm thì bỏ qua bước này) · số ảnh trên đĩa = số object trong bucket menu-images.
 */
export function kiemTep(thuMuc) {
  const loi = [];
  let tomTat;
  try {
    tomTat = JSON.parse(fs.readFileSync(path.join(thuMuc, "_tom-tat.json"), "utf8"));
  } catch (err) {
    return { dat: false, loi: [`không đọc được _tom-tat.json: ${err.message}`] };
  }

  let soAnhCanCo = 0;
  for (const [ten, v] of Object.entries(tomTat.bang ?? {})) {
    if (v.loi) {
      loi.push(`${ten}: không dump được lúc sao lưu (${v.loi})`);
      continue;
    }
    const [schema, bang] = ten.split(".");
    const tep = path.join(thuMuc, `${schema}__${bang}.jsonl`);
    if (!fs.existsSync(tep)) {
      loi.push(`${ten}: thiếu tệp ${path.basename(tep)}`);
      continue;
    }
    const noiDung = fs.readFileSync(tep, "utf8");
    const dong = noiDung.split("\n").filter((d) => d.length > 0);
    if (dong.length !== v.so_dong) {
      loi.push(`${ten}: có ${dong.length} dòng, tóm tắt ghi ${v.so_dong}`);
      continue;
    }
    const hong = dong.findIndex((d) => {
      try {
        JSON.parse(d);
        return false;
      } catch {
        return true;
      }
    });
    if (hong > -1) {
      loi.push(`${ten}: dòng ${hong + 1} không phải JSON hợp lệ`);
      continue;
    }
    if (v.sha256 && bam(noiDung) !== v.sha256) {
      loi.push(`${ten}: mã băm lệch — nội dung đã bị sửa`);
      continue;
    }
    if (ten === "storage.objects") {
      soAnhCanCo = dong.filter((d) => JSON.parse(d).bucket_id === "menu-images").length;
    }
  }

  if (soAnhCanCo > 0) {
    const thuMucAnh = path.join(thuMuc, "storage-menu-images");
    if (!fs.existsSync(thuMucAnh)) {
      loi.push(`ảnh: chưa chép (cần ${soAnhCanCo} tệp) — chạy lệnh "anh" hoặc dùng "day-du"`);
    } else {
      const coAnh = fs.readdirSync(thuMucAnh).length;
      if (coAnh !== soAnhCanCo) loi.push(`ảnh: có ${coAnh} tệp, cần ${soAnhCanCo}`);
    }
  }

  return { dat: loi.length === 0, loi };
}

/**
 * Bản sao lưu MỚI NHẤT trong một thư mục cha, theo mốc ghi trong tệp tóm tắt — không theo giờ sửa
 * thư mục, vì chép thư mục sang ổ khác là đổi giờ sửa. Không có bản nào → null: đó là chế độ hỏng
 * im lặng nhất và phải được báo đỏ, không phải xanh.
 */
export function tuoiBanMoiNhat(thuMucCha, now = Date.now()) {
  if (!fs.existsSync(thuMucCha)) return null;
  let moiNhat = null;
  for (const ten of fs.readdirSync(thuMucCha)) {
    const thuMuc = path.join(thuMucCha, ten);
    let luc;
    try {
      luc = JSON.parse(fs.readFileSync(path.join(thuMuc, "_tom-tat.json"), "utf8")).luc;
    } catch {
      continue; // thư mục rác, không phải bản sao lưu
    }
    const t = Date.parse(luc);
    if (!Number.isFinite(t)) continue;
    if (!moiNhat || t > moiNhat.t) moiNhat = { thuMuc, luc, t };
  }
  if (!moiNhat) return null;
  return { thuMuc: moiNhat.thuMuc, luc: moiNhat.luc, gio: Math.floor((now - moiNhat.t) / 3_600_000) };
}

function baoKiem(thuMuc) {
  const { dat, loi } = kiemTep(thuMuc);
  if (dat) {
    const tomTat = JSON.parse(fs.readFileSync(path.join(thuMuc, "_tom-tat.json"), "utf8"));
    const coBam = Object.values(tomTat.bang).some((v) => v.sha256);
    console.log(
      `Tự kiểm ${thuMuc}: ĐẠT — mọi tệp đủ dòng, đúng JSON, đủ ảnh` +
        (coBam ? ", đúng mã băm." : ". (Bản cũ, chưa có mã băm — không kiểm được nội dung bị sửa.)")
    );
  }
  else console.error(`Tự kiểm ${thuMuc}: HỎNG\n  ${loi.join("\n  ")}`);
  return dat;
}

const laEntry = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (laEntry) {
  const [lenh, thuMuc, dbUrl] = process.argv.slice(2);
  const nguon = process.env.POSTGRES_URL_NON_POOLING;
  if (lenh === "dump") await dump(thuMuc, nguon);
  else if (lenh === "anh") await chepAnh(thuMuc);
  else if (lenh === "restore") await restore(thuMuc, dbUrl);
  else if (lenh === "verify") await verify(thuMuc, dbUrl);
  else if (lenh === "kiem") process.exit(baoKiem(thuMuc) ? 0 : 1);
  else if (lenh === "day-du") {
    // Lệnh để ĐẶT LỊCH: một bản sao lưu = dữ liệu + ảnh + tự kiểm. Thiếu một trong ba là chưa xong.
    await dump(thuMuc, nguon);
    await chepAnh(thuMuc);
    process.exit(baoKiem(thuMuc) ? 0 : 1);
  } else if (lenh === "tuoi") {
    const nguong = Number(dbUrl ?? 24);
    const ban = tuoiBanMoiNhat(thuMuc);
    if (!ban) {
      console.error(`KHÔNG có bản sao lưu nào trong ${thuMuc}.`);
      process.exit(1);
    }
    console.log(`Bản mới nhất: ${ban.thuMuc} — ${ban.luc} (${ban.gio} giờ trước, ngưỡng ${nguong} giờ)`);
    const lanh = baoKiem(ban.thuMuc);
    if (ban.gio >= nguong) console.error(`QUÁ HẠN: bản mới nhất đã ${ban.gio} giờ.`);
    process.exit(lanh && ban.gio < nguong ? 0 : 1);
  } else {
    console.error("Dùng: node scripts/db-backup.mjs dump|anh|day-du|kiem|tuoi|restore|verify <thư-mục> [db-url|giờ]");
    process.exit(1);
  }
}

export { dump, restore, verify };
