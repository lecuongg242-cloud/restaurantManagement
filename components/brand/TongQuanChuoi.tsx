import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ChiNhanh } from "@/lib/brand/branches";
import { resolveRange } from "@/lib/billing/report-range";
import { formatVnd } from "@/lib/orders/cart";
import { parseSettings } from "@/lib/tenant/settings";
import { hangCauIn } from "@/lib/print/cau-in-super";
import { docBanPhatHanh } from "@/lib/print/bridge-release";
import { homNayHanDung, ngayVnHienThi, subscriptionState } from "@/lib/tenant/subscription";
import { cn } from "@/lib/utils";

const CAU_IN = { song: "Sống", chet: "MẤT KẾT NỐI", "chua-co": "—" } as const;

/**
 * Tổng quan chuỗi HÔM NAY (P15 15-02): mỗi chi nhánh doanh thu, số hóa đơn, bàn đang mở, cầu in, hạn dùng + dòng
 * cả chuỗi. Số từ `report_by_branch` (0064) — cùng nguồn với báo cáo lọc chi nhánh. Đọc qua phiên RLS.
 */
export async function TongQuanChuoi({ branches, hienTai }: { branches: ChiNhanh[]; hienTai: string }) {
  const ids = branches.map((b) => b.tenantId);
  const range = resolveRange({ preset: "today" });
  const supabase = await createClient();
  const [{ data: so }, { data: ban }, { data: tt }, { data: nhip }] = await Promise.all([
    supabase.rpc("report_by_branch", { p_tenants: ids, p_from: range.fromUtc, p_to: range.toUtc }),
    supabase.from("table_sessions").select("tenant_id").in("tenant_id", ids).eq("status", "open"),
    supabase.from("tenants").select("id, settings, paid_until").in("id", ids),
    supabase.from("printer_heartbeats").select("tenant_id, seen_at, printer_ok, printer_checked_at, version").in("tenant_id", ids),
  ]);
  const soTheo = new Map(((so ?? []) as { tenant_id: string; revenue: number; bill_count: number }[]).map((r) => [r.tenant_id, r]));
  const banMo = new Map<string, number>();
  for (const r of ban ?? []) banMo.set(r.tenant_id as string, (banMo.get(r.tenant_id as string) ?? 0) + 1);
  const ttTheo = new Map((tt ?? []).map((t) => [t.id as string, t]));
  const nhipTheo = new Map((nhip ?? []).map((n) => [n.tenant_id as string, n]));
  const banMoiNhat = docBanPhatHanh().version;
  const today = homNayHanDung();
  const now = Date.now();

  const dong = branches.map((b) => {
    const r = soTheo.get(b.tenantId);
    const t = ttTheo.get(b.tenantId);
    const paidUntil = (t?.paid_until as string | null) ?? null;
    return {
      ...b,
      revenue: Number(r?.revenue ?? 0),
      bills: Number(r?.bill_count ?? 0),
      banMo: banMo.get(b.tenantId) ?? 0,
      cau: hangCauIn({
        printMode: parseSettings(t?.settings).print_mode,
        nhip: (nhipTheo.get(b.tenantId) as Parameters<typeof hangCauIn>[0]["nhip"]) ?? null,
        banMoiNhat,
        now,
      }),
      paidUntil,
      han: subscriptionState(paidUntil, today),
    };
  });
  const tong = {
    revenue: dong.reduce((a, d) => a + d.revenue, 0),
    bills: dong.reduce((a, d) => a + d.bills, 0),
    banMo: dong.reduce((a, d) => a + d.banMo, 0),
  };

  return (
    <section className="rounded-lg border border-hairline-soft bg-canvas shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-sm px-lg pt-lg">
        <h2 className="font-semibold text-lg text-ink">Hôm nay cả chuỗi</h2>
        <p className="text-sm text-steel">{range.label}</p>
      </div>
      <div className="mt-sm overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-sm" data-bang-chi-nhanh>
          <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-lg py-sm font-medium">Chi nhánh</th>
              <th className="px-md py-sm text-right font-medium">Doanh thu</th>
              <th className="px-md py-sm text-right font-medium">Hóa đơn</th>
              <th className="px-md py-sm text-right font-medium">Bàn mở</th>
              <th className="px-md py-sm font-medium">Cầu in</th>
              <th className="px-md py-sm font-medium">Hạn dùng</th>
              <th className="px-lg py-sm" />
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {dong.map((d) => (
              <tr key={d.tenantId} className={cn(d.slug === hienTai && "bg-cream/40")}>
                <td className="px-lg py-sm text-ink">
                  {d.name}
                  {d.slug === hienTai && <span className="ml-xs text-xs text-steel">(đang mở)</span>}
                  {d.status === "suspended" && <span className="ml-xs text-xs text-steel">tạm ngưng</span>}
                </td>
                <td className="px-md py-sm text-right tabular-nums text-ink">{formatVnd(d.revenue)}</td>
                <td className="px-md py-sm text-right tabular-nums text-slate">{d.bills}</td>
                <td className="px-md py-sm text-right tabular-nums text-slate">{d.banMo}</td>
                <td className={cn("px-md py-sm", d.cau.canChuY ? "font-medium text-status-late" : "text-slate")}>
                  {d.cau.printMode === "bridge" ? CAU_IN[d.cau.cauIn] : "Trình duyệt"}
                </td>
                <td className={cn("px-md py-sm", d.han === "grace" || d.han === "locked" ? "font-medium text-status-late" : "text-slate")}>
                  {d.paidUntil ? ngayVnHienThi(d.paidUntil) : "Không giới hạn"}
                  {d.han === "locked" && " · đã khóa"}
                </td>
                <td className="px-lg py-sm text-right">
                  {d.slug !== hienTai && (
                    <Link href={`/r/${d.slug}/admin`} className="text-primary underline-offset-4 hover:underline">
                      Vào chi nhánh →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-hairline-strong font-medium text-ink">
            <tr>
              <td className="px-lg py-sm">Cả chuỗi</td>
              <td className="px-md py-sm text-right tabular-nums" data-tong-doanh-thu>
                {formatVnd(tong.revenue)}
              </td>
              <td className="px-md py-sm text-right tabular-nums">{tong.bills}</td>
              <td className="px-md py-sm text-right tabular-nums">{tong.banMo}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-lg pb-md pt-xs text-xs text-steel">Chi nhánh đang bị khóa (hết hạn / tạm ngưng) không có trong số liệu.</p>
    </section>
  );
}
