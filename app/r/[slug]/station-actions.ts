"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole, type Section } from "@/lib/auth/rbac";
import { verifyPin, isValidPin } from "@/lib/auth/pin";

type Surface = "pos" | "kds";

function staffCookieName(surface: Surface) {
  return `staff_${surface}`;
}

/** Đăng nhập tài khoản TRẠM (station) 1 lần/thiết bị cho POS hoặc KDS. */
export async function stationSignIn(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const surface = String(formData.get("surface") ?? "pos") as Surface;
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const loginUrl = `/r/${slug}/${surface}/login`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`${loginUrl}?error=${encodeURIComponent("Email hoặc mật khẩu sai.")}`);
  }

  const session = await getSessionMembership(slug);
  if (!session) {
    await supabase.auth.signOut();
    redirect(`${loginUrl}?error=${encodeURIComponent("Tài khoản không thuộc nhà hàng này.")}`);
  }
  if (!canAccess(session!.role, surface as Section)) {
    redirect(defaultRouteForRole(slug, session!.role));
  }

  redirect(`/r/${slug}/${surface}`);
}

export async function stationSignOut(slug: string, surface: Surface) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(staffCookieName(surface));
  redirect(`/r/${slug}/${surface}/login`);
}

/** Bỏ chọn nhân viên hiện tại (quay lại StaffPicker). */
export async function clearStaff(slug: string, surface: Surface) {
  (await cookies()).delete(staffCookieName(surface));
  redirect(`/r/${slug}/${surface}`);
}

/**
 * Xác thực PIN của nhân viên đã chọn (SERVER — không so khớp ở client).
 * Thành công: lưu membershipId vào cookie httpOnly scoped theo bề mặt và trả {ok:true}.
 * Thất bại: trả {ok:false, error}.
 */
export async function verifyStaffPin(
  _prev: unknown,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const slug = String(formData.get("slug") ?? "");
  const surface = String(formData.get("surface") ?? "pos") as Surface;
  const membershipId = String(formData.get("membershipId") ?? "");
  const pin = String(formData.get("pin") ?? "");

  if (!isValidPin(pin)) return { ok: false, error: "PIN phải gồm 4 chữ số." };

  const session = await getSessionMembership(slug);
  if (!session) return { ok: false, error: "Phiên trạm hết hạn, đăng nhập lại." };

  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("memberships")
    .select("id, display_name, role, pin_hash, active")
    .eq("id", membershipId)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  if (!staff || !staff.active || !staff.pin_hash) {
    return { ok: false, error: "Nhân viên không hợp lệ." };
  }

  const ok = await verifyPin(pin, staff.pin_hash);
  if (!ok) return { ok: false, error: "PIN không đúng." };

  (await cookies()).set(staffCookieName(surface), staff.id, {
    httpOnly: true,
    sameSite: "lax",
    path: `/r/${slug}/${surface}`,
    maxAge: 60 * 60 * 12, // 12h ca làm
  });

  return { ok: true };
}

/** Đọc nhân viên đang thao tác (từ cookie) — trả membership tối giản hoặc null. */
export async function getCurrentStaff(slug: string, surface: Surface) {
  const cookie = (await cookies()).get(staffCookieName(surface));
  if (!cookie?.value) return null;

  const session = await getSessionMembership(slug);
  if (!session) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("id, display_name, role, active")
    .eq("id", cookie.value)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  if (!data || !data.active) return null;
  return data as { id: string; display_name: string | null; role: string; active: boolean };
}
