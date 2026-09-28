// scripts/du-bao-dem.mjs — Job đêm dự báo + nhận xét tuần (P18, AI-01..05, QD-025 D4).
//
// Chạy 02:30 giờ VN bằng GitHub Actions (.github/workflows/du-bao.yml), như sao lưu. Mỗi quán đang dùng được:
//   1. Chuỗi doanh thu / hóa đơn theo ngày qua RPC báo cáo có sẵn (report_series_multi — CÙNG quy ước doanh thu với
//      màn Báo cáo) + số lượng từng món theo ngày → backtest 4 tuần → dự báo 14 ngày (món: 7 ngày) → ghi `forecasts`,
//      `forecast_runs`.
//   2. Bất thường của hôm qua (luật cứng) → `insights` kind 'anomaly' (mẫu câu, không gọi AI).
//   3. Nhận xét tuần (tuần vừa hết, thứ Hai → Chủ nhật) theo lịch rải → `insights` kind 'weekly'.
// Một quán lỗi KHÔNG chặn quán khác; có quán lỗi thì thoát mã 1 để GitHub gửi email (kênh trực sự cố như sao lưu).
//
// Chạy tay:  node scripts/du-bao-dem.mjs [--quan <slug>] [--ngay YYYY-MM-DD] [--khong-ghi] [--khong-nhan-xet]
// Env: POSTGRES_URL_NON_POOLING (bắt buộc); GEMINI_API_KEY / GROQ_API_KEY / CF_ACCOUNT_ID + CF_API_TOKEN (tùy chọn,
//      thiếu hết → nhận xét bằng mẫu câu); *_MODEL để đổi mô hình; MAX_NHAN_XET_MOI_DEM (mặc định 20).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { backtest, congNgay, forecastDaily, gomMonMoi, soTuanCoBan, MAPE_TOI_DA, TUAN_TOI_THIEU } from "../lib/forecast/model.mjs";
import { NGAY_LE_VN } from "../lib/forecast/holidays-vn.mjs";
import { buildWeeklyFacts } from "../lib/insights/facts.mjs";
import { detectAnomalies, lechNgay } from "../lib/insights/anomalies.mjs";
import { nhaCungCapTuEnv, writeInsight } from "../lib/insights/llm.mjs";
import { chonQuanDem } from "../lib/insights/schedule.mjs";

