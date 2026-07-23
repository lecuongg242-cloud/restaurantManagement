import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReservationForm } from "@/components/reserve/ReservationForm";
import { submitReservation } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Đặt bàn online (RESV-01) — bề mặt KHÁCH ẩn danh. Khách không có phiên → đọc nhận diện
 * công khai (tên/logo) + danh sách khu vực bằng admin client, scope theo slug (D15).
 * Gửi form → server action createReservation (service role). Theme khách cố định (QD-006).
 */
export default async function ReservePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, name, logo_url")
    .eq("slug", slug)
    .maybeSingle();

  const name = tenant?.name ?? slug;
  const logoUrl = tenant?.logo_url ?? null;

  const { data: areas } = tenant
    ? await admin
        .from("areas")
        .select("id, name")
        .eq("tenant_id", tenant.id)
        .order("sort_order", { ascending: true })
    : { data: null };

  return (
    <div>
      <header className="flex items-center gap-sm border-b border-hairline-soft px-lg py-sm">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={name} className="h-8 w-8 rounded-md object-cover" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-fg">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium text-ink" data-tenant-slug={slug}>
            {name}
          </span>
          <span className="text-xs text-steel">Đặt bàn</span>
        </div>
      </header>

      <main className="mx-auto max-w-md p-lg">
        {ok ? (
          <div className="rounded-lg border border-beige-deep bg-cream p-xxl text-center">
            <h1 className="font-display text-2xl leading-tight text-ink">Đã gửi yêu cầu đặt bàn</h1>
            <p className="mt-sm text-sm text-slate">
              Cảm ơn bạn! Nhà hàng sẽ liên hệ qua số điện thoại để xác nhận đặt bàn.
            </p>
            <div className="mt-lg flex flex-col gap-sm">
              <Link
                href={`/r/${slug}/reserve`}
                className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-lg text-sm font-medium text-primary-fg hover:bg-primary-deep"
              >
                Đặt bàn khác
              </Link>
              <Link href={`/r/${slug}`} className="text-sm text-primary hover:underline">
                Về trang nhà hàng
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h1 className="font-display text-3xl leading-tight text-ink">Đặt bàn</h1>
            <p className="mt-sm text-sm text-slate">
              Điền thông tin bên dưới, nhà hàng sẽ liên hệ xác nhận với bạn.
            </p>

            {error && (
              <p
                role="alert"
                className="mt-md rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late"
              >
                {error}
              </p>
            )}

            <div className="mt-lg">
              <ReservationForm
                slug={slug}
                areas={(areas ?? []) as { id: string; name: string }[]}
                action={submitReservation}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
