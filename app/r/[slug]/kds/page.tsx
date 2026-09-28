import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole } from "@/lib/auth/rbac";
import { getKdsTickets } from "@/lib/orders/kds";
import { getCustomerMenu } from "@/lib/orders/customer-menu";
import { StationScreen } from "@/components/staff/StationScreen";
import { KdsBoard } from "@/components/kds/KdsBoard";
import { manifestMeta } from "@/lib/offline/manifest-meta";
import { createClient } from "@/lib/supabase/server";
import { parseSettings } from "@/lib/tenant/settings";
import { PrintModeProvider } from "@/lib/print/print-mode";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return manifestMeta((await params).slug, "kds");
}

/**
 * Màn hình bếp KDS (03-03). StationScreen lo login trạm + chọn nhân viên (kitchen); khi đã chọn
 * → KdsBoard (3 cột realtime) với vé initial. Owner/manager thao tác như chính họ.
 */
export default async function KdsHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/kds/login`);
  if (!canAccess(session.role, "kds")) redirect(defaultRouteForRole(slug, session.role));

  // `menu` cho drawer "Báo hết món" (MENU-04) — getCustomerMenu trả CẢ món đang hết.
  const supabase = await createClient();
  const [tickets, menu, { data: tenantRow }] = await Promise.all([
    getKdsTickets(session.tenant.id),
    getCustomerMenu(slug),
    // Chế độ in: băng "máy in quầy mất kết nối" chỉ có ở quán dùng cầu in (P17 17-02).
    supabase.from("tenants").select("settings").eq("id", session.tenant.id).maybeSingle(),
  ]);

  return (
    <StationScreen slug={slug} surface="kds" fill>
      <PrintModeProvider mode={parseSettings(tenantRow?.settings).print_mode}>
        <KdsBoard slug={slug} tenantId={session.tenant.id} initial={tickets} menu={menu} />
      </PrintModeProvider>
    </StationScreen>
  );
}
