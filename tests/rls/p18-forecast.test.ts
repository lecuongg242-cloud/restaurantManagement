import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B } from "./setup";
import { adminClient, cleanupFixtures, seedFixtures } from "./fixtures";

/**
 * P18 (0073) trên DB thật, quán demo pho-viet (A): dự báo / nhận xét chỉ chủ / quản lý của chính quán đọc được; thu
 * ngân và quán khác 0 dòng; không ai (kể cả chủ) GHI được dự báo / nhận xét — chỉ job đêm; phản hồi "Hữu ích" chỉ ghi
 * cho chính mình, quán mình.
 */
const TAG = crypto.randomUUID().slice(0, 6);
const NGAY = "2001-01-01"; // run_date / week_start giả, xa khỏi dữ liệu thật của job
let tenantA = "";
let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let cashierA: SupabaseClient;
let insightId = 0;
let memOwnerA = "";
const tam: string[] = [];

beforeAll(async () => {
  tenantA = (await seedFixtures()).tenantA;
  const a = adminClient();
  const email = `p18-cashier-${TAG}@test.local`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data } = await a.auth.admin.createUser({ email, password, email_confirm: true });
  tam.push(data.user!.id);
  await a.from("memberships").insert({ tenant_id: tenantA, user_id: data.user!.id, role: "cashier", display_name: "P18", active: true });
  cashierA = await signInAs(email, password);
  ownerA = await signInAs(OWNER_A.email, OWNER_A.password);
  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);
  const { data: u } = await ownerA.auth.getUser();
  memOwnerA = (await a.from("memberships").select("id").eq("tenant_id", tenantA).eq("user_id", u.user!.id).single()).data!.id as string;

  await a.from("forecast_runs").insert({ tenant_id: tenantA, run_date: NGAY, status: "ok", selling_weeks: 8, mape_revenue: 12.5 });
  await a.from("forecasts").insert({ tenant_id: tenantA, run_date: NGAY, target_date: NGAY, metric: "revenue", value: 1000, low: 900, high: 1100 });
  const { data: ins } = await a
    .from("insights")
    .insert({ tenant_id: tenantA, week_start: NGAY, kind: "weekly", body: `thử ${TAG}`, facts: {}, model: "mau-cau" })
    .select("id")
    .single();
  insightId = ins!.id as number;
}, 120_000);

afterAll(async () => {
  const a = adminClient();
  await a.from("insights").delete().eq("tenant_id", tenantA).eq("week_start", NGAY);
  await a.from("forecasts").delete().eq("tenant_id", tenantA).eq("run_date", NGAY);
  await a.from("forecast_runs").delete().eq("tenant_id", tenantA).eq("run_date", NGAY);
  await a.from("memberships").delete().in("user_id", tam);
  for (const id of tam) await a.auth.admin.deleteUser(id);
  await cleanupFixtures();
}, 120_000);

describe("forecasts / forecast_runs / insights — chỉ đọc cho chủ / quản lý", () => {
  it("chủ quán A đọc được", async () => {
    expect((await ownerA.from("forecast_runs").select("status").eq("tenant_id", tenantA).eq("run_date", NGAY)).data).toHaveLength(1);
    expect((await ownerA.from("forecasts").select("value").eq("tenant_id", tenantA).eq("run_date", NGAY)).data).toHaveLength(1);
    expect((await ownerA.from("insights").select("body").eq("id", insightId)).data?.[0]?.body).toBe(`thử ${TAG}`);
  });

  it("thu ngân quán A và chủ quán B → 0 dòng", async () => {
    for (const c of [cashierA, ownerB]) {
      expect((await c.from("forecast_runs").select("status").eq("tenant_id", tenantA)).data ?? []).toHaveLength(0);
      expect((await c.from("forecasts").select("value").eq("tenant_id", tenantA)).data ?? []).toHaveLength(0);
      expect((await c.from("insights").select("body").eq("tenant_id", tenantA)).data ?? []).toHaveLength(0);
    }
  });

  it("không ai ghi được dự báo / nhận xét qua API — kể cả chủ quán (chỉ job đêm)", async () => {
    expect((await ownerA.from("forecasts").insert({ tenant_id: tenantA, run_date: NGAY, target_date: NGAY, metric: "revenue", value: 1 })).error).not.toBeNull();
    expect((await ownerA.from("insights").insert({ tenant_id: tenantA, week_start: "2001-01-08", kind: "weekly", body: "x", facts: {} })).error).not.toBeNull();
    await ownerA.from("forecast_runs").update({ mape_revenue: 1 }).eq("tenant_id", tenantA).eq("run_date", NGAY);
    const { data } = await adminClient().from("forecast_runs").select("mape_revenue").eq("tenant_id", tenantA).eq("run_date", NGAY).single();
    expect(Number(data!.mape_revenue)).toBe(12.5);
  });
});

describe("insight_feedback", () => {
  it("chủ quán ghi phản hồi của chính mình; đổi ý được (upsert)", async () => {
    const ghi = (useful: boolean) =>
      ownerA.from("insight_feedback").upsert({ insight_id: insightId, tenant_id: tenantA, membership_id: memOwnerA, useful }, { onConflict: "insight_id,membership_id" });
    expect((await ghi(true)).error).toBeNull();
    expect((await ghi(false)).error).toBeNull();
    const { data } = await ownerA.from("insight_feedback").select("useful").eq("insight_id", insightId);
    expect(data).toEqual([{ useful: false }]);
  });

  it("thu ngân / chủ quán khác không ghi được; không ghi thay người khác", async () => {
    expect((await cashierA.from("insight_feedback").insert({ insight_id: insightId, tenant_id: tenantA, membership_id: memOwnerA, useful: true })).error).not.toBeNull();
    expect((await ownerB.from("insight_feedback").insert({ insight_id: insightId, tenant_id: tenantA, membership_id: memOwnerA, useful: true })).error).not.toBeNull();
    const { data: nv } = await adminClient().from("memberships").select("id").in("user_id", tam).single();
    expect((await ownerA.from("insight_feedback").insert({ insight_id: insightId, tenant_id: tenantA, membership_id: nv!.id, useful: true })).error).not.toBeNull();
  });
});
