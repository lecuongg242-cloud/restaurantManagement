import type { SupabaseClient } from "@supabase/supabase-js";
import { loadInventory } from "./data";
import { addDays } from "./day";
import { buildDailyClose, daysToClose, type DayRow, type PricePoint } from "./close";
import { measureYield, yieldSamples } from "./yield";

/**
 * Tự chốt sổ (INV-09): chốt LẦN LƯỢT mọi ngày chưa chốt từ mốc gốc tới HÔM QUA. Gọi khi mở khu
 * Nguyên liệu hoặc Báo cáo. Không chốt hôm nay: quán còn đang bán — chốt lúc này thì đơn sau đó
 * vĩnh viễn nằm ngoài sổ (bản chốt không sửa được).
 *
 * Tuần tự, không song song: tồn đầu ngày D+1 đọc từ bản chốt ngày D.
 * Nhận client từ ngoài để test chạy được bằng phiên owner thật.
 */
export async function ensureClosedThrough(
  supabase: SupabaseClient,
  tenantId: string,
  today: string
): Promise<{ closed: string[] }> {
  const [{ data: last }, { data: first }] = await Promise.all([
    supabase
      .from("daily_closes")
      .select("business_date")
      .eq("tenant_id", tenantId)
      .order("business_date", { ascending: false })
      .limit(1),
    supabase
      .from("stock_entries")
      .select("business_date")
      .eq("tenant_id", tenantId)
      .order("business_date", { ascending: true })
      .limit(1),
  ]);
  const days = daysToClose(
    (last?.[0]?.business_date as string) ?? null,
    (first?.[0]?.business_date as string) ?? null,
    today
  );
  if (days.length === 0) return { closed: [] };

  const statics = await loadStatics(supabase, tenantId, days[days.length - 1]);
  const closed: string[] = [];
  for (const day of days) {
    const rows = await loadDayRows(supabase, tenantId, day);
    const payload = buildDailyClose({ day, rows, ...statics });
    const { error } = await supabase
      .from("daily_closes")
      .upsert(
        { tenant_id: tenantId, business_date: day, payload },
        { onConflict: "tenant_id,business_date", ignoreDuplicates: true }
      );
    if (error) {
      console.error(JSON.stringify({ op: "ensureClosedThrough", tenant: tenantId, day, error: error.message }));
      break; // ngày sau cần bản chốt ngày này làm tồn đầu — dừng, lượt tải sau thử lại
    }
    closed.push(day);
  }
  if (closed.length > 0) {
    console.log(JSON.stringify({ op: "ensureClosedThrough", tenant: tenantId, closed: closed.length }));
    // % dùng được tự tính lại sau mỗi lần chốt (0081). Lỗi không chặn chốt sổ — lượt chốt sau thử lại.
    try {
      await refreshMeasuredYields(supabase, tenantId, today);
    } catch (e) {
      console.error(JSON.stringify({ op: "refreshMeasuredYields", tenant: tenantId, error: String(e) }));
    }
  }
  return { closed };
}

/** Đọc bản chốt 180 ngày gần nhất đủ cho 14 lần kiểm kê của quán kiểm thưa. */
const YIELD_LOOKBACK_DAYS = 180;

/**
 * Tính lại "% dùng được" của mọi nguyên liệu mua vào từ bản chốt (lib/inventory/yield.ts): Σ định lượng × bán ÷ Σ thực dùng
 * của 14 lần kiểm kê gần nhất. Chưa có lần kiểm kê nào → 100%. Chỉ ghi dòng có thay đổi.
 */
