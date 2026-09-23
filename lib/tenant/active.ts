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

/** Đủ hình dạng để chốt chặn tra `tenants` — cho phép test tiêm client giả lập lỗi hạ tầng. */
type TenantReader = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { status: string } | null;
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
  const reader = client ?? (createAdminClient() as unknown as TenantReader);
  const { data, error } = await reader
    .from("tenants")
    .select("status")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return true;
  if (!data) return true;
  return data.status === "active";
}
