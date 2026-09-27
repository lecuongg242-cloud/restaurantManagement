import { describe, it, expect, vi, beforeEach } from "vitest";

/** PRINT-17 — mã kích hoạt gắn vào bộ cài chủ quán tải: chỉ owner, quán đang hoạt động, có giới hạn tần suất. */
const taoMa = vi.fn();
const gioiHan = vi.fn();
let trangThaiQuan = "active";

vi.mock("@/lib/print/activation", () => ({ createActivationCode: (...a: unknown[]) => taoMa(...a) }));
vi.mock("@/lib/security/rate-limit", () => ({
  RULES: { bridgeCode: { name: "bridge-code", windowS: 600, max: 5 } },
  checkRateLimit: (...a: unknown[]) => gioiHan(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: trangThaiQuan } }) }) }),
    }),
  }),
}));

const { taoMaChoChuQuan } = await import("@/lib/print/ma-chu-quan");
type Phien = Parameters<typeof taoMaChoChuQuan>[0];

const nguoi = (role: string) =>
  ({ userId: "u1", role, tenant: { id: "t1", slug: "q", name: "Q", logo_url: null }, membershipId: "m1", displayName: null }) as Phien;

beforeEach(() => {
  vi.clearAllMocks();
  trangThaiQuan = "active";
  gioiHan.mockResolvedValue({ ok: true, retryAfterS: 0 });
  taoMa.mockResolvedValue({ code: "ABCDEFGH", expiresAt: "2026-09-27T10:30:00Z" });
});

describe("taoMaChoChuQuan", () => {
  it("chủ quán → tạo mã cho ĐÚNG quán của phiên, ghi người tạo", async () => {
    expect(await taoMaChoChuQuan(nguoi("owner"))).toEqual({ code: "ABCDEFGH", expiresAt: "2026-09-27T10:30:00Z" });
    expect(taoMa).toHaveBeenCalledWith(expect.anything(), { tenantId: "t1", createdBy: "u1" });
    expect(gioiHan).toHaveBeenCalledWith(expect.objectContaining({ name: "bridge-code" }), ["t1"]);
  });

  it.each(["manager", "cashier", "waiter", "kitchen", "station", "printer"])("%s → từ chối, không tạo mã", async (role) => {
    expect(await taoMaChoChuQuan(nguoi(role))).toEqual({ error: "khong-phai-chu" });
    expect(taoMa).not.toHaveBeenCalled();
  });

  it("quán tạm ngưng → từ chối", async () => {
    trangThaiQuan = "suspended";
    expect(await taoMaChoChuQuan(nguoi("owner"))).toEqual({ error: "tam-ngung" });
    expect(taoMa).not.toHaveBeenCalled();
  });

  it("vượt 5 mã / 10 phút → từ chối", async () => {
    gioiHan.mockResolvedValue({ ok: false, retryAfterS: 120 });
    expect(await taoMaChoChuQuan(nguoi("owner"))).toEqual({ error: "gioi-han" });
    expect(taoMa).not.toHaveBeenCalled();
  });
});
