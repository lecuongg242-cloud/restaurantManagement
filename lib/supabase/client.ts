import { createBrowserClient } from "@supabase/ssr";

/** Browser client (Client Components). Dùng anon key public. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
