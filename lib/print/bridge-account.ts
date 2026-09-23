import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cấp tài khoản THIẾT BỊ cho cầu in của một nhà hàng (QD-012 §1).
 *
 * Trước đây máy tính tại quán giữ `SUPABASE_SERVICE_ROLE_KEY` — khóa bỏ qua RLS, nên mất một
 * laptop là lộ dữ liệu của mọi nhà hàng. Ở đây cầu in có tài khoản riêng vai trò `printer`, chỉ
 * là thành viên của đúng quán đó, và `canAccess()` chặn nó khỏi mọi bề mặt giao diện.
 *
 * Tách khỏi server action để test được bằng DB thật: action chỉ còn lớp kiểm quyền mỏng.
 */

/** Slug `pho-viet` → `print-pho-viet@bridge.local`. Cố định để cấp lại trúng đúng tài khoản cũ,
 *  không đẻ tài khoản mồ côi mỗi lần xoay mật khẩu. */
export function bridgeEmailForSlug(slug: string): string {
  return `print-${slug.trim().toLowerCase()}@bridge.local`;
}

export type PrintBridgeCredentials = { email: string; password: string };

/**
 * Tạo mới, hoặc XOAY mật khẩu nếu tài khoản đã có. Mật khẩu ngẫu nhiên và **không lưu ở đâu để
 * đọc lại** — mất thì cấp cái mới. Gọi lần hai là cách xử lý khi máy quán bị mất hoặc nhân viên
 * nghỉ việc: mật khẩu cũ hết hiệu lực ngay, và chỉ ảnh hưởng đúng quán đó.
 *
 * `admin` phải là client service-role (tạo auth user + ghi membership vượt RLS có chủ đích).
 */
export async function provisionPrintBridgeAccount(
  admin: SupabaseClient,
  tenant: { tenantId: string; slug: string; name: string }
): Promise<PrintBridgeCredentials> {
  const email = bridgeEmailForSlug(tenant.slug);
  const password = crypto.randomBytes(24).toString("base64url");

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Cầu in ${tenant.name}` },
  });

  let userId: string;
  if (created?.user) {
    userId = created.user.id;
  } else if (cErr && /already|registered|exists/i.test(cErr.message)) {
    const existing = await findUserByEmail(admin, email);
    if (!existing) {
      throw new Error("Tài khoản cầu in đã tồn tại nhưng không tra được. Báo kỹ thuật.");
    }
    userId = existing;
    const { error: uErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (uErr) throw new Error(`Không xoay được mật khẩu: ${uErr.message}`);
  } else {
    throw new Error(`Không tạo được tài khoản cầu in: ${cErr?.message ?? "lỗi không rõ"}`);
  }

  // Tra-rồi-ghi thay vì `upsert`: uniq_membership_tenant_user (0001) là index MỘT PHẦN
  // (`where user_id is not null`), nên ON CONFLICT không khớp được nó.
  const row = {
    tenant_id: tenant.tenantId,
    user_id: userId,
    role: "printer",
    display_name: `Cầu in ${tenant.name}`,
    email,
    active: true,
  };

  const { data: existingMembership } = await admin
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenant.tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  const { error: mErr } = existingMembership
    ? await admin.from("memberships").update(row).eq("id", existingMembership.id)
    : await admin.from("memberships").insert(row);
  if (mErr) throw new Error(`Không gán được quyền cầu in: ${mErr.message}`);

  return { email, password };
}

/** Tra auth user theo email. Phân trang vì Admin API không có lối tra thẳng theo email. */
async function findUserByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}
