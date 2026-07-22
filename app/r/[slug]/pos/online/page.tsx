import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole } from "@/lib/auth/rbac";
import { getCurrentStaff } from "@/app/r/[slug]/station-actions";
import { listOnlineOrders } from "@/lib/orders/online";
import { StationScreen } from "@/components/staff/StationScreen";
import { OnlineQueue } from "@/components/pos/OnlineQueue";

export const dynamic = "force-dynamic";

/**
 * Đơn online trên POS (thu ngân/phục vụ) — nhận đơn → bếp → sẵn sàng → thu tiền + hoàn tất.
 * Guard = phiên trạm + quyền POS (StationScreen lo staff-picker). Không còn ở khu admin.
 */
export default async function PosOnlinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/pos/login`);
  if (!canAccess(session.role, "pos")) redirect(defaultRouteForRole(slug, session.role));

  const current = await getCurrentStaff(slug, "pos");
  if (!current && session.role !== "owner" && session.role !== "manager") {
    return <StationScreen slug={slug} surface="pos" />;
  }

  const orders = await listOnlineOrders(session.tenant.id);

  return (
    <StationScreen slug={slug} surface="pos">
      <div className="mx-auto w-full max-w-4xl p-lg">
        <Link href={`/r/${slug}/pos`} className="inline-flex items-center gap-xs text-sm text-steel hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Về sơ đồ bàn
        </Link>
        <h1 className="mt-sm font-display text-2xl text-ink">Đơn online</h1>
        <p className="mt-xxs text-sm text-steel">
          Đơn mang về / giao của khách. Nhận đơn để xuống bếp, đánh dấu sẵn sàng, rồi thu tiền hoàn tất.
        </p>

        <OnlineQueue slug={slug} tenantId={session.tenant.id} orders={orders} />
      </div>
    </StationScreen>
  );
}
