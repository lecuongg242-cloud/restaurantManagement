import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole } from "@/lib/auth/rbac";
import { listOnlineOrders } from "@/lib/orders/online";
import { StationScreen } from "@/components/staff/StationScreen";
import { OnlineQueue } from "@/components/pos/OnlineQueue";
import { createClient } from "@/lib/supabase/server";
import { parseSettings } from "@/lib/tenant/settings";
import { PrintModeProvider } from "@/lib/print/print-mode";

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

  const supabase = await createClient();
  const [orders, { data: tenantRow }] = await Promise.all([
    listOnlineOrders(session.tenant.id),
    // Chế độ in của quán (PRINT-10) — nút "In hóa đơn" của hàng chờ đi đúng đường in.
    supabase.from("tenants").select("settings").eq("id", session.tenant.id).maybeSingle(),
  ]);
  const printMode = parseSettings(tenantRow?.settings).print_mode;

  return (
    <StationScreen slug={slug} surface="pos">
      <div className="mx-auto w-full max-w-4xl p-lg">
        <Link href={`/r/${slug}/pos`} className="inline-flex items-center gap-xs text-sm text-steel hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Về màn POS
        </Link>
        <h1 className="mt-sm font-semibold text-2xl text-ink">Đơn online</h1>
        <p className="mt-xxs text-sm text-steel">
          Đơn mang về / giao của khách. Nhận đơn để xuống bếp, đánh dấu sẵn sàng, rồi thu tiền hoàn tất.
        </p>

        <PrintModeProvider mode={printMode}>
          <OnlineQueue
            slug={slug}
            tenantId={session.tenant.id}
            orders={orders}
            canBackdatePayment={session.role === "owner" || session.role === "manager"}
          />
        </PrintModeProvider>
      </div>
    </StationScreen>
  );
}
