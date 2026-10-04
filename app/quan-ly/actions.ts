"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dichSauDangNhap, quanCuaToi } from "@/lib/quan-ly/quan";

/**
 * Đăng nhập app "TechMenu Quản lý" (P30, MGR-01, Giao diện B2): email + mật khẩu, không cần biết slug quán. Chỉ chủ /
 * quản lý — nhân viên trạm nhận câu báo và bị thu hồi phiên. Lỗi trả tại chỗ (useActionState), thành công → chuyển trang.
 */
export async function quanLySignIn(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Nhập email và mật khẩu." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email hoặc mật khẩu không đúng." };

  const dich = dichSauDangNhap(await quanCuaToi());
  if (!dich) {
    await supabase.auth.signOut();
    return { error: "Tài khoản này không có quyền quản lý." };
  }
  redirect(dich);
}

export async function quanLySignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/quan-ly");
}
