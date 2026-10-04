import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, tenantIdBySlug, OWNER_A, OWNER_B } from "./setup";
import { danhSachHoaDon, SO_DONG } from "@/lib/reports/hoa-don";
import { resolveRange } from "@/lib/billing/report-range";

/**
 * MGR-03 (P30) — tab Hóa đơn của app Quản lý: đọc bằng phiên của chủ quán (RLS), CÙNG điều kiện với báo cáo (BILL-05:
 * đã thanh toán, bỏ vỏ chia đều, theo ngày kinh doanh) ⇒ số hóa đơn = số "Số hóa đơn" của báo cáo cùng kỳ.
 */
let a: SupabaseClient;
let tenantA = "";
let tenantB = "";
const ky = resolveRange({ preset: "30d" });

beforeAll(async () => {
  [a, tenantA, tenantB] = await Promise.all([signInAs(OWNER_A.email, OWNER_A.password), tenantIdBySlug(OWNER_A.slug), tenantIdBySlug(OWNER_B.slug)]);
});

describe("danhSachHoaDon", () => {
  it("tổng số hóa đơn khớp report_summary cùng kỳ", async () => {
    const { data } = await a.rpc("report_summary", { p_tenant: tenantA, p_from: ky.fromUtc, p_to: ky.toUtc });
    const kq = await danhSachHoaDon(a, tenantA, ky, {});
    expect(kq.tong).toBe(Number(data![0].bill_count));
    expect(kq.dong.length).toBe(Math.min(kq.tong, SO_DONG));
  });

  it("mới nhất trước; dòng có số HĐ, nơi, tiền, phương thức", async () => {
    const { dong } = await danhSachHoaDon(a, tenantA, ky, {});
    expect(dong.length).toBeGreaterThan(0); // quán demo pho-viet có hóa đơn trong 30 ngày
    for (let i = 1; i < dong.length; i++) expect((dong[i - 1].luc ?? "") >= (dong[i].luc ?? "")).toBe(true);
    for (const d of dong) {
      expect(d.tong).toBeGreaterThanOrEqual(0);
      expect(d.ban.length).toBeGreaterThan(0);
      expect(d.phuongThuc).toMatch(/Tiền mặt|Chuyển khoản|—/);
    }
  });

  it("tìm theo số hóa đơn → đúng hóa đơn đó", async () => {
    const { dong } = await danhSachHoaDon(a, tenantA, ky, {});
    const mau = dong.find((d) => d.soHd !== null);
    if (!mau) return;
    const kq = await danhSachHoaDon(a, tenantA, ky, { tim: String(mau.soHd) });
    expect(kq.dong.map((d) => d.id)).toContain(mau.id);
  });

  it("chủ quán A truyền id quán B → 0 hóa đơn (RLS)", async () => {
    const kq = await danhSachHoaDon(a, tenantB, ky, {});
    expect(kq.tong).toBe(0);
    expect(kq.dong).toEqual([]);
  });
});
