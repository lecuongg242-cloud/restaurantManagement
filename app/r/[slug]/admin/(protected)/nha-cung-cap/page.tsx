import Link from "next/link";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listSuppliers } from "@/lib/purchasing/data";
import { formatVnd } from "@/lib/orders/cart";
import { Input } from "@/components/ui/input";
import { NewSupplierDialog } from "@/components/admin/purchasing/NewSupplierDialog";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Nhà cung cấp (P20 20-01, PURCH-01) — như KiotViet "Nhà cung cấp": Mã · Tên · Điện thoại · Tổng mua · Nợ cần trả hiện
 * tại; tìm theo tên / SĐT / mã; "+ Nhà cung cấp". Bấm tên xem chi tiết, sửa, ngừng hoạt động.
 */
export default async function SupplierListPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; no?: string }>;
}) {
  const { slug } = await params;
  const { q, no } = await searchParams;
  const session = (await getSessionMembership(slug))!;
  const all = await listSuppliers(await createClient(), session.tenant.id, { q });
  const dangNo = no === "1";
  const rows = dangNo ? all.filter((s) => s.debt > 0) : all;
  const base = `/r/${slug}/admin/nha-cung-cap`;
  const tongNo = all.reduce((s, r) => s + Math.max(0, r.debt), 0);

  return (
    <div className="flex flex-col gap-lg">
      <header className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <p className="text-sm text-steel">
            Mối hàng của quán — biết mua của ai bao nhiêu, còn nợ ai bao nhiêu. Nhập hàng ở tab Nhập hàng.
            {tongNo > 0 && <> Tổng nợ cần trả: <span className="font-medium text-ink">{formatVnd(tongNo)}</span>.</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-sm">
          <Link
            href={dangNo ? base : `${base}?no=1`}
            aria-pressed={dangNo}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-md text-sm",
              dangNo ? "border-ink bg-ink text-canvas" : "border-hairline-strong text-slate hover:bg-surface"
            )}
          >
            Đang nợ
          </Link>
          <form action={base} className="flex items-center gap-xs">
            {dangNo && <input type="hidden" name="no" value="1" />}
            <Input name="q" defaultValue={q ?? ""} placeholder="Tìm tên, SĐT hoặc mã" className="h-9 w-64" aria-label="Tìm nhà cung cấp" />
          </form>
          <NewSupplierDialog slug={slug} />
        </div>
      </header>

      <section className="rounded-lg border border-hairline-soft bg-canvas shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm" data-danh-sach-ncc>
            <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-lg py-sm font-medium">Mã</th>
                <th className="px-md py-sm font-medium">Tên nhà cung cấp</th>
                <th className="px-md py-sm font-medium">Điện thoại</th>
                <th className="px-md py-sm text-right font-medium">Tổng mua</th>
                <th className="px-lg py-sm text-right font-medium">Nợ cần trả hiện tại</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {rows.map((s) => (
                <tr key={s.id} className={cn("hover:bg-surface/60", !s.active && "text-steel")}>
                  <td className="px-lg py-sm font-mono text-xs text-slate">{s.code}</td>
                  <td className="px-md py-sm">
                    <Link href={`${base}/${s.id}`} className="text-ink underline-offset-4 hover:underline">
                      {s.name}
                    </Link>
                    {!s.active && <span className="ml-xs text-xs text-steel">· ngừng hoạt động</span>}
                  </td>
                  <td className="px-md py-sm font-mono text-slate">{s.phone ?? ""}</td>
                  <td className="px-md py-sm text-right tabular-nums">{formatVnd(s.totalPurchase)}</td>
                  <td className="px-lg py-sm text-right tabular-nums">
                    {s.debt > 0 ? (
                      <span className="font-medium text-ink">{formatVnd(s.debt)}</span>
                    ) : s.debt < 0 ? (
                      <span className="text-status-ready">Trả trước {formatVnd(-s.debt)}</span>
                    ) : (
                      <span className="text-steel">0₫</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-lg py-lg text-center text-sm text-steel">
                    {dangNo ? "Không còn nợ nhà cung cấp nào." : q ? "Không tìm thấy nhà cung cấp." : "Chưa có nhà cung cấp nào — bấm \"+ Nhà cung cấp\" để thêm."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
