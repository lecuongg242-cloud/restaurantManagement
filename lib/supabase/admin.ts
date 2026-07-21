import { createClient } from "@supabase/supabase-js";

/**
 * Admin client — SERVICE ROLE. Bỏ qua RLS. CHỈ dùng trong context server tin cậy
 * (server action/route handler super-admin, seed). KHÔNG bao giờ import ở client component.
 *
 * Dùng cho: tạo tenant + owner (admin.createUser), thao tác vượt RLS đã scope tenant thủ công.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY (chỉ server)."
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
