"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { parseSettings, serializeSettings } from "@/lib/tenant/settings";
import { SAMPLE_MENU } from "@/lib/onboarding/sample-menu";

async function requireOnboardingManager(slug: string) {
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "onboarding")) {
    redirect(`/r/${slug}/admin?error=${encodeURIComponent("Không đủ quyền.")}`);
  }
  return session!;
}

function onboardingPath(slug: string) {
  return `/r/${slug}/admin/onboarding`;
}

export type OnboardingState = {
  hasMenu: boolean;
  hasTables: boolean;
  hasLogo: boolean;
  done: boolean;
  itemCount: number;
  tableCount: number;
};

/** Trạng thái để tô tiến trình wizard + ẩn/hiện CTA dashboard. */
export async function getOnboardingState(slug: string): Promise<OnboardingState> {
  const session = await getSessionMembership(slug);
  if (!session) return { hasMenu: false, hasTables: false, hasLogo: false, done: false, itemCount: 0, tableCount: 0 };
  const supabase = await createClient();

  const [{ count: catCount }, { count: itemCount }, { count: tableCount }, { data: tenant }] =
    await Promise.all([
      supabase
        .from("menu_categories")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", session.tenant.id),
      supabase
        .from("menu_items")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", session.tenant.id),
      supabase
        .from("tables")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", session.tenant.id),
      supabase.from("tenants").select("logo_url, settings").eq("id", session.tenant.id).maybeSingle(),
    ]);

  const settings = parseSettings(tenant?.settings);
  return {
    hasMenu: (catCount ?? 0) > 0,
    hasTables: (tableCount ?? 0) > 0,
    hasLogo: !!tenant?.logo_url,
    done: settings.onboarding_done,
    itemCount: itemCount ?? 0,
    tableCount: tableCount ?? 0,
  };
}

/** Seed menu mẫu — CHỈ khi tenant chưa có danh mục nào (idempotent an toàn). */
export async function seedSampleMenu(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireOnboardingManager(slug);
  const back = `${onboardingPath(slug)}?step=2`;
  const supabase = await createClient();

  const { count } = await supabase
    .from("menu_categories")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", session.tenant.id);

  if ((count ?? 0) > 0) {
    redirect(`${back}&ok=${encodeURIComponent("Đã có danh mục — bỏ qua seed để tránh trùng.")}`);
  }

  let catSort = 0;
  for (const cat of SAMPLE_MENU) {
    const { data: category, error: catErr } = await supabase
      .from("menu_categories")
      .insert({ tenant_id: session.tenant.id, name: cat.name, sort_order: catSort++ })
      .select("id")
      .single();
    if (catErr || !category) {
      redirect(`${back}&error=${encodeURIComponent(catErr?.message ?? "Seed lỗi.")}`);
    }
    const rows = cat.items.map((it, i) => ({
      tenant_id: session.tenant.id,
      category_id: category!.id,
      name: it.name,
      description: it.description,
      base_price: it.base_price,
      sort_order: i,
    }));
    const { error: itemErr } = await supabase.from("menu_items").insert(rows);
    if (itemErr) redirect(`${back}&error=${encodeURIComponent(itemErr.message)}`);
  }

  revalidatePath(onboardingPath(slug));
  redirect(`${back}&ok=${encodeURIComponent("Đã thêm menu mẫu")}`);
}

/** Tạo nhanh N bàn (B1..BN) chưa xếp khu, cho bước Bàn của wizard. */
export async function seedTables(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireOnboardingManager(slug);
  const back = `${onboardingPath(slug)}?step=3`;
  const count = Math.min(50, Math.max(1, parseInt(String(formData.get("count") ?? "5"), 10) || 5));
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("tables")
    .select("sort_order")
    .eq("tenant_id", session.tenant.id)
    .is("area_id", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let sort = (last?.sort_order ?? -1) + 1;

  const { count: existing } = await supabase
    .from("tables")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", session.tenant.id);
  const startIdx = (existing ?? 0) + 1;

  const rows = Array.from({ length: count }, (_, i) => ({
    tenant_id: session.tenant.id,
    area_id: null,
    name: `B${startIdx + i}`,
    seats: 4,
    sort_order: sort++,
  }));
  const { error } = await supabase.from("tables").insert(rows);
  if (error) redirect(`${back}&error=${encodeURIComponent(error.message)}`);

  revalidatePath(onboardingPath(slug));
  redirect(`${back}&ok=${encodeURIComponent(`Đã tạo ${count} bàn`)}`);
}

/** Ghi settings.onboarding_done = true rồi về dashboard. */
export async function markOnboardingDone(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireOnboardingManager(slug);
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", session.tenant.id)
    .maybeSingle();
  const next = serializeSettings({ ...parseSettings(tenant?.settings), onboarding_done: true });

  const { error } = await supabase
    .from("tenants")
    .update({ settings: next, updated_at: new Date().toISOString() })
    .eq("id", session.tenant.id);
  if (error) {
    redirect(`${onboardingPath(slug)}?step=4&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/r/${slug}/admin`, "layout");
  redirect(`/r/${slug}/admin?ok=${encodeURIComponent("Hoàn tất thiết lập nhà hàng!")}`);
}
