import { ShieldCheck } from "lucide-react";
import { superSignOut } from "@/app/super/actions";
import { Button } from "@/components/ui/button";
import { SuperNav } from "@/components/super/SuperNav";
import { SuperMobileNav } from "@/components/super/SuperMobileNav";

/**
 * Khung super-admin: sidebar trái cố định từ `lg`, dưới ngưỡng đó là thanh trên + drawer. Nội dung trải
 * HẾT bề ngang (không `max-w`) — bảng nhà hàng / thuê bao / cầu in nhiều cột cần chỗ.
 */
export function SuperShell({
  email,
  badges,
  children,
}: {
  email: string | null;
  /** Số cần chú ý hiện cạnh mục menu, theo href. */
  badges: Record<string, number>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-hairline-soft bg-canvas lg:flex">
        <div className="flex items-center gap-sm border-b border-hairline-soft px-lg py-md">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-ink text-canvas">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-sm font-medium text-ink">Super Admin</span>
            <span className="truncate text-xs text-steel">{email ?? "Quản trị hệ thống"}</span>
          </div>
        </div>
        <SuperNav badges={badges} />
        <form action={superSignOut} className="border-t border-hairline-soft p-sm">
          <Button type="submit" variant="secondary" size="sm" className="w-full">
            Đăng xuất
          </Button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-sm border-b border-hairline-soft bg-canvas px-sm py-xs lg:hidden">
          <SuperMobileNav badges={badges} signOut={superSignOut} />
          <span className="text-sm font-medium text-ink">Super Admin</span>
        </header>
        <main className="min-w-0 flex-1 p-md sm:p-lg lg:p-xl">{children}</main>
      </div>
    </div>
  );
}

/** Tiêu đề trang dùng chung: tên + mô tả bên trái, nút thao tác bên phải. */
export function SuperPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-md sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-semibold text-3xl text-ink">{title}</h1>
        {description && <p className="mt-xs text-sm text-steel">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-sm">{actions}</div>}
    </header>
  );
}
