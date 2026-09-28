import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B } from "./setup";
import { adminClient, cleanupFixtures, seedFixtures } from "./fixtures";

/**
 * P16 phần còn mở (0074), quán demo pho-viet (A):
 *  - report_staff_detail: đi hết các trang của từng người → Σ tiền / số dòng = đúng số trên dòng tổng của
 *    report_by_staff (cùng vị từ). Thu ngân / chủ quán khác 0 dòng; p_limit kẹp 100.
 *  - Xóa bàn đang có phiên MỞ → DB từ chối, bàn + phiên còn nguyên; đóng phiên rồi xóa được; xóa cả quán không bị chặn.
 */
const TU = "2020-01-01T00:00:00Z";
const DEN = "2031-01-01T00:00:00Z";
const TAG = crypto.randomUUID().slice(0, 6);
let tenantA = "";
let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let cashierA: SupabaseClient;
const tam: string[] = [];
const banTam: string[] = [];

beforeAll(async () => {
  tenantA = (await seedFixtures()).tenantA;
  const email = `p16o-cashier-${TAG}@test.local`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  tam.push(data.user!.id);
  await adminClient().from("memberships").insert({ tenant_id: tenantA, user_id: data.user!.id, role: "cashier", display_name: "P16o", active: true });
  cashierA = await signInAs(email, password);
  ownerA = await signInAs(OWNER_A.email, OWNER_A.password);
  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);
}, 120_000);

afterAll(async () => {
  const a = adminClient();
  if (banTam.length) {
    await a.from("table_sessions").update({ status: "closed", closed_at: new Date().toISOString() }).in("table_id", banTam);
    await a.from("tables").delete().in("id", banTam);
  }
  await a.from("tenants").delete().eq("slug", `p16o-${TAG}`);
  await a.from("memberships").delete().in("user_id", tam);
  for (const id of tam) await a.auth.admin.deleteUser(id);
  await cleanupFixtures();
}, 120_000);

type Tong = { kind: string; membership_id: string | null; display_name: string; [k: string]: unknown };
type Dong = { total_count: number; qty: number | null; amount: number };

/** Đọc hết mọi trang (100 dòng/trang) của một người, một góc xem. */
async function hetTrang(c: SupabaseClient, r: Tong, view: string) {
  const dong: Dong[] = [];
  let tong = 0;
  for (let off = 0; ; off += 100) {
    const { data, error } = await c.rpc("report_staff_detail", {
      p_tenants: [tenantA], p_from: TU, p_to: DEN, p_kind: r.kind, p_membership: r.membership_id, p_view: view,
      p_offset: off, p_limit: 100,
    });
    expect(error).toBeNull();
    const page = (data ?? []) as Dong[];
    if (page.length) tong = Number(page[0].total_count);
    dong.push(...page);
    if (page.length < 100) break;
  }
  expect(dong.length, `${r.display_name}/${view}: total_count khác số dòng đọc được`).toBe(dong.length ? tong : 0);
  return {
    soDong: dong.length,
    tien: dong.reduce((s, d) => s + Number(d.amount), 0),
    sl: dong.reduce((s, d) => s + Number(d.qty ?? 0), 0),
  };
}

