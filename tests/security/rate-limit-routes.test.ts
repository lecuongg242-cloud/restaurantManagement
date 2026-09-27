import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TENANT-07 — bước kiểm phải đứng TRƯỚC mọi thao tác ghi: vượt ngưỡng → 429 và hàm tạo đơn / gọi
 * nhân viên KHÔNG được gọi (không một dòng nào vào DB).
 */
const checkRateLimit = vi.fn();
vi.mock("@/lib/security/rate-limit", async (orig) => {
  const that = await orig<typeof import("@/lib/security/rate-limit")>();
  return { ...that, checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) };
});

const createQrOrder = vi.fn();
vi.mock("@/lib/orders/create-order", () => ({ createQrOrder: (...a: unknown[]) => createQrOrder(...a) }));

const createStaffCall = vi.fn();
vi.mock("@/lib/orders/staff-calls", () => ({ createStaffCall: (...a: unknown[]) => createStaffCall(...a) }));

const createOnlineOrder = vi.fn();
vi.mock("@/lib/orders/online", () => ({ createOnlineOrder: (...a: unknown[]) => createOnlineOrder(...a) }));

const params = Promise.resolve({ slug: "pho-viet" });
const post = (body: unknown) =>
  new Request("https://app.example/r/pho-viet/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST api/order", () => {
  it("vượt ngưỡng → 429 + Retry-After, không tạo đơn; khóa là token bàn", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, retryAfterS: 30 });
    const { POST } = await import("@/app/r/[slug]/api/order/route");
    const res = await POST(post({ qrToken: "tok-ban-5", lines: [] }), { params });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect((await res.json()).error).toMatch(/30 giây/);
    expect(createQrOrder).not.toHaveBeenCalled();
    expect(checkRateLimit.mock.calls[0][1]).toEqual(["tok-ban-5"]);
  });

  it("trong ngưỡng → đi tiếp như cũ", async () => {
    checkRateLimit.mockResolvedValue({ ok: true, retryAfterS: 0 });
    createQrOrder.mockResolvedValue({ orderId: "o1" });
    const { POST } = await import("@/app/r/[slug]/api/order/route");
    const res = await POST(post({ qrToken: "tok", lines: [] }), { params });
    expect(res.status).toBe(200);
    expect(createQrOrder).toHaveBeenCalledOnce();
  });

  it("body hỏng vẫn trả 400 như cũ (không tính là một lượt)", async () => {
    const { POST } = await import("@/app/r/[slug]/api/order/route");
    const res = await POST(
      new Request("https://app.example/x", { method: "POST", body: "{hong" }),
      { params }
    );
    expect(res.status).toBe(400);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});

describe("POST api/call", () => {
  it("vượt ngưỡng → 429, không tạo lượt gọi", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, retryAfterS: 12 });
    const { POST } = await import("@/app/r/[slug]/api/call/route");
    const res = await POST(post({ qrToken: "tok" }), { params });
    expect(res.status).toBe(429);
    expect(createStaffCall).not.toHaveBeenCalled();
  });
});

describe("POST api/online-order", () => {
  it("vượt ngưỡng → 429, không tạo đơn; khóa là IP + quán", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, retryAfterS: 5 });
    const { POST } = await import("@/app/r/[slug]/api/online-order/route");
    const res = await POST(post({ lines: [] }), { params });
    expect(res.status).toBe(429);
    expect(createOnlineOrder).not.toHaveBeenCalled();
    expect(checkRateLimit.mock.calls[0][1]).toEqual(["203.0.113.7", "pho-viet"]);
  });
});

describe("GET api/order/[id]", () => {
  it("vượt ngưỡng → 429; khóa là IP + mã đơn (cả quán chung một wifi)", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, retryAfterS: 9 });
    const { GET } = await import("@/app/r/[slug]/api/order/[id]/route");
    const res = await GET(new Request("https://app.example/x", { headers: { "x-real-ip": "203.0.113.7" } }), {
      params: Promise.resolve({ slug: "pho-viet", id: "don-1" }),
    });
    expect(res.status).toBe(429);
    expect(checkRateLimit.mock.calls[0][1]).toEqual(["203.0.113.7", "don-1"]);
  });
});

