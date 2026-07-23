import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "manager" | "cashier" | "waiter" | "kitchen" | "station";

export type TenantInfo = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
};

export type SessionMembership = {
  userId: string;
  tenant: TenantInfo;
  role: Role;
  membershipId: string;
  displayName: string | null;
};

/**
 * Đọc user Supabase hiện tại + membership của họ trong tenant theo `slug`.
 * Trả `null` nếu chưa đăng nhập, tenant không tồn tại, hoặc user KHÔNG có
 * membership trong tenant này (dùng để guard admin layout — chặn chéo tenant).
 *
 * Chạy dưới phiên RLS của user: nếu user không thuộc tenant, RLS đã lọc bản ghi.
 */
export async function getSessionMembership(
  slug: string
): Promise<SessionMembership | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Tra tenant theo slug (RLS: chỉ thấy tenant mình là thành viên).
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name, logo_url")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return null;

  // Membership của chính user này trong tenant đó.
  const { data: membership } = await supabase
    .from("memberships")
    .select("id, role, display_name")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (!membership) return null;

  return {
    userId: user.id,
    tenant: tenant as TenantInfo,
    role: membership.role as Role,
    membershipId: membership.id as string,
    displayName: (membership.display_name as string | null) ?? null,
  };
}

/** Kiểm tra user hiện tại có phải super-admin (đọc bảng super_admins qua RLS self-read). */
export async function isSuperAdmin(): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("super_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return data ? { userId: user.id } : null;
}
