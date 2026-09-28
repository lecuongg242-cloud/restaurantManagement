import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B } from "./setup";
import { adminClient, cleanupFixtures, seedFixtures } from "./fixtures";

/**
 * P16 (16-02, 16-03, 16-05) trên DB thật, quán demo pho-viet (A). Số của báo cáo mới phải khớp báo cáo cũ cùng kỳ:
 *  - Σ thu theo nhân viên = Σ phương thức thanh toán; Σ tiền hàng theo phục vụ = Σ món bán chạy.
 *  - Σ doanh thu theo bàn = doanh thu kỳ.
 * Quyền: thu ngân / chủ quán khác nhận 0 dòng; ghi chú khách chỉ chủ / quản lý của quán.
 */
const TU = "2020-01-01T00:00:00Z";
const DEN = "2031-01-01T00:00:00Z";
const TAG = crypto.randomUUID().slice(0, 6);
let tenantA = "";
let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let cashierA: SupabaseClient;
const tam: string[] = [];

beforeAll(async () => {
  tenantA = (await seedFixtures()).tenantA;
  const email = `p16-cashier-${TAG}@test.local`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  tam.push(data.user!.id);
  await adminClient().from("memberships").insert({ tenant_id: tenantA, user_id: data.user!.id, role: "cashier", display_name: "P16", active: true });
  cashierA = await signInAs(email, password);
  ownerA = await signInAs(OWNER_A.email, OWNER_A.password);
  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);
}, 120_000);

afterAll(async () => {
  const a = adminClient();
  await a.from("customer_notes").delete().eq("tenant_id", tenantA).like("note", `%${TAG}%`);
  await a.from("memberships").delete().in("user_id", tam);
  for (const id of tam) await a.auth.admin.deleteUser(id);
  await cleanupFixtures();
}, 120_000);

const ky = { p_from: TU, p_to: DEN };
const tong = (rows: Record<string, unknown>[] | null, k: string) => (rows ?? []).reduce((s, r) => s + Number(r[k] ?? 0), 0);

describe("report_by_staff", () => {
  it("Σ thu theo nhân viên = Σ phương thức TT; Σ tiền hàng theo phục vụ = Σ món bán chạy", async () => {
    const { data: nv, error } = await ownerA.rpc("report_by_staff", { p_tenants: [tenantA], ...ky });
    expect(error).toBeNull();
    const { data: pt } = await ownerA.rpc("report_payments", { p_tenant: tenantA, ...ky });
    const { data: mon } = await ownerA.rpc("report_top_items", { p_tenant: tenantA, ...ky, p_limit: 100000 });
    expect(tong(nv, "amount_received")).toBe(tong(pt, "amount"));
    expect(tong(nv, "revenue_taken")).toBe(tong(mon, "revenue"));
    expect(tong(nv, "amount_received")).toBeGreaterThan(0);
  }, 60_000);

  it("nhân viên đã bị xóa vẫn có dòng, nhãn “Nhân viên đã xóa”", async () => {
    const a = adminClient();
    const { data: m } = await a.from("memberships").insert({ tenant_id: tenantA, role: "cashier", display_name: `Tạm ${TAG}`, active: true }).select("id").single();
    const { data: p } = await a.from("payments").select("id, received_by").eq("tenant_id", tenantA).limit(1).single();
    await a.from("payments").update({ received_by: m!.id }).eq("id", p!.id);
    await a.from("memberships").delete().eq("id", m!.id);
    const { data: nv } = await ownerA.rpc("report_by_staff", { p_tenants: [tenantA], ...ky });
    const dong = (nv ?? []).find((r: { membership_id: string }) => r.membership_id === m!.id);
    expect(dong?.display_name).toBe("Nhân viên đã xóa");
    await a.from("payments").update({ received_by: p!.received_by }).eq("id", p!.id);
  }, 60_000);

  it("thu ngân gọi → 0 dòng; chủ quán khác truyền id quán A → 0 dòng", async () => {
    expect((await cashierA.rpc("report_by_staff", { p_tenants: [tenantA], ...ky })).data ?? []).toHaveLength(0);
    expect((await ownerB.rpc("report_by_staff", { p_tenants: [tenantA], ...ky })).data ?? []).toHaveLength(0);
  }, 60_000);
});

describe("report_table_usage / report_category_trend", () => {
  it("Σ doanh thu theo bàn (kể cả “Không gắn bàn”) = doanh thu kỳ", async () => {
    const { data: ban, error } = await ownerA.rpc("report_table_usage", { p_tenants: [tenantA], ...ky });
    expect(error).toBeNull();
    const { data: s } = await ownerA.rpc("report_summary", { p_tenant: tenantA, ...ky });
    expect(tong(ban, "revenue")).toBe(Number(s![0].total_revenue));
  }, 60_000);

  it("xu hướng nhóm món: Σ = Σ nhóm món cùng kỳ; tuần bắt đầu thứ Hai giờ VN", async () => {
    const { data: tuan } = await ownerA.rpc("report_category_trend", { p_tenants: [tenantA], ...ky, p_bucket: "week" });
    const { data: nhom } = await ownerA.rpc("report_by_category", { p_tenant: tenantA, ...ky });
    expect(tong(tuan, "revenue")).toBe(tong(nhom, "revenue"));
    for (const r of (tuan ?? []) as { bucket_start: string }[]) {
      const vn = new Date(Date.parse(r.bucket_start) + 7 * 3600e3);
      expect(vn.getUTCDay()).toBe(1);
      expect(vn.getUTCHours()).toBe(0);
    }
  }, 60_000);
});

