import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B } from "./setup";
import { adminClient, seedFixtures } from "./fixtures";
import { provisionPrintBridgeAccount, bridgeEmailForSlug } from "@/lib/print/bridge-account";
import { quayCoCauIn } from "@/lib/print/cau-in-db";
import type { PhieuAnh } from "@/lib/print/anh-phieu";

config({ path: ".env.local" });
config();

/**
 * PRINT-14/15/16 — in hóa đơn từ thiết bị không có máy in, qua cầu in (DB thật, migration 0054).
 *  - Nhịp tim báo máy in quầy; cầu in bản cũ gọi kiểu cũ vẫn chạy và không xóa dữ liệu quầy.
 *  - Server chỉ xếp hóa đơn khi cầu in SỐNG và ĐÃ KHAI máy in quầy.
 *  - Ảnh phiếu chỉ cầu in của ĐÚNG quán lấy được.
 */
let admin: SupabaseClient;
let tenantA: string;
let tenantB: string;
let mayInA: SupabaseClient;
let tokenA = "";
const settingsCu = new Map<string, unknown>();

const ANH: PhieuAnh = {
  loai: "customer_ticket",
  gio: "12:00 27/09",
  phieu: {
    orderId: "x",
    kitchenNo: 5,
    tenantName: "Quán thử",
    logoUrl: null,
    place: "Mang về",
    contactName: null,
    createdAt: null,
    ticketNo: "K5",
    items: [{ name: "Phở", qty: 1, modifiers: [], note: null, unitPrice: 50000 }],
    total: 50000,
  },
};

beforeAll(async () => {
  const ids = await seedFixtures();
  tenantA = ids.tenantA;
  tenantB = ids.tenantB;
  admin = adminClient();
  const { data } = await admin.from("tenants").select("id, settings").in("id", [tenantA, tenantB]);
  for (const r of data ?? []) settingsCu.set(r.id, r.settings);
  const { data: t } = await admin.from("tenants").select("name").eq("id", tenantA).single();
  const { email, password } = await provisionPrintBridgeAccount(admin, { tenantId: tenantA, slug: OWNER_A.slug, name: t!.name });
  mayInA = await signInAs(email, password);
  tokenA = (await mayInA.auth.getSession()).data.session!.access_token;
}, 120_000);

afterAll(async () => {
  for (const [id, settings] of settingsCu) await admin.from("tenants").update({ settings }).eq("id", id);
  await admin.from("printer_heartbeats").delete().in("tenant_id", [tenantA, tenantB]);
  await admin.from("print_jobs").delete().in("tenant_id", [tenantA, tenantB]).like("payload->>orderId", "e2e-anh-%");
  const email = bridgeEmailForSlug(OWNER_A.slug);
  await admin.from("memberships").delete().eq("email", email);
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users.find((x) => (x.email ?? "").toLowerCase() === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
}, 120_000);

describe("nhịp tim kèm máy in quầy (0054)", () => {
  it("báo máy in quầy → lưu; gọi kiểu cũ (0043/0044/0053) → vẫn chạy, GIỮ dữ liệu quầy", async () => {
    await admin.from("printer_heartbeats").delete().eq("tenant_id", tenantA);
    expect((await mayInA.rpc("printer_heartbeat", { p_counter_ok: true, p_counter_target: "usb:XP-80C" })).error).toBeNull();
    for (const kieuCu of [{}, { p_printer_ok: true, p_printer_host: "h:9100" }, { p_version: 2 }]) {
      expect((await mayInA.rpc("printer_heartbeat", kieuCu)).error).toBeNull();
    }
    const { data } = await admin
      .from("printer_heartbeats")
      .select("counter_ok, counter_target, version")
      .eq("tenant_id", tenantA)
      .single();
    expect(data).toMatchObject({ counter_ok: true, counter_target: "usb:XP-80C", version: 2 });
  });
});

describe("quayCoCauIn", () => {
  it("cầu in sống + đã khai máy in quầy → có", async () => {
    await mayInA.rpc("printer_heartbeat", { p_counter_target: "usb:XP-80C" });
    expect(await quayCoCauIn(admin, tenantA)).toBe(true);
  });

  it("cầu in sống nhưng CHƯA khai máy in quầy → không (phiếu sẽ nằm chờ không ai in)", async () => {
    await admin.from("printer_heartbeats").delete().eq("tenant_id", tenantA);
    await mayInA.rpc("printer_heartbeat", { p_printer_ok: true, p_printer_host: "h:9100" });
    expect(await quayCoCauIn(admin, tenantA)).toBe(false);
  });

  it("đã khai nhưng cầu in chết → không", async () => {
    await mayInA.rpc("printer_heartbeat", { p_counter_target: "usb:XP-80C" });
    await admin
      .from("printer_heartbeats")
      .update({ seen_at: new Date(Date.now() - 10 * 60_000).toISOString() })
      .eq("tenant_id", tenantA);
    expect(await quayCoCauIn(admin, tenantA)).toBe(false);
  });

  it("chưa từng có cầu in → không", async () => {
    expect(await quayCoCauIn(admin, tenantB)).toBe(false);
  });
});

describe("GET /api/print/jobs/[id]/image", () => {
  async function taoPhieu(tenantId: string) {
    const { data } = await admin
      .from("print_jobs")
      .insert({
        tenant_id: tenantId,
        type: "customer_ticket",
        target_station: "counter",
        status: "pending",
        payload: { orderId: `e2e-anh-${Date.now()}`, anh: ANH },
      })
      .select("id")
      .single();
    return data!.id as string;
  }
  async function goi(id: string, token?: string) {
    const { GET } = await import("@/app/api/print/jobs/[id]/image/route");
    const req = new Request(`http://x/api/print/jobs/${id}/image?w=80`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return GET(req, { params: Promise.resolve({ id }) });
  }

  it("cầu in đúng quán → PNG rộng 576", async () => {
    const res = await goi(await taoPhieu(tenantA), tokenA);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/png/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.readUInt32BE(16)).toBe(576);
  }, 30_000);

  it("phiếu của quán KHÁC → 404", async () => {
    expect((await goi(await taoPhieu(tenantB), tokenA)).status).toBe(404);
  });

  it("thiếu token → 401; token rác → 401", async () => {
    const id = await taoPhieu(tenantA);
    expect((await goi(id)).status).toBe(401);
    expect((await goi(id, "rac")).status).toBe(401);
  });

  it("chủ quán (không phải printer) → 404", async () => {
    const chu = await signInAs(OWNER_A.email, OWNER_A.password);
    const tokenChu = (await chu.auth.getSession()).data.session!.access_token;
    expect((await goi(await taoPhieu(tenantA), tokenChu)).status).toBe(404);
  });

  it("cầu in bị thu hồi → 404", async () => {
    const id = await taoPhieu(tenantA);
    await admin.from("memberships").update({ active: false }).eq("tenant_id", tenantA).eq("role", "printer");
    try {
      expect((await goi(id, tokenA)).status).toBe(404);
    } finally {
      await admin.from("memberships").update({ active: true }).eq("tenant_id", tenantA).eq("role", "printer");
    }
  });
});
