import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/auth/session";
import { daysLeft, homNayHanDung, ngayVnHienThi, subscriptionState } from "@/lib/tenant/subscription";
import { cn } from "@/lib/utils";

/**
 * Ô "Gói dịch vụ" ở chân sidebar admin — kiểu Shopify/Notion: tình trạng gói luôn thấy nhưng gọn, thanh
 * toán không chiếm một mục trong menu vận hành. CHỈ owner (người trả tiền). Sắp hết hạn thì banner đầu
 * trang (SubscriptionBanner) mới là chỗ nổi bật.
 */
export async function GoiDichVuThe({ slug, tenantId, role }: { slug: string; tenantId: string; role: Role }) {
  if (role !== "owner") return null;
  const supabase = await createClient();
  const { data } = await supabase.from("tenants").select("paid_until").eq("id", tenantId).maybeSingle();
  const paidUntil = (data?.paid_until as string | null) ?? null;
  const today = homNayHanDung();
  const state = subscriptionState(paidUntil, today);
  const canh = state === "due_soon" || state === "grace" || state === "locked";

  return (
    <div
      data-goi-dich-vu={state}
      className={cn(
        "mx-sm mb-sm rounded-md border px-md py-sm text-xs",
        canh ? "border-status-late/40 bg-status-late/5" : "border-hairline-soft bg-surface"
      )}
    >
      <p className="font-medium text-ink">Gói dịch vụ</p>
      {paidUntil ? (
        <>
          <p className={cn("mt-[2px]", canh ? "font-medium text-status-late" : "text-slate")}>
            {state === "grace" || state === "locked"
              ? `Quá hạn ${-daysLeft(paidUntil, today)} ngày`
              : `Còn ${daysLeft(paidUntil, today)} ngày`}
            {" · "}hết hạn {ngayVnHienThi(paidUntil)}
          </p>
          <Link
            href={`/r/${slug}/admin/gia-han`}
            className="mt-xxs inline-block font-medium text-primary underline-offset-4 hover:underline"
          >
            Gia hạn →
          </Link>
        </>
      ) : (
        <p className="mt-[2px] text-slate">Không giới hạn</p>
      )}
    </div>
  );
}
