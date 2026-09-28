import "server-only";
import { createClient } from "@/lib/supabase/server";
import { vnToday } from "@/lib/billing/report-range";
import { congNgay, thuTrongTuan, MAPE_TOI_DA, TUAN_TOI_THIEU } from "@/lib/forecast/model.mjs";

/**
 * Đọc dự báo + nhận xét cho màn admin (P18). Chỉ ĐỌC bảng job đêm đã ghi — không tính gì ở đây (QD-025 D4). Chạy dưới
 * phiên của người xem: RLS chỉ cho chủ / quản lý của chính chi nhánh (0073).
 */

const THU_NGAN = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export type NgayDuBao = {
  date: string;
  nhan: string;
  value: number;
  low: number;
  high: number;
  holiday: boolean;
  /** Thực tế cùng thứ tuần trước — để so. null = tuần trước không bán ngày đó. */
  tuanTruoc: number | null;
};

export type DuBaoHienThi =
  | { trangThai: "chua-co" }
  | {
      trangThai: "hien" | "chua-tin";
      runDate: string;
      /** Job đêm qua không chạy / lỗi → đang hiện bản cũ hơn hôm nay (AI-01). */
      cu: boolean;
      saiLechPct: number | null;
      soTuan: number;
      ngay: NgayDuBao[];
      tong: { value: number; low: number; high: number; tuanTruoc: number };
      monNhieu: { ten: string; sl: number }[];
    };

export async function getDuBao(tenantId: string): Promise<DuBaoHienThi> {
  const supabase = await createClient();
  const homNay = vnToday();
  const { data: run } = await supabase
    .from("forecast_runs")
    .select("run_date, status, selling_weeks, mape_revenue")
    .eq("tenant_id", tenantId)
    .in("status", ["ok", "thieu-du-lieu"])
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return { trangThai: "chua-co" };

  const runDate = run.run_date as string;
  const [{ data: rows }, { data: mon }, { data: thuc }] = await Promise.all([
    supabase
      .from("forecasts")
      .select("target_date, value, low, high, holiday")
      .eq("tenant_id", tenantId)
      .eq("run_date", runDate)
      .eq("metric", "revenue")
      .gte("target_date", homNay)
      .order("target_date")
      .limit(7),
    supabase
      .from("forecasts")
      .select("item_key, item_name, value")
      .eq("tenant_id", tenantId)
      .eq("run_date", runDate)
      .eq("metric", "item_qty")
      .gte("target_date", homNay)
      .lt("target_date", congNgay(homNay, 7)),
    supabase.rpc("report_series_multi", {
      p_tenants: [tenantId],
      p_from: `${congNgay(homNay, -7)}T00:00:00+07:00`,
      p_to: `${homNay}T00:00:00+07:00`,
      p_grain: "day",
    }),
  ]);

  const thucTe = new Map(
    ((thuc ?? []) as { bucket_start: string; revenue: number }[]).map((r) => [
      new Date(Date.parse(r.bucket_start) + 7 * 3600e3).toISOString().slice(0, 10),
      Number(r.revenue),
    ])
  );
  const ngay: NgayDuBao[] = ((rows ?? []) as { target_date: string; value: number; low: number; high: number; holiday: boolean }[]).map((r) => ({
    date: r.target_date,
    nhan: `${THU_NGAN[thuTrongTuan(r.target_date)]} ${r.target_date.slice(8, 10)}/${r.target_date.slice(5, 7)}`,
    value: Math.round(Number(r.value)),
    low: Math.round(Number(r.low)),
    high: Math.round(Number(r.high)),
    holiday: r.holiday,
    tuanTruoc: thucTe.get(congNgay(r.target_date, -7)) ?? null,
  }));

  const theoMon = new Map<string, { ten: string; sl: number }>();
  for (const r of (mon ?? []) as { item_key: string; item_name: string | null; value: number }[]) {
    const x = theoMon.get(r.item_key) ?? { ten: r.item_name ?? r.item_key, sl: 0 };
    x.sl += Number(r.value);
    theoMon.set(r.item_key, x);
  }

  const saiLech = run.mape_revenue === null ? null : Number(run.mape_revenue);
  const soTuan = Number(run.selling_weeks ?? 0);
  const tin = run.status === "ok" && soTuan >= TUAN_TOI_THIEU && saiLech !== null && saiLech <= MAPE_TOI_DA && ngay.length > 0;
  return {
    trangThai: tin ? "hien" : "chua-tin",
    runDate,
    cu: runDate < homNay,
    saiLechPct: saiLech,
    soTuan,
    ngay,
    tong: {
      value: ngay.reduce((s, d) => s + d.value, 0),
      low: ngay.reduce((s, d) => s + d.low, 0),
      high: ngay.reduce((s, d) => s + d.high, 0),
      tuanTruoc: ngay.reduce((s, d) => s + (d.tuanTruoc ?? 0), 0),
    },
    monNhieu: [...theoMon.values()]
      .filter((m) => m.ten !== "Món khác")
      .sort((a, b) => b.sl - a.sl)
      .slice(0, 5)
      .map((m) => ({ ten: m.ten, sl: Math.round(m.sl) })),
  };
}

