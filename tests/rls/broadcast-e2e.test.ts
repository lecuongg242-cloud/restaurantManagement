import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { broadcastOrderStatus, ORDER_CHANNEL } from "@/lib/orders/broadcast";
import { adminClient, cleanupFixtures, fid, IDX, seedFixtures } from "./fixtures";

config({ path: ".env.local" });
config();

/**
 * PERF-01 — Đổi cơ chế phát trạng thái mà khách vẫn nhận được.
 *
 * Mọi test mock chỉ chứng minh hình dạng request; chỉ test này chứng minh thứ thật sự quan trọng —
 * khách đang mở trang theo dõi vẫn thấy trạng thái đổi. Nếu chỉ có test mock thì một ngày nào đó
 * tên topic đổi và cả bộ test vẫn xanh trong khi khách không nhận được gì.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let khach: SupabaseClient;
let orderId: string;

beforeAll(async () => {
  await seedFixtures();
  orderId = fid("A", IDX.orders);
  khach = createClient(URL, ANON, { auth: { persistSession: false } });
}, 120_000);

afterAll(async () => {
  await cleanupFixtures();
}, 120_000);

describe("Khách nhận được trạng thái qua REST broadcast", () => {
  it("nhận đúng payload trong ≤ 2 giây", async () => {
    const nhanDuoc: Record<string, unknown>[] = [];
    const ch = khach
      .channel(ORDER_CHANNEL(orderId))
      .on("broadcast", { event: "status" }, (m) => nhanDuoc.push(m.payload));

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("không subscribe được")), 15_000);
      ch.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          clearTimeout(t);
          resolve();
        }
      });
    });

    const t0 = Date.now();
    await broadcastOrderStatus(orderId);

    for (let i = 0; i < 40 && nhanDuoc.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const doTre = Date.now() - t0;

    await khach.removeChannel(ch);

    expect(nhanDuoc, "khách KHÔNG nhận được gì — cơ chế phát đã hỏng").toHaveLength(1);
    expect(doTre, `độ trễ ${doTre}ms, quá 2 giây`).toBeLessThan(2000);
    // Fixture dựng đơn `confirmed` với đúng 1 món.
    expect(nhanDuoc[0]).toMatchObject({ status: "confirmed", channel: "dine_in" });
    expect((nhanDuoc[0] as { items: unknown[] }).items).toHaveLength(1);
  }, 60_000);

  it("đơn không tồn tại → không phát gì, không ném lỗi", async () => {
    const admin = adminClient();
    const { data } = await admin.from("orders").select("id").eq("id", fid("A", 99)).maybeSingle();
    expect(data, "id này phải không tồn tại để phép thử có nghĩa").toBeNull();

    await expect(broadcastOrderStatus(fid("A", 99))).resolves.toBeUndefined();
  }, 30_000);
});
