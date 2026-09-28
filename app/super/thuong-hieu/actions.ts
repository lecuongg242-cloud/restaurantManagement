"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/auth/session";
import { slugify } from "@/lib/utils";
import { findAuthUserByEmail } from "@/lib/tenant/provision-owner";
import type { SuperActionState } from "../actions";

/**
 * Thương hiệu / chi nhánh (P15 15-01, QD-023). Mọi thao tác gọi RPC 0062 bằng PHIÊN super-admin — RPC tự kiểm
 * quyền và làm trong một giao dịch (tạo chi nhánh + membership cho cả chuỗi).
 */
async function phien() {
  if (!(await isSuperAdmin())) redirect("/super/login");
  return createClient();
}

/** Lỗi RPC (không dấu, để khớp mọi locale DB) → câu tiếng Việt cho người dùng. */
function loiRpc(m: string): string {
  if (/duplicate key|23505|already exists/i.test(m)) return "Mã (slug) này đã có người dùng — chọn mã khác.";
  if (/slug khong hop le/.test(m)) return "Mã chỉ gồm chữ thường không dấu, số và dấu gạch ngang.";
  if (/da thuoc thuong hieu khac/.test(m)) return "Quán này đã thuộc thương hiệu khác.";
  if (/thieu ten/.test(m)) return "Thiếu tên chi nhánh.";
  return m;
}

function xong(ok: string): SuperActionState {
  revalidatePath("/super", "layout");
  return { ok };
}

export async function createBrandAction(_p: SuperActionState, fd: FormData): Promise<SuperActionState> {
  const supabase = await phien();
  const name = String(fd.get("name") ?? "").trim();
  const slug = slugify(String(fd.get("slug") ?? "").trim() || name);
  const tenantId = String(fd.get("tenant_id") ?? "").trim();
  if (!name) return { error: "Thiếu tên thương hiệu." };
  if (!slug) return { error: "Mã thương hiệu không hợp lệ." };

  const { data: brandId, error } = await supabase.rpc("create_brand", { p_name: name, p_slug: slug });
  if (error) return { error: loiRpc(error.message) };
  if (tenantId) {
    const { error: e2 } = await supabase.rpc("attach_tenant_to_brand", { p_tenant: tenantId, p_brand: brandId });
    if (e2) return { error: `Đã tạo thương hiệu nhưng chưa gắn được quán: ${loiRpc(e2.message)}` };
  }
  return xong(`Đã tạo thương hiệu “${name}”.`);
}

export async function attachTenantAction(_p: SuperActionState, fd: FormData): Promise<SuperActionState> {
  const supabase = await phien();
  const { error } = await supabase.rpc("attach_tenant_to_brand", {
    p_tenant: String(fd.get("tenant_id") ?? ""),
    p_brand: String(fd.get("brand_id") ?? ""),
  });
  if (error) return { error: loiRpc(error.message) };
  return xong("Đã gắn quán vào thương hiệu. Chủ quán đó thành chủ thương hiệu.");
}

export async function createBranchAction(_p: SuperActionState, fd: FormData): Promise<SuperActionState> {
  const supabase = await phien();
  const name = String(fd.get("name") ?? "").trim();
  const slug = slugify(String(fd.get("slug") ?? "").trim() || name);
  const nguon = String(fd.get("copy_from") ?? "").trim();
  if (!name) return { error: "Thiếu tên chi nhánh." };
  const { error } = await supabase.rpc("create_branch", {
    p_brand: String(fd.get("brand_id") ?? ""),
    p_name: name,
    p_slug: slug,
    p_copy_settings_from: nguon || null,
  });
  if (error) return { error: loiRpc(error.message) };
  return xong(`Đã tạo chi nhánh “${name}” (/r/${slug}). Chủ và quản lý thương hiệu vào được ngay.`);
}

