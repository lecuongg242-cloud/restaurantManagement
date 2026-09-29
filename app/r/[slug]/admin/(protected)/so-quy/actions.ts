"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { setFlash } from "@/lib/flash";
import { cashErrorMessage, COST_GROUP_LABEL, vnLocalToIso, type CostGroup } from "@/lib/cashbook/labels";

async function requireCashbook(slug: string) {
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "cashbook")) {
    redirect(`/r/${slug}/admin?error=${encodeURIComponent("Không đủ quyền.")}`);
  }
  return session!;
}

const base = (slug: string) => `/r/${slug}/admin/so-quy`;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const money = (fd: FormData, k: string) => Number(str(fd, k).replace(/\D/g, "")) || 0;

function refresh(slug: string) {
  revalidatePath(base(slug), "layout");
  revalidatePath(`/r/${slug}/admin/nha-cung-cap`, "layout");
}

/** "+ Phiếu thu" / "+ Phiếu chi" (CASH-02). Mã PT/PC do DB cấp. */
export async function createVoucher(fd: FormData) {
  const slug = str(fd, "slug");
  const session = await requireCashbook(slug);
  const direction = str(fd, "direction") === "in" ? "in" : "out";
  const fund = str(fd, "fund") === "bank" ? "bank" : "cash";
  const at = vnLocalToIso(str(fd, "occurred_at"));
  const cp = str(fd, "counterparty_kind");
  const supplierId = cp === "supplier" ? str(fd, "supplier_id") : "";
  if (cp === "supplier" && !supplierId) {
    await setFlash("error", "Chọn nhà cung cấp.");
    return;
  }
  const docDate = str(fd, "source_doc_date");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_cash_voucher", {
    p_tenant: session.tenant.id,
    p_voucher: {
      kind: "manual",
      direction,
      fund,
      amount: money(fd, "amount"),
      occurred_at: at,
      category_id: str(fd, "category_id") || null,
      in_pnl: fd.get("in_pnl") === "on",
      counterparty_kind: cp || null,
      counterparty_name: cp === "supplier" ? null : str(fd, "counterparty_name").slice(0, 120) || null,
      supplier_id: supplierId || null,
      note: str(fd, "note").slice(0, 500),
      source_doc_kind: str(fd, "source_doc_kind") || null,
      source_doc_no: str(fd, "source_doc_no").slice(0, 40) || null,
      source_doc_date: /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate : null,
    },
  });
  if (error || !data?.[0]) {
    await setFlash("error", cashErrorMessage(error?.message));
    return;
  }
  refresh(slug);
  await setFlash("ok", `Đã lập ${direction === "in" ? "phiếu thu" : "phiếu chi"} ${(data[0] as { code: string }).code}.`);
  redirect(`${base(slug)}?quy=${fund}`);
}

/** Số dư đầu kỳ của một quỹ — tiền đang có trong két / tài khoản lúc bắt đầu dùng sổ quỹ. */
export async function createOpening(fd: FormData) {
  const slug = str(fd, "slug");
  const session = await requireCashbook(slug);
  const fund = str(fd, "fund") === "bank" ? "bank" : "cash";
  const day = str(fd, "day");
  const at = /^\d{4}-\d{2}-\d{2}$/.test(day) ? vnLocalToIso(`${day}T00:00`) : null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_cash_voucher", {
    p_tenant: session.tenant.id,
    p_voucher: { kind: "opening", direction: "in", fund, amount: money(fd, "amount"), occurred_at: at, note: "Số dư đầu kỳ" },
  });
  if (error) {
    await setFlash("error", cashErrorMessage(error.message));
    return;
  }
  refresh(slug);
  await setFlash("ok", "Đã ghi số dư đầu kỳ.");
}

/** "Hủy phiếu" (CASH-04): vô hiệu, không xóa. */
export async function cancelVoucher(fd: FormData) {
  const slug = str(fd, "slug");
  await requireCashbook(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_cash_voucher", { p_voucher: str(fd, "id") });
  if (error) {
    await setFlash("error", cashErrorMessage(error.message));
    return;
  }
  refresh(slug);
  await setFlash("ok", "Đã hủy phiếu.");
}

/** Sửa ghi chú + thời gian. Số tiền / loại sai thì hủy rồi lập lại. */
export async function updateVoucherMeta(fd: FormData) {
  const slug = str(fd, "slug");
  await requireCashbook(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_cash_voucher_meta", {
    p_voucher: str(fd, "id"),
    p_note: str(fd, "note").slice(0, 500),
    p_occurred_at: vnLocalToIso(str(fd, "occurred_at")),
  });
  if (error) {
    await setFlash("error", cashErrorMessage(error.message));
    return;
  }
  refresh(slug);
  await setFlash("ok", "Đã lưu phiếu.");
}

/** Thêm / sửa loại thu chi. Đổi mặc định "Hạch toán" không đổi phiếu đã lập. */
export async function saveCategory(fd: FormData) {
  const slug = str(fd, "slug");
  const session = await requireCashbook(slug);
  const name = str(fd, "name").slice(0, 60);
  if (!name) {
    await setFlash("error", "Nhập tên loại.");
    return;
  }
  const group = str(fd, "cost_group") as CostGroup;
  const cost_group = group in COST_GROUP_LABEL ? group : "e";
  const default_in_pnl = fd.get("default_in_pnl") === "on";
  const id = str(fd, "id");
  const supabase = await createClient();
  const q = id
    ? supabase.from("cash_categories").update({ name, cost_group, default_in_pnl }).eq("id", id).eq("tenant_id", session.tenant.id)
    : supabase.from("cash_categories").insert({
        tenant_id: session.tenant.id,
        direction: str(fd, "direction") === "in" ? "in" : "out",
        name,
        cost_group,
        default_in_pnl,
      });
  const { error } = await q;
  if (error) {
    await setFlash("error", error.code === "23505" ? "Đã có loại cùng tên." : `Lưu lỗi: ${error.message}`);
    return;
  }
  refresh(slug);
  await setFlash("ok", id ? "Đã lưu loại." : "Đã thêm loại.");
}

export async function setCategoryActive(fd: FormData) {
  const slug = str(fd, "slug");
  const session = await requireCashbook(slug);
  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_categories")
    .update({ active: str(fd, "active") === "true" })
    .eq("id", str(fd, "id"))
    .eq("tenant_id", session.tenant.id);
  if (error) {
    await setFlash("error", error.code === "23505" ? "Đã có loại cùng tên đang dùng." : `Lưu lỗi: ${error.message}`);
    return;
  }
  refresh(slug);
  await setFlash("ok", "Đã cập nhật loại.");
}
