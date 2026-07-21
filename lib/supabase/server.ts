import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server client (Server Components / Route Handlers). Đọc/ghi session qua cookies.
 * Không dùng service_role ở đây — service_role chỉ dùng trong context server tin cậy riêng.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll gọi từ Server Component — bỏ qua, middleware sẽ refresh session.
          }
        },
      },
    }
  );
}
