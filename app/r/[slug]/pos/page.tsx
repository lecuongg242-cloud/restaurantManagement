import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole } from "@/lib/auth/rbac";
import { getCurrentStaff } from "@/app/r/[slug]/station-actions";
import { getPosSnapshot } from "@/lib/orders/pos";
import { getCustomerMenu } from "@/lib/orders/customer-menu";
import { createClient } from "@/lib/supabase/server";
import { StationScreen } from "@/components/staff/StationScreen";
import { PosBoard } from "@/components/pos/PosBoard";

export const dynamic = "force-dynamic";

/**
 * Trạm POS (03-02). StationScreen lo login trạm + chọn nhân viên (PIN, P1); khi đã chọn
 * nhân viên → render PosBoard (sơ đồ bàn + duyệt order + panel) với snapshot initial.
 */
export default async function PosHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/pos/login`);
  if (!canAccess(session.role, "pos")) redirect(defaultRouteForRole(slug, session.role));

  const current = await getCurrentStaff(slug, "pos");
  // Chưa chọn nhân viên (và không phải owner/manager) → StationScreen hiện StaffPicker.
  if (!current && session.role !== "owner" && session.role !== "manager") {
    return <StationScreen slug={slug} surface="pos" />;
  }

  const supabase = await createClient();
  const [{ data: snapshotData }, menu, { data: cancelStaffData }] = await Promise.all([
    getPosSnapshot(session.tenant.id).then((s) => ({ data: s })),
    getCustomerMenu(slug),
    // Nhân viên được quyền duyệt hủy món (manager/cashier) — cho CancelItemDialog.
    supabase
      .from("memberships")
      .select("id, display_name, role")
      .eq("tenant_id", session.tenant.id)
      .eq("active", true)
      .in("role", ["manager", "cashier"])
      .order("display_name", { ascending: true }),
  ]);

  const isPrincipal = session.role === "owner" || session.role === "manager";
  const cancelStaff = (cancelStaffData ?? []).map((m) => ({
    id: m.id,
    name: m.display_name ?? "(không tên)",
    role: m.role as "manager" | "cashier",
  }));

  return (
    <StationScreen slug={slug} surface="pos">
      <PosBoard
        slug={slug}
        tenantId={session.tenant.id}
        initial={snapshotData}
        menu={menu}
        cancelStaff={cancelStaff}
        canCancelWithoutPin={isPrincipal}
      />
    </StationScreen>
  );
}
