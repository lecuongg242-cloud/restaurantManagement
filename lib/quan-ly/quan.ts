import "server-only";
import { createClient } from "@/lib/supabase/server";

export type QuanQuanLy = { slug: string; ten: string; vaiTro: "owner" | "manager"; brandId: string | null };
export type ChuoiQuanLy = { brandId: string; ten: string; quanDau: string; soChiNhanh: number };

/**
 * Các quán người đang đăng nhập được dùng app Quản lý (P30, MGR-01): membership owner/manager còn hoạt động — đúng ngưỡng
 * `canAccess(role, "admin")`. Đọc qua phiên RLS (quán hết hạn / tạm ngưng đã bị RLS giấu như ở admin).
 */
export async function quanCuaToi(): Promise<QuanQuanLy[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("memberships")
    .select("role, tenants(slug, name, brand_id)")
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["owner", "manager"]);
  return (data ?? [])
    .map((m) => {
      const t = m.tenants as unknown as { slug: string; name: string; brand_id: string | null } | null;
      return t ? { slug: t.slug, ten: t.name, vaiTro: m.role as "owner" | "manager", brandId: t.brand_id } : null;
    })
    .filter((x): x is QuanQuanLy => x !== null)
    .sort((a, b) => a.ten.localeCompare(b.ten, "vi"));
}

/** Chuỗi có ≥ 2 chi nhánh trong danh sách → dòng "Tất cả chi nhánh" ở màn Chọn quán (Giao diện B3). */
export async function chuoiCuaToi(quan: QuanQuanLy[]): Promise<ChuoiQuanLy[]> {
  const theoChuoi = new Map<string, QuanQuanLy[]>();
  for (const q of quan) if (q.brandId) theoChuoi.set(q.brandId, [...(theoChuoi.get(q.brandId) ?? []), q]);
  const nhieu = [...theoChuoi].filter(([, ds]) => ds.length >= 2);
  if (!nhieu.length) return [];
  const supabase = await createClient();
  const { data: brands } = await supabase.from("brands").select("id, name").in("id", nhieu.map(([id]) => id));
  const tenChuoi = new Map((brands ?? []).map((b) => [b.id as string, b.name as string]));
  return nhieu.map(([brandId, ds]) => ({ brandId, ten: tenChuoi.get(brandId) ?? "Chuỗi", quanDau: ds[0].slug, soChiNhanh: ds.length }));
}

/** Sau đăng nhập / mở app: một quán → vào thẳng; nhiều quán → màn chọn; không quán nào → null. */
export function dichSauDangNhap(quan: QuanQuanLy[]): string | null {
  if (!quan.length) return null;
  return quan.length === 1 ? `/r/${quan[0].slug}/quan-ly` : "/quan-ly/chon-quan";
}
