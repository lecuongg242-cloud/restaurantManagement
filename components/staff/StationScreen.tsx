import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole, type Section } from "@/lib/auth/rbac";
import { stationSignOut } from "@/app/r/[slug]/station-actions";
import { Button } from "@/components/ui/button";

const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ quán",
  manager: "Quản lý",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  kitchen: "Bếp",
  station: "Trạm",
};

/**
 * Bề mặt trạm (POS/KDS) — QD-009. Nhân viên đã đăng nhập bằng email + PIN nên phiên CHÍNH LÀ danh
 * tính thao tác; không còn bước "Chọn nhân viên". Chỉ guard phiên + quyền vào bề mặt, hiện tên
 * nhân viên trên header và nút đăng xuất.
 */
export async function StationScreen({
  slug,
  surface,
  children,
}: {
  slug: string;
  surface: "pos" | "kds";
  children?: React.ReactNode;
}) {
  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/${surface}/login`);
  if (!canAccess(session.role, surface as Section)) {
    redirect(defaultRouteForRole(slug, session.role));
  }

  const label = surface === "pos" ? "Trạm POS" : "Màn hình bếp (KDS)";
  const staffName = session.displayName ?? ROLE_LABEL[session.role] ?? session.role;
  const signOut = stationSignOut.bind(null, slug, surface);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-hairline-soft bg-canvas px-lg py-md">
        <div className="flex items-baseline gap-sm">
          <span className="text-base font-medium text-ink">{label}</span>
          <span className="text-sm text-steel">· {session.tenant.name}</span>
        </div>
        <div className="flex items-center gap-sm">
          <span className="rounded-full bg-cream px-md py-xxs text-sm font-medium text-ink">
            Nhân viên: {staffName}
          </span>
          <form action={signOut}>
            <Button type="submit" variant="link" size="sm">
              Đăng xuất
            </Button>
          </form>
        </div>
      </header>
      {children ? (
        <main className="min-h-0 flex-1">{children}</main>
      ) : (
        <main className="flex-1 p-xl">
          <h1 className="text-2xl font-medium text-ink">
            {label} — {session.tenant.name}
          </h1>
          <p className="mt-sm text-sm text-slate">
            Nhân viên đang thao tác: <span className="text-ink">{staffName}</span>. Mọi thao tác gắn
            staff_id của nhân viên này.
          </p>
        </main>
      )}
    </div>
  );
}
