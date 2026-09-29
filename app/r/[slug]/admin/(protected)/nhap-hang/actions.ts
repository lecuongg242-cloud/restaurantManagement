"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { setFlash } from "@/lib/flash";
import { purchaseErrorMessage } from "@/lib/purchasing/receipt";

async function requirePurchasing(slug: string) {
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "purchasing")) {
    redirect(`/r/${slug}/admin?error=${encodeURIComponent("Không đủ quyền.")}`);
  }
  return session!;
}

const detail = (slug: string, id: string) => `/r/${slug}/admin/nhap-hang/${id}`;

function refresh(slug: string) {
  revalidatePath(`/r/${slug}/admin/inventory`, "layout");
  revalidatePath(`/r/${slug}/admin/nha-cung-cap`, "layout");
}

/** "Hủy bỏ" (PURCH-03, QD-027 D5): hoàn tồn kho; hỏi có hủy luôn phiếu chi đi kèm. */
export async function cancelReceipt(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  await requirePurchasing(slug);
  const id = String(fd.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_purchase_receipt", {
    p_receipt: id,
    p_cancel_vouchers: fd.get("cancel_vouchers") === "on",
  });
  if (error) {
    await setFlash("error", purchaseErrorMessage(error.message));
    return;
  }
  refresh(slug);
  await setFlash("ok", "Đã hủy phiếu nhập.");
}

/** "Sao chép" → phiếu tạm mới cùng dòng; mở luôn để sửa rồi Hoàn thành. */
export async function copyReceipt(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  await requirePurchasing(slug);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copy_purchase_receipt", { p_receipt: String(fd.get("id") ?? "") });
  if (error || !data?.[0]) {
    await setFlash("error", purchaseErrorMessage(error?.message));
    return;
  }
  const moi = data[0] as { id: string; code: string };
  refresh(slug);
  await setFlash("ok", `Đã sao chép thành phiếu tạm ${moi.code}.`);
  redirect(detail(slug, moi.id));
}

/** Phiếu đã nhập: chỉ sửa ghi chú, ngày chứng từ, gắn NCC khi đang trống. */
export async function updateReceiptMeta(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  await requirePurchasing(slug);
  const docDate = String(fd.get("doc_date") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_purchase_receipt_meta", {
    p_receipt: String(fd.get("id") ?? ""),
    p_note: String(fd.get("note") ?? "").slice(0, 500),
    p_doc_date: /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate : null,
    p_supplier: String(fd.get("supplier_id") ?? "") || null,
  });
  if (error) {
    await setFlash("error", purchaseErrorMessage(error.message));
    return;
  }
  refresh(slug);
  await setFlash("ok", "Đã lưu thông tin phiếu.");
}
