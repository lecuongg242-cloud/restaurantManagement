import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, myTenantId, OWNER_A, OWNER_B } from "./setup";

/**
 * TENANT-02 — Cách ly tenant bằng RLS thật (không service role).
 * Owner A (Phở Việt) không đọc/ghi được dữ liệu Owner B (Bún Bò) và ngược lại.
 */
describe("RLS: cách ly tenant A ⊥ tenant B", () => {
  let a: SupabaseClient;
  let b: SupabaseClient;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    a = await signInAs(OWNER_A.email, OWNER_A.password);
    b = await signInAs(OWNER_B.email, OWNER_B.password);
    tenantA = await myTenantId(a);
    tenantB = await myTenantId(b);
    expect(tenantA).not.toEqual(tenantB);
  });

  it("đối chứng dương: A đọc được membership của chính tenant A", async () => {
    const { data, error } = await a
      .from("memberships")
      .select("id, tenant_id")
      .eq("tenant_id", tenantA);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("A đọc memberships của tenant B → 0 dòng (RLS lọc)", async () => {
    const { data, error } = await a
      .from("memberships")
      .select("id, tenant_id")
      .eq("tenant_id", tenantB);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("A liệt kê tenants → chỉ thấy tenant của mình, KHÔNG thấy Bún Bò", async () => {
    const { data, error } = await a.from("tenants").select("id, slug");
    expect(error).toBeNull();
    const slugs = (data ?? []).map((r) => r.slug);
    expect(slugs).not.toContain(OWNER_B.slug);
    expect(slugs).toContain(OWNER_A.slug);
  });

  it("A GHI (insert) membership vào tenant B → bị chặn", async () => {
    const { data, error } = await a
      .from("memberships")
      .insert({
        tenant_id: tenantB,
        user_id: null,
        role: "waiter",
        display_name: "xâm nhập",
        active: true,
      })
      .select("id");
    // RLS with-check chặn → error (thường 42501) và không có dòng nào được tạo.
    expect(error).not.toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("A CẬP NHẬT membership của tenant B → 0 dòng bị ảnh hưởng", async () => {
    const { data, error } = await a
      .from("memberships")
      .update({ display_name: "bị sửa" })
      .eq("tenant_id", tenantB)
      .select("id");
    // RLS lọc mọi dòng tenant B khỏi tầm nhìn của A → không sửa được dòng nào.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("chiều ngược: B đọc memberships của tenant A → 0 dòng", async () => {
    const { data, error } = await b
      .from("memberships")
      .select("id")
      .eq("tenant_id", tenantA);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
