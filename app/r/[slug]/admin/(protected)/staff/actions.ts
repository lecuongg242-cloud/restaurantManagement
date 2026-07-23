"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionMembership, type Role } from "@/lib/auth/session";
import { canManageStaff } from "@/lib/auth/rbac";
import { hashPin, isValidPin } from "@/lib/auth/pin";
import { createAdminClient } from "@/lib/supabase/admin";
import { derivePinPassword } from "@/lib/auth/staff-credentials";
import { setFlash } from "@/lib/flash";

const PIN_ROLES: Role[] = ["cashier", "waiter", "kitchen"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Guard chung: chỉ owner/manager của tenant theo slug được quản lý nhân viên. */
async function requireManager(slug: string) {
  const session = await getSessionMembership(slug);
  if (!session || !canManageStaff(session.role)) {
    redirect(`/r/${slug}/admin/staff?error=${encodeURIComponent("Không đủ quyền.")}`);
  }
  return session!;
}

function staffPath(slug: string) {
  return `/r/${slug}/admin/staff`;
}

/**
 * Tạo nhân viên (QD-009): cấp 1 tài khoản Supabase (email + mật khẩu suy dẫn từ PIN) rồi gắn
 * membership. Cập nhật tại chỗ (useActionState) — phản hồi inline, không đổi link.
 */
export async function createStaff(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireManager(slug);

  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as Role;
  const pin = String(formData.get("pin") ?? "");

  if (!displayName) return setFlash("error", "Thiếu tên nhân viên.");
  if (!EMAIL_RE.test(email)) return setFlash("error", "Email không hợp lệ.");
  if (!PIN_ROLES.includes(role)) return setFlash("error", "Vai trò phải là thu ngân / phục vụ / bếp.");
  if (!isValidPin(pin)) return setFlash("error", "PIN phải gồm đúng 4 chữ số.");

  const admin = createAdminClient();

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password: derivePinPassword(email, pin),
    email_confirm: true,
    user_metadata: { full_name: displayName },
  });
  if (cErr || !created?.user) {
    const dup = /registered|already/i.test(cErr?.message ?? "");
    return setFlash(
      "error",
      dup ? "Email đã được dùng." : `Không tạo được tài khoản: ${cErr?.message ?? "lỗi"}`
    );
  }

  const userId = created.user.id;
  const pin_hash = await hashPin(pin);
  const { error: mErr } = await admin.from("memberships").insert({
    tenant_id: session.tenant.id,
    user_id: userId,
    role,
    display_name: displayName,
    email,
    pin_hash,
    active: true,
  });
  if (mErr) {
    // Rollback tài khoản vừa tạo để tránh mồ côi.
    await admin.auth.admin.deleteUser(userId);
    return setFlash("error", `Không tạo được nhân viên: ${mErr.message}`);
  }

  revalidatePath(staffPath(slug));
  await setFlash("ok", `Đã thêm ${displayName} (${email}).`);
}

/** Đặt lại PIN: cập nhật mật khẩu Supabase (suy dẫn) + pin_hash. */
export async function resetPin(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireManager(slug);
  const id = String(formData.get("id") ?? "");
  const pin = String(formData.get("pin") ?? "");

  if (!isValidPin(pin)) return setFlash("error", "PIN phải 4 chữ số.");

  const admin = createAdminClient();
  const { data: m } = await admin
    .from("memberships")
    .select("user_id, email")
    .eq("id", id)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();
  if (!m) return setFlash("error", "Không tìm thấy nhân viên.");

  if (m.user_id && m.email) {
    const { error } = await admin.auth.admin.updateUserById(m.user_id, {
      password: derivePinPassword(m.email, pin),
    });
    if (error) return setFlash("error", `Không đặt lại được PIN: ${error.message}`);
  }

  const pin_hash = await hashPin(pin);
  const { error } = await admin
    .from("memberships")
    .update({ pin_hash })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  if (error) return setFlash("error", error.message);

  revalidatePath(staffPath(slug));
  await setFlash("ok", "Đã đặt lại PIN.");
}

/**
 * Bật/tắt nhân viên (giữ lịch sử). Tắt = ban tài khoản Supabase để không đăng nhập được.
 * Void: cập nhật tại chỗ (badge trạng thái đổi ngay), không đổi link.
 */
export async function setStaffActive(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireManager(slug);
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  const admin = createAdminClient();
  const { data: m } = await admin
    .from("memberships")
    .select("user_id")
    .eq("id", id)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  await admin
    .from("memberships")
    .update({ active })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);

  if (m?.user_id) {
    await admin.auth.admin.updateUserById(m.user_id, {
      ban_duration: active ? "none" : "876000h",
    });
  }

  revalidatePath(staffPath(slug));
  await setFlash("ok", active ? "Đã bật nhân viên." : "Đã tắt nhân viên.");
}

/** Xóa cứng nhân viên: xóa membership + tài khoản Supabase. Không đụng owner/station. */
export async function deleteStaff(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireManager(slug);
  const id = String(formData.get("id") ?? "");

  const admin = createAdminClient();
  const { data: m } = await admin
    .from("memberships")
    .select("user_id, role")
    .eq("id", id)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();
  if (!m) return setFlash("error", "Không tìm thấy nhân viên.");
  if (!PIN_ROLES.includes(m.role as Role)) {
    return setFlash("error", "Chỉ xóa được nhân viên (thu ngân/phục vụ/bếp).");
  }

  await admin
    .from("memberships")
    .delete()
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);

  if (m.user_id) await admin.auth.admin.deleteUser(m.user_id);

  revalidatePath(staffPath(slug));
  await setFlash("ok", "Đã xóa nhân viên.");
}
