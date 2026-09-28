import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listMyBranches, type ChiNhanh } from "./branches";

export type ChuoiCuaQuan = {
  brand: { id: string; slug: string; name: string; root_tenant_id: string | null };
  /** Người đang xem là CHỦ chuỗi (tạo chi nhánh, đồng bộ thực đơn, gia hạn cả chuỗi). */
  laChuChuoi: boolean;
  /** Chi nhánh người đang xem vào được (RLS). */
  branches: ChiNhanh[];
};

/**
 * Chuỗi của quán đang mở trong admin (P15 — quản lý chi nhánh nằm NGAY trong admin quán, như KiotViet/CUKCUK). `null`
 * = quán lẻ, hoặc người xem không phải thành viên chuỗi (quản lý riêng của một chi nhánh). Đọc qua phiên RLS.
 */
export async function chuoiCuaQuan(tenantId: string, userId: string): Promise<ChuoiCuaQuan | null> {
  const supabase = await createClient();
  const { data: t } = await supabase.from("tenants").select("brand_id").eq("id", tenantId).maybeSingle();
  const brandId = (t?.brand_id as string | null) ?? null;
  if (!brandId) return null;
  const [{ data: brand }, { data: m }, branches] = await Promise.all([
    supabase.from("brands").select("id, slug, name, root_tenant_id").eq("id", brandId).maybeSingle(),
    supabase.from("brand_members").select("role").eq("brand_id", brandId).eq("user_id", userId).maybeSingle(),
    listMyBranches(brandId),
  ]);
  if (!brand || !m) return null;
  return { brand: brand as ChuoiCuaQuan["brand"], laChuChuoi: m.role === "owner", branches };
}
