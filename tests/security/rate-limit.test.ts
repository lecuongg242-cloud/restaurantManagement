import { describe, it, expect, vi } from "vitest";
import {
  RULES,
  hashKey,
  retryAfterS,
  clientIp,
  checkRateLimit,
  tooManyMessage,
} from "@/lib/security/rate-limit";

/**
 * TENANT-07 — một quán (hoặc một kẻ phá) dội đường ẩn danh không được kéo chậm quán khác.
 * Ngưỡng đặt từ số đo production 26/09/2026: mỗi bàn tối đa 1 đơn QR/phút, 1 lượt gọi nhân viên/phút
 * (xem 11-03-SUMMARY). Ngưỡng ở đây gấp ≥5 lần đỉnh thật.
 */
describe("hashKey", () => {
  it("ổn định, khác nhau theo luật và theo phần khóa", () => {
    const a = hashKey(RULES.order, ["tok-1"], "k");
    expect(hashKey(RULES.order, ["tok-1"], "k")).toBe(a);
    expect(hashKey(RULES.order, ["tok-2"], "k")).not.toBe(a);
    expect(hashKey(RULES.call, ["tok-1"], "k")).not.toBe(a);
  });

  it("không chứa IP/token thô — IP là dữ liệu cá nhân", () => {
    const k = hashKey(RULES.lead, ["203.0.113.7"], "k");
    expect(k).not.toContain("203.0.113.7");
    expect(k).toMatch(/^lead:[0-9a-f]{32}$/);
  });

  it("đổi khóa bí mật → đổi băm (không dò ngược IP bằng từ điển)", () => {
    expect(hashKey(RULES.lead, ["203.0.113.7"], "k1")).not.toBe(hashKey(RULES.lead, ["203.0.113.7"], "k2"));
  });
});

describe("retryAfterS", () => {
  it("số giây tới hết cửa sổ cố định, tối thiểu 1", () => {
    expect(retryAfterS(60, Date.UTC(2026, 8, 26, 10, 0, 15))).toBe(45);
    expect(retryAfterS(60, Date.UTC(2026, 8, 26, 10, 0, 59, 900))).toBe(1);
    expect(retryAfterS(600, Date.UTC(2026, 8, 26, 10, 3, 0))).toBe(420);
  });
});

describe("clientIp", () => {
  it("ưu tiên x-real-ip, rồi phần đầu x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 10.0.0.1" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers())).toBe("khong-ro");
  });
});

describe("checkRateLimit", () => {
  const now = () => Date.UTC(2026, 8, 26, 10, 0, 20);

  it("RPC trả true → cho qua", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    expect(await checkRateLimit(RULES.order, ["t"], { rpc, now, secret: "k" })).toEqual({ ok: true, retryAfterS: 0 });
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_key: hashKey(RULES.order, ["t"], "k"),
      p_window_s: RULES.order.windowS,
      p_max: RULES.order.max,
    });
  });

  it("RPC trả false → chặn, kèm số giây chờ", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    expect(await checkRateLimit(RULES.order, ["t"], { rpc, now, secret: "k" })).toEqual({ ok: false, retryAfterS: 40 });
  });

  it("RPC lỗi hoặc ném → CHO QUA: bộ đếm hỏng không được làm quán không bán được", async () => {
    const loi = vi.fn().mockResolvedValue({ data: null, error: { message: "db down" } });
    const nem = vi.fn().mockRejectedValue(new Error("network"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await checkRateLimit(RULES.order, ["t"], { rpc: loi, now, secret: "k" })).ok).toBe(true);
    expect((await checkRateLimit(RULES.order, ["t"], { rpc: nem, now, secret: "k" })).ok).toBe(true);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("tooManyMessage", () => {
  it("tiếng Việt, có số giây", () => {
    expect(tooManyMessage(45)).toMatch(/45 giây/);
  });
});

describe("RULES — ngưỡng gấp ≥5 lần đỉnh đo được", () => {
  it("đơn QR và gọi nhân viên theo phút", () => {
    expect(RULES.order).toMatchObject({ windowS: 60 });
    expect(RULES.order.max).toBeGreaterThanOrEqual(5);
    expect(RULES.call.max).toBeGreaterThanOrEqual(5);
  });
});
