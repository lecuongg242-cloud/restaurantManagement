import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";

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
  return <div className="w-full">{children}</div>;
}
