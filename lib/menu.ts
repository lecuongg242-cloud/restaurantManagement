import type { SupabaseClient } from "@supabase/supabase-js";

export type MenuOption = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  sort: number;
};

export type MenuOptionGroup = {
  id: string;
  item_id: string;
  name: string;
  selection: "single" | "multiple";
  is_required: boolean;
  sort: number;
  options: MenuOption[];
};

export type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  is_sold_out: boolean;
  sort: number;
  groups: MenuOptionGroup[];
};

export type MenuCategory = {
  id: string;
  name: string;
  sort: number;
  items: MenuItem[];
};

/**
 * Menu cho app khách (anon): RLS chỉ trả dữ liệu active.
 * Món hết (is_sold_out) vẫn được trả về — view khách tự ẩn, và nhờ đó
 * realtime báo được cả chiều "còn món trở lại" (MENU-02).
 */
export async function fetchCustomerMenu(
  supabase: SupabaseClient,
  tenantId: string
): Promise<MenuCategory[]> {
  const [{ data: cats }, { data: items }, { data: groups }, { data: options }] =
    await Promise.all([
      supabase
        .from("menu_categories")
        .select("id, name, sort")
        .eq("tenant_id", tenantId)
        .order("sort")
        .order("created_at"),
      supabase
        .from("menu_items")
        .select(
          "id, category_id, name, description, price, image_url, is_sold_out, sort"
        )
        .eq("tenant_id", tenantId)
        .order("sort")
        .order("created_at"),
      supabase
        .from("menu_option_groups")
        .select("id, item_id, name, selection, is_required, sort")
        .eq("tenant_id", tenantId)
        .order("sort"),
      supabase
        .from("menu_options")
        .select("id, group_id, name, price_delta, sort")
        .eq("tenant_id", tenantId)
        .order("sort"),
    ]);

  const groupsWithOptions: MenuOptionGroup[] = (groups ?? []).map((g) => ({
    ...g,
    options: (options ?? []).filter((o) => o.group_id === g.id),
  }));

  return (cats ?? []).map((c) => ({
    ...c,
    items: (items ?? [])
      .filter((i) => i.category_id === c.id)
      .map((i) => ({
        ...i,
        groups: groupsWithOptions.filter((g) => g.item_id === i.id),
      })),
  }));
}
