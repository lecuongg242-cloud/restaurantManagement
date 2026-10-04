import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { quanCuaToi } from "@/lib/quan-ly/quan";
import { QUAN_LY_METADATA, QUAN_LY_VIEWPORT } from "@/lib/quan-ly/metadata";
import { ThanhTab } from "@/components/quan-ly/ThanhTab";
import { Toaster } from "@/components/ui/toaster";
import { readFlash } from "@/lib/flash";
import { SubscriptionBannerSlot } from "@/components/tenant/SubscriptionBanner";
import { quanLySignOut } from "@/app/quan-ly/actions";

export const metadata = QUAN_LY_METADATA;
export const viewport = QUAN_LY_VIEWPORT;

/**
 * Khung app "TechMenu Quản lý" trong một quán (P30, Giao diện B4): đầu trang = tên quán (chạm → đổi quán khi có nhiều),
 * thanh 5 tab ở đáy. Guard như admin: chưa đăng nhập → `/quan-ly`; thu ngân / bếp → báo không có quyền (không đẩy sang
 * POS — đây là app của chủ). Một cột, rộng tối đa ~480px; máy lớn đã có trang admin đầy đủ.
 */
export default async function QuanLyQuanLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session) redirect("/quan-ly");
  if (!canAccess(session.role, "admin")) {
    return (
      <main className="mx-auto max-w-[480px] px-md py-xl">
        <p role="alert" className="rounded-md border border-status-late bg-cream-soft p-md text-sm text-status-late">
          Tài khoản này không có quyền quản lý.
        </p>
        <form action={quanLySignOut} className="mt-md">
          <button className="min-h-11 text-sm text-steel underline">Đăng nhập tài khoản khác</button>
        </form>
      </main>
    );
  }
  const [quan, flash] = await Promise.all([quanCuaToi(), readFlash()]);
  const nhieuQuan = quan.length > 1;

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-20 border-b border-hairline-soft bg-canvas/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex min-h-12 max-w-[480px] items-center px-md">
          {nhieuQuan ? (
            <Link href="/quan-ly/chon-quan" className="flex min-h-11 min-w-0 items-center gap-xxs font-medium text-ink" aria-label={`${session.tenant.name} — đổi quán`}>
              <span className="truncate">{session.tenant.name}</span>
              <ChevronDown className="size-4 shrink-0 text-steel" aria-hidden />
            </Link>
          ) : (
            <span className="truncate font-medium text-ink">{session.tenant.name}</span>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-[480px] px-md pb-[calc(5rem+env(safe-area-inset-bottom))] pt-md">
        <SubscriptionBannerSlot slug={slug} tenantId={session.tenant.id} role={session.role} />
        {children}
      </div>
      <Suspense>
        <ThanhTab slug={slug} />
      </Suspense>
      <Toaster flash={flash} />
    </div>
  );
}
