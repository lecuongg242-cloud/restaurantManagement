// scripts/db-reset.mjs — RESET public schema về trạng thái sạch (ONE-OFF, phá hủy).
// Dùng khi cần dựng lại P1 trên project đã có schema cũ khác chuẩn.
// AN TOÀN: chỉ chạy khi CONFIRM_RESET=1. KHÔNG bao giờ chạy trên prod.
//
//   CONFIRM_RESET=1 node scripts/db-reset.mjs
//
// Sau reset: `supabase db push` áp 0001..0003; `npm run seed`.
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

if (process.env.CONFIRM_RESET !== "1" && !process.argv.includes("--confirm")) {
  console.error("Từ chối: chạy với --confirm (hoặc CONFIRM_RESET=1) để xác nhận DROP SCHEMA public.");
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL_NON_POOLING;
if (!connectionString) {
  console.error("Thiếu POSTGRES_URL_NON_POOLING trong .env.local");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

const SQL = `
drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;

alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;

-- Xóa lịch sử migration để supabase db push áp lại từ đầu.
delete from supabase_migrations.schema_migrations;
`;

try {
  await client.connect();
  await client.query(SQL);
  console.log("✓ Reset schema public + xóa lịch sử migration xong.");
} catch (e) {
  console.error("Reset lỗi:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
