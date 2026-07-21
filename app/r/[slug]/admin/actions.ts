"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { defaultRouteForRole, canAccess } from "@/lib/auth/rbac";
import { getSessionMembership } from "@/lib/auth/session";

/** Đăng nhập owner/manager vào khu admin của tenant theo slug. */
export async function ownerSignIn(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const loginUrl = `/r/${slug}/admin/login`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`${loginUrl}?error=${encodeURIComponent("Email hoặc mật khẩu sai.")}`);
  }

  // Phải có membership ở tenant này.
  const session = await getSessionMembership(slug);
  if (!session) {
    await supabase.auth.signOut();
    redirect(`${loginUrl}?error=${encodeURIComponent("Tài khoản không thuộc nhà hàng này.")}`);
  }

  // Điều hướng theo vai trò (kitchen/cashier... đăng nhập nhầm cửa admin → về đúng khu).
  if (!canAccess(session!.role, "admin")) {
    redirect(defaultRouteForRole(slug, session!.role));
  }
  redirect(`/r/${slug}/admin`);
}

export async function ownerSignOut(slug: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/r/${slug}/admin/login`);
}
