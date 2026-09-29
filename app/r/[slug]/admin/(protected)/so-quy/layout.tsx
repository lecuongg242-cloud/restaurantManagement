import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";

/** Sổ quỹ (P20 20-02, QD-027 C5): owner + manager. Guard một chỗ cho sổ, phiếu, loại thu chi. */
export default async function CashbookLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "cashbook")) redirect(defaultRouteForRole(slug, session.role));
  return <div className="w-full">{children}</div>;
}
