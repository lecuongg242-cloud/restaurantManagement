import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { homNayHanDung, subscriptionState, type SubscriptionState } from "@/lib/tenant/subscription";

/**
 * Dữ liệu dùng chung của các trang super-admin: mọi quán + owner + trạng thái hạn dùng. Đọc bằng service
 * role — chỉ gọi SAU khi đã kiểm isSuperAdmin() (layout /super làm việc đó).
 */
export type QuanSuper = {
  id: string;
  slug: string;
  name: string;
  status: string;
  paid_until: string | null;
  created_at: string;
  owner: string | null;
  han: SubscriptionState;
  /** Lý do quán đang khóa, để bảng cầu in không báo nhầm "cầu in chết". */
  khoa: "tạm ngưng" | "hết hạn" | null;
};

export async function docQuan(): Promise<{ quan: QuanSuper[]; today: string }> {
  const admin = createAdminClient();
  const [{ data: tenants }, { data: owners }] = await Promise.all([
    admin.from("tenants").select("id, slug, name, status, paid_until, created_at").order("created_at", { ascending: false }),
    admin.from("memberships").select("tenant_id, display_name").eq("role", "owner").eq("active", true),
  ]);
  const ownerByTenant = new Map((owners ?? []).map((o) => [o.tenant_id as string, o.display_name as string | null]));
  const today = homNayHanDung();
  const quan = (tenants ?? []).map((t) => {
    const han = subscriptionState(t.paid_until as string | null, today);
    return {
      id: t.id as string,
      slug: t.slug as string,
      name: t.name as string,
      status: t.status as string,
      paid_until: (t.paid_until as string | null) ?? null,
      created_at: t.created_at as string,
      owner: ownerByTenant.get(t.id as string) ?? null,
      han,
      khoa: t.status === "suspended" ? "tạm ngưng" : han === "locked" ? "hết hạn" : null,
    } satisfies QuanSuper;
  });
  return { quan, today };
}

/** Quán cần nhắc thu tiền: sắp hết hạn, đang ân hạn, đã khóa vì hết hạn. */
export function canThuTien(q: QuanSuper): boolean {
  return q.status === "active" && (q.han === "due_soon" || q.han === "grace" || q.han === "locked");
}
