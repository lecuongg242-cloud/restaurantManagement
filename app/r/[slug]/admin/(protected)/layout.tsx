import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole } from "@/lib/auth/rbac";
import { AdminShell } from "@/components/admin/AdminShell";
import { Toaster } from "@/components/ui/toaster";
import { readFlash } from "@/lib/flash";

/**
 * Guard khu admin (server): chặn chéo tenant + RBAC vai trò.
 * - Không đăng nhập / không membership ở tenant này → về login.
 * - Có membership nhưng vai trò không được vào admin (kitchen/cashier/waiter)
 *   → đẩy về route mặc định của vai trò (AUTH-04).
 * Login nằm NGOÀI route group (protected) này nên không bị vòng lặp guard.
 */
export default async function ProtectedAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canAccess(session!.role, "admin")) {
    redirect(defaultRouteForRole(slug, session!.role));
  }

  const flash = await readFlash();

  return (
    <>
      <AdminShell tenant={session!.tenant} role={session!.role}>
        {children}
      </AdminShell>
      <Toaster flash={flash} />
    </>
  );
}
