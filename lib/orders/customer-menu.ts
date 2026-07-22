/**
 * Đọc menu cho KHÁCH ẨN DANH (D15). Khách không có phiên → RLS chặn, nên đọc bằng
 * SERVICE ROLE nhưng scope thủ công theo slug và CHỈ trả cột công khai (không rò
 * dữ liệu tenant khác). Chỉ dùng ở server component / route handler.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type CustomerModifierOption = {
  id: string;
  name: string;
  price_delta: number;
  is_available: boolean;
};

export type CustomerModifierGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  required: boolean;
  options: CustomerModifierOption[];
};

export type CustomerMenuItem = {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  is_available: boolean;
  groups: CustomerModifierGroup[];
};

export type CustomerMenuCategory = {
  id: string;
  name: string;
  items: CustomerMenuItem[];
};

export type CustomerMenu = {
  tenant: { id: string; name: string; logo_url: string | null };
  categories: CustomerMenuCategory[];
};

export type ResolvedTable = {
  tenant_id: string;
  table: { id: string; name: string; status: string };
};

/** Lấy tenant công khai theo slug (id + tên + logo). null nếu không có. */
async function getPublicTenant(slug: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tenants")
    .select("id, name, logo_url")
    .eq("slug", slug)
    .maybeSingle();
  return data as { id: string; name: string; logo_url: string | null } | null;
}

/**
 * Menu đầy đủ để khách gọi món: danh mục active + món active (kể cả is_available=false
 * để hiện nhãn "Hết") + nhóm tùy chọn gắn theo món. Chỉ cột công khai.
 */
export async function getCustomerMenu(slug: string): Promise<CustomerMenu | null> {
  const tenant = await getPublicTenant(slug);
  if (!tenant) return null;

  const admin = createAdminClient();
  const tid = tenant.id;

  const [{ data: cats }, { data: items }, { data: links }, { data: groups }, { data: options }] =
    await Promise.all([
      admin
        .from("menu_categories")
        .select("id, name")
        .eq("tenant_id", tid)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      admin
        .from("menu_items")
        .select("id, category_id, name, description, base_price, image_url, is_available, sort_order")
        .eq("tenant_id", tid)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      admin
        .from("menu_item_modifier_groups")
        .select("item_id, group_id, sort_order")
        .eq("tenant_id", tid),
      admin
        .from("modifier_groups")
        .select("id, name, min_select, max_select, required, sort_order")
        .eq("tenant_id", tid)
        .order("sort_order", { ascending: true }),
      admin
        .from("modifier_options")
        .select("id, group_id, name, price_delta, is_available, sort_order")
        .eq("tenant_id", tid)
        .order("sort_order", { ascending: true }),
    ]);

  // Gom option theo group.
  const optionsByGroup = new Map<string, CustomerModifierOption[]>();
  for (const o of options ?? []) {
    const arr = optionsByGroup.get(o.group_id) ?? [];
    arr.push({
      id: o.id,
      name: o.name,
      price_delta: o.price_delta,
      is_available: o.is_available,
    });
    optionsByGroup.set(o.group_id, arr);
  }

  // Group đầy đủ (kèm option).
  const groupById = new Map<string, CustomerModifierGroup>();
  for (const g of groups ?? []) {
    groupById.set(g.id, {
      id: g.id,
      name: g.name,
      min_select: g.min_select,
      max_select: g.max_select,
      required: g.required,
      options: optionsByGroup.get(g.id) ?? [],
    });
  }

  // Group gắn theo món (giữ thứ tự sort_order của link).
  const groupsByItem = new Map<string, CustomerModifierGroup[]>();
  const sortedLinks = [...(links ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  for (const l of sortedLinks) {
    const g = groupById.get(l.group_id);
    if (!g) continue;
    const arr = groupsByItem.get(l.item_id) ?? [];
    arr.push(g);
    groupsByItem.set(l.item_id, arr);
  }

  // Món theo danh mục.
  const itemsByCat = new Map<string, CustomerMenuItem[]>();
  for (const it of items ?? []) {
    const arr = itemsByCat.get(it.category_id) ?? [];
    arr.push({
      id: it.id,
      name: it.name,
      description: it.description,
      base_price: it.base_price,
      image_url: it.image_url,
      is_available: it.is_available,
      groups: groupsByItem.get(it.id) ?? [],
    });
    itemsByCat.set(it.category_id, arr);
  }

  const categories: CustomerMenuCategory[] = (cats ?? [])
    .map((c) => ({ id: c.id, name: c.name, items: itemsByCat.get(c.id) ?? [] }))
    .filter((c) => c.items.length > 0);

  return {
    tenant: { id: tenant.id, name: tenant.name, logo_url: tenant.logo_url },
    categories,
  };
}

/**
 * Giải mã qr_token → bàn thuộc tenant của slug. null nếu token sai hoặc không thuộc
 * tenant này (chống đoán token chéo tenant). Dùng cho header (tên bàn) + tạo order.
 */
export async function resolveTable(slug: string, qrToken: string): Promise<ResolvedTable | null> {
  if (!qrToken) return null;
  const tenant = await getPublicTenant(slug);
  if (!tenant) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("tables")
    .select("id, name, status")
    .eq("tenant_id", tenant.id)
    .eq("qr_token", qrToken)
    .maybeSingle();

  if (!data) return null;
  return { tenant_id: tenant.id, table: { id: data.id, name: data.name, status: data.status } };
}
