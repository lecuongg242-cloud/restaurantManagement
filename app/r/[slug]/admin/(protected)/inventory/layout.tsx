import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { InventoryTabs } from "@/components/admin/inventory/InventoryTabs";

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
