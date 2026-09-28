import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ReportRange } from "@/lib/billing/report-range";

/**
 * Báo cáo sâu P16 (16-02, 16-03) — MỘT nguồn số cho màn hình và file Excel (16-04). Gọi RPC mảng chi nhánh (0068):
 * trang một chi nhánh truyền [chi nhánh đó], trang "Tất cả chi nhánh" truyền cả danh sách.
 */
export type DongNhanVien = {
  kind: "staff" | "customer" | "unknown";
  membershipId: string | null;
  ten: string;
  vaiTro: string;
  dangLam: boolean;
  donNhan: number;
  monNhan: number;
  tienHangNhan: number;
  hoaDonThu: number;
  tienThu: number;
  tienMat: number;
  chuyenKhoan: number;
  monHuy: number;
  tienHuy: number;
  lanGiam: number;
  tienGiam: number;
};

export type DongBan = {
  khu: string;
  ban: string;
  luot: number;
  phutTb: number | null;
  doanhThu: number;
  moiLuot: number | null;
  moiGio: number | null;
};

export type DiemNhomMon = { ky: string; nhom: string; soLuong: number; doanhThu: number };

type Client = Awaited<ReturnType<typeof createClient>>;
async function rpc<T>(c: Client, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(`Báo cáo: lỗi khi gọi ${fn} — ${error.message}`);
  return (data ?? []) as T[];
}
const n = (v: unknown) => Number(v ?? 0);

export async function getBaoCaoNhanVien(tenantIds: string[], range: ReportRange): Promise<DongNhanVien[]> {
  const rows = await rpc<Record<string, unknown>>(await createClient(), "report_by_staff", {
    p_tenants: tenantIds,
    p_from: range.fromUtc,
    p_to: range.toUtc,
  });
  return rows.map((r) => ({
    kind: r.kind as DongNhanVien["kind"],
    membershipId: (r.membership_id as string | null) ?? null,
    ten: String(r.display_name ?? "—"),
    vaiTro: String(r.role ?? ""),
    dangLam: Boolean(r.active),
    donNhan: n(r.orders_taken),
    monNhan: n(r.items_taken),
    tienHangNhan: n(r.revenue_taken),
    hoaDonThu: n(r.bills_received),
    tienThu: n(r.amount_received),
    tienMat: n(r.amount_cash),
    chuyenKhoan: n(r.amount_transfer),
    monHuy: n(r.items_cancelled),
    tienHuy: n(r.amount_cancelled),
    lanGiam: n(r.discounts_approved),
    tienGiam: n(r.amount_discounted),
  }));
}

export async function getBaoCaoBan(tenantIds: string[], range: ReportRange): Promise<DongBan[]> {
  const rows = await rpc<Record<string, unknown>>(await createClient(), "report_table_usage", {
    p_tenants: tenantIds,
    p_from: range.fromUtc,
    p_to: range.toUtc,
  });
  return rows.map((r) => ({
    khu: String(r.area_name ?? ""),
    ban: String(r.table_name ?? ""),
    luot: n(r.sessions),
    phutTb: r.avg_minutes == null ? null : n(r.avg_minutes),
    doanhThu: n(r.revenue),
    moiLuot: r.revenue_per_session == null ? null : n(r.revenue_per_session),
    moiGio: r.revenue_per_hour == null ? null : n(r.revenue_per_hour),
  }));
}

/** Nhóm món theo tuần (thứ Hai, giờ VN). Nhãn kỳ "dd/mm". */
export async function getNhomMonTheoTuan(tenantIds: string[], range: ReportRange): Promise<DiemNhomMon[]> {
  const rows = await rpc<Record<string, unknown>>(await createClient(), "report_category_trend", {
    p_tenants: tenantIds,
    p_from: range.fromUtc,
    p_to: range.toUtc,
    p_bucket: "week",
  });
  return rows.map((r) => {
    const vn = new Date(Date.parse(String(r.bucket_start)) + 7 * 3600e3);
    return {
      ky: `${String(vn.getUTCDate()).padStart(2, "0")}/${String(vn.getUTCMonth() + 1).padStart(2, "0")}`,
      nhom: String(r.name ?? "Khác"),
      soLuong: n(r.qty),
      doanhThu: n(r.revenue),
    };
  });
}

/** Chi tiết một dòng của báo cáo nhân viên (16-02 "bấm vào một nhân viên") — 0074, phân trang ở SQL. */
export type GocXemNhanVien = "nhan" | "thu" | "huy";
export type DongChiTietNhanVien = {
  luc: string;
  tenantId: string;
  soHd: number | null;
  soDon: number | null;
  noi: string | null;
  chiTiet: string | null;
  soLuong: number | null;
  tien: number;
  phuongThuc: string | null;
};

export async function getChiTietNhanVien(
  tenantIds: string[],
  range: ReportRange,
  ai: { kind: DongNhanVien["kind"]; membershipId: string | null },
  xem: GocXemNhanVien,
  trang: { offset: number; limit: number }
): Promise<{ tong: number; rows: DongChiTietNhanVien[] }> {
  const rows = await rpc<Record<string, unknown>>(await createClient(), "report_staff_detail", {
    p_tenants: tenantIds,
    p_from: range.fromUtc,
    p_to: range.toUtc,
    p_kind: ai.kind,
    p_membership: ai.membershipId,
    p_view: xem,
    p_offset: trang.offset,
    p_limit: trang.limit,
  });
  return {
    tong: rows.length ? n(rows[0].total_count) : 0,
    rows: rows.map((r) => ({
      luc: String(r.at),
      tenantId: String(r.tenant_id),
      soHd: r.bill_no == null ? null : n(r.bill_no),
      soDon: r.kitchen_no == null ? null : n(r.kitchen_no),
      noi: (r.place as string | null) ?? null,
      chiTiet: (r.detail as string | null) ?? null,
      soLuong: r.qty == null ? null : n(r.qty),
      tien: n(r.amount),
      phuongThuc: (r.method as string | null) ?? null,
    })),
  };
}
