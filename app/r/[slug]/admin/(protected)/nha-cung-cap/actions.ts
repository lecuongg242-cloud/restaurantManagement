"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { setFlash } from "@/lib/flash";
import { parseSupplierForm } from "@/lib/purchasing/supplier";

/** Guard chung: owner/manager (QD-027 C5). RLS `suppliers` chặn thêm một lớp ở DB. */
async function requirePurchasing(slug: string) {
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "purchasing")) {
    redirect(`/r/${slug}/admin?error=${encodeURIComponent("Không đủ quyền.")}`);
  }
  return session!;
}

const base = (slug: string) => `/r/${slug}/admin/nha-cung-cap`;

function dbError(message: string, code?: string): string {
  if (code === "23505") return "Số điện thoại này đã có ở một nhà cung cấp khác.";
  return `Lưu lỗi: ${message}`;
}

/** "+ Nhà cung cấp" (PURCH-01). Mã NCC000001 do DB cấp (trigger 0076). Trả `ok` để hộp thoại biết đóng hay giữ. */
export async function createSupplier(fd: FormData): Promise<{ ok: boolean }> {
  const slug = String(fd.get("slug") ?? "");
  const session = await requirePurchasing(slug);
  const parsed = parseSupplierForm(fd);
  if (!parsed.ok) {
    await setFlash("error", parsed.error);
    return { ok: false };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ tenant_id: session.tenant.id, ...parsed.value })
    .select("id, code")
    .single();
  if (error) {
    await setFlash("error", dbError(error.message, error.code));
    return { ok: false };
  }
  revalidatePath(base(slug));
  await setFlash("ok", `Đã thêm nhà cung cấp ${data.code}.`);
  return { ok: true };
}

export async function updateSupplier(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await requirePurchasing(slug);
  const id = String(fd.get("id") ?? "");
  const parsed = parseSupplierForm(fd);
  if (!parsed.ok) {
    await setFlash("error", parsed.error);
    return;
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  if (error) {
    await setFlash("error", dbError(error.message, error.code));
    return;
  }
  revalidatePath(base(slug), "layout");
  await setFlash("ok", "Đã lưu nhà cung cấp.");
}

/** "Ngừng hoạt động" / "Cho hoạt động lại": ẩn khỏi ô chọn trên phiếu nhập, giữ nguyên lịch sử và công nợ. */
export async function setSupplierActive(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await requirePurchasing(slug);
  const id = String(fd.get("id") ?? "");
  const active = String(fd.get("active") ?? "") === "true";
  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  if (error) {
    await setFlash("error", dbError(error.message, error.code));
    return;
  }
  revalidatePath(base(slug), "layout");
  await setFlash("ok", active ? "Nhà cung cấp hoạt động lại." : "Đã ngừng hoạt động nhà cung cấp.");
}

// ── 20-03: công nợ nhà cung cấp (PURCH-05, QD-027 D11) ─────────────────────────────────────────────────────────────

const debtError = (m: string | undefined) =>
  m?.includes("so_tien_khong_hop_le")
    ? "Số tiền phải lớn hơn 0."
    : m?.includes("phieu_khong_hop_le")
      ? "Phiếu được chọn không còn nợ hoặc không thuộc nhà cung cấp này."
      : m?.includes("ngay_tuong_lai")
        ? "Thời gian không được ở tương lai."
        : m?.includes("khong du quyen")
          ? "Không đủ quyền."
          : `Lưu lỗi: ${m}`;

/** "Thanh toán" → phiếu chi trả nợ; không tích phiếu = trả phiếu cũ trước, trả dư = trả trước. */
export async function paySupplier(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  await requirePurchasing(slug);
  const id = String(fd.get("id") ?? "");
  const amount = Number(String(fd.get("amount") ?? "").replace(/\D/g, "")) || 0;
  const receipts = fd.getAll("receipts").map(String).filter(Boolean);
  const at = String(fd.get("occurred_at") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pay_supplier", {
    p_supplier: id,
    p_amount: amount,
    p_fund: String(fd.get("fund") ?? "") === "bank" ? "bank" : "cash",
    p_at: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) ? new Date(Date.parse(`${at}:00+07:00`)).toISOString() : null,
    p_receipts: receipts.length ? receipts : null,
    p_note: String(fd.get("note") ?? "").slice(0, 500),
  });
  if (error || !data?.[0]) {
    await setFlash("error", debtError(error?.message));
    return;
  }
  revalidatePath(base(slug), "layout");
  revalidatePath(`/r/${slug}/admin/so-quy`, "layout");
  revalidatePath(`/r/${slug}/admin/inventory`, "layout");
  await setFlash("ok", `Đã tạo phiếu chi ${(data[0] as { code: string }).code}.`);
}

/** "Điều chỉnh": nợ đầu kỳ / sửa lệch — không đi qua sổ quỹ. */
export async function adjustDebt(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  await requirePurchasing(slug);
  const amount = Number(String(fd.get("amount") ?? "").replace(/\D/g, "")) || 0;
  const sign = String(fd.get("sign") ?? "") === "minus" ? -1 : 1;
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_supplier_debt", {
    p_supplier: String(fd.get("id") ?? ""),
    p_amount: sign * amount,
    p_note: String(fd.get("note") ?? "").slice(0, 500),
  });
  if (error) {
    await setFlash("error", debtError(error.message));
    return;
  }
  revalidatePath(base(slug), "layout");
  await setFlash("ok", "Đã điều chỉnh công nợ.");
}

export async function cancelAdjustment(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  await requirePurchasing(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_supplier_adjustment", { p_id: String(fd.get("adj") ?? "") });
  if (error) {
    await setFlash("error", debtError(error.message));
    return;
  }
  revalidatePath(base(slug), "layout");
  await setFlash("ok", "Đã hủy điều chỉnh.");
}
