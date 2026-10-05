import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { KhoHangHeader } from "@/components/admin/inventory/KhoHangHeader";
import { KhoSoStatus } from "@/components/admin/inventory/KhoSoStatus";
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

  // Tự chốt các ngày đã quá 7 ngày (INV-09, P34 INV-22). Lỗi không được chặn trang: lượt tải sau thử lại.
  try {
    await ensureClosedThrough(await createClient(), session.tenant.id, businessDate());
  } catch (e) {
    console.error(JSON.stringify({ op: "ensureClosedThrough", error: String(e) }));
  }

  return (
    <div className="w-full">
      <KhoHangHeader adminBase={`/r/${slug}/admin`} />
      <KhoSoStatus tenantId={session.tenant.id} adminBase={`/r/${slug}/admin`} />
      <div className="mt-lg">{children}</div>
    </div>
  );
}
