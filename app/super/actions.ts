"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/auth/session";
import { slugify } from "@/lib/utils";

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

  // 2) Tạo auth user owner (email đã xác nhận).
  const { data: created, error: uErr } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: { full_name: ownerEmail },
  });
  const ownerUser = created?.user;
  if (uErr || !ownerUser) {
    // rollback tenant vừa tạo để tránh rác.
    await admin.from("tenants").delete().eq("id", tenantId);
    fail(`Không tạo được owner: ${uErr?.message ?? "email có thể đã dùng"}`);
  }

  const ownerId = ownerUser!.id;

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
    await admin.auth.admin.deleteUser(ownerId);
    await admin.from("tenants").delete().eq("id", tenantId);
    fail(`Không gán được owner: ${mErr.message}`);
  }

  revalidatePath("/super");
  redirect(`/super?created=${encodeURIComponent(tenant!.slug)}`);
}
