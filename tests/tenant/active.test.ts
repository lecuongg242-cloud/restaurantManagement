import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { activeTenantBySlug, isTenantActive } from "@/lib/tenant/active";

config({ path: ".env.local" });
config();

/**
 * TENANT-06 — Bề mặt khách và route handler chạy service-role nên RLS không chạm tới. "Đang hoạt
 * động" phải được định nghĩa ở đúng MỘT chỗ, và mọi lối tra tenant theo slug đều đi qua đó.
 */
const SLUG = "bun-bo"; // chỉ tenant demo — không bao giờ ngưng quán đang hoạt động thật

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function setStatus(status: "active" | "suspended") {
  const { error } = await admin.from("tenants").update({ status }).eq("slug", SLUG);
  if (error) throw error;
}

let tenantId: string;

beforeAll(async () => {
  const { data } = await admin.from("tenants").select("id").eq("slug", SLUG).maybeSingle();
  if (!data) throw new Error(`Không tìm thấy tenant ${SLUG}`);
  tenantId = data.id;
});

afterAll(async () => {
  await setStatus("active");
});

describe("activeTenantBySlug", () => {
  it("quán active → trả về dòng tenant", async () => {
    await setStatus("active");
    const t = await activeTenantBySlug<{ id: string }>("id", SLUG);
    expect(t?.id).toEqual(tenantId);
    expect(await isTenantActive(SLUG)).toBe(true);
  });

  it("quán suspended → trả null (rơi vào đúng nhánh 'không tìm thấy' sẵn có)", async () => {
    await setStatus("suspended");
    expect(await activeTenantBySlug("id", SLUG)).toBeNull();
    expect(await isTenantActive(SLUG)).toBe(false);
  });

  it("slug không tồn tại → trả null, không ném lỗi", async () => {
    expect(await activeTenantBySlug("id", "khong-ton-tai-abc")).toBeNull();
    expect(await isTenantActive("khong-ton-tai-abc")).toBe(false);
  });
});
