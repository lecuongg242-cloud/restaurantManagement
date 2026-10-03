import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { KhoHangHeader } from "@/components/admin/inventory/KhoHangHeader";

/** Nhập hàng (P20, chủ dự án chốt G1 30/09/2026 — mục menu riêng như KiotViet FnB): owner + manager. */
export default async function PurchaseLayout({
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
  // Nhập hàng (P20) là một tab của khu "Kho hàng" (P28, 04/10/2026).
  return (
    <div className="w-full">
      <KhoHangHeader adminBase={`/r/${slug}/admin`} />
      <div className="mt-lg">{children}</div>
    </div>
  );
}
