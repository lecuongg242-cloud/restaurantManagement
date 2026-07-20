"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function tenantIdFromSlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return data?.id as string | undefined;
}

const back = (slug: string, q = "") => redirect(`/r/${slug}/admin/staff${q}`);

/** Mời nhân viên: tạo tenant_invitations (KHÔNG tạo membership trực tiếp — quy định P1). */
export async function inviteStaff(formData: FormData) {
  const slug = String(formData.get("slug"));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) back(slug, "?err=" + encodeURIComponent("Không tìm thấy nhà hàng."));

  const { data: invite, error } = await supabase
    .from("tenant_invitations")
    .insert({ tenant_id: tenantId, email, role, invited_by: user.id })
    .select()
    .single();
  if (error) {
    back(slug, "?err=" + encodeURIComponent("Không tạo được lời mời: " + error.message));
  }
  back(slug, `?invited=${invite!.token}&email=${encodeURIComponent(email)}`);
}

/** Thu hồi lời mời đang chờ. */
export async function revokeInvite(formData: FormData) {
  const slug = String(formData.get("slug"));
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("tenant_invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) back(slug, "?err=" + encodeURIComponent(error.message));
  back(slug);
}

/** Khóa/mở khóa nhân viên. Hiệu lực ngay từ request kế tiếp (middleware + RLS). */
export async function setMembershipStatus(formData: FormData) {
  const slug = String(formData.get("slug"));
  const userId = String(formData.get("user_id"));
  const status = String(formData.get("status")); // 'active' | 'disabled'
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.id === userId) {
    back(slug, "?err=" + encodeURIComponent("Không thể tự khóa chính mình."));
  }

  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) back(slug, "?err=" + encodeURIComponent("Không tìm thấy nhà hàng."));

  const { error } = await supabase
    .from("memberships")
    .update({ status })
    .match({ tenant_id: tenantId, user_id: userId });
  if (error) back(slug, "?err=" + encodeURIComponent(error.message));
  back(slug);
}
