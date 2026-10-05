// scripts/doi-chieu-kho-demo.mjs — Đối chiếu bản chốt sổ kho (daily_closes) của quán demo với đáp án do
// seed-kho-demo.mjs tính ĐỘC LẬP bằng JS: từng ngày × từng nguyên liệu × 15 trường. In số ô khớp / lệch và hao hụt theo
// tiền của đáp án (để so với khối "Hao hụt" ở trang Báo cáo).
//
//   node scripts/seed-kho-demo.mjs --out kho-demo.json
//   (mở Quản trị → Kho hàng một lần: app tự chốt các ngày đã qua)
//   node scripts/doi-chieu-kho-demo.mjs kho-demo.json
//
// Kịch bản: docs/40-KiemTra/KichBan-Kho-PhoViet.md. Cần POSTGRES_URL_NON_POOLING (.env.local).
import fs from "node:fs";
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const file = process.argv[2];
if (!file) throw new Error("Thiếu đường dẫn file đáp án (tham số --out của seed-kho-demo.mjs)");
const exp = JSON.parse(fs.readFileSync(file, "utf8"));
const c = new pg.Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING.replace(/[?&]sslmode=[^&]*/, ""),
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows } = await c.query("select business_date::text d, payload from daily_closes where tenant_id=$1 order by 1", [exp.tenant]);
const FIELDS = ["opening", "receipts", "batch_in", "batch_out", "waste_hong", "waste_do_bo", "waste_com_nv", "waste_khac", "adjust",
  "counted", "order_usage", "cancel_usage", "batch_shortfall", "closing", "unit_cost"];
let ok = 0;
let bad = 0;
const diffs = [];
const totals = { cancel: 0, shortfall: 0, waste: 0, unexplained: 0 };
for (const day of exp.days) {
  const close = rows.find((r) => r.d === day);
  if (!close) {
    diffs.push(`${day}: THIẾU bản chốt — mở khu Kho hàng để app tự chốt`);
    bad++;
    continue;
  }
  for (const [name, e] of Object.entries(exp.expected[day])) {
    const a = close.payload.ingredients.find((x) => x.name === name);
    for (const f of FIELDS) {
      const ev = e[f];
      const av = !a ? (f === "counted" ? false : f === "unit_cost" ? ev : 0) : a[f];
      const same =
        typeof ev === "boolean"
          ? ev === av
          : ev === null
            ? av === null
            : Math.abs(Number(av) - ev) < (f === "unit_cost" ? 0.01 : 0.0015);
      if (same) ok++;
      else {
        bad++;
        diffs.push(`${day} ${name}.${f}: app=${av} đáp án=${ev}`);
      }
    }
    if (e.vnd) for (const k of Object.keys(totals)) totals[k] += e.vnd[k];
  }
}
console.log(`Ngày ${exp.days[0]} → ${exp.days.at(-1)}: so khớp ${ok} ô, lệch ${bad} ô`);
if (diffs.length) console.log(diffs.slice(0, 60).join("\n"));
const tong = Object.values(totals).reduce((s, x) => s + x, 0);
console.log("Đáp án hao hụt (đ):", totals, "tổng", tong);
await c.end();
process.exit(bad ? 1 : 0);