export async function refreshMeasuredYields(supabase: SupabaseClient, tenantId: string, today: string): Promise<number> {
  const since = addDays(today, -YIELD_LOOKBACK_DAYS);
  const [{ data: ings, error: e1 }, { data: closes, error: e2 }, { count: older }] = await Promise.all([
    supabase.from("ingredients").select("id, yield_pct, yield_days").eq("tenant_id", tenantId).eq("kind", "purchased"),
    supabase
      .from("daily_closes")
      .select("business_date, payload")
      .eq("tenant_id", tenantId)
      .gte("business_date", since)
      .order("business_date"),
    supabase
      .from("daily_closes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .lt("business_date", since),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  const current = new Map((ings ?? []).map((i) => [i.id as string, Number(i.yield_pct)]));
  const samples = yieldSamples((closes ?? []) as { business_date: string; payload: unknown }[], current, (older ?? 0) > 0);
  const now = new Date().toISOString();
  let changed = 0;
  for (const ing of ings ?? []) {
    const m = measureYield(samples.get(ing.id as string) ?? []);
    const pct = m.pct ?? 100;
    if (pct === Number(ing.yield_pct) && m.days === Number(ing.yield_days)) continue;
    const { error } = await supabase
      .from("ingredients")
      .update({ yield_pct: pct, yield_days: m.days, yield_updated_at: now })
      .eq("id", ing.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    changed++;
  }
  return changed;
}

/** Bản xem trước chốt của một ngày chưa chốt (hôm nay — "tạm tính"), KHÔNG ghi. */
export async function previewDay(supabase: SupabaseClient, tenantId: string, day: string) {
  const statics = await loadStatics(supabase, tenantId, day);
  return buildDailyClose({ day, rows: await loadDayRows(supabase, tenantId, day), ...statics });
}

async function loadDayRows(supabase: SupabaseClient, tenantId: string, day: string): Promise<DayRow[]> {
  const { data, error } = await supabase.rpc("inventory_day", { p_tenant: tenantId, p_date: day });
  if (error) throw new Error(`inventory_day ${day}: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ingredient_id: String(r.ingredient_id),
    opening: Number(r.opening),
    receipts: Number(r.receipts),
    batch_in: Number(r.batch_in),
    batch_out: Number(r.batch_out),
    waste_hong: Number(r.waste_hong),
    waste_do_bo: Number(r.waste_do_bo),
    waste_com_nv: Number(r.waste_com_nv),
    waste_khac: Number(r.waste_khac),
    adjust: Number(r.adjust),
    counted: Boolean(r.counted),
    order_usage: Number(r.order_usage),
    cancel_usage: Number(r.cancel_usage),
    batch_shortfall: Number(r.batch_shortfall),
    closing: Number(r.closing),
  }));
}

/** Thứ không đổi theo ngày trong một lượt chốt: nguyên liệu, định lượng, tên món, lịch sử giá. */
async function loadStatics(supabase: SupabaseClient, tenantId: string, upTo: string) {
  const [inv, items, options, prices] = await Promise.all([
    loadInventory(supabase, tenantId),
    supabase.from("menu_items").select("id, name").eq("tenant_id", tenantId),
    supabase.from("modifier_options").select("id, name").eq("tenant_id", tenantId),
    loadPrices(supabase, tenantId, upTo),
  ]);
  return {
    ingredients: inv.ingredients,
    byItem: inv.byItem,
    byOption: inv.byOption,
    byParent: inv.byParent,
    items: (items.data ?? []) as { id: string; name: string }[],
    options: (options.data ?? []) as { id: string; name: string }[],
    prices,
  };
}

/**
 * Các lần nhập / ra mẻ có giá trong 90 ngày tới `upTo`. Đọc theo trang: PostgREST trả tối đa 1.000
 * dòng một lần và CẮT IM LẶNG (bài học REPORT-04).
 */
async function loadPrices(supabase: SupabaseClient, tenantId: string, upTo: string) {
  const out = new Map<string, PricePoint[]>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("stock_entries")
      .select("ingredient_id, business_date, qty, unit_cost")
      .eq("tenant_id", tenantId)
      .in("kind", ["receipt", "batch_in"])
      .not("unit_cost", "is", null)
      .gte("business_date", addDays(upTo, -90))
      .lte("business_date", upTo)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Đọc giá nhập lỗi: ${error.message}`);
    for (const r of data ?? []) {
      const arr = out.get(r.ingredient_id as string) ?? [];
      arr.push({ business_date: r.business_date as string, qty: Number(r.qty), unit_cost: Number(r.unit_cost) });
      out.set(r.ingredient_id as string, arr);
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}
