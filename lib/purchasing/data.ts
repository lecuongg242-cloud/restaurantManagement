import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE_UNIT_LABEL, type BaseUnit } from "@/lib/inventory/types";

export type Supplier = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_code: string | null;
  note: string | null;
  active: boolean;
};

export type SupplierRow = Supplier & { totalPurchase: number; debt: number };

const COLS = "id, code, name, phone, email, address, tax_code, note, active";

/** Danh sách NCC kèm "Tổng mua" + "Nợ cần trả hiện tại" (supplier_summaries, 0076). */
export async function listSuppliers(
  supabase: SupabaseClient,
  tenantId: string,
  opts: { q?: string } = {}
): Promise<SupplierRow[]> {
  let query = supabase.from("suppliers").select(COLS).eq("tenant_id", tenantId).order("active", { ascending: false }).order("name");
  const q = opts.q?.trim();
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,code.ilike.%${safe}%`);
  }
  const [{ data, error }, sums] = await Promise.all([query, supabase.rpc("supplier_summaries", { p_tenant: tenantId })]);
  if (error) throw new Error(`Đọc nhà cung cấp lỗi: ${error.message}`);
  const byId = new Map(
    ((sums.data ?? []) as { supplier_id: string; total_purchase: number; debt: number }[]).map((s) => [s.supplier_id, s])
  );
  return ((data ?? []) as Supplier[]).map((s) => ({
    ...s,
    totalPurchase: Number(byId.get(s.id)?.total_purchase ?? 0),
    debt: Number(byId.get(s.id)?.debt ?? 0),
  }));
}

export async function getSupplier(supabase: SupabaseClient, tenantId: string, id: string): Promise<Supplier | null> {
  const { data } = await supabase.from("suppliers").select(COLS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  return (data as Supplier | null) ?? null;
}

/** NCC đang hoạt động cho ô chọn trên phiếu nhập. */
export async function activeSupplierOptions(supabase: SupabaseClient, tenantId: string) {
  const { data } = await supabase
    .from("suppliers")
    .select("id, code, name, phone")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name");
  return (data ?? []) as { id: string; code: string; name: string; phone: string | null }[];
}

export type ReceiptStatus = "draft" | "done" | "cancelled";

export type ReceiptListRow = {
  id: string;
  code: string;
  status: ReceiptStatus;
  doc_date: string;
  stock_date: string | null;
  /** Thời gian nhập (P34); phiếu tạm chưa chọn giờ = null. */
  received_at: string | null;
  total: number;
  paid: number;
  supplier: { id: string; name: string } | null;
  lineCount: number;
  /** "Thịt bò 2 kg · Hành 0,5 kg" — tên + số lượng theo đơn vị nhập, đúng thứ tự trên phiếu. */
  items: string[];
};

/**
 * Phiếu nhập mới nhất trước. `paid`: phiếu có NCC = Σ phân bổ (0078 — gồm cả trả nợ sau này); phiếu không NCC = Σ phiếu
 * chi còn hiệu lực gắn phiếu (mua lẻ trả đủ, không có công nợ nên không phân bổ).
 */
export async function listReceipts(
  supabase: SupabaseClient,
  tenantId: string,
  f: { status?: ReceiptStatus; supplierId?: string; from?: string; to?: string; limit?: number } = {}
): Promise<ReceiptListRow[]> {
  let q = supabase
    .from("purchase_receipts")
    .select(
      "id, code, status, doc_date, stock_date, received_at, total, supplier:suppliers(id, name), " +
        "purchase_receipt_lines(qty, purchase_unit, sort, ingredients(name, base_unit)), " +
        "cash_vouchers(amount, status), cash_voucher_allocations(amount)"
    )
    .eq("tenant_id", tenantId)
    // Phiếu tạm chưa chọn giờ nằm theo giờ tạo (P34: sắp theo thời gian nhập).
    .order("doc_date", { ascending: false })
    .order("received_at", { ascending: false, nullsFirst: true })
    .order("code", { ascending: false })
    .limit(f.limit ?? 200);
  if (f.status) q = q.eq("status", f.status);
  if (f.supplierId) q = q.eq("supplier_id", f.supplierId);
  if (f.from) q = q.gte("doc_date", f.from);
  if (f.to) q = q.lte("doc_date", f.to);
  const { data, error } = await q;
  if (error) throw new Error(`Đọc phiếu nhập lỗi: ${error.message}`);
  type Raw = {
    id: string; code: string; status: ReceiptStatus; doc_date: string; stock_date: string | null; received_at: string | null;
    total: number;
    supplier: { id: string; name: string } | { id: string; name: string }[] | null;
    purchase_receipt_lines: {
      qty: number; purchase_unit: string | null; sort: number;
      ingredients: { name: string; base_unit: BaseUnit } | { name: string; base_unit: BaseUnit }[] | null;
    }[];
    cash_vouchers: { amount: number; status: string }[];
    cash_voucher_allocations: { amount: number }[];
  };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id,
    code: r.code,
    status: r.status,
    doc_date: r.doc_date,
    stock_date: r.stock_date,
    received_at: r.received_at,
    total: r.total,
    paid: (Array.isArray(r.supplier) ? r.supplier[0] : r.supplier)
      ? r.cash_voucher_allocations.reduce((s, a) => s + a.amount, 0)
      : r.cash_vouchers.filter((v) => v.status === "active").reduce((s, v) => s + v.amount, 0),
    supplier: Array.isArray(r.supplier) ? r.supplier[0] ?? null : r.supplier,
    lineCount: r.purchase_receipt_lines.length,
    items: [...r.purchase_receipt_lines]
      .sort((a, b) => a.sort - b.sort)
      .map((l) => {
        const ing = Array.isArray(l.ingredients) ? l.ingredients[0] : l.ingredients;
        const unit = l.purchase_unit ?? (ing ? BASE_UNIT_LABEL[ing.base_unit] : "");
        return `${ing?.name ?? "?"} ${Number(l.qty).toLocaleString("vi-VN", { maximumFractionDigits: 3 })} ${unit}`.trim();
      }),
  }));
}

export type ReceiptDetail = {
  id: string;
  code: string;
  status: ReceiptStatus;
  doc_date: string;
  stock_date: string | null;
  received_at: string | null;
  subtotal: number;
  discount: number;
  total: number;
  pay_now: number;
  pay_fund: "cash" | "bank";
  note: string | null;
  supplier_id: string | null;
  copied_from: string | null;
  created_at: string;
  completed_at: string | null;
  completed_by: string | null;
  cancelled_at: string | null;
  lines: {
    ingredient_id: string; name: string; qty: number; purchase_unit: string | null; base_unit: string;
    unit_price: number | null; amount: number | null;
  }[];
  vouchers: { id: string; code: string; amount: number; fund: "cash" | "bank"; status: string; occurred_at: string; source: string }[];
  /** Lịch sử thanh toán: phiếu có NCC = các phần phân bổ (kể cả trả nợ sau); không NCC = phiếu chi đi kèm. */
  payments: { voucher_id: string; code: string; amount: number; fund: "cash" | "bank"; status: string; occurred_at: string }[];
  paid: number;
};

export async function getReceipt(supabase: SupabaseClient, tenantId: string, id: string): Promise<ReceiptDetail | null> {
  const { data } = await supabase
    .from("purchase_receipts")
    .select(
      "id, code, status, doc_date, stock_date, received_at, subtotal, discount, total, pay_now, pay_fund, note, supplier_id, copied_from, created_at, completed_at, completed_by, cancelled_at, " +
        "purchase_receipt_lines(ingredient_id, qty, purchase_unit, unit_price, amount, sort, ingredients(name, base_unit)), " +
        "cash_vouchers(id, code, amount, fund, status, occurred_at, source), " +
        "cash_voucher_allocations(amount, voucher:cash_vouchers(id, code, fund, status, occurred_at))"
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  type L = {
    ingredient_id: string; qty: number; purchase_unit: string | null; unit_price: number | null; amount: number | null; sort: number;
    ingredients: { name: string; base_unit: string } | { name: string; base_unit: string }[] | null;
  };
  type V = { id: string; code: string; fund: "cash" | "bank"; status: string; occurred_at: string };
  const r = data as unknown as Omit<ReceiptDetail, "lines" | "vouchers" | "payments" | "paid"> & {
    purchase_receipt_lines: L[];
    cash_vouchers: ReceiptDetail["vouchers"];
    cash_voucher_allocations: { amount: number; voucher: V | V[] | null }[];
  };
  const { purchase_receipt_lines, cash_vouchers, cash_voucher_allocations, ...head } = r;
  const payments: ReceiptDetail["payments"] = head.supplier_id
    ? cash_voucher_allocations.flatMap((a) => {
        const v = Array.isArray(a.voucher) ? a.voucher[0] : a.voucher;
        return v ? [{ voucher_id: v.id, code: v.code, amount: a.amount, fund: v.fund, status: v.status, occurred_at: v.occurred_at }] : [];
      })
    : cash_vouchers.map((v) => ({ voucher_id: v.id, code: v.code, amount: v.amount, fund: v.fund, status: v.status, occurred_at: v.occurred_at }));
  payments.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  return {
    ...head,
    payments,
    paid: payments.filter((p) => p.status === "active").reduce((s, p) => s + p.amount, 0),
    lines: [...purchase_receipt_lines]
      .sort((a, b) => a.sort - b.sort)
      .map((l) => {
        const ing = Array.isArray(l.ingredients) ? l.ingredients[0] : l.ingredients;
        return {
          ingredient_id: l.ingredient_id, name: ing?.name ?? "?", qty: Number(l.qty), purchase_unit: l.purchase_unit,
          base_unit: ing?.base_unit ?? "", unit_price: l.unit_price, amount: l.amount,
        };
      }),
    vouchers: [...cash_vouchers].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
  };
}
