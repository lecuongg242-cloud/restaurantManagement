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
    // Cột tính `usable` (0057) = đang active VÀ còn hạn dùng (kể cả ân hạn) — cùng hàm SQL với
    // auth_tenant_ids(), không chép điều kiện sang đây.
    .eq("usable", true)
    .maybeSingle();
  return (data as T | null) ?? null;
}

/** Đủ hình dạng để chốt chặn tra `tenants` — cho phép test tiêm client giả lập lỗi hạ tầng. */
type TenantReader = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { status: string; usable?: boolean | null } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

/**
 * Quán có đang hoạt động không — chốt chặn ở `app/r/[slug]/layout.tsx`.
 *
 * Quy tắc: **chỉ chặn khi có bằng chứng dương rằng quán đã ngưng.** Hàm này chạy trên MỌI request
 * vào `/r/*` nên nó là điểm hỏng đơn lẻ của cả 4 bề mặt; nuốt lỗi rồi trả `false` nghĩa là một cú
 * nấc mạng của Supabase sẽ dựng biển "Nhà hàng đang tạm ngưng" trước mặt khách đang đứng ở quán —
 * một thông báo sai, rất tự tin, giữa giờ phục vụ.
 *
 * Nên:
 *  - lỗi hạ tầng → cho qua. Nhân viên của quán đã ngưng vẫn bị `auth_tenant_ids()` (0039) chặn ở
 *    tầng DB, còn khách chỉ xem được menu. Để lọt vài giây rẻ hơn nhiều so với chặn nhầm tất cả.
 *  - slug không tồn tại → cho qua, để trang con trả 404 đúng nghĩa thay vì "tạm ngưng" sai nghĩa.
 */
export async function isTenantActive(slug: string, client?: TenantReader): Promise<boolean> {
  return (await tenantGate(slug, client)) === "ok";
}

/**
 * Như `isTenantActive` nhưng nói rõ VÌ SAO chặn — màn "Hết hạn sử dụng" (có lối gia hạn cho chủ quán)
 * khác màn "Tạm ngưng" (không có lối nào). `expired` = còn `active` nhưng quá `paid_until` + ân hạn.
 */
export async function tenantGate(
  slug: string,
  client?: TenantReader
): Promise<"ok" | "suspended" | "expired"> {
  const reader = client ?? (createAdminClient() as unknown as TenantReader);
  const { data, error } = await reader
    .from("tenants")
    .select("status, usable")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return "ok";
  if (!data) return "ok";
  if (data.status !== "active") return "suspended";
  // `usable` null/thiếu (DB chưa có 0057) ⇒ không có bằng chứng dương ⇒ cho qua.
  return data.usable === false ? "expired" : "ok";
}
