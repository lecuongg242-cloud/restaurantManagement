import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A } from "./setup";
import { adminClient, cleanupFixtures, seedFixtures } from "./fixtures";
import { cauInConSongCua, thayTheLuotDangCho } from "@/lib/print/cau-in-db";

/**
 * PRINT-08 + PRINT-06 — hai quyết định server đưa ra khi nhân viên bấm "Phiếu bếp", chạy bằng
 * đúng quyền của nhân viên (RLS thật), không phải service-role.
 */
let chuA: SupabaseClient;
let tenantA: string;
const DON = "e2e-sup-order";

beforeAll(async () => {
  const ids = await seedFixtures();
  tenantA = ids.tenantA;
  chuA = await signInAs(OWNER_A.email, OWNER_A.password);
}, 120_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("print_jobs").delete().filter("payload->>orderId", "in", `(${DON},don-khac)`);
  await admin.from("printer_heartbeats").delete().eq("tenant_id", tenantA);
  await cleanupFixtures();
}, 120_000);

async function datNhipTim(seenAt: string | null) {
  const admin = adminClient();
  await admin.from("printer_heartbeats").delete().eq("tenant_id", tenantA);
  if (seenAt) await admin.from("printer_heartbeats").insert({ tenant_id: tenantA, seen_at: seenAt });
}

describe("cauInConSongCua", () => {
  it("quán chưa từng có cầu in → KHÔNG xếp phiếu vào hàng đợi", async () => {
    await datNhipTim(null);
    expect(await cauInConSongCua(chuA, tenantA)).toBe(false);
  });

  it("nhịp tim vừa xong → xếp hàng", async () => {
    await datNhipTim(new Date().toISOString());
    expect(await cauInConSongCua(chuA, tenantA)).toBe(true);
  });

  it("nhịp tim cũ 5 phút → in trình duyệt", async () => {
    await datNhipTim(new Date(Date.now() - 5 * 60_000).toISOString());
    expect(await cauInConSongCua(chuA, tenantA)).toBe(false);
  });
});

describe("thayTheLuotDangCho", () => {
  async function them(orderId: string, status: string) {
    const { data, error } = await adminClient()
      .from("print_jobs")
      .insert({ tenant_id: tenantA, type: "kitchen_ticket", payload: { orderId }, status })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }
  async function trangThai(id: string) {
    const { data } = await adminClient().from("print_jobs").select("status").eq("id", id).single();
    return data!.status as string;
  }

  it("lượt cũ còn pending → superseded; cầu in sống lại không in thêm tờ cũ", async () => {
    const cu = await them(DON, "pending");
    await thayTheLuotDangCho(chuA, tenantA, DON);
    expect(await trangThai(cu)).toBe("superseded");
  });

  it("lượt ĐÃ IN và lượt HỎNG giữ nguyên — không viết lại lịch sử", async () => {
    const daIn = await them(DON, "printed");
    const hong = await them(DON, "failed");
    await thayTheLuotDangCho(chuA, tenantA, DON);
    expect(await trangThai(daIn)).toBe("printed");
    expect(await trangThai(hong)).toBe("failed");
  });

  it("đơn KHÁC không bị đụng tới", async () => {
    const khac = await them("don-khac", "pending");
    await thayTheLuotDangCho(chuA, tenantA, DON);
    expect(await trangThai(khac)).toBe("pending");
  });
});
