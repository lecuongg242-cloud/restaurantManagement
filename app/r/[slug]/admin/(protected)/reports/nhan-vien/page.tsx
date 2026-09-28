import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { chuoiCuaQuan } from "@/lib/brand/context";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/billing/report-range";
import { getChiTietNhanVien, type GocXemNhanVien } from "@/lib/reports/deep";
import { formatVnd } from "@/lib/orders/cart";
import { gioNgayNamVn } from "@/lib/time/vn";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MOI_TRANG = 50;
const PT: Record<string, string> = { cash: "Tiền mặt", transfer: "Chuyển khoản" };
const GOC: [GocXemNhanVien, string][] = [
  ["nhan", "Đơn đã nhận"],
  ["thu", "Hóa đơn đã thu"],
  ["huy", "Món đã hủy"],
];

/**
 * Báo cáo nhân viên → bấm vào một người (P16 16-02): danh sách đơn đã nhận / hóa đơn đã thu / món đã hủy trong kỳ đang
 * xem (cùng kỳ + phạm vi chi nhánh với trang Báo cáo), 50 dòng một trang — phân trang ở SQL (0074). Chỉ chủ / quản lý.
 */
export default async function ChiTietNhanVien({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "reports")) redirect(defaultRouteForRole(slug, session.role));

  const kind = (["staff", "customer", "unknown"] as const).find((k) => k === sp.kind);
  if (!kind || (kind === "staff" && !sp.m)) notFound();
  const membershipId = kind === "staff" ? sp.m! : null;
  const xem = GOC.find(([k]) => k === sp.xem)?.[0] ?? (kind === "customer" ? "nhan" : "thu");
  const trang = Math.max(1, parseInt(sp.trang ?? "1", 10) || 1);

  const range = resolveRange(sp, new Date());
  const chuoi = await chuoiCuaQuan(session.tenant.id, session.userId);
  const caChuoi = !!chuoi && chuoi.branches.length >= 2 && sp.pham === "chuoi";
  const chon = caChuoi && sp.cn ? new Set(sp.cn.split(",")) : null;
  const ids = caChuoi ? chuoi!.branches.filter((b) => !chon || chon.has(b.slug)).map((b) => b.tenantId) : [session.tenant.id];
  const tenCn = new Map((chuoi?.branches ?? []).map((b) => [b.tenantId, b.name]));

  let ten = kind === "customer" ? "Khách tự gọi" : "Không rõ";
  if (membershipId) {
    const { data: m } = await (await createClient())
      .from("memberships")
      .select("display_name, email")
      .eq("id", membershipId)
      .maybeSingle();
    ten = (m?.display_name as string | null) ?? (m?.email as string | null) ?? "Nhân viên đã xóa";
  }

  const { tong, rows } = await getChiTietNhanVien(ids, range, { kind, membershipId }, xem, {
    offset: (trang - 1) * MOI_TRANG,
    limit: MOI_TRANG,
  });
  const soTrang = Math.max(1, Math.ceil(tong / MOI_TRANG));

  // Giữ kỳ + phạm vi khi đổi góc xem / trang và khi quay lại Báo cáo.
  const giu = Object.fromEntries(
    Object.entries({ preset: sp.preset, offset: sp.offset, from: sp.from, to: sp.to, pham: caChuoi ? "chuoi" : undefined, cn: caChuoi ? sp.cn : undefined })
      .filter(([, v]) => v) as [string, string][]
  );
  const href = (them: Record<string, string>) =>
    `/r/${slug}/admin/reports/nhan-vien?${new URLSearchParams({ ...giu, kind, ...(membershipId ? { m: membershipId } : {}), xem, ...them })}`;
  const gocHien = kind === "customer" ? GOC.filter(([k]) => k === "nhan") : GOC;

  return (
    <div className="flex flex-col gap-lg">
      <header>
        <Link href={`/r/${slug}/admin/reports?${new URLSearchParams(giu)}`} className="text-sm text-primary underline-offset-4 hover:underline">
          ← Báo cáo
        </Link>
        <h1 className="mt-xs font-display text-2xl text-ink">{ten}</h1>
        <p className="text-sm text-steel">
          {range.label} · giờ Việt Nam{caChuoi ? ` · ${ids.length} chi nhánh` : ""}
        </p>
      </header>

      <nav role="tablist" className="flex flex-wrap gap-xs text-sm">
        {gocHien.map(([k, nhan]) => (
          <Link
            key={k}
            role="tab"
            aria-selected={xem === k}
            href={href({ xem: k })}
            className={cn("rounded-full border px-sm py-[2px]", xem === k ? "border-ink bg-ink text-canvas" : "border-hairline-strong text-slate")}
          >
            {nhan}
          </Link>
        ))}
      </nav>

      <Card>
        {rows.length === 0 ? (
          <p className="text-sm text-steel">Không có dòng nào trong kỳ này.</p>
        ) : (
          <div className="overflow-x-auto" data-chi-tiet-nhan-vien>
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-xs pr-md font-medium">Thời gian</th>
                  {caChuoi && <th className="py-xs pr-md font-medium">Chi nhánh</th>}
                  {xem === "nhan" && (
                    <>
                      <th className="py-xs pr-md font-medium">Đơn</th>
                      <th className="py-xs pr-md font-medium">Bàn</th>
                      <th className="py-xs pr-md font-medium">Nguồn</th>
                      <th className="py-xs pr-md text-right font-medium">Số món</th>
                      <th className="py-xs text-right font-medium">Tiền hàng</th>
                    </>
                  )}
                  {xem === "thu" && (
                    <>
                      <th className="py-xs pr-md font-medium">Hóa đơn</th>
                      <th className="py-xs pr-md font-medium">Bàn</th>
                      <th className="py-xs pr-md font-medium">Phương thức</th>
                      <th className="py-xs text-right font-medium">Số tiền</th>
                    </>
                  )}
                  {xem === "huy" && (
                    <>
                      <th className="py-xs pr-md font-medium">Món</th>
                      <th className="py-xs pr-md font-medium">Đơn</th>
                      <th className="py-xs pr-md font-medium">Lý do</th>
                      <th className="py-xs pr-md text-right font-medium">SL</th>
                      <th className="py-xs text-right font-medium">Tiền</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="py-xs pr-md tabular-nums text-slate">{gioNgayNamVn(r.luc)}</td>
                    {caChuoi && <td className="py-xs pr-md text-slate">{tenCn.get(r.tenantId) ?? ""}</td>}
                    {xem === "nhan" && (
                      <>
                        <td className="py-xs pr-md tabular-nums">{r.soDon != null ? `#${r.soDon}` : "—"}</td>
                        <td className="py-xs pr-md">{r.noi ?? "—"}</td>
                        <td className="py-xs pr-md text-slate">{r.chiTiet}</td>
                        <td className="py-xs pr-md text-right tabular-nums">{r.soLuong}</td>
                        <td className="py-xs text-right tabular-nums text-ink">{formatVnd(r.tien)}</td>
                      </>
                    )}
                    {xem === "thu" && (
                      <>
                        <td className="py-xs pr-md tabular-nums">{r.soHd != null ? `#${r.soHd}` : "—"}</td>
                        <td className="py-xs pr-md">{r.noi}</td>
                        <td className="py-xs pr-md text-slate">{PT[r.phuongThuc ?? ""] ?? r.phuongThuc}</td>
                        <td className="py-xs text-right tabular-nums text-ink">{formatVnd(r.tien)}</td>
                      </>
                    )}
                    {xem === "huy" && (
                      <>
                        <td className="py-xs pr-md text-ink">{r.noi}</td>
                        <td className="py-xs pr-md tabular-nums">{r.soDon != null ? `#${r.soDon}` : "—"}</td>
                        <td className="py-xs pr-md text-slate">{r.chiTiet || "—"}</td>
                        <td className="py-xs pr-md text-right tabular-nums">{r.soLuong}</td>
                        <td className="py-xs text-right tabular-nums text-ink">{formatVnd(r.tien)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tong > MOI_TRANG && (
          <nav aria-label="Trang" className="mt-md flex items-center justify-between text-sm">
            {trang > 1 ? <Link href={href({ trang: String(trang - 1) })} className="text-primary hover:underline">← Trước</Link> : <span />}
            <span className="text-steel">
              Trang {trang}/{soTrang} · {tong} dòng
            </span>
            {trang < soTrang ? <Link href={href({ trang: String(trang + 1) })} className="text-primary hover:underline">Sau →</Link> : <span />}
          </nav>
        )}
      </Card>
    </div>
  );
}

