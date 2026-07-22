import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole, type Section } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff, clearStaff, stationSignOut } from "@/app/r/[slug]/station-actions";
import { StaffPicker } from "@/components/staff/StaffPicker";
import { Button } from "@/components/ui/button";

const PICKER_ROLES: Record<"pos" | "kds", string[]> = {
  pos: ["cashier", "waiter"],
  kds: ["kitchen"],
};

/**
 * Bề mặt trạm (POS/KDS). Server component:
 *  1) chưa đăng nhập trạm / sai vai trò → login hoặc route mặc định;
 *  2) đã đăng nhập trạm nhưng chưa chọn nhân viên → StaffPicker + PinPad;
 *  3) đã chọn nhân viên → shell thao tác (hiển thị tên nhân viên đang thao tác).
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
  if (!canAccess(session!.role, surface as Section)) {
    redirect(defaultRouteForRole(slug, session!.role));
  }

  const current = await getCurrentStaff(slug, surface);
  const label = surface === "pos" ? "Trạm POS" : "Màn hình bếp (KDS)";

  // Owner/manager đăng nhập email thao tác như chính họ (không cần chọn nhân viên/PIN).
  const isPrincipal = session!.role === "owner" || session!.role === "manager";
  const acting =
    current ??
    (isPrincipal
      ? {
          id: session!.membershipId,
          display_name: session!.role === "owner" ? "Chủ quán" : "Quản lý",
          role: session!.role,
          active: true,
        }
      : null);

  // (2) Chưa chọn nhân viên → StaffPicker
  if (!acting) {
    const supabase = await createClient();
    const { data: staff } = await supabase
      .from("memberships")
      .select("id, display_name, role")
      .eq("tenant_id", session!.tenant.id)
      .eq("active", true)
      .in("role", PICKER_ROLES[surface])
      .order("display_name", { ascending: true });

    const signOut = stationSignOut.bind(null, slug, surface);
    return (
      <div className="flex min-h-screen flex-col bg-surface">
        <header className="flex items-center justify-between border-b border-hairline-soft bg-canvas px-lg py-md">
          <div>
            <span className="text-sm font-medium text-ink">{label}</span>
            <span className="ml-xs text-xs text-steel">· {session!.tenant.name}</span>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="secondary" size="sm">
              Đăng xuất thiết bị
            </Button>
          </form>
        </header>
        <div className="grid flex-1 place-items-center p-lg">
          <StaffPicker slug={slug} surface={surface} staff={staff ?? []} />
        </div>
      </div>
    );
  }

  // (3) Đã chọn nhân viên → shell
  const change = clearStaff.bind(null, slug, surface);
  const signOut = stationSignOut.bind(null, slug, surface);
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-hairline-soft bg-canvas px-lg py-md">
        <div className="flex items-baseline gap-sm">
          <span className="text-base font-medium text-ink">{label}</span>
          <span className="text-sm text-steel">· {session!.tenant.name}</span>
        </div>
        <div className="flex items-center gap-sm">
          <span className="rounded-full bg-cream px-md py-xxs text-sm font-medium text-ink">
            Nhân viên: {acting.display_name}
          </span>
          {current && (
            <form action={change}>
              <Button type="submit" variant="secondary" size="sm">
                Đổi nhân viên
              </Button>
            </form>
          )}
          <form action={signOut}>
            <Button type="submit" variant="link" size="sm">
              Đăng xuất thiết bị
            </Button>
          </form>
        </div>
      </header>
      {children ? (
        <main className="min-h-0 flex-1">{children}</main>
      ) : (
        <main className="flex-1 p-xl">
          <h1 className="text-2xl font-medium text-ink">
            {label} — {session!.tenant.name}
          </h1>
          <p className="mt-sm text-sm text-slate">
            Nhân viên đang thao tác: <span className="text-ink">{acting.display_name}</span>.
            Khung P1 — thao tác gọi món / vé bếp mở ở các plan sau; mọi thao tác sẽ gắn staff_id
            của nhân viên này.
          </p>
        </main>
      )}
    </div>
  );
}