describe("khách hàng", () => {
  it("customer_list: tổng chi ≤ doanh thu; p_limit > 100 bị kẹp về 100", async () => {
    const { data, error } = await ownerA.rpc("customer_list", { p_tenants: [tenantA], p_limit: 500 });
    expect(error).toBeNull();
    expect((data ?? []).length).toBeLessThanOrEqual(100);
    const { data: cv } = await ownerA.rpc("customer_coverage", { p_tenants: [tenantA], ...ky });
    expect(Number(cv![0].revenue_with_phone)).toBeLessThanOrEqual(Number(cv![0].revenue_total));
  }, 60_000);

  it("một hóa đơn gộp hai đơn có hai SĐT → chỉ quy cho SĐT của đơn ĐẦU TIÊN, không nhân đôi tiền", async () => {
    const a = adminClient();
    // Một hóa đơn đã trả của quán demo có món từ ≥ 2 đơn.
    // PostgREST trả tối đa 1000 dòng/lần ⇒ đọc theo trang.
    const theoBill = new Map<string, Set<string>>();
    for (let tu = 0; tu < 20000; tu += 1000) {
      const { data: bis } = await a
        .from("bill_items")
        .select("bill_id, order_items!inner(order_id), bills!inner(status, split_count)")
        .eq("tenant_id", tenantA)
        .eq("bills.status", "paid")
        .is("bills.split_count", null)
        .order("id")
        .range(tu, tu + 999);
      for (const r of (bis ?? []) as unknown as { bill_id: string; order_items: { order_id: string } }[]) {
        theoBill.set(r.bill_id, (theoBill.get(r.bill_id) ?? new Set()).add(r.order_items.order_id));
      }
      if ((bis ?? []).length < 1000 || [...theoBill.values()].some((v) => v.size >= 2)) break;
    }
    const [billId, dons] = [...theoBill.entries()].find(([, v]) => v.size >= 2) ?? [];
    expect(billId, "quán demo không có hóa đơn gộp ≥ 2 đơn").toBeTruthy();
    const { data: ords } = await a.from("orders").select("id, customer_contact, created_at").in("id", [...dons!]).order("created_at");
    const [dau, sau] = ords!;
    const P1 = "0911" + TAG.replace(/\D/g, "1").padEnd(6, "1").slice(0, 6);
    const P2 = "0922" + TAG.replace(/\D/g, "2").padEnd(6, "2").slice(0, 6);
    try {
      await a.from("orders").update({ customer_contact: { name: `Khách đầu ${TAG}`, phone: P1 } }).eq("id", dau.id);
      await a.from("orders").update({ customer_contact: { name: `Khách sau ${TAG}`, phone: P2 } }).eq("id", sau.id);
      const { data: bill } = await a.from("bills").select("total").eq("id", billId!).single();
      const { data: k1 } = await ownerA.rpc("customer_list", { p_tenants: [tenantA], p_search: P1 });
      const { data: k2 } = await ownerA.rpc("customer_list", { p_tenants: [tenantA], p_search: P2 });
      expect(k1?.[0]).toMatchObject({ phone: P1, last_name: `Khách đầu ${TAG}` });
      expect(Number(k1![0].total_spent)).toBeGreaterThanOrEqual(Number(bill!.total));
      const lich2 = (await ownerA.rpc("customer_history", { p_tenants: [tenantA], p_phone: P2 })).data ?? [];
      expect(lich2.find((h: { ref_id: string }) => h.ref_id === billId), "hóa đơn bị quy cho cả SĐT thứ hai").toBeUndefined();
      expect(k2 ?? []).toHaveLength(0);
    } finally {
      await a.from("orders").update({ customer_contact: dau.customer_contact }).eq("id", dau.id);
      await a.from("orders").update({ customer_contact: sau.customer_contact }).eq("id", sau.id);
    }
  }, 60_000);

  it("thu ngân / chủ quán khác → 0 dòng khách", async () => {
    expect((await cashierA.rpc("customer_list", { p_tenants: [tenantA] })).data ?? []).toHaveLength(0);
    expect((await ownerB.rpc("customer_list", { p_tenants: [tenantA] })).data ?? []).toHaveLength(0);
    expect((await cashierA.rpc("customer_history", { p_tenants: [tenantA], p_phone: "0912345678" })).data ?? []).toHaveLength(0);
  }, 60_000);

  it("ghi chú khách: chủ quán ghi / đọc được; thu ngân và quán khác = 0 dòng, không ghi được", async () => {
    const note = `Dị ứng tôm ${TAG}`;
    expect((await ownerA.from("customer_notes").upsert({ tenant_id: tenantA, phone: "0912345678", note })).error).toBeNull();
    expect(((await ownerA.from("customer_notes").select("note").eq("tenant_id", tenantA)).data ?? []).length).toBeGreaterThan(0);
    expect((await cashierA.from("customer_notes").select("note")).data ?? []).toHaveLength(0);
    expect((await ownerB.from("customer_notes").select("note").eq("tenant_id", tenantA)).data ?? []).toHaveLength(0);
    expect((await cashierA.from("customer_notes").insert({ tenant_id: tenantA, phone: "0987654321", note })).error).not.toBeNull();
    expect((await ownerB.from("customer_notes").insert({ tenant_id: tenantA, phone: "0987654321", note })).error).not.toBeNull();
  }, 60_000);

  it("export_logs: thu ngân không ghi được; chủ quán ghi được", async () => {
    expect((await cashierA.from("export_logs").insert({ tenant_id: tenantA, kind: "report" })).error).not.toBeNull();
    const { error } = await ownerA.from("export_logs").insert({ tenant_id: tenantA, kind: "report", from_day: "2026-09-01", to_day: "2026-09-27" });
    expect(error).toBeNull();
    await adminClient().from("export_logs").delete().eq("tenant_id", tenantA).eq("from_day", "2026-09-01");
  }, 60_000);
});
