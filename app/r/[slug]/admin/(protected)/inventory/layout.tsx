import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { InventoryTabs } from "@/components/admin/inventory/InventoryTabs";
import { createClient } from "@/lib/supabase/server";
import { ensureClosedThrough } from "@/lib/inventory/close-server";
import { businessDate } from "@/lib/inventory/day";

/** Khu Nguyên liệu (P10, QD-017): owner + manager. Guard một chỗ cho mọi tab. */
export default async function InventoryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "inventory")) redirect(defaultRouteForRole(slug, session.role));

  // Tự chốt các ngày đã qua (INV-09). Lỗi không được chặn trang: lượt tải sau thử lại.
  try {
    await ensureClosedThrough(await createClient(), session.tenant.id, businessDate());
  } catch (e) {
    console.error(JSON.stringify({ op: "ensureClosedThrough", error: String(e) }));
  }

  return (
    <div className="w-full">
      <h1 className="font-display text-2xl text-ink">Nguyên liệu</h1>
      <p className="mt-xxs text-sm text-steel">
        Khai nguyên liệu và định lượng để biết giá vốn từng món. Món chưa khai thì mọi thứ chạy như cũ.
      </p>
      <InventoryTabs base={`/r/${slug}/admin/inventory`} />
      <div className="mt-lg">{children}</div>
    </div>
  );
}
