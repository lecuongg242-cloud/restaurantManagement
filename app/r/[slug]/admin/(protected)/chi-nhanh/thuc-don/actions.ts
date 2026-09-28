"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { chuoiCuaQuan } from "@/lib/brand/context";
import { revalidateMenu } from "@/lib/menu/cache";

export type KetQuaDongBo = { ok?: string; error?: string };

/**
 * Đồng bộ thực đơn chi nhánh gốc → các chi nhánh chọn (P15 15-03). Mỗi chi nhánh một lần gọi RPC = một giao dịch:
 * chi nhánh 2 lỗi thì chi nhánh 1 đã xong vẫn giữ, chi nhánh 2 không nửa chừng. Chỉ chủ thương hiệu (RPC kiểm
 * lại). Xóa cache thực đơn từng chi nhánh để khách thấy món mới ngay lần tải sau.
 *
 * `pair` = "kind:branchId:rootId" — cặp nối lần đầu người dùng đã tích.
 */
/** Chủ chuỗi đang mở admin của một chi nhánh (`slug`) — null nếu không phải. */
async function chuChuoi(slug: string) {
  const session = await getSessionMembership(slug);
  if (!session || session.role !== "owner") return null;
  const chuoi = await chuoiCuaQuan(session.tenant.id, session.userId);
  return chuoi?.laChuChuoi ? chuoi : null;
}

export async function syncMenuAction(_p: KetQuaDongBo, fd: FormData): Promise<KetQuaDongBo> {
  const slug = String(fd.get("slug") ?? "");
  if (!(await chuChuoi(slug))) return { error: "Chỉ chủ chuỗi được đồng bộ thực đơn." };

  const targets = fd.getAll("target").map(String);
  const pairs = fd.getAll("pair").map(String);
  const supabase = await createClient();
  const ok: string[] = [];
  const loi: string[] = [];
  for (const t of targets) {
    const cua = pairs
      .map((p) => p.split(":"))
      .filter(([, b]) => b)
      .filter(([, , , tenant]) => !tenant || tenant === t)
      .map(([kind, branch_id, root_id]) => ({ kind, branch_id, root_id }));
    const { data, error } = await supabase.rpc("sync_menu_from_root", { p_target: t, p_pairs: cua });
    revalidateMenu(t);
    if (error) loi.push(error.message);
    else {
      const r = data as { them: number; sua: number; an: number };
      ok.push(`+${r.them} · sửa ${r.sua} · ẩn ${r.an}`);
    }
  }
  revalidatePath(`/r/${slug}/admin/chi-nhanh/thuc-don`);
  if (loi.length) return { error: `${ok.length} chi nhánh xong, ${loi.length} lỗi: ${loi.join("; ")}` };
  return { ok: `Đã đồng bộ ${ok.length} chi nhánh (${ok.join(" | ")}).` };
}

export async function setRootAction(_p: KetQuaDongBo, fd: FormData): Promise<KetQuaDongBo> {
  const slug = String(fd.get("slug") ?? "");
  const chuoi = await chuChuoi(slug);
  if (!chuoi) return { error: "Chỉ chủ chuỗi được đổi chi nhánh gốc." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_brand_root", { p_brand: chuoi.brand.id, p_tenant: String(fd.get("tenant_id") ?? "") });
  if (error) return { error: error.message };
  revalidatePath(`/r/${slug}/admin/chi-nhanh/thuc-don`);
  return { ok: "Đã đổi chi nhánh gốc." };
}
