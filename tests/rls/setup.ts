import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Nạp biến môi trường (ưu tiên .env.local; CI đặt qua secrets).
config({ path: ".env.local" });
config(); // .env fallback (CI)

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  throw new Error(
    "Test RLS cần NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (KHÔNG dùng service role)."
  );
}

/** Tài khoản owner demo (seed.sql / npm run seed). Có thể override qua env cho CI. */
export const OWNER_A = {
  email: process.env.SEED_OWNER_A_EMAIL ?? "ownerA@pho-viet.test",
  password: process.env.SEED_OWNER_A_PASSWORD ?? "DemoPass123!",
  slug: "pho-viet",
};
export const OWNER_B = {
  email: process.env.SEED_OWNER_B_EMAIL ?? "ownerB@bun-bo.test",
  password: process.env.SEED_OWNER_B_PASSWORD ?? "DemoPass123!",
  slug: "bun-bo",
};

/**
 * Đăng nhập bằng ANON key (đúng như client thật) → trả client đã có phiên.
 * KHÔNG dùng service role (service role bỏ qua RLS → kết quả test sai).
 */
export async function signInAs(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      `Không đăng nhập được ${email}: ${error.message}. Đã chạy seed chưa? (npm run seed)`
    );
  }
  return client;
}

/** Lấy tenant_id đầu tiên mà phiên hiện tại là thành viên (qua RLS). */
export async function myTenantId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.from("memberships").select("tenant_id").limit(1);
  if (error) throw error;
  if (!data?.length) throw new Error("Owner không thấy membership nào của chính mình (RLS sai?).");
  return data[0].tenant_id as string;
}
