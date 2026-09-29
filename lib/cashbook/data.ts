import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CostGroup, Fund } from "./labels";

export type CashCategory = {
  id: string;
  direction: "in" | "out";
  name: string;
  cost_group: CostGroup;
  default_in_pnl: boolean;
  active: boolean;
};

export type CashFlow = {
  kind: "voucher" | "sales";
  voucher_id: string | null;
  code: string | null;
  occurred_at: string;
  direction: "in" | "out";
  fund: Fund;
  amount: number;
  status: "active" | "cancelled";
  source: string;
  category: string | null;
  counterparty: string | null;
  note: string | null;
  sales_count: number | null;
};

export type CashSummary = { opening: number; totalIn: number; totalOut: number; closing: number };

/** Danh mục loại thu/chi của quán; lần đầu mở tự tạo danh mục mặc định (QD-027 D10). */
export async function loadCategories(supabase: SupabaseClient, tenantId: string): Promise<CashCategory[]> {
  const read = () =>
    supabase
      .from("cash_categories")
      .select("id, direction, name, cost_group, default_in_pnl, active")
      .eq("tenant_id", tenantId)
      .order("sort")
      .order("name");
  let { data } = await read();
  if (!data || data.length === 0) {
    await supabase.rpc("ensure_cash_categories", { p_tenant: tenantId });
    ({ data } = await read());
  }
  return (data ?? []) as CashCategory[];
}

/** Sổ quỹ một quỹ (hoặc Tổng quỹ) trong [fromUtc, toUtc): 4 số tổng + các dòng, mới nhất trước. */
export async function loadCashbook(
  supabase: SupabaseClient,
  tenantId: string,
  fund: Fund | "all",
  fromUtc: string,
  toUtc: string
): Promise<{ summary: CashSummary; flows: CashFlow[] }> {
  const args = { p_tenant: tenantId, p_fund: fund, p_from: fromUtc, p_to: toUtc };
  const [s, f] = await Promise.all([supabase.rpc("cashbook_summary", args), supabase.rpc("cashbook_flows", args)]);
  if (s.error) throw new Error(`Đọc sổ quỹ lỗi: ${s.error.message}`);
  if (f.error) throw new Error(`Đọc sổ quỹ lỗi: ${f.error.message}`);
  const r = (s.data as { opening: number; total_in: number; total_out: number; closing: number }[])[0];
  const flows = ((f.data ?? []) as CashFlow[])
    .map((x) => ({ ...x, amount: Number(x.amount), sales_count: x.sales_count === null ? null : Number(x.sales_count) }))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || (b.code ?? "").localeCompare(a.code ?? ""));
  return {
    summary: {
      opening: Number(r?.opening ?? 0),
      totalIn: Number(r?.total_in ?? 0),
      totalOut: Number(r?.total_out ?? 0),
      closing: Number(r?.closing ?? 0),
    },
    flows,
  };
}

/** Quỹ đã có phiếu "Số dư đầu kỳ" còn hiệu lực chưa. */
export async function fundsWithOpening(supabase: SupabaseClient, tenantId: string): Promise<Set<Fund>> {
  const { data } = await supabase
    .from("cash_vouchers")
    .select("fund")
    .eq("tenant_id", tenantId)
    .eq("source", "opening")
    .eq("status", "active");
  return new Set(((data ?? []) as { fund: Fund }[]).map((d) => d.fund));
}

export type VoucherDetail = {
  id: string;
  code: string;
  direction: "in" | "out";
  fund: Fund;
  amount: number;
  occurred_at: string;
  source: string;
  status: "active" | "cancelled";
  in_pnl: boolean;
  note: string | null;
  counterparty_kind: string | null;
  counterparty_name: string | null;
  source_doc_kind: string | null;
  source_doc_no: string | null;
  source_doc_date: string | null;
  cancelled_at: string | null;
  purchase_receipt_id: string | null;
  category: { name: string; cost_group: CostGroup } | null;
  supplier: { id: string; name: string } | null;
  receipt: { id: string; code: string } | null;
};

export async function getVoucher(supabase: SupabaseClient, tenantId: string, id: string): Promise<VoucherDetail | null> {
  const { data } = await supabase
    .from("cash_vouchers")
    .select(
      "id, code, direction, fund, amount, occurred_at, source, status, in_pnl, note, counterparty_kind, counterparty_name, " +
        "source_doc_kind, source_doc_no, source_doc_date, cancelled_at, purchase_receipt_id, " +
        "category:cash_categories(name, cost_group), supplier:suppliers(id, name), receipt:purchase_receipts(id, code)"
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const r = data as unknown as VoucherDetail & {
    category: VoucherDetail["category"] | VoucherDetail["category"][];
    supplier: VoucherDetail["supplier"] | VoucherDetail["supplier"][];
    receipt: VoucherDetail["receipt"] | VoucherDetail["receipt"][];
  };
  return { ...r, category: one(r.category), supplier: one(r.supplier), receipt: one(r.receipt) };
}
