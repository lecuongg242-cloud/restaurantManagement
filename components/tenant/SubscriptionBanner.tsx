import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/auth/session";
import { homNayHanDung, subscriptionBanner, type SubscriptionBanner } from "@/lib/tenant/subscription";
import { cn } from "@/lib/utils";

/** Một dòng, không che nút nào: đặt TRONG luồng (shrink-0) phía trên nội dung, cắt chữ ở màn 360px. */
export function SubscriptionBannerView({
  banner,
  giaHanHref,
}: {
  banner: SubscriptionBanner;
  giaHanHref: string | null;
}) {
  return (
    <div
      role="status"
      data-subscription-banner={banner.tone}
      className={cn(
        "flex shrink-0 items-center gap-sm px-md py-xs text-sm",
        banner.tone === "warn" ? "bg-status-new text-status-new-fg" : "bg-status-late text-status-late-fg"
      )}
    >
      <span className="min-w-0 flex-1 truncate">{banner.text}</span>
      {giaHanHref && (
        <Link href={giaHanHref} className="shrink-0 font-medium underline underline-offset-4">
          Gia hạn
        </Link>
      )}
    </div>
  );
}

/** Đọc hạn dùng của quán rồi hiện banner nếu cần (SUB-02). Vai trò khác owner/manager: không truy vấn gì. */
export async function SubscriptionBannerSlot({
  slug,
  tenantId,
  role,
}: {
  slug: string;
  tenantId: string;
  role: Role;
}) {
  if (role !== "owner" && role !== "manager") return null;
  const supabase = await createClient();
  const { data } = await supabase.from("tenants").select("paid_until").eq("id", tenantId).maybeSingle();
  const banner = subscriptionBanner(role, (data?.paid_until as string | null) ?? null, homNayHanDung());
  if (!banner) return null;
  // Trang Gia hạn chỉ dành cho owner; manager thấy nhắc để báo chủ quán.
  return <SubscriptionBannerView banner={banner} giaHanHref={role === "owner" ? `/r/${slug}/admin/gia-han` : null} />;
}
