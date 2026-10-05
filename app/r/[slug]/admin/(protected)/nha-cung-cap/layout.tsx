import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { KhoHangHeader } from "@/components/admin/inventory/KhoHangHeader";
import { KhoSoStatus } from "@/components/admin/inventory/KhoSoStatus";

/** Nhà cung cấp (P20, QD-027): owner + manager. Guard một chỗ cho danh sách và chi tiết. */
export default async function SupplierLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "purchasing")) redirect(defaultRouteForRole(slug, session.role));
  // Nhà cung cấp (P20) là một tab của khu "Kho hàng" (P28, 04/10/2026).
  return (
    <div className="w-full">
      <KhoHangHeader adminBase={`/r/${slug}/admin`} />
      <KhoSoStatus tenantId={session.tenant.id} adminBase={`/r/${slug}/admin`} />
      <div className="mt-lg">{children}</div>
    </div>
  );
}