export type NhanXet = {
  id: number;
  tuan: string;
  body: string;
  model: string | null;
  taoLuc: string;
  phanHoi: boolean | null;
};

export type BatThuongGanDay = { id: number; luc: string; body: string };

/** Nhận xét tuần mới nhất + bất thường 14 ngày qua + phản hồi của chính người xem. */
export async function getNhanXet(tenantId: string, membershipId: string): Promise<{ nhanXet: NhanXet | null; batThuong: BatThuongGanDay[] }> {
  const supabase = await createClient();
  const [{ data: tuan }, { data: bt }] = await Promise.all([
    supabase
      .from("insights")
      .select("id, week_start, body, model, created_at")
      .eq("tenant_id", tenantId)
      .eq("kind", "weekly")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("insights")
      .select("id, body, created_at")
      .eq("tenant_id", tenantId)
      .eq("kind", "anomaly")
      .gte("created_at", new Date(Date.now() - 14 * 86400e3).toISOString())
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  let phanHoi: boolean | null = null;
  if (tuan) {
    const { data: ph } = await supabase
      .from("insight_feedback")
      .select("useful")
      .eq("insight_id", tuan.id)
      .eq("membership_id", membershipId)
      .maybeSingle();
    phanHoi = (ph?.useful as boolean | undefined) ?? null;
  }
  return {
    nhanXet: tuan
      ? { id: tuan.id as number, tuan: tuan.week_start as string, body: tuan.body as string, model: tuan.model as string | null, taoLuc: tuan.created_at as string, phanHoi }
      : null,
    batThuong: ((bt ?? []) as { id: number; body: string; created_at: string }[]).map((r) => ({ id: r.id, luc: r.created_at, body: r.body })),
  };
}

/**
 * Số món dự báo cho `soNgay` ngày từ hôm nay (P18 18-02) — CHỈ khi dự báo đáng tin (cùng điều kiện khối "7 ngày tới").
 * null = chưa có / chưa tin được → màn nhập hàng không gợi ý.
 */
export async function getMonDuBao(tenantId: string, soNgay: number): Promise<{ runDate: string; mon: { itemKey: string; qty: number }[] } | null> {
  const du = await getDuBao(tenantId);
  if (du.trangThai !== "hien") return null;
  const supabase = await createClient();
  const homNay = vnToday();
  const { data } = await supabase
    .from("forecasts")
    .select("item_key, value")
    .eq("tenant_id", tenantId)
    .eq("run_date", du.runDate)
    .eq("metric", "item_qty")
    .gte("target_date", homNay)
    .lt("target_date", congNgay(homNay, soNgay));
  const m = new Map<string, number>();
  for (const r of (data ?? []) as { item_key: string; value: number }[]) m.set(r.item_key, (m.get(r.item_key) ?? 0) + Number(r.value));
  return { runDate: du.runDate, mon: [...m].map(([itemKey, qty]) => ({ itemKey, qty })) };
}
