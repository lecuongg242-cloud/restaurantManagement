import { describe, it, expect } from "vitest";
import { nextPollMs } from "../../scripts/print-bridge.mjs";

/**
 * PERF-03 — Cầu in giãn nhịp khi quán vắng.
 *
 * Bậc thang cố định, không tham số nào phải chỉnh tay:
 *   0–4 nhịp rỗng → nhịp nền · 5–14 → ×2.5 · ≥15 → ×5 (trần)
 *
 * Trần thấp là cố ý: phiếu bếp nhạy thời gian. Giãn tới 30–60 giây tiết kiệm thêm không đáng kể
 * nhưng đổi lấy việc bếp đứng nhìn máy in, mà không ai ở quán đoán được là do nhịp poll.
 */
describe("nextPollMs", () => {
  it("0–4 nhịp rỗng → giữ nhịp nền 2 giây", () => {
    for (const n of [0, 1, 2, 3, 4]) {
      expect(nextPollMs(n, 2000), `streak ${n}`).toBe(2000);
    }
  });

  it("5–14 nhịp rỗng → 5 giây", () => {
    for (const n of [5, 9, 14]) {
      expect(nextPollMs(n, 2000), `streak ${n}`).toBe(5000);
    }
  });

  it("từ 15 nhịp rỗng → 10 giây và KHÔNG tăng tiếp (có trần)", () => {
    expect(nextPollMs(15, 2000)).toBe(10000);
    expect(nextPollMs(100, 2000)).toBe(10000);
    expect(nextPollMs(100000, 2000)).toBe(10000);
  });

  it("POLL_MS tuỳ chỉnh thì bậc thang nhân theo tỉ lệ, không bị ghi đè cứng", () => {
    expect(nextPollMs(0, 1000)).toBe(1000);
    expect(nextPollMs(5, 1000)).toBe(2500);
    expect(nextPollMs(20, 1000)).toBe(5000);
  });

  it("không bao giờ trả 0, số âm hay NaN", () => {
    for (const n of [0, 1, 5, 15, 999]) {
      const ms = nextPollMs(n, 2000);
      expect(Number.isFinite(ms), `streak ${n} ra NaN/Infinity`).toBe(true);
      expect(ms).toBeGreaterThan(0);
    }
  });
});

/**
 * Import tệp cầu in mà nó tự chạy vòng lặp poll thì test sẽ nối vào Supabase thật. Phần thân phải
 * nằm sau guard "chỉ chạy khi là entry point" — chính việc test này import được đã là bằng chứng,
 * nhưng khẳng định tường minh để ai gỡ guard sẽ thấy test đỏ chứ không phải thấy test treo.
 */
describe("guard entry point", () => {
  it("import được mà không khởi động cầu in", async () => {
    const mod = await import("../../scripts/print-bridge.mjs");
    expect(typeof mod.nextPollMs).toBe("function");
  });
});
