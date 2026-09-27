import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { signInAs, OWNER_A } from "./setup";
import { adminClient, seedFixtures } from "./fixtures";

config({ path: ".env.local" });
config();

/**
 * TENANT-07 — bộ đếm giới hạn tần suất trên DB thật (migration 0050).
 * Chỉ service_role gọi được RPC và chạm được bảng: anon hay nhân viên đã đăng nhập tự đặt lại bộ đếm
 * của mình là giới hạn vô nghĩa.
 */
let admin: SupabaseClient;
let anon: SupabaseClient;
let chuA: SupabaseClient;
const PREFIX = `test-rl-${crypto.randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  await seedFixtures();
  admin = adminClient();
  anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  chuA = await signInAs(OWNER_A.email, OWNER_A.password);
}, 120_000);

afterAll(async () => {
  await admin.from("rate_limit_hits").delete().like("key", `${PREFIX}%`);
});

const hit = (c: SupabaseClient, key: string, windowS = 60, max = 3) =>
  c.rpc("rate_limit_hit", { p_key: key, p_window_s: windowS, p_max: max });

describe("rate_limit_hit", () => {
  it("trong ngưỡng → true; lượt max+1 → false", async () => {
    const k = `${PREFIX}-a`;
    const kq: unknown[] = [];
    for (let i = 0; i < 4; i++) kq.push((await hit(admin, k)).data);
    expect(kq).toEqual([true, true, true, false]);
  });

  it("khóa khác nhau không ảnh hưởng nhau (hai bàn cùng wifi)", async () => {
    for (let i = 0; i < 4; i++) await hit(admin, `${PREFIX}-ban1`);
    expect((await hit(admin, `${PREFIX}-ban2`)).data).toBe(true);
  });

  it("sang cửa sổ mới → được lại", async () => {
    // Cửa sổ 2 giây, ngưỡng 1. Cửa sổ chia theo đồng hồ DB, nên hai lượt liên tiếp có thể rơi đúng
    // biên cửa sổ (lượt 2 thành lượt đầu của cửa sổ mới). Gặp vậy thì thử lại với khóa mới — không
    // canh theo đồng hồ máy, vì đồng hồ máy lệch với DB (bài học P9).
    let k = "";
    let bichan = false;
    for (let lan = 0; lan < 3 && !bichan; lan++) {
      k = `${PREFIX}-cua-so-${lan}`;
      const dau = (await hit(admin, k, 2, 1)).data;
      const sau = (await hit(admin, k, 2, 1)).data;
      bichan = dau === true && sau === false;
    }
    expect(bichan).toBe(true);
    // 2,1 giây > độ dài cửa sổ ⇒ chắc chắn đã sang cửa sổ khác.
    await new Promise((r) => setTimeout(r, 2100));
    expect((await hit(admin, k, 2, 1)).data).toBe(true);
  });

  it("tham số sai → lỗi, không ghi", async () => {
    const { error } = await hit(admin, `${PREFIX}-sai`, 0, 3);
    expect(error).not.toBeNull();
  });

  it("anon và nhân viên đã đăng nhập KHÔNG gọi được RPC", async () => {
    expect((await hit(anon, `${PREFIX}-anon`)).error).not.toBeNull();
    expect((await hit(chuA, `${PREFIX}-chu`)).error).not.toBeNull();
  });

  it("anon và nhân viên KHÔNG đọc/ghi/xóa được bảng", async () => {
    for (const c of [anon, chuA]) {
      const { data } = await c.from("rate_limit_hits").select("key").like("key", `${PREFIX}%`);
      expect(data ?? []).toHaveLength(0);
      await c.from("rate_limit_hits").delete().like("key", `${PREFIX}%`);
      const { error: insErr } = await c
        .from("rate_limit_hits")
        .insert({ key: `${PREFIX}-gia`, window_start: new Date().toISOString(), hits: 0 });
      expect(insErr).not.toBeNull();
    }
    // Đối chứng dương: service_role vẫn thấy các dòng của test — xóa ở trên không có tác dụng.
    const { data } = await admin.from("rate_limit_hits").select("key").like("key", `${PREFIX}%`);
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});
