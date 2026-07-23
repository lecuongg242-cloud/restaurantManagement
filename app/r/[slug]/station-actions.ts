"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole, type Section } from "@/lib/auth/rbac";
import {
  derivePinPassword,
  isFourDigitPin,
  isLoginLocked,
  recordLoginFailure,
  clearLoginFailures,
} from "@/lib/auth/staff-credentials";

type Surface = "pos" | "kds";

/**
 * Đăng nhập nhân viên (QD-009) — 1 bước: email + PIN (hoặc mật khẩu với owner/manager).
 * Bí mật đúng 4 chữ số ⇒ PIN (suy dẫn mật khẩu Supabase bằng pepper server-side); còn lại ⇒
 * mật khẩu thường. Vào thẳng bề mặt với đúng danh tính — không còn bước "Chọn nhân viên".
 */
export async function staffSignIn(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const surface = String(formData.get("surface") ?? "pos") as Surface;
  const email = String(formData.get("email") ?? "").trim();
  const secret = String(formData.get("secret") ?? "");
  const loginUrl = `/r/${slug}/${surface}/login`;
  const fail = (msg: string) => redirect(`${loginUrl}?error=${encodeURIComponent(msg)}`);

  if (!email || !secret) fail("Nhập email và PIN/mật khẩu.");

  if (await isLoginLocked(email)) {
    fail("Đăng nhập tạm khóa do sai nhiều lần. Thử lại sau ít phút.");
  }

  const password = isFourDigitPin(secret) ? derivePinPassword(email, secret) : secret;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await recordLoginFailure(email);
    fail("Email hoặc PIN/mật khẩu sai.");
  }

  const session = await getSessionMembership(slug);
  if (!session) {
    await supabase.auth.signOut();
    fail("Tài khoản không thuộc nhà hàng này.");
  }
  if (!canAccess(session!.role, surface as Section)) {
    await clearLoginFailures(email);
    redirect(defaultRouteForRole(slug, session!.role));
  }

  await clearLoginFailures(email);
  redirect(`/r/${slug}/${surface}`);
}

/** Đăng xuất khỏi thiết bị (kết thúc phiên nhân viên). */
export async function stationSignOut(slug: string, surface: Surface) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/r/${slug}/${surface}/login`);
}
