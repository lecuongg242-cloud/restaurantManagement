import { ownerSignOut } from "@/app/r/[slug]/admin/actions";
import { Button } from "@/components/ui/button";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminMobileNav } from "@/components/admin/AdminMobileNav";
import type { TenantInfo, Role } from "@/lib/auth/session";

/**
 * Khung admin. Sidebar điều hướng + header hiện logo + tên tenant (OPS-06).
 * P1: Tổng quan / Nhân viên / Thực đơn / Bàn / Cài đặt hoạt động; mục khác là placeholder "chờ".
 *
 * Responsive: từ `lg` (≥1024px — desktop, iPad ngang) sidebar cố định bên trái. Dưới ngưỡng đó
 * (điện thoại, tablet dọc) sidebar ẩn hẳn để trả hết bề ngang cho nội dung; điều hướng chuyển
 * sang thanh trên + drawer (AdminMobileNav).
 */
export function AdminShell({
  tenant,
  role,
  banner,
  planCard,
  branchSwitcher,
  children,
}: {
  tenant: TenantInfo;
  role: Role;
  /** Banner nhắc hạn dùng (SUB-02) — dựng ở layout server, null khi không cần nhắc. */
  banner?: React.ReactNode;
  /** Ô "Gói dịch vụ" ở chân sidebar (chỉ owner) — dựng ở layout server. */
  planCard?: React.ReactNode;
  /** Bộ chọn chi nhánh (P15) — null với quán lẻ / người chỉ thuộc một chi nhánh. */
  branchSwitcher?: React.ReactNode;
  children: React.ReactNode;
}) {
  const base = `/r/${tenant.slug}/admin`;
  const signOut = ownerSignOut.bind(null, tenant.slug);

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Sidebar desktop — sticky để nav còn thấy khi trang dài (thực đơn, báo cáo). */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-hairline-soft bg-canvas lg:flex">
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

        <AdminNav base={base} role={role} />

        {planCard}
        <form action={signOut} className="border-t border-hairline-soft p-sm">
          <Button type="submit" variant="secondary" size="sm" className="w-full">
            Đăng xuất
          </Button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Thanh trên mobile/tablet: hamburger + tên tenant. Sticky để luôn đổi màn được. */}
        <header className="sticky top-0 z-30 flex items-center gap-sm border-b border-hairline-soft bg-canvas px-sm py-xs lg:hidden">
          <AdminMobileNav tenant={tenant} role={role} base={base} signOut={signOut} planCard={planCard} />
          {tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logo_url}
              alt=""
              className="h-8 w-8 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-fg">
              {tenant.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium text-ink">{tenant.name}</span>
            <span className="text-xs text-steel">khu quản trị</span>
          </div>
          {branchSwitcher && <div className="ml-auto min-w-0">{branchSwitcher}</div>}
        </header>

        {/* Header desktop — mobile đã có thanh trên riêng nên ẩn đi để không lặp tên tenant. */}
        <header className="hidden items-center gap-sm border-b border-hairline-soft bg-canvas px-xl py-md lg:flex">
          <h2 className="text-sm font-medium text-ink">{tenant.name}</h2>
          <span className="text-xs text-steel">· khu quản trị</span>
          {branchSwitcher && <div className="ml-auto">{branchSwitcher}</div>}
        </header>

        {banner}

        {/* Bỏ overflow-x-auto: khung ngoài cuộn ngang che mất lỗi tràn của từng trang; nay mỗi
            bảng/biểu đồ tự bọc vùng cuộn riêng nên nội dung KHÔNG đẩy trang lệch trên mobile. */}
        <main className="min-w-0 flex-1 p-md sm:p-lg lg:p-xl xl:p-xxl">
          {/* Trải hết bề ngang màn PC như KiotViet/Sapo. Trang form (Cài đặt, Onboarding) tự giới hạn độ rộng riêng. */}
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
