import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DESK-01 — phần không cần DB của kích hoạt máy quầy: đọc thân yêu cầu, nhánh quán tạm ngưng, và route
 * giới hạn tần suất theo IP lẫn theo email. Phần chạy DB thật: tests/rls/desktop-activate.test.ts.
 */
const rl = vi.hoisted(() => ({ ketQua: [] as { ok: boolean; retryAfterS: number }[], goi: [] as string[][] }));
vi.mock("@/lib/security/rate-limit", async (goc) => ({
  ...(await goc<typeof import("@/lib/security/rate-limit")>()),
  checkRateLimit: vi.fn(async (_rule: unknown, parts: string[]) => {
    rl.goi.push(parts);
    return rl.ketQua.shift() ?? { ok: true, retryAfterS: 0 };
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { docDauVao, kichHoatMayQuay, LOI_TAM_NGUNG } from "@/lib/desktop/kich-hoat";
import { POST } from "@/app/api/desktop/activate/route";

/** DB giả: `memberships` và `tenants` trả dữ liệu định sẵn, mọi hàm lọc trả chính nó. */
function dbGia(bang: Record<string, unknown[]>): SupabaseClient {
  return {
    from: (ten: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        then: (ok: (v: unknown) => void) => ok({ data: bang[ten] ?? [], error: null }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const hopLe = { email: " Chu@Quan.VN ", password: "mat-khau", coMayIn: true };

describe("docDauVao", () => {
  it("chuẩn hóa email, giữ nguyên mật khẩu", () => {
    expect(docDauVao(hopLe)).toEqual({ email: "chu@quan.vn", password: "mat-khau", tenantId: null, coMayIn: true });
  });
  it.each([
    ["không phải object", "abc"],
    ["thiếu email", { ...hopLe, email: "" }],
    ["email không có @", { ...hopLe, email: "abc" }],
    ["thiếu mật khẩu", { ...hopLe, password: "" }],
    ["mật khẩu quá dài", { ...hopLe, password: "x".repeat(201) }],
    ["coMayIn không phải boolean", { ...hopLe, coMayIn: "co" }],
    ["tenantId lạ", { ...hopLe, tenantId: "../../x" }],
  ])("%s → null", (_ten, body) => {
    expect(docDauVao(body)).toBeNull();
  });
});

describe("kichHoatMayQuay — quán tạm ngưng", () => {
  it("chủ của quán tạm ngưng → 403 kèm lý do, không tạo tài khoản printer", async () => {
    const db = dbGia({
      memberships: [{ tenant_id: "t1" }],
      tenants: [{ id: "t1", slug: "q", name: "Q", status: "suspended" }],
    });
    const kq = await kichHoatMayQuay(db, async () => "u1", docDauVao(hopLe)!);
    expect(kq).toEqual({ loai: "loi", status: 403, error: LOI_TAM_NGUNG });
  });
});

describe("POST /api/desktop/activate — giới hạn tần suất", () => {
  beforeEach(() => {
    rl.ketQua = [];
    rl.goi = [];
  });
  const goi = (body: unknown) =>
    POST(
      new Request("https://app.test/api/desktop/activate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": "1.2.3.4" },
        body: JSON.stringify(body),
      })
    );

  it("vượt ngưỡng theo IP → 429, không đọc tới mật khẩu", async () => {
    rl.ketQua = [{ ok: false, retryAfterS: 30 }];
    const res = await goi(hopLe);
    expect(res.status).toBe(429);
    expect(rl.goi).toEqual([["1.2.3.4"]]);
  });

  it("vượt ngưỡng theo email → 429 (chặn dò mật khẩu một chủ quán từ nhiều IP)", async () => {
    rl.ketQua = [{ ok: true, retryAfterS: 0 }, { ok: false, retryAfterS: 30 }];
    const res = await goi(hopLe);
    expect(res.status).toBe(429);
    expect(rl.goi).toEqual([["1.2.3.4"], ["email", "chu@quan.vn"]]);
  });

  it("thân yêu cầu sai → 400", async () => {
    const res = await goi({ email: "x" });
    expect(res.status).toBe(400);
  });
});
