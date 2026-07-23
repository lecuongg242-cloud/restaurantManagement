import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { listReservationsByDay, todayVN } from "@/lib/reservations/reservations";
import { StationScreen } from "@/components/staff/StationScreen";
import { ReservationList } from "@/components/pos/ReservationList";

export const dynamic = "force-dynamic";

const DAY = 86400000;
function shiftDay(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY).toISOString().slice(0, 10);
}
function formatDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Đặt bàn trên POS (thu ngân/phục vụ) — danh sách theo ngày + duyệt + tạo đặt bàn hộ khách.
 * Guard = phiên trạm + quyền POS (StationScreen lo staff-picker). Không còn ở khu admin.
 */
export default async function PosReservationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { slug } = await params;
  const { day } = await searchParams;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/pos/login`);
  if (!canAccess(session.role, "pos")) redirect(defaultRouteForRole(slug, session.role));

  const validDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayVN();
  const supabase = await createClient();
  const [{ items, counts }, { data: areas }, { data: tables }] = await Promise.all([
    listReservationsByDay(session.tenant.id, validDay),
    supabase.from("areas").select("id, name").eq("tenant_id", session.tenant.id).order("sort_order", { ascending: true }),
    supabase
      .from("tables")
      .select("id, name, area_id")
      .eq("tenant_id", session.tenant.id)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <StationScreen slug={slug} surface="pos">
      <div className="mx-auto w-full max-w-4xl p-lg">
        <Link href={`/r/${slug}/pos`} className="inline-flex items-center gap-xs text-sm text-steel hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Về sơ đồ bàn
        </Link>
        <h1 className="mt-sm font-display text-2xl text-ink">Đặt bàn</h1>
        <p className="mt-xxs text-sm text-steel">
          Yêu cầu đặt bàn theo ngày. Tạo mới khi khách gọi điện, xác nhận hoặc từ chối.
        </p>

        <ReservationList
          slug={slug}
          tenantId={session.tenant.id}
          day={validDay}
          dayLabel={formatDay(validDay)}
          prevDay={shiftDay(validDay, -1)}
          nextDay={shiftDay(validDay, 1)}
          today={todayVN()}
          items={items}
          counts={counts}
          areas={(areas ?? []) as { id: string; name: string }[]}
          tables={(tables ?? []) as { id: string; name: string; area_id: string | null }[]}
        />
      </div>
    </StationScreen>
  );
}
