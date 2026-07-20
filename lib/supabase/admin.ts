import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — CHỈ dành cho tác vụ hệ thống server-side có kiểm soát
 * (quy định P1: không dùng để lách RLS trong luồng nghiệp vụ tenant).
 *
 * Nơi được phép dùng:
 * - Tạo tài khoản từ lời mời hợp lệ (app/invite/[token]/actions.ts) — token đã
 *   xác thực người dùng nên không cần email xác nhận, tránh rate limit SMTP.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
