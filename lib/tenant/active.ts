import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Nhà hàng đang hoạt động" định nghĩa ở ĐÚNG MỘT CHỖ (TENANT-06, QD-012 §2).
 *
 * Cổng `auth_tenant_ids()` (migration 0039) khóa mọi phiên CÓ đăng nhập — đó là POS, KDS, admin.
 * Nhưng bề mặt khách (menu QR, đặt bàn, đơn online) và các route handler chạy bằng service-role,
 * nên RLS không chạm tới chúng. Mọi lối tra tenant theo slug đi qua đây thì quán bị ngưng rơi vào
 * đúng nhánh "không tìm thấy nhà hàng" mà các lối gọi vốn đã xử lý — không phải viết thêm đường
 * xử lý lỗi nào.
 */
export async function activeTenantBySlug<T = Record<string, unknown>>(
  columns: string,
  slug: string
): Promise<T | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tenants")
    .select(columns)
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  return (data as T | null) ?? null;
}

/** Quán có đang hoạt động không — dùng cho chốt chặn ở layout tenant. */
export async function isTenantActive(slug: string): Promise<boolean> {
  return (await activeTenantBySlug<{ id: string }>("id", slug)) !== null;
}
