import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Danh sách khách (P16 16-05, CUST-02/03) — gọi RPC 0069/0070. Chỉ chủ / quản lý (RPC tự lọc bằng manager_tenants).
 * Trang một chi nhánh truyền [chi nhánh đó]; "Tất cả chi nhánh" truyền cả chuỗi ⇒ khách đến nhiều chi nhánh gộp một dòng.
 */
export type Khach = {
  phone: string;
  ten: string | null;
  soLan: number;
  tongChi: number;
  lanDau: string;
  ganNhat: string;
  kenh: string | null;
  datBan: number;
  ghiChu: string | null;
};
export type SapXepKhach = "spent" | "visits" | "recent";
export const MOI_TRANG = 50;

export async function danhSachKhach(
  tenantIds: string[],
  opts: { q?: string; sort?: SapXepKhach; page?: number; limit?: number }
): Promise<{ rows: Khach[]; tong: number }> {
  const supabase = await createClient();
  const limit = opts.limit ?? MOI_TRANG;
  const { data, error } = await supabase.rpc("customer_list", {
    p_tenants: tenantIds,
    p_search: opts.q?.trim() || null,
    p_sort: opts.sort ?? "spent",
    p_limit: limit,
    p_offset: Math.max(0, (opts.page ?? 1) - 1) * limit,
  });
  if (error) throw new Error(`Khách hàng: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    tong: rows.length ? Number(rows[0].total_count) : 0,
    rows: rows.map((r) => ({
      phone: String(r.phone),
      ten: (r.last_name as string | null) ?? null,
      soLan: Number(r.visits),
      tongChi: Number(r.total_spent),
      lanDau: String(r.first_seen),
      ganNhat: String(r.last_seen),
      kenh: (r.top_channel as string | null) ?? null,
      datBan: Number(r.reservations),
      ghiChu: (r.note as string | null) ?? null,
    })),
  };
}

export type DongLichSu = {
  loai: "bill" | "reservation";
  tenantId: string;
  id: string;
  soHd: number | null;
  luc: string;
  tien: number | null;
  kenh: string | null;
  chiTiet: string | null;
};

export async function lichSuKhach(tenantIds: string[], phone: string): Promise<DongLichSu[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_history", { p_tenants: tenantIds, p_phone: phone });
  if (error) throw new Error(`Khách hàng: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    loai: r.kind as DongLichSu["loai"],
    tenantId: String(r.tenant_id),
    id: String(r.ref_id),
    soHd: r.bill_no == null ? null : Number(r.bill_no),
    luc: String(r.at),
    tien: r.amount == null ? null : Number(r.amount),
    kenh: (r.channel as string | null) ?? null,
    chiTiet: (r.detail as string | null) ?? null,
  }));
}

/** Tỷ lệ doanh thu có SĐT khách trong khoảng [tu, den) — để chủ quán biết danh sách phủ được bao nhiêu. */
export async function phuSdt(tenantIds: string[], tu: string, den: string): Promise<{ coSdt: number; tong: number }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("customer_coverage", { p_tenants: tenantIds, p_from: tu, p_to: den });
  const r = ((data ?? []) as { revenue_with_phone: number; revenue_total: number }[])[0];
  return { coSdt: Number(r?.revenue_with_phone ?? 0), tong: Number(r?.revenue_total ?? 0) };
}

export const KENH: Record<string, string> = { dine_in: "Tại bàn", takeaway: "Mang về", delivery: "Giao hàng" };
