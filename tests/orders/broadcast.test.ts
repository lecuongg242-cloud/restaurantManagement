import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { broadcastOrderStatus, broadcastOrderStatuses, ORDER_CHANNEL } from "@/lib/orders/broadcast";

/**
 * PERF-01 — Phát trạng thái qua REST thay vì mở một WebSocket mỗi lần.
 *
 * Tính chất quan trọng nhất: N đơn → ĐÚNG MỘT request. Đó là thứ phá bỏ vòng lặp tuần tự ở
 * `pos/actions.ts` và `bill.ts` vốn làm đóng bill gộp chậm.
 */

/** Đơn giả: mọi truy vấn Supabase trả về một đơn hợp lệ, trừ id nằm trong `missing`. */
function stubSupabase(missing: string[] = []) {
  const single = (id: string) =>
    missing.includes(id)
      ? { data: null }
      : { data: { status: "confirmed", channel: "dine_in", cancel_reason: null } };

  return {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => single(val),
          order: async () => ({
            data: [{ id: "i1", name_snapshot: "Phở", qty: 1, status: "served" }],
          }),
        }),
      }),
    }),
    __table: undefined as unknown as string,
  };
}

const originalFetch = globalThis.fetch;
let calls: { url: string; body: { messages: { topic: string; event: string }[] } }[] = [];

beforeEach(() => {
  // Đặt env giả: test này kiểm HÌNH DẠNG request, không được phụ thuộc .env.local của máy ai.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  calls = [];
  globalThis.fetch = vi.fn(async (url: unknown, init: unknown) => {
    const opts = init as { body: string };
    calls.push({ url: String(url), body: JSON.parse(opts.body) });
    return { ok: true, status: 202, text: async () => "" } as unknown as Response;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("broadcastOrderStatuses", () => {
  it("năm đơn → ĐÚNG MỘT request, năm message", async () => {
    const ids = ["a", "b", "c", "d", "e"];
    await broadcastOrderStatuses(ids, stubSupabase());

    expect(calls, "phải gộp thành một request").toHaveLength(1);
    expect(calls[0].body.messages).toHaveLength(5);
    expect(calls[0].url).toContain("/realtime/v1/api/broadcast");
  });

  it("message mang đúng topic và event mà client đang nghe", async () => {
    await broadcastOrderStatuses(["abc"], stubSupabase());
    expect(calls[0].body.messages[0].topic).toBe(ORDER_CHANNEL("abc"));
    expect(calls[0].body.messages[0].event).toBe("status");
  });

  it("một đơn qua broadcastOrderStatus sinh cùng request như broadcastOrderStatuses", async () => {
    await broadcastOrderStatus("abc", stubSupabase());
    const motDon = JSON.stringify(calls[0].body);
    calls = [];
    await broadcastOrderStatuses(["abc"], stubSupabase());
    expect(JSON.stringify(calls[0].body)).toEqual(motDon);
  });

  it("danh sách rỗng → KHÔNG gọi mạng", async () => {
    await broadcastOrderStatuses([], stubSupabase());
    expect(calls).toHaveLength(0);
  });

  it("đơn không tồn tại bị bỏ qua, các đơn khác vẫn được gửi", async () => {
    await broadcastOrderStatuses(["a", "mat-tieu", "c"], stubSupabase(["mat-tieu"]));
    expect(calls).toHaveLength(1);
    expect(calls[0].body.messages.map((m) => m.topic)).toEqual([
      ORDER_CHANNEL("a"),
      ORDER_CHANNEL("c"),
    ]);
  });

  it("mạng hỏng → KHÔNG ném ra ngoài (thao tác nghiệp vụ không được hỏng theo)", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("mạng sập");
    }) as unknown as typeof fetch;
    await expect(broadcastOrderStatuses(["a"], stubSupabase())).resolves.toBeUndefined();
  });

  it("máy chủ trả 500 → KHÔNG ném ra ngoài", async () => {
    globalThis.fetch = vi.fn(async () => {
      return { ok: false, status: 500, text: async () => "boom" } as unknown as Response;
    }) as unknown as typeof fetch;
    await expect(broadcastOrderStatuses(["a"], stubSupabase())).resolves.toBeUndefined();
  });
});

describe("không còn WebSocket", () => {
  it("broadcast.ts không còn mở kênh Realtime nào", () => {
    const src = fs.readFileSync("lib/orders/broadcast.ts", "utf8");
    const soLanMoKenh = (src.match(/\.channel\(/g) ?? []).length;
    expect(soLanMoKenh, "WebSocket đã quay lại broadcast.ts").toBe(0);
  });
});
