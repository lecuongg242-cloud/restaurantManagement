"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/auth/session";
import { slugify } from "@/lib/utils";

/** Tra tài khoản auth theo email (phân trang listUsers) — trả null nếu không có. */
async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
) {
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

/** Đăng nhập super-admin (email/mật khẩu Supabase). */
export async function superSignIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/super/login?error=${encodeURIComponent("Email hoặc mật khẩu sai.")}`);
  }

  // Chỉ super-admin mới được vào /super.
  const su = await isSuperAdmin();
  if (!su) {
    await supabase.auth.signOut();
    redirect(`/super/login?error=${encodeURIComponent("Tài khoản không có quyền super-admin.")}`);
  }

  redirect("/super");
}

export async function superSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/super/login");
}

/**
 * Tạo nhà hàng (tenant) + tài khoản owner. Chỉ super-admin.
 * Dùng SERVICE ROLE để tạo auth user + ghi bảng (bỏ qua RLS có chủ đích).
 */
export async function createTenant(formData: FormData) {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const slug = slugRaw ? slugify(slugRaw) : slugify(name);
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim();
  const ownerPassword = String(formData.get("ownerPassword") ?? "");

  const fail = (msg: string): never =>
    redirect(`/super/new?error=${encodeURIComponent(msg)}`);

  if (!name) fail("Thiếu tên nhà hàng.");
  if (!slug) fail("Slug không hợp lệ.");
  if (!ownerEmail) fail("Thiếu email owner.");
  if (ownerPassword.length < 6) fail("Mật khẩu owner tối thiểu 6 ký tự.");

  const admin = createAdminClient();

  // 1) Tạo tenant trước (bắt trùng slug sớm).
  const { data: tenant, error: tErr } = await admin
    .from("tenants")
    .insert({ name, slug })
    .select("id, slug")
    .single();
  if (tErr || !tenant) {
    fail(
      tErr?.code === "23505"
        ? `Slug "${slug}" đã tồn tại.`
        : `Không tạo được nhà hàng: ${tErr?.message ?? "lỗi không rõ"}`
    );
  }

  const tenantId = tenant!.id;

  // 2) Tạo auth user owner — hoặc TÁI DÙNG nếu email đã tồn tại.
  //    Xoá nhà hàng KHÔNG xoá tài khoản auth của owner, nên email có thể còn "mồ côi"
  //    từ một nhà hàng đã xoá trước đó → tái dùng tài khoản đó và đặt lại mật khẩu theo form.
  let ownerId: string;
  let ownerCreated = false;
  const { data: created, error: uErr } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: { full_name: ownerEmail },
  });

  if (created?.user) {
    ownerId = created.user.id;
    ownerCreated = true;
  } else if (uErr && /already|registered|exists/i.test(uErr.message)) {
    const existing = await findAuthUserByEmail(admin, ownerEmail);
    if (!existing) {
      await admin.from("tenants").delete().eq("id", tenantId);
      fail("Email đã tồn tại nhưng không tra được tài khoản. Hãy dùng email khác.");
    }
    ownerId = existing!.id;
    // Đặt lại mật khẩu tài khoản sẵn có theo mật khẩu vừa nhập.
    await admin.auth.admin.updateUserById(ownerId, { password: ownerPassword });
  } else {
    await admin.from("tenants").delete().eq("id", tenantId);
    fail(`Không tạo được owner: ${uErr?.message ?? "email có thể đã dùng"}`);
    return;
  }

  // 3) Profile + membership owner.
  await admin.from("profiles").upsert({ id: ownerId, full_name: ownerEmail });
  const { error: mErr } = await admin.from("memberships").insert({
    tenant_id: tenantId,
    user_id: ownerId,
    role: "owner",
    display_name: ownerEmail,
    active: true,
  });
  if (mErr) {
    // Chỉ xoá auth user nếu chính lần này ta tạo nó (đừng xoá tài khoản tái dùng).
    if (ownerCreated) await admin.auth.admin.deleteUser(ownerId);
    await admin.from("tenants").delete().eq("id", tenantId);
    fail(`Không gán được owner: ${mErr.message}`);
  }

  revalidatePath("/super");
  redirect(`/super?created=${encodeURIComponent(tenant!.slug)}`);
}

/**
 * Đặt lại mật khẩu owner của một nhà hàng — TRỰC TIẾP, không gửi email.
 * Chỉ super-admin. Dùng SERVICE ROLE (updateUserById) để đổi ngay lập tức.
 * Đây là cơ chế "quên mật khẩu" cấp hệ thống: owner mất mật khẩu → super-admin đặt lại.
 */
export async function resetOwnerPassword(formData: FormData) {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const fail = (msg: string): never =>
    redirect(`/super?error=${encodeURIComponent(msg)}`);

  if (!tenantId) fail("Thiếu nhà hàng.");
  if (password.length < 8) fail("Mật khẩu tối thiểu 8 ký tự.");

  const admin = createAdminClient();

  // Tìm tài khoản owner của tenant.
  const { data: owner, error: mErr } = await admin
    .from("memberships")
    .select("user_id, display_name")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (mErr) fail(`Không tra được owner: ${mErr.message}`);
  if (!owner) fail("Nhà hàng này chưa có tài khoản owner.");

  const { error: uErr } = await admin.auth.admin.updateUserById(owner!.user_id, {
    password,
  });
  if (uErr) fail(`Không đổi được mật khẩu: ${uErr.message}`);

  revalidatePath("/super");
  redirect(`/super?reset=${encodeURIComponent(owner!.display_name ?? "owner")}`);
}

/**
 * Tạm ngưng / kích hoạt lại nhà hàng (đổi tenants.status). Chỉ super-admin.
 * "suspended" hồi phục được — KHÔNG xoá dữ liệu.
 */
export async function setTenantStatus(formData: FormData) {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (status !== "active" && status !== "suspended") {
    redirect(`/super?error=${encodeURIComponent("Trạng thái không hợp lệ.")}`);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tenants")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (error) redirect(`/super?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/super");
  redirect(
    `/super?status=${encodeURIComponent(
      status === "suspended" ? "Đã tạm ngưng nhà hàng." : "Đã kích hoạt lại nhà hàng."
    )}`
  );
}

/**
 * Xoá vĩnh viễn nhà hàng. Chỉ super-admin. AN TOÀN:
 *  - Chỉ xoá được nhà hàng đã "suspended" (buộc tạm ngưng trước).
 *  - Phải gõ đúng slug để xác nhận.
 * Xoá dòng tenant → mọi bảng con ON DELETE CASCADE tự xoá theo. KHÔNG hồi phục.
 * Tài khoản auth owner + ảnh storage giữ lại (dọn riêng nếu cần).
 */
export async function deleteTenant(formData: FormData) {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const confirmSlug = String(formData.get("confirm_slug") ?? "").trim();
  const fail = (msg: string): never => redirect(`/super?error=${encodeURIComponent(msg)}`);

  if (!tenantId) fail("Thiếu nhà hàng.");

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, slug, name, status")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant) fail("Không tìm thấy nhà hàng.");
  if (tenant!.status !== "suspended") {
    fail("Chỉ xoá được nhà hàng đã tạm ngưng. Hãy tạm ngưng trước.");
  }
  if (confirmSlug !== tenant!.slug) {
    fail("Slug xác nhận không khớp — nhập đúng slug để xoá.");
  }

  const { error } = await admin.from("tenants").delete().eq("id", tenantId);
  if (error) fail(`Không xoá được: ${error.message}`);

  revalidatePath("/super");
  redirect(`/super?deleted=${encodeURIComponent(tenant!.name)}`);
}
