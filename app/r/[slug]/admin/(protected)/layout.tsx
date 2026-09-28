import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole } from "@/lib/auth/rbac";
import { AdminShell } from "@/components/admin/AdminShell";
import { Toaster } from "@/components/ui/toaster";
import { readFlash } from "@/lib/flash";
import { SubscriptionBannerSlot } from "@/components/tenant/SubscriptionBanner";
import { GoiDichVuThe } from "@/components/tenant/GoiDichVuThe";
import { BranchSwitcher } from "@/components/brand/BranchSwitcher";
import { boChonChiNhanh } from "@/lib/brand/branches";
import { manifestMeta } from "@/lib/offline/manifest-meta";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return manifestMeta((await params).slug, "admin");
}

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

  const [flash, chiNhanh] = await Promise.all([readFlash(), boChonChiNhanh(session!.tenant.id)]);

  return (
    <>
      <AdminShell
        tenant={session!.tenant}
        role={session!.role}
        banner={<SubscriptionBannerSlot slug={slug} tenantId={session!.tenant.id} role={session!.role} />}
        planCard={<GoiDichVuThe slug={slug} tenantId={session!.tenant.id} role={session!.role} />}
        branchSwitcher={chiNhanh && <BranchSwitcher slug={slug} branches={chiNhanh.branches} brandSlug={chiNhanh.brandSlug} />}
      >
        {children}
      </AdminShell>
      <Toaster flash={flash} />
    </>
  );
}