const createReservation = vi.fn();
vi.mock("@/lib/reservations/reservations", () => ({
  createReservation: (...a: unknown[]) => createReservation(...a),
}));
const createLead = vi.fn();
vi.mock("@/lib/marketing/leads", () => ({ createLead: (...a: unknown[]) => createLead(...a) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));

describe("submitReservation", () => {
  it("vượt ngưỡng → quay lại form kèm lỗi, không tạo đặt bàn; khóa IP + quán", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, retryAfterS: 20 });
    const { submitReservation } = await import("@/app/r/[slug]/(customer)/reserve/actions");
    const fd = new FormData();
    fd.set("slug", "pho-viet");
    await expect(submitReservation(fd)).rejects.toThrow(/REDIRECT:\/r\/pho-viet\/reserve\?error=/);
    expect(decodeURIComponent(String(redirect.mock.calls[0][0]))).toMatch(/20 giây/);
    expect(createReservation).not.toHaveBeenCalled();
    expect(checkRateLimit.mock.calls[0][1]).toEqual(["203.0.113.7", "pho-viet"]);
  });
});

describe("submitLead", () => {
  it("vượt ngưỡng → lỗi cấp form, không lưu liên hệ", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, retryAfterS: 300 });
    const { submitLead } = await import("@/app/(marketing)/actions");
    const r = await submitLead({ status: "idle" }, new FormData());
    expect(r).toMatchObject({ status: "error", field: "form" });
    expect(createLead).not.toHaveBeenCalled();
  });
});

const redeemActivationCode = vi.fn();
vi.mock("@/lib/print/activation", () => ({
  redeemActivationCode: (...a: unknown[]) => redeemActivationCode(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

describe("POST api/bridge/activate", () => {
  const kichHoat = (body: unknown) =>
    new Request("https://app.example/api/bridge/activate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7" },
      body: JSON.stringify(body),
    });

  it("vượt ngưỡng → 429, không đổi mã; khóa theo IP", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, retryAfterS: 60 });
    const { POST } = await import("@/app/api/bridge/activate/route");
    const res = await POST(kichHoat({ code: "ABCDEFGH" }));
    expect(res.status).toBe(429);
    expect(redeemActivationCode).not.toHaveBeenCalled();
    expect(checkRateLimit.mock.calls[0][1]).toEqual(["203.0.113.7"]);
  });

  it("mã sai → 400 kèm thông báo, không lộ gì thêm", async () => {
    checkRateLimit.mockResolvedValue({ ok: true, retryAfterS: 0 });
    redeemActivationCode.mockResolvedValue({ error: "Mã không hợp lệ hoặc đã hết hạn." });
    const { POST } = await import("@/app/api/bridge/activate/route");
    const res = await POST(kichHoat({ code: "SAI" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Mã không hợp lệ hoặc đã hết hạn." });
  });

  it("mã đúng → trả đủ cấu hình cho cầu in, không cache", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-cong-khai");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-bi-mat");
    checkRateLimit.mockResolvedValue({ ok: true, retryAfterS: 0 });
    redeemActivationCode.mockResolvedValue({ slug: "pho-viet", email: "print-pho-viet@bridge.local", password: "mk" });
    const { POST } = await import("@/app/api/bridge/activate/route");
    const res = await POST(kichHoat({ code: "ABCDEFGH" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({
      slug: "pho-viet",
      email: "print-pho-viet@bridge.local",
      password: "mk",
      appUrl: "https://app.example/r/pho-viet/pos",
    });
    expect(body.supabaseUrl).toBeTruthy();
    expect(body.anonKey).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("service-bi-mat");
    vi.unstubAllEnvs();
  });
});
