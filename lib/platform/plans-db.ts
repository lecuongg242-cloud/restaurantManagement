import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sapXepGoi, type Plan } from "./plans";

/** Mọi gói (0061), đã sắp xếp. Service role — chỉ gọi ở server; trang Gia hạn tự lọc `visible`. Lỗi → []. */
export async function docGoi(): Promise<Plan[]> {
  try {
    const { data, error } = await createAdminClient()
      .from("platform_plans")
      .select("id, name, months, price, visible");
    if (error) return [];
    return sapXepGoi((data ?? []) as Plan[]);
  } catch {
    return [];
  }
}