describe("report_staff_detail (16-02: bấm vào một nhân viên)", () => {
  it("mọi người, mọi góc xem: Σ chi tiết = số trên dòng tổng", async () => {
    const { data: tongs, error } = await ownerA.rpc("report_by_staff", { p_tenants: [tenantA], p_from: TU, p_to: DEN });
    expect(error).toBeNull();
    expect((tongs ?? []).length).toBeGreaterThan(0);
    for (const r of (tongs ?? []) as Tong[]) {
      const nhan = await hetTrang(ownerA, r, "nhan");
      expect(nhan.soDong, `${r.display_name}: số đơn nhận`).toBe(Number(r.orders_taken));
      expect(nhan.tien, `${r.display_name}: tiền hàng nhận`).toBe(Number(r.revenue_taken));
      expect(nhan.sl, `${r.display_name}: số món nhận`).toBe(Number(r.items_taken));
      const thu = await hetTrang(ownerA, r, "thu");
      expect(thu.tien, `${r.display_name}: tổng thu`).toBe(Number(r.amount_received));
      const huy = await hetTrang(ownerA, r, "huy");
      expect(huy.tien, `${r.display_name}: tiền hủy`).toBe(Number(r.amount_cancelled));
      expect(huy.sl, `${r.display_name}: món hủy`).toBe(Number(r.items_cancelled));
    }
  }, 300_000);

  it("p_limit 500 → ≤ 100 dòng; offset quá cuối → 0 dòng", async () => {
    const { data: tongs } = await ownerA.rpc("report_by_staff", { p_tenants: [tenantA], p_from: TU, p_to: DEN });
    const r = ((tongs ?? []) as Tong[]).sort((a, b) => Number(b.orders_taken) - Number(a.orders_taken))[0];
    const goi = (off: number, lim: number) =>
      ownerA.rpc("report_staff_detail", {
        p_tenants: [tenantA], p_from: TU, p_to: DEN, p_kind: r.kind, p_membership: r.membership_id, p_view: "nhan",
        p_offset: off, p_limit: lim,
      });
    expect(((await goi(0, 500)).data ?? []).length).toBeLessThanOrEqual(100);
    expect((await goi(10_000_000, 50)).data ?? []).toHaveLength(0);
  }, 60_000);

  it("thu ngân / chủ quán khác → 0 dòng", async () => {
    const { data: tongs } = await ownerA.rpc("report_by_staff", { p_tenants: [tenantA], p_from: TU, p_to: DEN });
    const r = ((tongs ?? []) as Tong[]).find((x) => Number(x.amount_received) > 0)!;
    const args = { p_tenants: [tenantA], p_from: TU, p_to: DEN, p_kind: r.kind, p_membership: r.membership_id, p_view: "thu" };
    expect(((await ownerA.rpc("report_staff_detail", args)).data ?? []).length).toBeGreaterThan(0);
    expect((await cashierA.rpc("report_staff_detail", args)).data ?? []).toHaveLength(0);
    expect((await ownerB.rpc("report_staff_detail", args)).data ?? []).toHaveLength(0);
  }, 60_000);
});

describe("không xóa bàn đang có khách (16-01 lỗi còn tồn)", () => {
  it("phiên mở → chủ quán xóa bị từ chối, bàn + phiên còn; đóng phiên → xóa được", async () => {
    const a = adminClient();
    const { data: ban } = await a.from("tables").insert({ tenant_id: tenantA, name: `Tạm ${TAG}` }).select("id").single();
    banTam.push(ban!.id);
    const { data: phien } = await a.from("table_sessions").insert({ tenant_id: tenantA, table_id: ban!.id, status: "open" }).select("id").single();

    const { error } = await ownerA.from("tables").delete().eq("id", ban!.id);
    expect(error?.message).toContain("đang có khách");
    expect((await a.from("tables").select("id").eq("id", ban!.id)).data).toHaveLength(1);
    expect((await a.from("table_sessions").select("status").eq("id", phien!.id).single()).data?.status).toBe("open");

    await a.from("table_sessions").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", phien!.id);
    expect((await ownerA.from("tables").delete().eq("id", ban!.id)).error).toBeNull();
    expect((await a.from("tables").select("id").eq("id", ban!.id)).data).toHaveLength(0);
  }, 60_000);

  it("xóa CẢ quán có bàn đang mở phiên → không bị chặn", async () => {
    const a = adminClient();
    const { data: t, error: e0 } = await a.from("tenants").insert({ slug: `p16o-${TAG}`, name: `P16o ${TAG}` }).select("id").single();
    expect(e0).toBeNull();
    const { data: ban } = await a.from("tables").insert({ tenant_id: t!.id, name: "B1" }).select("id").single();
    await a.from("table_sessions").insert({ tenant_id: t!.id, table_id: ban!.id, status: "open" });
    expect((await a.from("tenants").delete().eq("id", t!.id)).error).toBeNull();
    expect((await a.from("tables").select("id").eq("id", ban!.id)).data).toHaveLength(0);
  }, 60_000);
});
