import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole, type Section } from "@/lib/auth/rbac";
import { stationSignOut } from "@/app/r/[slug]/station-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SubscriptionBannerSlot } from "@/components/tenant/SubscriptionBanner";
import { BranchSwitcher } from "@/components/brand/BranchSwitcher";
import { boChonChiNhanh } from "@/lib/brand/branches";

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
  fill = false,
  children,
}: {
  slug: string;
  surface: "pos" | "kds";
  /**
   * `true` cho các BẢNG chiếm trọn màn (PosBoard, KdsBoard): khóa khung ở đúng một màn hình để
   * các cột bên trong tự cuộn.
   *
   * Vì sao cần: `min-h-screen` KHÔNG phải chiều cao xác định, nên `h-full` của bảng con rơi về
   * `auto` → mọi `overflow-y-auto` bên trong thành vô hiệu và cả TÀI LIỆU dài ra theo cột dài
   * nhất (thực đơn 200 món hay lịch sử 400 đơn là trang cao vài chục nghìn px, toolbar và tiêu đề
   * danh mục dính trôi mất). `h-dvh` (không phải `h-screen`) để thanh URL trên máy tính bảng thu
   * vào không cắt mất đáy.
   *
   * Để `false` cho trang đọc thường (/pos/online, /pos/reservations) — chúng cần cuộn tài liệu.
   */
  fill?: boolean;
  children?: React.ReactNode;
}) {
  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/${surface}/login`);
  if (!canAccess(session.role, surface as Section)) {
    redirect(defaultRouteForRole(slug, session.role));
  }

  const chiNhanh = await boChonChiNhanh(session.tenant.id);
  const label = surface === "pos" ? "Trạm POS" : "Màn hình bếp (KDS)";
  const staffName = session.displayName ?? ROLE_LABEL[session.role] ?? session.role;
  const signOut = stationSignOut.bind(null, slug, surface);

  return (
    <div
      className={cn(
        "flex flex-col bg-surface",
        fill ? "h-dvh overflow-hidden" : "min-h-screen"
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-sm border-b border-hairline-soft bg-canvas px-lg py-md max-sm:px-md max-sm:py-sm">
        {/* shrink-0 + nowrap: 360px trở xuống, cụm này bị co rồi rớt dòng "Trạm / POS" — để tên nhân viên
            bên phải tự cắt (truncate) thay. */}
        <div className="flex shrink-0 items-baseline gap-sm whitespace-nowrap">
          {/* Có bộ chọn chi nhánh thì màn hẹp nhường chỗ cho nó — tên chi nhánh quan trọng hơn chữ "Trạm POS". */}
          <span className={cn("text-base font-medium text-ink", chiNhanh && "max-sm:hidden")}>{label}</span>
          {chiNhanh ? (
            <BranchSwitcher slug={slug} branches={chiNhanh.branches} brandSlug={chiNhanh.brandSlug} pos className="whitespace-normal" />
          ) : (
            <span className="text-sm text-steel max-sm:hidden">· {session.tenant.name}</span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-sm">
          <span className="truncate rounded-full bg-cream px-md py-xxs text-sm font-medium text-ink">
            <span className="max-sm:hidden">Nhân viên: </span>
            {staffName}
          </span>
          <form action={signOut}>
            <Button type="submit" variant="link" size="sm">
              Đăng xuất
            </Button>
          </form>
        </div>
      </header>
      {surface === "pos" && (
        <SubscriptionBannerSlot slug={slug} tenantId={session.tenant.id} role={session.role} />
      )}
      {children ? (
        <main className={cn("min-h-0 flex-1", fill && "overflow-hidden")}>{children}</main>
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
