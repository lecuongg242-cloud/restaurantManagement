import { describe, it, expect, vi, afterEach } from "vitest";
import { logRequest, timed } from "@/lib/observability/log";

/**
 * PERF-04 — Log phải đọc được bằng máy, không làm hỏng request, và không rò token bàn.
 * Query string của bề mặt khách chứa `?t=<qr_token>` — khóa mở bàn. Ghi nó vào log là đem khóa
 * đi rải khắp nơi lưu log.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

function capture(): { lines: string[]; spy: ReturnType<typeof vi.spyOn> } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  return { lines, spy };
}

describe("logRequest", () => {
  it("in đúng một dòng JSON đủ 5 trường", () => {
    const { lines } = capture();
    logRequest({ evt: "req", tenant: "pho-viet", path: "/r/pho-viet/pos", ms: 42, status: 200 });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toEqual({
      evt: "req",
      tenant: "pho-viet",
      path: "/r/pho-viet/pos",
      ms: 42,
      status: 200,
    });
  });

  it("cắt query string — token bàn KHÔNG được lọt vào log", () => {
    const { lines } = capture();
    logRequest({
      evt: "req",
      tenant: "pho-viet",
      path: "/r/pho-viet/menu?t=b98186ed87d27ff86d",
      ms: 10,
      status: 200,
    });

    expect(JSON.parse(lines[0]).path).toBe("/r/pho-viet/menu");
    expect(lines[0], "RÒ RỈ: token bàn lọt vào log").not.toContain("b98186ed87d27ff86d");
  });

  it("route ngoài /r/* vẫn được log với tenant null", () => {
    const { lines } = capture();
    logRequest({ evt: "req", tenant: null, path: "/super", ms: 5, status: 200 });
    expect(JSON.parse(lines[0]).tenant).toBeNull();
  });

  it("nuốt lỗi — đường ghi log không bao giờ làm hỏng request", () => {
    vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("log sink chết");
    });
    expect(() =>
      logRequest({ evt: "req", tenant: "x", path: "/r/x", ms: 1, status: 200 })
    ).not.toThrow();
  });
});

describe("timed", () => {
  it("trả đúng giá trị của fn và ghi thời lượng thật", async () => {
    const { lines } = capture();
    const ketQua = await timed("getPosSnapshot", "pho-viet", async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true };
    });

    expect(ketQua).toEqual({ ok: true });
    const parsed = JSON.parse(lines[0]);
    expect(parsed.evt).toBe("op");
    expect(parsed.name).toBe("getPosSnapshot");
    expect(parsed.tenant).toBe("pho-viet");
    expect(parsed.ms).toBeGreaterThanOrEqual(15);
  });

  it("fn ném lỗi → vẫn ghi log rồi NÉM TIẾP (không nuốt lỗi nghiệp vụ)", async () => {
    const { lines } = capture();
    await expect(
      timed("getCustomerMenu", "bun-bo", async () => {
        throw new Error("DB sập");
      })
    ).rejects.toThrow("DB sập");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ evt: "op", name: "getCustomerMenu", ok: false });
  });
});
