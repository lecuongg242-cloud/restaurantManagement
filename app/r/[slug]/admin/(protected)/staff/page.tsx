import { redirect } from "next/navigation";
import { getSessionMembership, type Role } from "@/lib/auth/session";
import { canManage, canAssignRole, defaultRouteForRole } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { StaffTable, type StaffRole } from "@/components/admin/staff/StaffTable";

export const dynamic = "force-dynamic";

/**
 * Màn Nhân viên (P31, chủ dự án chốt 04/10/2026): bảng gọn + hộp thoại thêm / sửa / đổi PIN — xem `StaffTable`.
 * Liệt kê CẢ owner/manager để thấy trọn đội ngũ; dòng không có quyền (`canAssignRole`) không có nút ⋯.
 */
export default async function StaffPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "staff")) redirect(defaultRouteForRole(slug, session.role));

  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("memberships")
    .select("id, display_name, email, role, active, created_at")
    .eq("tenant_id", session.tenant.id)
    .in("role", ["owner", "manager", "cashier", "waiter", "kitchen"])
    .order("created_at", { ascending: true });

  const rows = (staff ?? []).map((s) => ({
    id: s.id,
    name: s.display_name,
    email: s.email,
    role: s.role as StaffRole,
    active: s.active,
    editable: canAssignRole(session.role, s.role as Role),
  }));

  return (
    <div className="w-full">
      <StaffTable slug={slug} rows={rows} canCreateManager={canAssignRole(session.role, "manager")} />
    </div>
  );
}
