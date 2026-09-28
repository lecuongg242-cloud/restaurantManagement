import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ChiNhanh = { tenantId: string; slug: string; name: string; status: string };

/**
 * Chi nhánh cùng thương hiệu mà người đang đăng nhập VÀO ĐƯỢC (P15 15-02, BRANCH-03). Đọc qua phiên RLS: bảng
 * `tenants` chỉ trả quán mình có membership ⇒ quản lý thuộc chi nhánh 1, 2 không thấy chi nhánh 3.
 */
export async function listMyBranches(brandId: string): Promise<ChiNhanh[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("tenants").select("id, slug, name, status").eq("brand_id", brandId).order("name");
  return (data ?? []).map((t) => ({ tenantId: t.id as string, slug: t.slug as string, name: t.name as string, status: t.status as string }));
}

/**
 * Dữ liệu cho bộ chọn chi nhánh ở header admin/POS. `null` = không hiện (quán lẻ, hoặc người dùng chỉ vào được
 * một chi nhánh — thu ngân, quản lý một chi nhánh). `brandSlug` chỉ có với thành viên thương hiệu (đọc được
 * `brands` qua RLS) → hiện thêm lối "Cả chuỗi".
 */
export async function boChonChiNhanh(
  tenantId: string
): Promise<{ branches: { slug: string; name: string }[]; brandSlug: string | null } | null> {
  const supabase = await createClient();
  const { data: t } = await supabase.from("tenants").select("brand_id").eq("id", tenantId).maybeSingle();
  const brandId = (t?.brand_id as string | null) ?? null;
  if (!brandId) return null;
  const [branches, { data: brand }] = await Promise.all([
    listMyBranches(brandId),
    supabase.from("brands").select("slug").eq("id", brandId).maybeSingle(),
  ]);
  if (branches.length < 2) return null;
  return { branches: branches.map((b) => ({ slug: b.slug, name: b.name })), brandSlug: (brand?.slug as string | null) ?? null };
}
