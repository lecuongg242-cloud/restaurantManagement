import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole } from "@/lib/auth/rbac";
import { OwnerLoginForm } from "./OwnerLoginForm";

export default async function AdminLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Đã đăng nhập đúng quyền → vào thẳng admin (hoặc khu mặc định của vai trò).
  const session = await getSessionMembership(slug);
  if (session) {
    if (canAccess(session.role, "admin")) redirect(`/r/${slug}/admin`);
    redirect(defaultRouteForRole(slug, session.role));
  }

  // Trang login là public (chưa có phiên) → đọc tên tenant qua service role.
  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();
  const tenantName = tenant?.name ?? slug;

  return (
    <div className="grid min-h-screen place-items-center bg-surface p-lg">
      <div className="w-full max-w-sm rounded-lg border border-hairline-soft bg-canvas p-xxl shadow-card">
        <h1 className="font-display text-2xl text-ink">Đăng nhập quản trị</h1>
        <p className="mt-xxs text-sm text-steel">
          Nhà hàng <span className="font-medium text-ink">{tenantName}</span>
        </p>

        <OwnerLoginForm slug={slug} />
      </div>
    </div>
  );
}
