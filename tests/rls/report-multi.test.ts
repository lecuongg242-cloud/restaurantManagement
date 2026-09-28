import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A } from "./setup";
import { adminClient, cleanupFixtures, seedFixtures } from "./fixtures";

/**
 * P15 15-04 (BRANCH-05) — RPC báo cáo theo mảng chi nhánh (0064). Bản một quán giữ nguyên; bản mảng phải cho
 * ĐÚNG CÙNG SỐ khi truyền [một quán] — kiểm cả trên qt-food (dữ liệu bán thật, đọc bằng service role vì RPC là
 * security invoker) — và tổng nhiều quán = Σ từng quán. RLS lọc chi nhánh không có quyền.
 */
let tenantA = "";
let tenantB = "";
let qtFood = "";
let ownerA: SupabaseClient;
const TU = "2020-01-01T00:00:00Z";
const DEN = "2031-01-01T00:00:00Z";
const KY: [string, string][] = [
  [TU, DEN],
  [new Date(Date.now() - 30 * 86400e3).toISOString(), new Date().toISOString()],
];

const tong = (rows: { revenue?: number; amount?: number; qty?: number }[] | null, k: "revenue" | "amount" | "qty") =>
  (rows ?? []).reduce((s, r) => s + Number(r[k] ?? 0), 0);

beforeAll(async () => {
  const ids = await seedFixtures();
  tenantA = ids.tenantA;
  tenantB = ids.tenantB;
  qtFood = ((await adminClient().from("tenants").select("id").eq("slug", "qt-food").single()).data!.id) as string;
  ownerA = await signInAs(OWNER_A.email, OWNER_A.password);
}, 120_000);

afterAll(async () => {
  await cleanupFixtures();
}, 120_000);

describe("bản mảng [một quán] = bản một quán", () => {
  it.each(["A", "qt-food"])("%s: tổng, biểu đồ, nhóm món, phương thức, món bán chạy khớp", async (ten) => {
    const c = adminClient();
    const t = ten === "A" ? tenantA : qtFood;
    for (const [tu, den] of KY) {
      const don = { p_tenant: t, p_from: tu, p_to: den };
      const mang = { p_tenants: [t], p_from: tu, p_to: den };
      expect((await c.rpc("report_summary_multi", mang)).data).toEqual((await c.rpc("report_summary", don)).data);
      expect((await c.rpc("report_series_multi", { ...mang, p_grain: "day" })).data).toEqual(
        (await c.rpc("report_series", { ...don, p_grain: "day" })).data
      );
      expect((await c.rpc("report_by_category_multi", mang)).data).toEqual((await c.rpc("report_by_category", don)).data);
      expect((await c.rpc("report_payments_multi", mang)).data).toEqual((await c.rpc("report_payments", don)).data);
      // Món bán chạy gom theo món (source_id) thay vì theo tên → so TỔNG số lượng + doanh thu.
      const topM = (await c.rpc("report_top_items_multi", { ...mang, p_limit: 100000 })).data;
      const topD = (await c.rpc("report_top_items", { ...don, p_limit: 100000 })).data;
      expect(tong(topM, "qty")).toBe(tong(topD, "qty"));
      expect(tong(topM, "revenue")).toBe(tong(topD, "revenue"));
    }
  }, 120_000);
});

describe("gộp nhiều chi nhánh", () => {
  it("tổng [A, B] = tổng A + tổng B; report_by_branch khớp từng quán", async () => {
    const c = adminClient();
    const a = (await c.rpc("report_summary", { p_tenant: tenantA, p_from: TU, p_to: DEN })).data![0];
    const b = (await c.rpc("report_summary", { p_tenant: tenantB, p_from: TU, p_to: DEN })).data![0];
    const ab = (await c.rpc("report_summary_multi", { p_tenants: [tenantA, tenantB], p_from: TU, p_to: DEN })).data![0];
    expect(Number(ab.total_revenue)).toBe(Number(a.total_revenue) + Number(b.total_revenue));
    expect(Number(ab.bill_count)).toBe(Number(a.bill_count) + Number(b.bill_count));

    const rows = (await c.rpc("report_by_branch", { p_tenants: [tenantA, tenantB], p_from: TU, p_to: DEN })).data!;
    const theo = new Map(rows.map((r: { tenant_id: string; revenue: number }) => [r.tenant_id, Number(r.revenue)]));
    expect(theo.get(tenantA)).toBe(Number(a.total_revenue));
    expect(theo.get(tenantB)).toBe(Number(b.total_revenue));
  }, 60_000);

  it("RLS: owner A truyền [A, B] → chỉ ra số của A, không lỗi", async () => {
    const a = (await ownerA.rpc("report_summary", { p_tenant: tenantA, p_from: TU, p_to: DEN })).data![0];
    const { data, error } = await ownerA.rpc("report_summary_multi", { p_tenants: [tenantA, tenantB], p_from: TU, p_to: DEN });
    expect(error).toBeNull();
    expect(data![0]).toEqual(a);
    const rows = (await ownerA.rpc("report_by_branch", { p_tenants: [tenantA, tenantB], p_from: TU, p_to: DEN })).data!;
    expect(rows.map((r: { tenant_id: string }) => r.tenant_id)).toEqual([tenantA]);
  }, 60_000);

  it("anon không gọi được RPC mới", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await anon.rpc("report_summary_multi", { p_tenants: [tenantA], p_from: TU, p_to: DEN });
    expect(error).not.toBeNull();
  }, 60_000);
});
