"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Tạo tenant mới + lời mời owner. RLS đảm bảo chỉ super-admin làm được. */
export async function createTenant(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const ownerEmail = String(formData.get("owner_email") ?? "")
    .trim()
    .toLowerCase();

  if (!name || !slug || !ownerEmail) {
    redirect("/super?err=" + encodeURIComponent("Điền đủ tên, slug và email chủ nhà hàng."));
  }

  const { data: tenant, error } = await supabase
    .from("tenants")
    .insert({ name, slug })
    .select()
    .single();
  if (error) {
    const msg = error.message.includes("duplicate")
      ? `Slug "${slug}" đã tồn tại.`
      : error.message.includes("violates check")
        ? "Slug chỉ gồm chữ thường/số/gạch ngang, 3-50 ký tự."
        : "Không tạo được nhà hàng: " + error.message;
    redirect("/super?err=" + encodeURIComponent(msg));
  }

  const { data: invite, error: invErr } = await supabase
    .from("tenant_invitations")
    .insert({
      tenant_id: tenant.id,
      email: ownerEmail,
      role: "owner",
      invited_by: user.id,
    })
    .select()
    .single();
  if (invErr) {
    redirect("/super?err=" + encodeURIComponent("Tạo nhà hàng OK nhưng không tạo được lời mời: " + invErr.message));
  }

  redirect(`/super?invited=${invite.token}&email=${encodeURIComponent(ownerEmail)}`);
}
