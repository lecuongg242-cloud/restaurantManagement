import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuSnapshot } from "./menu-sync";

/**
 * Bản chụp thực đơn một chi nhánh cho `planMenuSync` (15-03). Đọc bằng client truyền vào — phiên RLS của chủ
 * thương hiệu (có membership ở mọi chi nhánh) hoặc service role trong test.
 */
export async function docMenuSnapshot(client: SupabaseClient, tenantId: string): Promise<MenuSnapshot> {
  const [c, i, g, o, l] = await Promise.all([
    client.from("menu_categories").select("id, name, sort_order, active, source_id").eq("tenant_id", tenantId),
    client
      .from("menu_items")
      .select("id, category_id, name, description, base_price, image_url, sort_order, active, is_available, price_locked, source_id")
      .eq("tenant_id", tenantId),
    client.from("modifier_groups").select("id, name, min_select, max_select, required, sort_order, source_id").eq("tenant_id", tenantId),
    client.from("modifier_options").select("id, group_id, name, price_delta, sort_order, is_available, source_id").eq("tenant_id", tenantId),
    client.from("menu_item_modifier_groups").select("item_id, group_id, sort_order").eq("tenant_id", tenantId),
  ]);
  const loi = [c, i, g, o, l].find((r) => r.error)?.error;
  if (loi) throw new Error(loi.message);
  return {
    categories: (c.data ?? []) as MenuSnapshot["categories"],
    items: (i.data ?? []) as MenuSnapshot["items"],
    groups: (g.data ?? []) as MenuSnapshot["groups"],
    options: (o.data ?? []) as MenuSnapshot["options"],
    links: (l.data ?? []) as MenuSnapshot["links"],
  };
}
