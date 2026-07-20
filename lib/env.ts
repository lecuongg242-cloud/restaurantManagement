/** Đã cấu hình Supabase chưa (chạy local lần đầu có thể chưa có .env.local). */
export function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
