import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { signInAs, tenantIdBySlug, OWNER_A, OWNER_B } from "./setup";

/**
 * 0084 — view `bills_revenue` chạy bằng quyền NGƯỜI GỌI (RLS áp lên). Trước 0084 khóa `anon` (công khai, nằm trong trang
 * web) đọc được hóa đơn của mọi quán qua view này (phát hiện 04/10/2026 khi làm P30).
 */
describe("bills_revenue — không lộ hóa đơn chéo quán", () => {
  it("khóa anon (chưa đăng nhập) bị từ chối", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.from("bills_revenue").select("id").limit(1);
    expect(data ?? []).toHaveLength(0);
    expect(error?.code).toBe("42501");
  });

  it("chủ quán A không đọc được hóa đơn quán B; đọc được quán mình", async () => {
    const [a, tenantA, tenantB] = await Promise.all([signInAs(OWNER_A.email, OWNER_A.password), tenantIdBySlug(OWNER_A.slug), tenantIdBySlug(OWNER_B.slug)]);
    const khac = await a.from("bills_revenue").select("id", { count: "exact", head: true }).eq("tenant_id", tenantB);
    expect(khac.error).toBeNull();
    expect(khac.count).toBe(0);
    const minh = await a.from("bills_revenue").select("id", { count: "exact", head: true }).eq("tenant_id", tenantA);
    expect(minh.error).toBeNull();
    expect(minh.count).toBeGreaterThan(0);
  });
});
