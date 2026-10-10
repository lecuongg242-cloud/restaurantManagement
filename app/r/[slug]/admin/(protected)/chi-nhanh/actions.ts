"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { slugify } from "@/lib/utils";

export type KetQuaChiNhanh = { ok?: string; error?: string; slug?: string };

/**
 * Chủ chuỗi tự thêm chi nhánh (P15, như "Tạo chi nhánh" của KiotViet) — chỉ khi quán ĐÃ được super-admin đăng ký chuỗi
 * (0088; trước đó quán lẻ tự lập chuỗi được). RPC `create_my_branch` kiểm chủ quán + chủ chuỗi, một giao dịch. Chi nhánh mới
 * tính vào lần gia hạn sau.
 */
export async function createBranchAction(_p: KetQuaChiNhanh, fd: FormData): Promise<KetQuaChiNhanh> {
  const slug = String(fd.get("slug_quan") ?? "");
  const session = await getSessionMembership(slug);
  if (!session || session.role !== "owner") return { error: "Chỉ chủ quán được tạo chi nhánh." };
  const name = String(fd.get("name") ?? "").trim();
  const moi = slugify(String(fd.get("slug") ?? "").trim() || name);
  if (!name) return { error: "Thiếu tên chi nhánh." };
  if (!moi) return { error: "Mã chi nhánh không hợp lệ." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_my_branch", { p_from_tenant: session.tenant.id, p_name: name, p_slug: moi });
  if (error) {
    const m = error.message;
    return {
      error: /duplicate key|23505|already exists/i.test(m)
        ? `Mã “${moi}” đã có quán dùng — chọn mã khác.`
        : /chua dang ky chuoi/.test(m)
          ? "Quán chưa được đăng ký chuỗi. Liên hệ TechMenu để mở chuỗi nhiều chi nhánh."
          : /42501|chi chu/.test(`${error.code} ${m}`)
          ? "Chỉ chủ quán / chủ chuỗi được tạo chi nhánh."
          : m,
    };
  }
  revalidatePath(`/r/${slug}/admin`, "layout");
  return { ok: `Đã tạo chi nhánh “${name}”.`, slug: moi };
}