// .env.local khi chạy tay trên máy dev (trên GitHub Actions biến đã có sẵn).
const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
if (fs.existsSync(envFile)) {
  for (const raw of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const CHI_QUAN = arg("--quan");
const KHONG_GHI = process.argv.includes("--khong-ghi");
const KHONG_NHAN_XET = process.argv.includes("--khong-nhan-xet");
const HOM_NAY = arg("--ngay") ?? new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); // ngày VN
const LICH_SU_TUAN = 16;
const GIU_DU_BAO_NGAY = 60; // giữ các lượt cũ để so dự báo vs thực tế (nghiệm thu 2 tuần)
const MAX_NHAN_XET = Number(process.env.MAX_NHAN_XET_MOI_DEM || 20); // biến rỗng trên GitHub = mặc định

const log = (...a) => console.log(new Date().toISOString(), ...a);
/** Mốc 00:00 giờ VN của một ngày, dạng timestamptz. */
const dauNgayVn = (d) => `${d}T00:00:00+07:00`;
/** Thứ Hai của tuần chứa ngày d. */
const thuHai = (d) => congNgay(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.error("Thiếu POSTGRES_URL_NON_POOLING.");
  process.exit(1);
}
// Như db-backup.mjs: pg coi sslmode=require là verify-full, Supabase dùng chứng chỉ tự ký nên phải gỡ ra.
const cs = String(url).replace(/([?&])sslmode=[^&]*/, "$1").replace(/[?&]$/, "");
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();

/** Doanh thu + hóa đơn theo ngày VN trong [tu, den). Ngày không bán = 0, từ ngày bán đầu tiên. */
async function chuoiNgay(tenantId, tu, den) {
  const { rows } = await db.query(
    `select to_char(bucket_start at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as ngay, revenue::float8 as dt, bill_count::int as hd
       from public.report_series_multi(array[$1]::uuid[], $2::timestamptz, $3::timestamptz, 'day')`,
    [tenantId, dauNgayVn(tu), dauNgayVn(den)]
  );
  const m = new Map(rows.map((r) => [r.ngay, r]));
  const dau = rows.length ? rows.reduce((a, r) => (r.ngay < a ? r.ngay : a), rows[0].ngay) : null;
  const out = [];
  if (dau) for (let d = dau; d < den; d = congNgay(d, 1)) out.push({ ngay: d, dt: m.get(d)?.dt ?? 0, hd: m.get(d)?.hd ?? 0 });
  return out;
}

/** Số lượng từng món theo ngày VN — cùng quy ước "món bán chạy" (bill đã trả, theo business_at). */
async function monTheoNgay(tenantId, tu, den) {
  const { rows } = await db.query(
    `select to_char(b.business_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as ngay,
            coalesce(oi.menu_item_id::text, 'ten:' || coalesce(oi.name_snapshot, '—')) as khoa,
            max(coalesce(oi.name_snapshot, '—')) as ten,
            sum(bi.qty_allocated)::float8 as sl, sum(bi.amount)::float8 as dt
       from public.bill_items bi
       join public.bills_revenue b on b.id = bi.bill_id
       join public.order_items oi on oi.id = bi.order_item_id
      where bi.tenant_id = $1 and b.status = 'paid' and b.business_at >= $2::timestamptz and b.business_at < $3::timestamptz
      group by 1, 2`,
    [tenantId, dauNgayVn(tu), dauNgayVn(den)]
  );
  return rows;
}

/** 18-01: dự báo + backtest cho một quán, ghi bảng. Trả tổng dự báo 7 ngày tới (cho nhận xét tuần) nếu tin được. */
async function duBaoQuan(t) {
  const tu = congNgay(HOM_NAY, -7 * LICH_SU_TUAN);
  const ngay = await chuoiNgay(t.id, tu, HOM_NAY);
  const dt = ngay.map((x) => ({ date: x.ngay, value: x.dt }));
  const hd = ngay.map((x) => ({ date: x.ngay, value: x.hd }));
  const tuan = soTuanCoBan(dt);
  const soNgayBan = dt.filter((p) => p.value > 0).length;
  const opts = { holidays: NGAY_LE_VN, weeks: 6 };
  const btDt = backtest(dt, opts, 4);
  const btHd = backtest(hd, opts, 4);
  const tin = tuan >= TUAN_TOI_THIEU && btDt.mape !== null && btDt.mape <= MAPE_TOI_DA;

  const dong = [];
  const them = (metric, key, ten, arr) => {
    for (const p of arr) {
      dong.push([t.id, HOM_NAY, p.date, metric, key, ten, Math.round(p.value * 100) / 100, Math.round(p.low * 100) / 100, Math.round(p.high * 100) / 100, p.holiday]);
    }
  };
  const duDt = dt.length ? forecastDaily(dt, { ...opts, horizon: 14, from: HOM_NAY }) : [];
  if (dt.length) {
    them("revenue", null, null, duDt);
    them("bills", null, null, forecastDaily(hd, { ...opts, horizon: 14, from: HOM_NAY }));
    // Món: 8 tuần gần nhất đủ cho trung bình 6 tuần; món mới < 3 tuần gộp "Món khác".
    const rows = await monTheoNgay(t.id, congNgay(HOM_NAY, -56), HOM_NAY);
    const theoMon = new Map();
    const ten = new Map([["khac", "Món khác"]]);
    for (const r of rows) {
      ten.set(r.khoa, r.ten);
      const arr = theoMon.get(r.khoa) ?? [];
      arr.push({ date: r.ngay, value: r.sl });
      theoMon.set(r.khoa, arr);
    }
    for (const [k, pts] of gomMonMoi(theoMon, HOM_NAY)) {
      // Món có số ngày bán thưa vẫn dự báo được: ngày không bán = 0 được loại, trung bình theo ngày có bán.
      them("item_qty", k, ten.get(k) ?? k, forecastDaily(pts, { ...opts, horizon: 7, from: HOM_NAY }));
    }
  }

  const status = !dt.length || tuan < TUAN_TOI_THIEU || btDt.mape === null ? "thieu-du-lieu" : "ok";
  log(`${t.slug}: ${tuan} tuần có bán, ${soNgayBan} ngày; sai lệch backtest doanh thu ${btDt.mape?.toFixed(1) ?? "—"}%, hóa đơn ${btHd.mape?.toFixed(1) ?? "—"}% → ${status}${tin ? "" : " (không hiện)"}; ${dong.length} dòng dự báo`);
  if (!KHONG_GHI) {
    await db.query("begin");
    try {
      await db.query("delete from public.forecasts where tenant_id = $1 and (run_date = $2 or run_date < $3)", [t.id, HOM_NAY, congNgay(HOM_NAY, -GIU_DU_BAO_NGAY)]);
      for (let i = 0; i < dong.length; i += 500) {
        const phan = dong.slice(i, i + 500);
        const cot = 10;
        const ve = phan.map((_, j) => `(${Array.from({ length: cot }, (_, c) => `$${j * cot + c + 1}`).join(",")})`).join(",");
        await db.query(
          `insert into public.forecasts (tenant_id, run_date, target_date, metric, item_key, item_name, value, low, high, holiday) values ${ve}`,
          phan.flat()
        );
      }
      await db.query(
        `insert into public.forecast_runs (tenant_id, run_date, status, history_days, selling_weeks, mape_revenue, mape_bills, error)
         values ($1, $2, $3, $4, $5, $6, $7, null)
         on conflict (tenant_id, run_date) do update set status = excluded.status, history_days = excluded.history_days,
           selling_weeks = excluded.selling_weeks, mape_revenue = excluded.mape_revenue, mape_bills = excluded.mape_bills,
           error = null, created_at = now()`,
        [t.id, HOM_NAY, status, soNgayBan, tuan, btDt.mape, btHd.mape]
      );
      await db.query("commit");
    } catch (e) {
      await db.query("rollback");
      throw e;
    }
  }
  const tuanToi = duDt.slice(0, 7).reduce((s, p) => s + p.value, 0);
  return { ngay, duBaoTuanToi: tin ? { doanhThu: Math.round(tuanToi), saiLechPct: Math.round(btDt.mape * 10) / 10 } : null };
}

/** 18-03: bất thường của HÔM QUA (doanh thu lệch > 2σ so với cùng thứ) — mẫu câu, không gọi AI. */
async function batThuongHomQua(t, ngay) {
  const homQua = congNgay(HOM_NAY, -1);
  const a = lechNgay(homQua, new Map(ngay.map((x) => [x.ngay, x.dt])));
  if (!a) return;
  const { rows } = await db.query(
    "select 1 from public.insights where tenant_id = $1 and kind = 'anomaly' and facts->>'ngay' = $2 limit 1",
    [t.id, homQua]
  );
  if (rows.length) return;
  const body = `${a.thu} ${homQua.slice(8, 10)}/${homQua.slice(5, 7)}: doanh thu ${String(Math.round(a.doanhThu)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}đ, ${a.huong === "cao" ? "cao" : "thấp"} bất thường so với cùng thứ các tuần trước (trung bình ${String(a.trungBinhCungThu).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}đ).`;
  log(`${t.slug}: bất thường ${homQua} — ${a.huong} ${a.lechPct}%`);
  if (!KHONG_GHI) {
    await db.query(
      "insert into public.insights (tenant_id, week_start, kind, body, facts, anomalies, model) values ($1, $2, 'anomaly', $3, $4, $5, 'luat')",
      [t.id, thuHai(homQua), body, JSON.stringify({ ngay: homQua }), JSON.stringify([a])]
    );
  }
}

/** 18-03: nhận xét tuần vừa hết cho một quán. */
async function nhanXetTuan(t, ngay, duBaoTuanToi, nguonAi) {
  const tuNgay = congNgay(thuHai(HOM_NAY), -7);
  const den = congNgay(tuNgay, 7);
  const truoc = congNgay(tuNgay, -7);
  const q = (sql, p) => db.query(sql, p).then((r) => r.rows);
  // Nối tiếp, không Promise.all: MỘT kết nối pg chỉ chạy một truy vấn một lúc.
  const cacTruyVan = [
    () => monTheoNgay(t.id, tuNgay, den),
    () => monTheoNgay(t.id, truoc, tuNgay),
    () => q("select name as ten, revenue::float8 as dt from public.report_by_category_multi(array[$1]::uuid[], $2, $3)", [t.id, dauNgayVn(tuNgay), dauNgayVn(den)]),
    () => q("select name as ten, revenue::float8 as dt from public.report_by_category_multi(array[$1]::uuid[], $2, $3)", [t.id, dauNgayVn(truoc), dauNgayVn(tuNgay)]),
    () =>
      q(
        `select extract(hour from bucket_start at time zone 'Asia/Ho_Chi_Minh')::int as gio, sum(revenue)::float8 as dt
           from public.report_series_multi(array[$1]::uuid[], $2, $3, 'hour') group by 1`,
        [t.id, dauNgayVn(tuNgay), dauNgayVn(den)]
      ),
    () =>
      q(
        `select (select discount_amount from public.report_branch_extra(array[$1]::uuid[], $2, $3))::float8 as gg_nay,
                (select cancelled_amount from public.report_branch_extra(array[$1]::uuid[], $2, $3))::float8 as huy_nay,
                (select discount_amount from public.report_branch_extra(array[$1]::uuid[], $4, $2))::float8 as gg_truoc,
                (select cancelled_amount from public.report_branch_extra(array[$1]::uuid[], $4, $2))::float8 as huy_truoc`,
        [t.id, dauNgayVn(tuNgay), dauNgayVn(den), dauNgayVn(truoc)]
      ),
  ];
  const kq = [];
  for (const f of cacTruyVan) kq.push(await f());
  const [monNay, monTruoc, nhomNay, nhomTruoc, gio, them] = kq;
  const gomMon = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const x = m.get(r.khoa) ?? { ten: r.ten, sl: 0, doanhThu: 0 };
      x.sl += r.sl;
      x.doanhThu += r.dt;
      m.set(r.khoa, x);
    }
    return [...m.values()].map((x) => ({ ten: x.ten, sl: Math.round(x.sl), doanhThu: Math.round(x.doanhThu) }));
  };
  const facts = buildWeeklyFacts({
    tuNgay,
    ngay: ngay.map((x) => ({ ngay: x.ngay, doanhThu: x.dt, hoaDon: x.hd })),
    monTuanNay: gomMon(monNay),
    monTuanTruoc: gomMon(monTruoc),
    nhomTuanNay: nhomNay.map((r) => ({ ten: r.ten, doanhThu: r.dt })),
    nhomTuanTruoc: nhomTruoc.map((r) => ({ ten: r.ten, doanhThu: r.dt })),
    theoGio: gio.map((r) => ({ gio: r.gio, doanhThu: r.dt })),
    giamGia: { tuanNay: them[0].gg_nay ?? 0, tuanTruoc: them[0].gg_truoc ?? 0 },
    huy: { tuanNay: them[0].huy_nay ?? 0, tuanTruoc: them[0].huy_truoc ?? 0 },
    duBaoTuanToi,
  });
  if (facts.doanhThu.tuanNay <= 0) {
    log(`${t.slug}: tuần ${tuNgay} không có bán — bỏ qua nhận xét`);
    return;
  }
  const bt = detectAnomalies(facts, new Map(ngay.map((x) => [x.ngay, x.dt])), gomMon(monTruoc));
  const r = await writeInsight(facts, bt, nguonAi);
  log(`${t.slug}: nhận xét tuần ${tuNgay} bằng ${r.model}${r.fallbacks.length ? ` (đã rơi: ${r.fallbacks.map((f) => `${f.nguon} — ${f.lyDo}`).join("; ")})` : ""}`);
  if (KHONG_GHI) {
    console.log(`\n${r.body}\n`);
    return;
  }
  await db.query(
    `insert into public.insights (tenant_id, week_start, kind, body, facts, anomalies, model, fallbacks, tokens_in, tokens_out)
     values ($1, $2, 'weekly', $3, $4, $5, $6, $7, $8, $9)
     on conflict (tenant_id, week_start) where kind = 'weekly' do nothing`,
    [t.id, tuNgay, r.body, JSON.stringify(facts), JSON.stringify(bt), r.model, JSON.stringify(r.fallbacks), r.tokensIn, r.tokensOut]
  );
}

