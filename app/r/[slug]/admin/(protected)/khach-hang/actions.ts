"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";

export type KetQuaGhiChu = { ok?: string; error?: string };

/** Ghi chú khách ("dị ứng tôm", "khách quen") — theo chi nhánh, chủ / quản lý (RLS customer_notes, 0069). Trống = xóa. */
export async function luuGhiChu(_p: KetQuaGhiChu, fd: FormData): Promise<KetQuaGhiChu> {
  const slug = String(fd.get("slug") ?? "");
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "customers")) return { error: "Không đủ quyền." };
  const phone = String(fd.get("phone") ?? "");
  if (!/^0\d{8,10}$/.test(phone)) return { error: "Số điện thoại không hợp lệ." };
  const note = String(fd.get("note") ?? "").trim().slice(0, 500);
  const supabase = await createClient();
  const { error } = note
    ? await supabase.from("customer_notes").upsert({
        tenant_id: session.tenant.id,
        phone,
        note,
        updated_by: session.membershipId,
        updated_at: new Date().toISOString(),
      })
    : await supabase.from("customer_notes").delete().eq("tenant_id", session.tenant.id).eq("phone", phone);
  if (error) return { error: error.message };
  revalidatePath(`/r/${slug}/admin/khach-hang`, "layout");
  return { ok: note ? "Đã lưu ghi chú." : "Đã xóa ghi chú." };
}
