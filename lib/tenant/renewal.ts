import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Trang Gia hạn chạy cả khi quán ĐÃ BỊ KHÓA vì hết hạn (SUB-04) — lúc đó auth_tenant_ids() (0057) đã
 * loại quán, phiên thường không đọc được cả dòng `tenants`. Nên đọc bằng service-role, SAU KHI tự kiểm:
 * có phiên đăng nhập + là OWNER đang hoạt động của đúng quán này. Không mở policy RLS nào cho việc này.
 *
 * Quán `suspended` (super-admin khóa tay) KHÔNG có lối này — đó không phải việc chủ quán tự gỡ được.
 */
export type RenewalTenant = {
  id: string;
  slug: string;
  name: string;
  paid_until: string | null;
  /** Chi nhánh của chuỗi (P15) → gia hạn ở trang chuỗi, không gia hạn riêng (QD-023 D8). */
  brand: { id: string; slug: string; name: string } | null;
};

/**
 * Cột đọc cho trang Gia hạn. `brands!tenants_brand_id_fkey`: tenants ↔ brands có HAI khóa ngoại (tenants.brand_id và
 * brands.root_tenant_id, 0062) — nhúng `brands(...)` trơn bị PostgREST từ chối vì mơ hồ, trang Gia hạn chết theo
 * (tests/rls/renewal-query.test.ts chạy đúng chuỗi này trên DB thật).
 */
export const COT_QUAN_GIA_HAN = "id, slug, name, status, paid_until, brands!tenants_brand_id_fkey(id, slug, name)";

export async function ownerForRenewal(slug: string): Promise<{ userId: string; tenant: RenewalTenant } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select(COT_QUAN_GIA_HAN)
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant || tenant.status !== "active") return null;

  const { data: membership } = await admin
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .eq("active", true)
    .eq("role", "owner")
    .maybeSingle();
  if (!membership) return null;

  return {
    userId: user.id,
    tenant: {
      id: tenant.id as string,
      slug: tenant.slug as string,
      name: tenant.name as string,
      paid_until: (tenant.paid_until as string | null) ?? null,
      brand: (tenant.brands as unknown as { id: string; slug: string; name: string } | null) ?? null,
    },
  };
}

export type RenewalRow = {
  id: string;
  /** Gói vĩnh viễn (0059): không có số tháng, không có hạn mới. */
  lifetime: boolean;
  months: number | null;
  amount: number;
  paid_until_before: string | null;
  paid_until_after: string | null;
  recorded_at: string;
  note: string | null;
};

/** Lịch sử gia hạn của MỘT quán — chỉ gọi sau `ownerForRenewal` hoặc từ /super. */
export async function renewalHistory(tenantId: string, limit = 24): Promise<RenewalRow[]> {
  const { data } = await createAdminClient()
    .from("subscription_payments")
    .select("id, lifetime, months, amount, paid_until_before, paid_until_after, recorded_at, note")
    .eq("tenant_id", tenantId)
    .order("recorded_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as RenewalRow[];
}
