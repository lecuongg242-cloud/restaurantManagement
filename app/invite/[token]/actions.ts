"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result = { error: string } | void;

/**
 * Đăng ký tài khoản cho NGƯỜI ĐƯỢC MỜI — không gửi email xác nhận.
 * Link mời (token, gắn đúng email, có hạn) chính là bằng chứng xác thực,
 * nên tài khoản được tạo trực tiếp qua admin API (đã ghi chú ở lib/supabase/admin.ts).
 * Token được kiểm tra TRƯỚC khi tạo tài khoản để không ai lợi dụng endpoint này.
 */
export async function registerWithInvite(
  token: string,
  email: string,
  password: string
): Promise<Result> {
  const cleanEmail = email.trim().toLowerCase();
  if (password.length < 8) return { error: "Mật khẩu tối thiểu 8 ký tự." };

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("tenant_invitations")
    .select("email, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite || invite.status === "revoked") {
    return { error: "Lời mời không tồn tại hoặc đã bị thu hồi." };
  }
  if (invite.status === "accepted") {
    return { error: "Lời mời này đã được sử dụng." };
  }
  if (new Date(invite.expires_at) < new Date()) {
    return { error: "Lời mời đã hết hạn. Hãy nhờ quản lý gửi lời mời mới." };
  }
  if (invite.email !== cleanEmail) {
    return {
      error: `Email không khớp. Lời mời này dành cho ${invite.email}.`,
    };
  }

  const { error: createErr } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true, // xác nhận sẵn — không gửi mail
  });
  if (createErr) {
    if (/already|registered|exists/i.test(createErr.message)) {
      return {
        error: "Email này đã có tài khoản — hãy dùng tab 'Đã có tài khoản'.",
      };
    }
    return { error: "Không tạo được tài khoản: " + createErr.message };
  }

  // Đăng nhập bằng session người dùng rồi chấp nhận lời mời qua RPC (RLS thực thi)
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (signInErr) {
    return {
      error: "Tài khoản đã tạo nhưng đăng nhập lỗi — thử tab 'Đã có tài khoản'.",
    };
  }

  const { error: acceptErr } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });
  if (acceptErr) {
    return { error: "Không chấp nhận được lời mời: " + acceptErr.message };
  }

  redirect("/choose");
}