// ── Chạy ──────────────────────────────────────────────────────────────────────
const { rows: quan } = await db.query(
  `select id, slug from public.tenants t
    where public.tenant_usable(t.status, t.paid_until) ${CHI_QUAN ? "and t.slug = $1" : ""}
    order by id`,
  CHI_QUAN ? [CHI_QUAN] : []
);
log(`Dự báo ngày ${HOM_NAY} cho ${quan.length} quán${KHONG_GHI ? " (KHÔNG ghi)" : ""}.`);

const nguonAi = nhaCungCapTuEnv(process.env);
log(`Nguồn AI: ${nguonAi.map((n) => `${n.ten}:${n.model}`).join(" → ") || "(không có khóa — dùng mẫu câu)"}`);

const loi = [];
const ketQua = new Map();
for (const t of quan) {
  try {
    const r = await duBaoQuan(t);
    ketQua.set(t.id, r);
    await batThuongHomQua(t, r.ngay);
  } catch (e) {
    loi.push(t.slug);
    log(`LỖI ${t.slug}: ${e.message}`);
    if (!KHONG_GHI) {
      await db
        .query(
          `insert into public.forecast_runs (tenant_id, run_date, status, error) values ($1, $2, 'loi', $3)
           on conflict (tenant_id, run_date) do update set status = 'loi', error = excluded.error, created_at = now()`,
          [t.id, HOM_NAY, String(e.message).slice(0, 500)]
        )
        .catch(() => {});
    }
  }
}

if (!KHONG_NHAN_XET) {
  const tuNgay = congNgay(thuHai(HOM_NAY), -7);
  const { rows: daCo } = await db.query("select tenant_id from public.insights where kind = 'weekly' and week_start = $1", [tuNgay]);
  const lamDem = chonQuanDem([...ketQua.keys()], new Set(daCo.map((r) => r.tenant_id)), MAX_NHAN_XET);
  log(`Nhận xét tuần ${tuNgay}: ${lamDem.length} quán đêm nay (tối đa ${MAX_NHAN_XET}).`);
  for (const id of lamDem) {
    const t = quan.find((x) => x.id === id);
    try {
      await nhanXetTuan(t, ketQua.get(id).ngay, ketQua.get(id).duBaoTuanToi, nguonAi);
    } catch (e) {
      loi.push(`${t.slug} (nhận xét)`);
      log(`LỖI nhận xét ${t.slug}: ${e.message}`);
    }
  }
}

await db.end();
if (loi.length) {
  console.error(`Có ${loi.length} lỗi: ${loi.join(", ")}`);
  process.exit(1);
}
log("Xong.");
