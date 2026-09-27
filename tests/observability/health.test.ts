import { describe, it, expect } from "vitest";
import { checkHealth, healthBody } from "@/lib/observability/health";

/**
 * OPS-10 — `/api/health` là thứ dịch vụ ngoài gọi 5 phút/lần để biết hệ thống còn sống.
 * Sai theo hướng "treo" nguy hiểm hơn sai theo hướng "chết": DB treo mà endpoint treo theo thì bộ
 * theo dõi chỉ thấy timeout của chính nó, không phải một câu trả lời "chết" rõ ràng.
 */
describe("checkHealth", () => {
  it("probe chạy xong → sống", async () => {
    expect(await checkHealth(async () => {}, 1000)).toEqual({ ok: true });
  });

  it("probe ném lỗi → chết", async () => {
    const r = await checkHealth(async () => {
      throw new Error("connection refused");
    }, 1000);
    expect(r).toEqual({ ok: false });
  });

  it("probe treo → chết đúng hạn, không treo theo", async () => {
    const t0 = Date.now();
    const r = await checkHealth(() => new Promise<void>(() => {}), 80);
    const ms = Date.now() - t0;
    expect(r).toEqual({ ok: false });
    expect(ms).toBeGreaterThanOrEqual(70);
    expect(ms).toBeLessThan(1000);
  });
});

describe("healthBody", () => {
  it("chỉ trả ok — không lộ thông điệp lỗi, host hay phiên bản", () => {
    const body = healthBody({ ok: false });
    expect(Object.keys(body)).toEqual(["ok"]);
    expect(JSON.stringify(body)).not.toMatch(/error|supabase|version|host/i);
  });
});