/** Thêm người vào thương hiệu theo EMAIL của tài khoản đã có (chủ/quản lý của một quán). */
export async function addBrandMemberAction(_p: SuperActionState, fd: FormData): Promise<SuperActionState> {
  const supabase = await phien();
  const email = String(fd.get("email") ?? "").trim();
  const role = fd.get("role") === "manager" ? "manager" : "owner";
  if (!email) return { error: "Thiếu email." };
  const user = await findAuthUserByEmail(createAdminClient(), email);
  if (!user) return { error: "Không có tài khoản nào dùng email này. Tạo tài khoản ở một chi nhánh trước." };
  const { error } = await supabase.rpc("set_brand_member", {
    p_brand: String(fd.get("brand_id") ?? ""),
    p_user: user.id,
    p_role: role,
  });
  if (error) return { error: loiRpc(error.message) };
  return xong(`Đã thêm ${email} (${role === "owner" ? "chủ" : "quản lý"}) vào mọi chi nhánh.`);
}

export async function removeBrandMemberAction(_p: SuperActionState, fd: FormData): Promise<SuperActionState> {
  const supabase = await phien();
  const { error } = await supabase.rpc("remove_brand_member", {
    p_brand: String(fd.get("brand_id") ?? ""),
    p_user: String(fd.get("user_id") ?? ""),
  });
  if (error) return { error: loiRpc(error.message) };
  return xong("Đã bỏ khỏi thương hiệu và tắt quyền ở mọi chi nhánh.");
}

/**
 * Ghi nhận gia hạn CẢ chuỗi (P15 15-07): mọi chi nhánh đang hoạt động cùng một ngày hết hạn, một dòng nhật ký.
 * `months` rỗng / "vv" = vĩnh viễn. Số tiền điền sẵn = giá gói × số chi nhánh đang hoạt động (sửa được).
 */
export async function recordBrandRenewalAction(_p: SuperActionState, fd: FormData): Promise<SuperActionState> {
  const supabase = await phien();
  const goi = String(fd.get("months") ?? "");
  const months = goi === "vv" ? null : Number(goi);
  const amount = Number(String(fd.get("amount") ?? "").replace(/[^\d]/g, ""));
  if (months !== null && !(Number.isInteger(months) && months >= 1 && months <= 120)) return { error: "Thời hạn không hợp lệ." };
  if (!Number.isInteger(amount) || amount < 0) return { error: "Số tiền không hợp lệ." };
  const { data, error } = await supabase.rpc("record_brand_subscription_payment", {
    p_brand: String(fd.get("brand_id") ?? ""),
    p_months: months,
    p_amount: amount,
    p_note: String(fd.get("note") ?? "").trim().slice(0, 400) || null,
    p_start_limited: fd.get("start_limited") === "on",
  });
  if (error) {
    return {
      error: /KHONG GIOI HAN/.test(error.message)
        ? "Có chi nhánh đang KHÔNG GIỚI HẠN — tích “Chuyển cả chuỗi sang có hạn” nếu thật sự muốn."
        : loiRpc(error.message),
    };
  }
  const sau = (data as { paid_until_after?: string | null } | null)?.paid_until_after;
  return xong(sau ? `Đã gia hạn cả chuỗi tới ${sau.split("-").reverse().join("/")}.` : "Đã chuyển cả chuỗi sang vĩnh viễn.");
}

/** Gỡ một quán khỏi thương hiệu: bỏ quyền do chuỗi cấp, giữ quyền vốn có của chủ quán (0066). */
export async function detachTenantAction(_p: SuperActionState, fd: FormData): Promise<SuperActionState> {
  const supabase = await phien();
  const { error } = await supabase.rpc("detach_tenant_from_brand", { p_tenant: String(fd.get("tenant_id") ?? "") });
  if (error) return { error: loiRpc(error.message) };
  return xong("Đã gỡ quán khỏi thương hiệu — quán trở lại là quán lẻ.");
}

/** Xóa thương hiệu: gỡ mọi quán rồi xóa. Phải gõ đúng mã thương hiệu để xác nhận. Không xóa quán nào. */
export async function deleteBrandAction(_p: SuperActionState, fd: FormData): Promise<SuperActionState> {
  const supabase = await phien();
  const slug = String(fd.get("slug") ?? "");
  if (String(fd.get("confirm") ?? "").trim() !== slug) return { error: `Gõ đúng mã “${slug}” để xác nhận.` };
  const { error } = await supabase.rpc("delete_brand", { p_brand: String(fd.get("brand_id") ?? "") });
  if (error) return { error: loiRpc(error.message) };
  return xong(`Đã xóa thương hiệu “${slug}”. Các quán vẫn còn, trở lại là quán lẻ.`);
}
