import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportRange } from "@/lib/billing/report-range";
import { orderPlaceLabel } from "@/lib/orders/place-label";
import type { OrderChannel, OrderSource } from "@/lib/orders/types";
import { parseSettings, type ServiceMode } from "@/lib/tenant/settings";

/**
 * Tab "Hóa đơn" của app Quản lý (P30, MGR-03, Giao diện B6). Đọc bằng client CỦA NGƯỜI ĐĂNG NHẬP (RLS chặn quán khác) và
 * CÙNG điều kiện với các RPC báo cáo (BILL-05): `bills_revenue`, đã thanh toán, bỏ hóa đơn cha khi chia đều, lọc theo
 * ngày kinh doanh `business_at` ⇒ tổng số dòng = "Số hóa đơn" của báo cáo cùng kỳ. Chi tiết một hóa đơn dùng lại
 * `buildReceiptView` (cùng nội dung tờ hóa đơn in cho khách).
 */
export const SO_DONG = 30;

export type DongHoaDon = {
  id: string;
  soHd: number | null;
  /** Giờ thanh toán (ISO). */
  luc: string | null;
  /** "Bàn A1" · "Tại quán" · "Mang về" · "Giao tận nơi" · "Không gắn bàn". */
  ban: string;
  tong: number;
  /** "Tiền mặt", "Chuyển khoản", hoặc cả hai nối bằng dấu phẩy; "—" khi chưa ghi thanh toán. */
  phuongThuc: string;
  thuNgan: string | null;
};

export const TEN_PHUONG_THUC: Record<string, string> = { cash: "Tiền mặt", transfer: "Chuyển khoản" };

type DonKhongBan = { channel: string; source: string | null; eat_in: boolean | null };

/** Nơi của một hóa đơn — đơn không bàn dùng chung quy tắc `orderPlaceLabel` với phiếu bếp / hóa đơn in (P35). */
export function nhanNoi(
  b: { table_label: string | null; online_order_id: string | null },
  don: DonKhongBan | null | undefined,
  serviceMode: ServiceMode
): string {
  if (b.table_label) return `Bàn ${b.table_label}`;
  if (!b.online_order_id) return "Không gắn bàn";
  if (!don) return "Mang về";
  return orderPlaceLabel({
    serviceMode,
    channel: don.channel as OrderChannel,
    source: don.source as OrderSource,
    eatIn: don.eat_in,
  });
}

export async function danhSachHoaDon(
  client: SupabaseClient,
  tenantId: string,
  range: Pick<ReportRange, "fromUtc" | "toUtc">,
  opts: { tim?: string; trang?: number }
): Promise<{ dong: DongHoaDon[]; tong: number }> {
  const trang = Math.max(1, Math.floor(opts.trang ?? 1));
  const tim = (opts.tim ?? "").trim();

  let q = client
    .from("bills_revenue")
    .select("id, bill_no, total, paid_at", { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("status", "paid")
    .is("split_count", null)
    .gte("business_at", range.fromUtc)
    .lt("business_at", range.toUtc);

  if (tim) {
    // Tìm theo tên bàn (snapshot `bills.table_label`) và/hoặc số hóa đơn.
    const { data: theoBan } = await client
      .from("bills")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("table_label", `%${tim.replace(/[%_,()]/g, "")}%`)
      .limit(500);
    const ids = (theoBan ?? []).map((r) => r.id as string);
    if (/^\d{1,9}$/.test(tim)) q = q.or(ids.length ? `bill_no.eq.${tim},id.in.(${ids.join(",")})` : `bill_no.eq.${tim}`);
    else if (ids.length) q = q.in("id", ids);
    else return { dong: [], tong: 0 };
  }

  const { data, count, error } = await q
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("bill_no", { ascending: false })
    .range((trang - 1) * SO_DONG, trang * SO_DONG - 1);
  if (error) throw new Error(`Không đọc được hóa đơn: ${error.message}`);
  const rows = data ?? [];
  if (!rows.length) return { dong: [], tong: count ?? 0 };

  const ids = rows.map((r) => r.id as string);
  const [{ data: meta }, { data: tra }] = await Promise.all([
    client.from("bills").select("id, table_label, online_order_id, closed_by").eq("tenant_id", tenantId).in("id", ids),
    client.from("payments").select("bill_id, method").eq("tenant_id", tenantId).in("bill_id", ids),
  ]);
  const nguoi = [...new Set((meta ?? []).map((m) => m.closed_by as string | null).filter((x): x is string => !!x))];
  const { data: ten } = nguoi.length
    ? await client.from("memberships").select("user_id, display_name").eq("tenant_id", tenantId).in("user_id", nguoi)
    : { data: [] as { user_id: string; display_name: string | null }[] };

  const donIds = [...new Set((meta ?? []).map((m) => m.online_order_id as string | null).filter((x): x is string => !!x))];
  const [{ data: dons }, { data: quan }] = await Promise.all([
    donIds.length
      ? client.from("orders").select("id, channel, source, eat_in").eq("tenant_id", tenantId).in("id", donIds)
      : Promise.resolve({ data: [] as (DonKhongBan & { id: string })[] }),
    client.from("tenants").select("settings").eq("id", tenantId).maybeSingle(),
  ]);
  const donTheoId = new Map((dons ?? []).map((d) => [d.id as string, d as DonKhongBan]));
  const serviceMode = parseSettings(quan?.settings).service_mode;

  const metaTheoId = new Map((meta ?? []).map((m) => [m.id as string, m]));
  const tenTheoUser = new Map((ten ?? []).map((t) => [t.user_id as string, (t.display_name as string | null) ?? null]));
  const ptTheoHd = new Map<string, Set<string>>();
  for (const p of tra ?? []) {
    const s = ptTheoHd.get(p.bill_id as string) ?? new Set<string>();
    s.add(TEN_PHUONG_THUC[p.method as string] ?? String(p.method));
    ptTheoHd.set(p.bill_id as string, s);
  }

  return {
    tong: count ?? rows.length,
    dong: rows.map((r) => {
      const m = metaTheoId.get(r.id as string);
      const pt = ptTheoHd.get(r.id as string);
      return {
        id: r.id as string,
        soHd: (r.bill_no as number | null) ?? null,
        luc: (r.paid_at as string | null) ?? null,
        ban: nhanNoi(
          { table_label: (m?.table_label as string | null) ?? null, online_order_id: (m?.online_order_id as string | null) ?? null },
          m?.online_order_id ? donTheoId.get(m.online_order_id as string) : null,
          serviceMode
        ),
        tong: Number(r.total ?? 0),
        phuongThuc: pt?.size ? [...pt].join(", ") : "—",
        thuNgan: m?.closed_by ? (tenTheoUser.get(m.closed_by as string) ?? null) : null,
      };
    }),
  };
}
