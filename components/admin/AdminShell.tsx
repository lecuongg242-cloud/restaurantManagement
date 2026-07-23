import { ownerSignOut } from "@/app/r/[slug]/admin/actions";
import { Button } from "@/components/ui/button";
import { AdminNav } from "@/components/admin/AdminNav";
import type { TenantInfo, Role } from "@/lib/auth/session";

/**
 * Khung admin (desktop). Sidebar điều hướng + header hiện logo + tên tenant (OPS-06).
 * P1: Tổng quan / Nhân viên / Thực đơn / Bàn / Cài đặt hoạt động; mục khác là placeholder "chờ".
 */
export function AdminShell({
  tenant,
  role,
  children,
}: {
  tenant: TenantInfo;
  role: Role;
  children: React.ReactNode;
}) {
  const base = `/r/${tenant.slug}/admin`;
  const signOut = ownerSignOut.bind(null, tenant.slug);

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="flex w-60 flex-col border-r border-hairline-soft bg-canvas">
        <div className="flex items-center gap-sm border-b border-hairline-soft px-lg py-md">
          {tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logo_url}
              alt={tenant.name}
              className="h-9 w-9 rounded-md object-cover"
            />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-base font-semibold text-primary-fg">
              {tenant.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium text-ink">{tenant.name}</span>
            <span className="text-xs text-steel">{role}</span>
          </div>
        </div>

        <AdminNav base={base} />

        <form action={signOut} className="border-t border-hairline-soft p-sm">
          <Button type="submit" variant="secondary" size="sm" className="w-full">
            Đăng xuất
          </Button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-sm border-b border-hairline-soft bg-canvas px-xl py-md">
          <h2 className="text-sm font-medium text-ink">{tenant.name}</h2>
          <span className="text-xs text-steel">· khu quản trị</span>
        </header>
        <main className="flex-1 overflow-x-auto p-lg sm:p-xl lg:p-xxl">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
