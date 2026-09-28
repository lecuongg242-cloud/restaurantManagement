import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tra tài khoản auth theo email (phân trang listUsers) — trả null nếu không có. */
export async function findAuthUserByEmail(admin: SupabaseClient, email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

export type KetQuaChuQuan =
  | { ok: true; userId: string; created: boolean; passwordSet: boolean }
  | { ok: false; error: string };

/**
 * Tài khoản chủ cho một quán mới (super-admin tạo nhà hàng). Email chưa có → tạo mới với mật khẩu form.
 *
 * Email ĐÃ có (15-01, QD-023 D2):
 *  - Đang là thành viên hoạt động của quán khác (chủ chuỗi mở thêm quán) → dùng lại, **GIỮ NGUYÊN mật khẩu**.
 *    Trước đây hàm đặt lại mật khẩu theo form ⇒ chủ đang bán ở quán cũ bị đăng xuất khỏi mọi máy.
 *  - Mồ côi (quán cũ đã xóa, không còn membership hoạt động) → đặt mật khẩu theo form + xác nhận email như cũ,
 *    vì không ai còn nhớ mật khẩu cũ và Supabase chặn đăng nhập khi email chưa xác nhận.
 */
export async function provisionOwner(admin: SupabaseClient, email: string, password: string): Promise<KetQuaChuQuan> {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: email },
  });
  if (created?.user) return { ok: true, userId: created.user.id, created: true, passwordSet: true };
  if (!error || !/already|registered|exists/i.test(error.message)) {
    return { ok: false, error: `Không tạo được owner: ${error?.message ?? "email có thể đã dùng"}` };
  }

  const existing = await findAuthUserByEmail(admin, email);
  if (!existing) return { ok: false, error: "Email đã tồn tại nhưng không tra được tài khoản. Hãy dùng email khác." };

  const { count } = await admin
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", existing.id)
    .eq("active", true);
  const dangDung = (count ?? 0) > 0;

  await admin.auth.admin.updateUserById(existing.id, dangDung ? { email_confirm: true } : { password, email_confirm: true });
  return { ok: true, userId: existing.id, created: false, passwordSet: !dangDung };
}
