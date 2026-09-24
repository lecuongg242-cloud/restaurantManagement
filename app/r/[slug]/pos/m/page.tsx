import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole } from "@/lib/auth/rbac";
import { getPosSnapshot } from "@/lib/orders/pos";
import { getCustomerMenu } from "@/lib/orders/customer-menu";
import { createClient } from "@/lib/supabase/server";
import { parseSettings } from "@/lib/tenant/settings";
import { StaffMobileOrder } from "@/components/pos/StaffMobileOrder";

export const dynamic = "force-dynamic";

/**
 * Màn gọi món tại bàn trên ĐIỆN THOẠI (ORDER-15) — `/r/{slug}/pos/m`.
 *
 * Nằm dưới `/pos` để dùng lại nguyên guard vai trò của bề mặt POS: nhân viên đăng nhập một lần
 * đầu ca (email + PIN, QD-009) và `session.membershipId` chính là danh tính gõ đơn, nên không có
 * bước "chọn nhân viên" nào. KHÔNG bọc trong `StationScreen`: header của nó là bố cục desktop,
 * ăn mất chiều cao quý giá ở khổ 360px — màn này tự dựng header gọn.
 */
export default async function StaffMobileOrderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/pos/login`);
  if (!canAccess(session.role, "pos")) redirect(defaultRouteForRole(slug, session.role));

  const supabase = await createClient();
  const [snapshot, menu, { data: tenantRow }] = await Promise.all([
    getPosSnapshot(session.tenant.id, slug),
    getCustomerMenu(slug),
    supabase.from("tenants").select("settings").eq("id", session.tenant.id).maybeSingle(),
  ]);

  const settings = parseSettings(tenantRow?.settings);

  return (
    <StaffMobileOrder
      slug={slug}
      staffName={session.displayName ?? "Nhân viên"}
      initial={snapshot}
      menu={menu}
      counter={settings.service_mode === "counter"}
    />
  );
}
