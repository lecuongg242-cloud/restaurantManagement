import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { menuUrlForToken, qrSvg, qrPngDataUrl } from "@/lib/tables/qr";
import { PrintButton } from "@/components/tables/PrintButton";
import { QrDownload } from "@/components/tables/QrDownload";
import type { Area, Table } from "@/lib/tables/types";

export const dynamic = "force-dynamic";

/**
 * Trang in QR gộp (khổ A4) + tải PNG/SVG từng bàn. Ngoài route group (protected)
 * nhưng vẫn dưới /r/[slug]/ nên tự guard membership. QR mã hoá URL tuyệt đối
 * lấy host từ header request (đúng local/dev/prod).
 */
export default async function PrintQrPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  const allowed = ["owner", "manager", "station"];
  if (!allowed.includes(session.role)) redirect(`/r/${slug}`);

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";

  const supabase = await createClient();
  const [{ data: areas }, { data: tables }] = await Promise.all([
    supabase.from("areas").select("id, name, sort_order").eq("tenant_id", session.tenant.id),
    supabase
      .from("tables")
      .select("*")
      .eq("tenant_id", session.tenant.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const areaName = new Map<string, string>();
  for (const a of (areas ?? []) as Pick<Area, "id" | "name">[]) areaName.set(a.id, a.name);

  const cards = await Promise.all(
    ((tables ?? []) as Table[]).map(async (t) => {
      const url = menuUrlForToken(host, slug, t.qr_token, proto);
      const [svg, png] = await Promise.all([qrSvg(url), qrPngDataUrl(url)]);
      return {
        id: t.id,
        name: t.name,
        area: t.area_id ? areaName.get(t.area_id) ?? "" : "Chưa xếp khu",
        svg,
        png,
      };
    })
  );

  return (
    <div className="mx-auto max-w-[210mm] p-lg print:p-0">
      <div className="no-print mb-lg flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">Mã QR bàn — {session.tenant.name}</h1>
          <p className="mt-xxs text-sm text-steel">
            In khổ A4 để dán lên bàn, hoặc tải PNG/SVG từng bàn. Khách quét QR để mở menu gọi món.
          </p>
        </div>
        <PrintButton />
      </div>

      {cards.length === 0 ? (
        <p className="text-center text-steel">Chưa có bàn nào. Tạo bàn ở trang Bàn & QR.</p>
      ) : (
        <div className="qr-grid grid grid-cols-2 gap-md sm:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.id}
              className="flex break-inside-avoid flex-col items-center rounded-lg border border-hairline-soft p-md text-center"
            >
              <span className="text-xs text-steel">{c.area}</span>
              <span className="font-display text-lg text-ink">{c.name}</span>
              <div
                className="mt-xs h-[128px] w-[128px]"
                // SVG QR nội tuyến (in nét). Nội dung do qrcode sinh, an toàn.
                dangerouslySetInnerHTML={{ __html: c.svg }}
              />
              <span className="mt-xs text-[10px] text-muted">Quét để gọi món</span>
              <div className="no-print">
                <QrDownload fileBase={`${c.area}-${c.name}`} svg={c.svg} png={c.png} />
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
          .qr-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 8mm !important; }
          html, body { background: #fff !important; }
        }
        .qr-grid svg { width: 100%; height: 100%; }
      `}</style>
    </div>
  );
}
