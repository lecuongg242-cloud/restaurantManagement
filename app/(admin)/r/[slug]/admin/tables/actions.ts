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

const back = (slug: string, q = ""): never =>
  redirect(`/r/${slug}/admin/tables${q}`);
const err = (msg: string) => "?err=" + encodeURIComponent(msg);

export async function createArea(formData: FormData) {
  const slug = String(formData.get("slug"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back(slug, err("Tên khu vực không được để trống."));
  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) back(slug, err("Không tìm thấy nhà hàng."));

  const supabase = await createClient();
  const { error } = await supabase
    .from("areas")
    .insert({ tenant_id: tenantId, name });
  if (error) {
    back(
      slug,
      err(
        /duplicate|unique/i.test(error.message)
          ? `Khu vực "${name}" đã tồn tại.`
          : error.message
      )
    );
  }
  back(slug);
}

export async function renameArea(formData: FormData) {
  const slug = String(formData.get("slug"));
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back(slug, err("Tên khu vực không được để trống."));
  const supabase = await createClient();
  const { error } = await supabase.from("areas").update({ name }).eq("id", id);
  if (error) back(slug, err(error.message));
  back(slug);
}

export async function deleteArea(formData: FormData) {
  const slug = String(formData.get("slug"));
  const id = String(formData.get("id"));
  const supabase = await createClient();
  // Bàn trong khu vực bị xóa theo (FK cascade) — UI đã hỏi xác nhận rõ số bàn.
  const { error } = await supabase.from("areas").delete().eq("id", id);
  if (error) back(slug, err(error.message));
  back(slug);
}

/** Tạo bàn hàng loạt: "Tầng 1, 8 bàn" → Bàn 1..Bàn 8 (đánh số tiếp nếu đã có). */
export async function bulkCreateTables(formData: FormData) {
  const slug = String(formData.get("slug"));
  const areaId = String(formData.get("area_id"));
  const count = Math.floor(Number(formData.get("count")));
  if (!Number.isFinite(count) || count < 1 || count > 100) {
    back(slug, err("Số bàn phải từ 1 đến 100."));
  }
  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) back(slug, err("Không tìm thấy nhà hàng."));

  const supabase = await createClient();

  // Đánh số tiếp theo số lớn nhất hiện có trong khu vực (tên dạng số)
  const { data: existing } = await supabase
    .from("tables")
    .select("name")
    .eq("area_id", areaId);
  const maxNum = (existing ?? [])
    .map((t) => Number(t.name))
    .filter((n) => Number.isInteger(n))
    .reduce((a, b) => Math.max(a, b), 0);

  const rows = Array.from({ length: count }, (_, i) => ({
    tenant_id: tenantId,
    area_id: areaId,
    name: String(maxNum + i + 1),
  }));
  const { error } = await supabase.from("tables").insert(rows);
  if (error) back(slug, err("Không tạo được bàn: " + error.message));
  back(slug);
}

export async function renameTable(formData: FormData) {
  const slug = String(formData.get("slug"));
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back(slug, err("Tên bàn không được để trống."));
  const supabase = await createClient();
  // Đổi tên KHÔNG đổi qr_token — QR đã in vẫn hiệu lực (cam kết P2 #5)
  const { error } = await supabase.from("tables").update({ name }).eq("id", id);
  if (error) {
    back(
      slug,
      err(
        /duplicate|unique/i.test(error.message)
          ? `Trong khu vực này đã có bàn tên "${name}".`
          : error.message
      )
    );
  }
  back(slug);
}

export async function deleteTable(formData: FormData) {
  const slug = String(formData.get("slug"));
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("tables").delete().eq("id", id);
  if (error) back(slug, err(error.message));
  back(slug);
}
