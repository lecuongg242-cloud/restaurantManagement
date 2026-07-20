import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { PrintButton } from "@/components/print-button";
import { siteOrigin, tableQrDataUrl } from "@/lib/qr";

/**
 * Trang in tổng QR (TABLE-01): lưới thẻ QR khổ A4, in qua trình duyệt /
 * lưu PDF — cùng triết lý in của V1. Mỗi thẻ: nhà hàng, khu vực, bàn,
 * QR, hướng dẫn quét.
 */
export default async function PrintQrPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return null;

  const [{ data: areas }, { data: tables }] = await Promise.all([
    supabase
      .from("areas")
      .select("id, name")
      .eq("tenant_id", tenant.id)
      .order("sort")
      .order("created_at"),
    supabase
      .from("tables")
      .select("id, area_id, name, qr_token")
      .eq("tenant_id", tenant.id)
      .order("created_at"),
  ]);

  const origin = await siteOrigin();
  const areaName = new Map((areas ?? []).map((a) => [a.id, a.name]));
  const cards = await Promise.all(
    (tables ?? []).map(async (t) => ({
      id: t.id,
      table: t.name,
      area: areaName.get(t.area_id) ?? "",
      qr: await tableQrDataUrl(origin, slug, t.qr_token),
    }))
  );

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          main { max-width: none !important; padding: 0 !important; }
          .qr-grid { gap: 4mm !important; }
          .qr-card { break-inside: avoid; border: 1px dashed #999 !important; }
        }
        @page { size: A4; margin: 10mm; }
      `}</style>

      <header className="no-print mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">In QR bàn — {tenant.name}</h1>
          <p className="text-sm opacity-70">
            {cards.length} bàn · In hoặc lưu PDF, cắt theo đường đứt dán từng
            bàn.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <PrintButton />
          <Link
            href={`/r/${slug}/admin/tables`}
            className="text-sm underline opacity-70"
          >
            ← Bàn
          </Link>
        </div>
      </header>

      {cards.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-6 text-center opacity-70">
          Chưa có bàn nào để in.
        </p>
      ) : (
        <div className="qr-grid grid grid-cols-2 gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.id}
              className="qr-card flex flex-col items-center rounded-card border border-border p-4 text-center"
            >
              <p className="text-sm font-medium">{tenant.name}</p>
              <p className="text-xs opacity-60">{c.area}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL, in ấn cần ảnh thô không qua optimizer */}
              <img src={c.qr} alt={`QR bàn ${c.table}`} className="my-2 h-32 w-32" />
              <p className="text-lg font-bold">Bàn {c.table}</p>
              <p className="mt-1 text-[11px] leading-tight opacity-70">
                Quét mã bằng camera điện thoại
                <br />
                để xem menu &amp; gọi món
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
