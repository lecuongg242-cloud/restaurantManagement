import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A } from "./setup";
import { adminClient, cleanupFixtures, fid, IDX, seedFixtures } from "./fixtures";
import { bridgeEmailForSlug, provisionPrintBridgeAccount } from "@/lib/print/bridge-account";

/**
 * PRINT-05 — Tài khoản cầu in của quán A chỉ thấy phiếu in của quán A.
 *
 * Đây là tính chất bảo mật THAY THẾ cho service-role trên máy quán (QD-012 §1). Kiểm tay lúc lắp
 * đặt chỉ đúng tại thời điểm đó; test này là thứ giữ cho nó đúng khi có người sửa policy
 * `print_jobs` hoặc `auth_tenant_ids()` sáu tháng sau.
 */
let printer: SupabaseClient;
let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  const ids = await seedFixtures();
  tenantA = ids.tenantA;
  tenantB = ids.tenantB;

  const admin = adminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, name")
    .eq("id", tenantA)
    .maybeSingle();

  const { email, password } = await provisionPrintBridgeAccount(admin, {
    tenantId: tenantA,
    slug: OWNER_A.slug,
    name: tenant!.name,
  });
  printer = await signInAs(email, password);
}, 120_000);

afterAll(async () => {
  const admin = adminClient();
  const email = bridgeEmailForSlug(OWNER_A.slug);
  await admin.from("memberships").delete().eq("email", email);
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users.find((x) => (x.email ?? "").toLowerCase() === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
  await cleanupFixtures();
}, 120_000);

describe("Tài khoản cầu in (vai trò printer)", () => {
  it("đọc được print_jobs của quán mình", async () => {
    const { data, error } = await printer.from("print_jobs").select("id").eq("tenant_id", tenantA);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("đánh dấu được phiếu của quán mình là đã in", async () => {
    const { data, error } = await printer
      .from("print_jobs")
      .update({ status: "printed", printed_at: new Date().toISOString() })
      .eq("id", fid("A", IDX.print_jobs))
      .select("id");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  it("KHÔNG đọc được print_jobs của quán khác", async () => {
    const { data, error } = await printer.from("print_jobs").select("id").eq("tenant_id", tenantB);
    expect(error).toBeNull();
    expect(data ?? [], "RÒ RỈ: cầu in quán A thấy phiếu quán B").toHaveLength(0);
  });

  it("KHÔNG sửa được phiếu in của quán khác", async () => {
    const { data } = await printer
      .from("print_jobs")
      .update({ status: "printed" })
      .eq("id", fid("B", IDX.print_jobs))
      .select("id");
    expect(data ?? [], "RÒ RỈ: cầu in quán A sửa được phiếu quán B").toHaveLength(0);
  });

  it("chỉ thấy đúng MỘT nhà hàng — đây là bán kính thiệt hại khi lộ khóa", async () => {
    const { data, error } = await printer.from("tenants").select("id");
    expect(error).toBeNull();
    // Trước thay đổi này máy quán giữ service-role: cùng truy vấn trả về MỌI nhà hàng.
    expect(data ?? []).toHaveLength(1);
    expect(data![0].id).toEqual(tenantA);
  });

  it("tenant suy được từ chính token, không cần cấu hình tay", async () => {
    const { data, error } = await printer
      .from("memberships")
      .select("tenant_id")
      .eq("role", "printer")
      .eq("active", true);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(data![0].tenant_id).toEqual(tenantA);
  });
});
