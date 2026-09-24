import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A } from "./setup";
import { adminClient, cleanupFixtures, seedFixtures } from "./fixtures";
import { cauInConSongCua, thayTheLuotDangCho, demPhieuHomNay } from "@/lib/print/cau-in-db";

/**
 * PRINT-08 + PRINT-06 — hai quyết định server đưa ra khi nhân viên bấm "Phiếu bếp", chạy bằng
 * đúng quyền của nhân viên (RLS thật), không phải service-role.
 */
let chuA: SupabaseClient;
let tenantA: string;
const DON = "e2e-sup-order";

beforeAll(async () => {
  const ids = await seedFixtures();
  tenantA = ids.tenantA;
  chuA = await signInAs(OWNER_A.email, OWNER_A.password);
}, 120_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("print_jobs").delete().filter("payload->>orderId", "in", `(${DON},don-khac)`);
  await admin.from("printer_heartbeats").delete().eq("tenant_id", tenantA);
  await cleanupFixtures();
}, 120_000);

async function datNhipTim(seenAt: string | null) {
  const admin = adminClient();
  await admin.from("printer_heartbeats").delete().eq("tenant_id", tenantA);
  if (seenAt) await admin.from("printer_heartbeats").insert({ tenant_id: tenantA, seen_at: seenAt });
}

describe("cauInConSongCua", () => {
  it("quán chưa từng có cầu in → KHÔNG xếp phiếu vào hàng đợi", async () => {
    await datNhipTim(null);
    expect(await cauInConSongCua(chuA, tenantA)).toBe(false);
  });

  it("nhịp tim vừa xong → xếp hàng", async () => {
    await datNhipTim(new Date().toISOString());
    expect(await cauInConSongCua(chuA, tenantA)).toBe(true);
  });

  it("nhịp tim cũ 5 phút → in trình duyệt", async () => {
    await datNhipTim(new Date(Date.now() - 5 * 60_000).toISOString());
    expect(await cauInConSongCua(chuA, tenantA)).toBe(false);
  });
});

describe("thayTheLuotDangCho", () => {
  async function them(orderId: string, status: string) {
    const { data, error } = await adminClient()
      .from("print_jobs")
      .insert({ tenant_id: tenantA, type: "kitchen_ticket", payload: { orderId }, status })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }
  async function trangThai(id: string) {
    const { data } = await adminClient().from("print_jobs").select("status").eq("id", id).single();
    return data!.status as string;
  }

  it("lượt cũ còn pending → superseded; cầu in sống lại không in thêm tờ cũ", async () => {
    const cu = await them(DON, "pending");
    await thayTheLuotDangCho(chuA, tenantA, DON);
    expect(await trangThai(cu)).toBe("superseded");
  });

  it("lượt ĐÃ IN và lượt HỎNG giữ nguyên — không viết lại lịch sử", async () => {
    const daIn = await them(DON, "printed");
    const hong = await them(DON, "failed");
    await thayTheLuotDangCho(chuA, tenantA, DON);
    expect(await trangThai(daIn)).toBe("printed");
    expect(await trangThai(hong)).toBe("failed");
  });

  it("đơn KHÁC không bị đụng tới", async () => {
    const khac = await them("don-khac", "pending");
    await thayTheLuotDangCho(chuA, tenantA, DON);
    expect(await trangThai(khac)).toBe("pending");
  });
});

/**
 * PRINT-09 — khối "Hôm nay" trên màn Máy in.
 *
 * Đếm bằng truy vấn đếm của DATABASE, không tải danh sách về rồi đếm: PostgREST trả tối đa 1.000 dòng
 * mỗi lần, và ngày đông quá số đó thì màn hình đếm THIẾU mà không báo gì (REPORT-04 từng dính đúng
 * lỗi này). Test chèn hơn 1.000 phiếu để chứng minh.
 */
describe("demPhieuHomNay", () => {
  const TU = new Date(Date.now() - 60 * 60_000).toISOString(); // mốc "đầu ngày" giả: 1 giờ trước

  afterAll(async () => {
    await adminClient().from("print_jobs").delete().eq("tenant_id", tenantA).filter("payload->>orderId", "eq", "e2e-dem");
  });

  async function chen(status: string, soPhut: number, soDon: number | null, n = 1) {
    const rows = Array.from({ length: n }, () => ({
      tenant_id: tenantA,
      type: "kitchen_ticket",
      status,
      payload: { orderId: "e2e-dem", kitchenNo: soDon },
      created_at: new Date(Date.now() - soPhut * 60_000).toISOString(),
      printed_at: status === "printed" ? new Date(Date.now() - soPhut * 60_000 + 3000).toISOString() : null,
    }));
    const { error } = await adminClient().from("print_jobs").insert(rows);
    if (error) throw error;
  }

  it("đếm đúng từng loại, kể cả khi quá 1.000 phiếu; superseded không tính", async () => {
    // Đo CHÊNH LỆCH: các test trước trong tệp này cũng chèn phiếu cho quán A trong giờ qua.
    const truoc = await demPhieuHomNay(chuA, tenantA, TU);
    await chen("printed", 30, 1, 1005); // vượt ngưỡng 1.000 của PostgREST
    await chen("failed", 20, 41);
    await chen("failed", 10, 42);
    await chen("pending", 0, 43); // vừa gửi → đang chờ
    await chen("pending", 5, 44); // 5 phút → kẹt
    await chen("superseded", 15, 45);
    await chen("printed", 120, 46); // TRƯỚC mốc đầu ngày → không tính

    const r = await demPhieuHomNay(chuA, tenantA, TU);
    expect({
      daIn: r.daIn - truoc.daIn,
      loi: r.loi - truoc.loi,
      dangCho: r.dangCho - truoc.dangCho,
      ket: r.ket - truoc.ket,
    }).toEqual({ daIn: 1005, loi: 2, dangCho: 1, ket: 1 });
    // Chỉ xét phiếu của test này (41, 42); test trước trong tệp cũng để lại phiếu lỗi không số đơn.
    const cuaTest = r.loiGanDay.map((x) => x.soDon).filter((n) => n === 41 || n === 42);
    expect(cuaTest).toEqual([42, 41]); // mới nhất trước
    expect(r.inGanNhat).not.toBeNull();
  }, 60_000);
});
