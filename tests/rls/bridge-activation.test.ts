import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { signInAs, OWNER_A, OWNER_B } from "./setup";
import { adminClient, seedFixtures } from "./fixtures";
import { createActivationCode, redeemActivationCode, hashCode, revokePrintBridge } from "@/lib/print/activation";
import { bridgeEmailForSlug } from "@/lib/print/bridge-account";

config({ path: ".env.local" });
config();

/**
 * PRINT-11 — mã kích hoạt cầu in trên DB thật (migration 0052).
 *
 * Mã đổi được thành mật khẩu tài khoản `printer` của một quán ⇒ nó phải: dùng đúng một lần, hết hạn,
 * không bao giờ trả tài khoản quán khác, không cho người dùng đọc/ghi bảng, và không phân biệt "sai"
 * với "hết hạn" (không cho dò).
 */
let admin: SupabaseClient;
let tenantA: string;
let tenantB: string;
let chuA: SupabaseClient;
/** Fixture A/B là hai quán DEMO dùng chung (pho-viet, bun-bo): đổi mã/thu hồi đổi `print_mode` của
 *  chúng ⇒ phải trả lại đúng như cũ, nếu không các E2E sau chạy trên chế độ in sai. */
const settingsCu = new Map<string, unknown>();

const LOI = "Mã không hợp lệ hoặc đã hết hạn.";

beforeAll(async () => {
  const ids = await seedFixtures();
  tenantA = ids.tenantA;
  tenantB = ids.tenantB;
  admin = adminClient();
  chuA = await signInAs(OWNER_A.email, OWNER_A.password);
  const { data } = await admin.from("tenants").select("id, settings").in("id", [tenantA, tenantB]);
  for (const r of data ?? []) settingsCu.set(r.id, r.settings);
}, 120_000);

afterAll(async () => {
  for (const [id, settings] of settingsCu) await admin.from("tenants").update({ settings }).eq("id", id);
  await admin.from("printer_heartbeats").delete().in("tenant_id", [tenantA, tenantB]);
  await admin.from("bridge_activation_codes").delete().in("tenant_id", [tenantA, tenantB]);
  for (const slug of [OWNER_A.slug, OWNER_B.slug]) {
    const email = bridgeEmailForSlug(slug);
    await admin.from("memberships").delete().eq("email", email);
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const u = data?.users.find((x) => (x.email ?? "").toLowerCase() === email);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
}, 120_000);

describe("đổi mã kích hoạt", () => {
  it("mã đúng → tài khoản printer của ĐÚNG quán, đăng nhập được", async () => {
    const { code } = await createActivationCode(admin, { tenantId: tenantA, createdBy: null });
    const r = await redeemActivationCode(admin, code);
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.slug).toBe(OWNER_A.slug);
    expect(r.email).toBe(bridgeEmailForSlug(OWNER_A.slug));

    const may = await signInAs(r.email, r.password);
    const { data } = await may.from("memberships").select("tenant_id, role").eq("role", "printer");
    expect(data).toEqual([{ tenant_id: tenantA, role: "printer" }]);

    // Kích hoạt đặt quán sang chế độ cầu in, GIỮ các cài đặt khác.
    const { data: t } = await admin.from("tenants").select("settings").eq("id", tenantA).single();
    expect((t!.settings as Record<string, unknown>).print_mode).toBe("bridge");
  });

  it("dùng lại mã đã dùng → từ chối", async () => {
    const { code } = await createActivationCode(admin, { tenantId: tenantA, createdBy: null });
    expect("error" in (await redeemActivationCode(admin, code))).toBe(false);
    expect(await redeemActivationCode(admin, code)).toEqual({ error: LOI });
  });

  it("mã hết hạn → từ chối, CÙNG thông báo với mã sai", async () => {
    const { code } = await createActivationCode(admin, { tenantId: tenantA, createdBy: null });
    await admin
      .from("bridge_activation_codes")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("code_hash", hashCode(code));
    expect(await redeemActivationCode(admin, code)).toEqual({ error: LOI });
    expect(await redeemActivationCode(admin, "ZZZZZZZZ")).toEqual({ error: LOI });
    expect(await redeemActivationCode(admin, "sai")).toEqual({ error: LOI });
  });

  it("mã của quán B không bao giờ trả tài khoản quán A", async () => {
    const { code } = await createActivationCode(admin, { tenantId: tenantB, createdBy: null });
    const r = await redeemActivationCode(admin, code);
    if ("error" in r) throw new Error(r.error);
    expect(r.slug).toBe(OWNER_B.slug);
    expect(r.email).not.toBe(bridgeEmailForSlug(OWNER_A.slug));
  });

  it("kích hoạt lần hai (mã mới) → mật khẩu cũ không đăng nhập được nữa", async () => {
    const r1 = await redeemActivationCode(admin, (await createActivationCode(admin, { tenantId: tenantA, createdBy: null })).code);
    const r2 = await redeemActivationCode(admin, (await createActivationCode(admin, { tenantId: tenantA, createdBy: null })).code);
    if ("error" in r1 || "error" in r2) throw new Error("không đổi được mã");
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await anon.auth.signInWithPassword({ email: r1.email, password: r1.password });
    expect(error).not.toBeNull();
    await expect(signInAs(r2.email, r2.password)).resolves.toBeTruthy();
  });

  it("quán tạm ngưng → từ chối", async () => {
    const { code } = await createActivationCode(admin, { tenantId: tenantB, createdBy: null });
    await admin.from("tenants").update({ status: "suspended" }).eq("id", tenantB);
    try {
      expect(await redeemActivationCode(admin, code)).toEqual({ error: LOI });
    } finally {
      await admin.from("tenants").update({ status: "active" }).eq("id", tenantB);
    }
  });
});

describe("thu hồi cầu in", () => {
  it("sau thu hồi, cầu in không còn thấy phiếu in của quán", async () => {
    const r = await redeemActivationCode(admin, (await createActivationCode(admin, { tenantId: tenantA, createdBy: null })).code);
    if ("error" in r) throw new Error(r.error);
    const may = await signInAs(r.email, r.password);
    // Đối chứng dương: trước thu hồi, gọi nhịp tim được.
    expect((await may.rpc("printer_heartbeat")).error).toBeNull();

    await revokePrintBridge(admin, tenantA);
    expect((await may.rpc("printer_heartbeat")).error).not.toBeNull();
    const { data: t } = await admin.from("tenants").select("settings").eq("id", tenantA).single();
    expect((t!.settings as Record<string, unknown>).print_mode).toBe("browser");
  });
});

describe("bảng bridge_activation_codes chỉ server chạm", () => {
  it("chủ quán không đọc, không ghi được", async () => {
    await createActivationCode(admin, { tenantId: tenantA, createdBy: null });
    const { data } = await chuA.from("bridge_activation_codes").select("id").eq("tenant_id", tenantA);
    expect(data ?? []).toHaveLength(0);
    const { error } = await chuA.from("bridge_activation_codes").insert({
      tenant_id: tenantA,
      code_hash: "gia",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(error).not.toBeNull();
    // Đối chứng dương: dòng có thật (service_role thấy).
    const { data: that } = await admin.from("bridge_activation_codes").select("id").eq("tenant_id", tenantA);
    expect((that ?? []).length).toBeGreaterThan(0);
  });
});
