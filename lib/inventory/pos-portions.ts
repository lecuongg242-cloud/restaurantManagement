import "server-only";
import { createClient } from "@/lib/supabase/server";
import { timed } from "@/lib/observability/log";

/**
 * Số phần dự đoán cho POS (INV-06/07). Khóa là id món HOẶC id tùy chọn (đều là uuid, không trùng).
 *
 * ĐI ĐƯỜNG RIÊNG, không nằm trong `getCustomerMenu`: đó là cache thực đơn dùng chung với trang
 * khách (PERF-02) — số phần vào đó sẽ vừa cũ vừa lộ ra `/menu` (QD-017 C4).
 * Lỗi → trả rỗng: POS thiếu nhãn còn hơn POS không mở được.
 */
export async function getMenuPortions(tenantId: string, slug: string): Promise<Record<string, number>> {
  return timed("menuPortions", slug, async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("menu_portions", { p_tenant: tenantId });
    if (error || !data) return {};
    const out: Record<string, number> = {};
    for (const r of data as { menu_item_id: string | null; modifier_option_id: string | null; portions: number }[]) {
      const key = r.menu_item_id ?? r.modifier_option_id;
      if (key) out[key] = r.portions;
    }
    return out;
  });
}
