import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { chuoiCuaQuan } from "@/lib/brand/context";
import { danhSachKhach, KENH, MOI_TRANG, phuSdt, type SapXepKhach } from "@/lib/reports/customers";
import { formatVnd } from "@/lib/orders/cart";
import { gioNgayNamVn } from "@/lib/time/vn";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Khách hàng (P16 16-05, CUST-02) — như danh sách khách của Sapo / KiotViet: Khách hàng · Điện thoại · Số lần · Lần
 * gần nhất · Tổng chi tiêu; tìm theo tên/SĐT, bấm tiêu đề cột để sắp xếp, bấm dòng xem lịch sử + ghi chú. Khách tự
 * có từ đơn / đặt bàn có SĐT — không nhập tay. Chỉ chủ / quản lý (SĐT là dữ liệu cá nhân).
 */
export default async function KhachHangPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; sx?: string; p?: string; pham?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "customers")) redirect(defaultRouteForRole(slug, session.role));

  const chuoi = await chuoiCuaQuan(session.tenant.id, session.userId);
  const caChuoi = !!chuoi && chuoi.branches.length >= 2 && sp.pham === "chuoi";
  const ids = caChuoi ? chuoi!.branches.map((b) => b.tenantId) : [session.tenant.id];
  const sort: SapXepKhach = sp.sx === "visits" || sp.sx === "recent" ? sp.sx : "spent";
  const page = Math.max(1, Number(sp.p) || 1);
  const bayGio = new Date();
  const [{ rows, tong }, phu] = await Promise.all([
    danhSachKhach(ids, { q: sp.q, sort, page }),
    phuSdt(ids, new Date(bayGio.getTime() - 30 * 86400e3).toISOString(), bayGio.toISOString()),
  ]);
  const soTrang = Math.max(1, Math.ceil(tong / MOI_TRANG));
  const base = `/r/${slug}/admin/khach-hang`;
  const url = (o: Partial<{ q: string; sx: string; p: number; pham: string }>) => {
    const q = new URLSearchParams();
    const v = { q: sp.q ?? "", sx: sort, p: 1, pham: caChuoi ? "chuoi" : "", ...o };
    if (v.q) q.set("q", v.q);
    if (v.sx !== "spent") q.set("sx", v.sx);
    if (v.p > 1) q.set("p", String(v.p));
    if (v.pham) q.set("pham", v.pham);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const tyLe = phu.tong > 0 ? Math.round((phu.coSdt / phu.tong) * 100) : 0;

  return (
    <div className="flex flex-col gap-lg">
      <header className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="font-display text-2xl text-ink">Khách hàng</h1>
          <p className="mt-xxs text-sm text-steel">
            {tong} khách có số điện thoại · 30 ngày qua {tyLe}% doanh thu có SĐT khách
            {tyLe < 20 && " — nhập SĐT khách khi bán mang về / giao hàng để danh sách đầy đủ hơn"}.
          </p>
          {chuoi && chuoi.branches.length >= 2 && (
            <nav aria-label="Phạm vi" className="mt-xs flex gap-xs text-sm">
              {[
                { chu: "Chi nhánh này", href: url({ pham: "", p: 1 }), bat: !caChuoi },
                { chu: "Tất cả chi nhánh", href: url({ pham: "chuoi", p: 1 }), bat: caChuoi },
              ].map((m) => (
                <Link
                  key={m.chu}
                  href={m.href}
                  aria-current={m.bat ? "page" : undefined}
                  className={cn("rounded-full border px-sm py-[2px]", m.bat ? "border-ink bg-ink text-canvas" : "border-hairline-strong text-slate")}
                >
                  {m.chu}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-sm">
          <form action={base} className="flex items-center gap-xs">
            {caChuoi && <input type="hidden" name="pham" value="chuoi" />}
            {sort !== "spent" && <input type="hidden" name="sx" value={sort} />}
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Tìm tên hoặc SĐT" className="h-9 w-56" aria-label="Tìm khách" />
          </form>
          {session.role === "owner" && (
            <a
              href={`${base}/export${caChuoi ? "?pham=chuoi" : ""}`}
              className="inline-flex h-9 items-center rounded-md border border-hairline-strong px-md text-sm text-ink hover:bg-surface"
            >
              Xuất Excel
            </a>
          )}
        </div>
      </header>

      <section className="rounded-lg border border-hairline-soft bg-canvas shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm" data-danh-sach-khach>
            <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-lg py-sm font-medium">Khách hàng</th>
                <th className="px-md py-sm font-medium">Điện thoại</th>
                <th className="px-md py-sm text-right font-medium">
                  <Link href={url({ sx: "visits" })} className={cn(sort === "visits" && "text-ink")}>
                    Số lần {sort === "visits" && "↓"}
                  </Link>
                </th>
                <th className="px-md py-sm font-medium">
                  <Link href={url({ sx: "recent" })} className={cn(sort === "recent" && "text-ink")}>
                    Lần gần nhất {sort === "recent" && "↓"}
                  </Link>
                </th>
                <th className="px-md py-sm text-right font-medium">
                  <Link href={url({ sx: "spent" })} className={cn(sort === "spent" && "text-ink")}>
                    Tổng chi tiêu {sort === "spent" && "↓"}
                  </Link>
                </th>
                <th className="px-lg py-sm font-medium">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {rows.map((k) => (
                <tr key={k.phone} className="hover:bg-surface/60">
                  <td className="px-lg py-sm">
                    <Link href={`${base}/${k.phone}${caChuoi ? "?pham=chuoi" : ""}`} className="text-ink underline-offset-4 hover:underline">
                      {k.ten ?? "(không tên)"}
                    </Link>
                    {k.kenh && <span className="ml-xs text-xs text-steel">{KENH[k.kenh] ?? k.kenh}</span>}
                  </td>
                  <td className="px-md py-sm font-mono text-slate">{k.phone}</td>
                  <td className="px-md py-sm text-right tabular-nums">
                    {k.soLan}
                    {k.datBan > 0 && <span className="ml-xxs text-xs text-steel">· {k.datBan} đặt bàn</span>}
                  </td>
                  <td className="px-md py-sm text-slate">{gioNgayNamVn(k.ganNhat)}</td>
                  <td className="px-md py-sm text-right tabular-nums text-ink">{formatVnd(k.tongChi)}</td>
                  <td className="max-w-[16rem] truncate px-lg py-sm text-xs text-steel">{k.ghiChu ?? ""}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-lg py-lg text-center text-sm text-steel">
                    {sp.q ? "Không tìm thấy khách." : "Chưa có khách nào để lại số điện thoại."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {soTrang > 1 && (
        <nav aria-label="Trang" className="flex items-center justify-center gap-sm text-sm">
          {page > 1 && <Link href={url({ p: page - 1 })} className="text-primary">‹ Trước</Link>}
          <span className="text-steel">
            Trang {page}/{soTrang}
          </span>
          {page < soTrang && <Link href={url({ p: page + 1 })} className="text-primary">Sau ›</Link>}
        </nav>
      )}
    </div>
  );
}
