import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Phone } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSettings } from "@/lib/tenant/settings";
import { dangMoCua } from "@/lib/brand/open-hours";
import { urlAnh } from "@/lib/storage/public-url";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ThuongHieu = { id: string; name: string; logo_url: string | null; root_tenant_id: string | null };

/** Thương hiệu theo slug — service role, CHỈ cột công khai. */
async function docThuongHieu(slug: string): Promise<ThuongHieu | null> {
  const { data } = await createAdminClient().from("brands").select("id, name, logo_url, root_tenant_id").eq("slug", slug).maybeSingle();
  return (data as ThuongHieu | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ brand: string }> }): Promise<Metadata> {
  const b = await docThuongHieu((await params).brand);
  return b ? { title: b.name } : {};
}

/**
 * Trang thương hiệu cho khách (P15 15-05, BRANCH-06): chọn chi nhánh rồi vào đặt món online / đặt bàn của đúng chi
 * nhánh. Chỉ chi nhánh DÙNG ĐƯỢC (cột tính `usable`, 0057 — cùng định nghĩa với lib/tenant/active.ts): chi nhánh
 * tạm ngưng / hết hạn không hiện. Chỉ đọc cột công khai (tên, logo, địa chỉ, SĐT, giờ mở) — không đưa `settings`
 * (có tài khoản ngân hàng) xuống trình duyệt.
 */
export default async function BrandPublicPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: slug } = await params;
  const brand = await docThuongHieu(slug);
  if (!brand) notFound();

  const { data } = await createAdminClient()
    .from("tenants")
    .select("id, slug, name, logo_url, settings")
    .eq("brand_id", brand.id)
    .eq("usable", true)
    .order("name");
  const chiNhanh = (data ?? []).map((t) => {
    const s = parseSettings(t.settings);
    return {
      id: t.id as string,
      slug: t.slug as string,
      name: t.name as string,
      logo: urlAnh(t.logo_url as string | null),
      address: s.address,
      phone: s.phone,
      open: s.open_time,
      close: s.close_time,
      mo: dangMoCua(s.open_time, s.close_time),
      coBan: s.service_mode === "table",
    };
  });
  const logo = urlAnh(brand.logo_url) ?? chiNhanh.find((c) => c.id === brand.root_tenant_id)?.logo ?? chiNhanh[0]?.logo ?? null;

  return (
    <main className="min-h-screen bg-surface px-md py-xl">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex items-center gap-md">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <span className="grid h-14 w-14 place-items-center rounded-full bg-primary font-semibold text-2xl text-primary-fg" aria-hidden>
              {brand.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="font-semibold text-3xl text-ink">{brand.name}</h1>
            <p className="text-sm text-steel">Chọn chi nhánh để đặt món hoặc đặt bàn</p>
          </div>
        </header>

        <ul className="mt-lg flex flex-col gap-md">
          {chiNhanh.map((c) => (
            <li key={c.id} className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card" data-chi-nhanh={c.slug}>
              <div className="flex flex-wrap items-start justify-between gap-sm">
                <h2 className="text-lg font-medium text-ink">{c.name}</h2>
                {c.mo != null && (
                  <span
                    className={cn(
                      "rounded-full px-sm py-[2px] text-xs font-medium",
                      c.mo ? "bg-status-ready-bg text-status-ready" : "bg-surface text-steel"
                    )}
                    data-mo-cua={c.mo ? "mo" : "dong"}
                  >
                    {c.mo ? "Đang mở" : "Đã đóng"} · {c.open}–{c.close}
                  </span>
                )}
              </div>
              {c.address && (
                <p className="mt-xs flex items-start gap-xxs text-sm text-slate">
                  <MapPin className="mt-[2px] h-4 w-4 shrink-0 text-steel" aria-hidden />
                  {c.address}
                </p>
              )}
              {c.phone && (
                <p className="mt-xxs flex items-center gap-xxs text-sm text-slate">
                  <Phone className="h-4 w-4 shrink-0 text-steel" aria-hidden />
                  <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="underline-offset-4 hover:underline">
                    {c.phone}
                  </a>
                </p>
              )}
              <div className="mt-md flex flex-wrap gap-sm">
                <Link href={`/r/${c.slug}/online`} className="inline-flex h-11 items-center rounded-md bg-primary px-lg text-sm font-medium text-primary-fg">
                  Đặt món
                </Link>
                {c.coBan && (
                  <Link
                    href={`/r/${c.slug}/reserve`}
                    className="inline-flex h-11 items-center rounded-md border border-hairline-strong px-lg text-sm font-medium text-ink"
                  >
                    Đặt bàn
                  </Link>
                )}
              </div>
            </li>
          ))}
          {chiNhanh.length === 0 && <li className="text-sm text-steel">Hiện chưa có chi nhánh nào nhận đơn.</li>}
        </ul>
      </div>
    </main>
  );
}
