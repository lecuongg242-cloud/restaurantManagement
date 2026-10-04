import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/billing/report-range";
import { formatVnd } from "@/lib/orders/cart";
import { danhSachHoaDon, SO_DONG } from "@/lib/reports/hoa-don";
import { docKy } from "@/lib/quan-ly/ky";
import { ngayGioVn, gioVn } from "@/lib/quan-ly/dinh-dang";
import { ChonKy } from "@/components/quan-ly/ChonKy";
import { Trong } from "@/components/quan-ly/Khoi";

export const dynamic = "force-dynamic";

/**
 * Tab Hóa đơn (P30, MGR-03, Giao diện B6 — CHỈ XEM, chốt 04/10/2026). Theo kỳ, mới nhất trước, tìm số HĐ / bàn,
 * 30 dòng một trang. Tổng số dòng = "Số hóa đơn" của báo cáo cùng kỳ (cùng điều kiện BILL-05).
 */
export default async function HoaDonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ky?: string; tim?: string; trang?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await getSessionMembership(slug);
  if (!session) redirect("/quan-ly");
  const ky = docKy(sp.ky);
  const range = resolveRange(ky.input);
  const trang = Math.max(1, Number(sp.trang) || 1);
  const tim = (sp.tim ?? "").trim();
  const { dong, tong } = await danhSachHoaDon(await createClient(), session.tenant.id, range, { tim, trang });
  const base = `/r/${slug}/quan-ly/hoa-don`;
  const soTrang = Math.max(1, Math.ceil(tong / SO_DONG));
  const lienKetTrang = (n: number) => {
    const q = new URLSearchParams(Object.entries({ ky: sp.ky, tim: tim || undefined, trang: n > 1 ? String(n) : undefined }).filter((e): e is [string, string] => !!e[1]));
    return q.size ? `${base}?${q}` : base;
  };
  const motNgay = range.dayCount === 1;

  return (
    <div className="flex flex-col gap-md">
      <ChonKy base={base} ky={ky} them={{ tim: tim || undefined }} />
      <form action={base} className="relative">
        {sp.ky && <input type="hidden" name="ky" value={sp.ky} />}
        <Search className="pointer-events-none absolute left-sm top-1/2 size-4 -translate-y-1/2 text-steel" aria-hidden />
        <input
          name="tim"
          defaultValue={tim}
          type="search"
          enterKeyHint="search"
          placeholder="Tìm số hóa đơn, bàn"
          aria-label="Tìm số hóa đơn, bàn"
          className="h-11 w-full rounded-md border border-hairline-strong bg-canvas pl-[2.25rem] pr-sm text-base text-ink placeholder:text-steel"
        />
      </form>
      <p className="text-sm text-steel">
        {tong} hóa đơn{tim ? ` khớp “${tim}”` : ""} · {ky.chu.toLowerCase()}
      </p>

      {dong.length === 0 ? (
        <Trong>{tim ? `Không có hóa đơn khớp “${tim}”.` : `Chưa có hóa đơn trong ${ky.chu.toLowerCase()}.`}</Trong>
      ) : (
        <ul className="divide-y divide-hairline-soft overflow-hidden rounded-lg border border-hairline-soft bg-canvas shadow-card">
          {dong.map((d) => (
            <li key={d.id}>
              <Link href={`${base}/${d.id}${sp.ky ? `?ky=${sp.ky}` : ""}`} className="flex min-h-16 items-center gap-sm px-md py-sm active:bg-cream-soft">
                <span className="w-12 shrink-0 text-sm tabular-nums text-steel">
                  {gioVn(d.luc)}
                  {!motNgay && <span className="block text-xs">{ngayGioVn(d.luc).slice(0, 5)}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {d.ban} <span className="font-normal text-steel">· #{d.soHd ?? "—"}</span>
                  </span>
                  <span className="block truncate text-xs text-steel">
                    {d.phuongThuc}
                    {d.thuNgan ? ` · ${d.thuNgan}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-ink">{formatVnd(d.tong)}</span>
                <ChevronRight className="size-4 shrink-0 text-steel" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {soTrang > 1 && (
        <nav aria-label="Trang" className="flex items-center justify-between text-sm">
          {trang > 1 ? (
            <Link href={lienKetTrang(trang - 1)} className="inline-flex min-h-11 items-center px-sm text-primary-deep">
              ‹ Trang trước
            </Link>
          ) : (
            <span />
          )}
          <span className="text-steel">
            Trang {trang}/{soTrang}
          </span>
          {trang < soTrang ? (
            <Link href={lienKetTrang(trang + 1)} className="inline-flex min-h-11 items-center px-sm text-primary-deep">
              Trang sau ›
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
