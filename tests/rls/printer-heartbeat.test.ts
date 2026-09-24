import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { signInAs, OWNER_A, OWNER_B } from "./setup";
import { adminClient, cleanupFixtures, fid, IDX, seedFixtures } from "./fixtures";
import { bridgeEmailForSlug, provisionPrintBridgeAccount } from "@/lib/print/bridge-account";

config({ path: ".env.local" });
config();

/**
 * PRINT-08 — Nhịp tim cầu in.
 *
 * Nhịp tim quyết định POS xếp phiếu bếp vào hàng đợi hay in trình duyệt. Giả được nhịp tim là giả
 * được "cầu in còn sống" → phiếu bếp đi vào hàng đợi không ai lấy, đúng lỗi 24/09/2026. Vì vậy chỉ
 * tài khoản `printer` được ghi, và chỉ cho quán của chính nó.
 */
let printer: SupabaseClient;
let chuA: SupabaseClient;
let chuB: SupabaseClient;
let anon: SupabaseClient;
let tenantA: string;

beforeAll(async () => {
  const ids = await seedFixtures();
  tenantA = ids.tenantA;

  const admin = adminClient();
  const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantA).maybeSingle();
  const { email, password } = await provisionPrintBridgeAccount(admin, {
    tenantId: tenantA,
    slug: OWNER_A.slug,
    name: tenant!.name,
  });
  printer = await signInAs(email, password);
  chuA = await signInAs(OWNER_A.email, OWNER_A.password);
  chuB = await signInAs(OWNER_B.email, OWNER_B.password);
  anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}, 120_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("printer_heartbeats").delete().eq("tenant_id", tenantA);
  await admin.from("print_jobs").delete().eq("status", "superseded").eq("tenant_id", tenantA);
  const email = bridgeEmailForSlug(OWNER_A.slug);
  await admin.from("memberships").delete().eq("email", email);
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users.find((x) => (x.email ?? "").toLowerCase() === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
  await cleanupFixtures();
}, 120_000);

describe("Nhịp tim cầu in", () => {
  it("cầu in của quán A báo sống được, mốc giờ do database ghi", async () => {
    const truoc = Date.now();
    const { data, error } = await printer.rpc("printer_heartbeat");
    expect(error).toBeNull();

    const { data: dong } = await adminClient()
      .from("printer_heartbeats")
      .select("seen_at")
      .eq("tenant_id", tenantA)
      .maybeSingle();
    expect(dong, "gọi thành công mà không có dòng nào được ghi").not.toBeNull();
    expect(data).toBe(dong!.seen_at);
    // Nới 60 giây cho lệch đồng hồ máy dev — thứ cần chứng minh là mốc giờ MỚI, không phải cũ.
    expect(Math.abs(Date.parse(dong!.seen_at) - truoc)).toBeLessThan(60_000);
  });

  it("báo sống lần nữa → cập nhật tại chỗ, không đẻ thêm dòng", async () => {
    await printer.rpc("printer_heartbeat");
    await printer.rpc("printer_heartbeat");
    const { data } = await adminClient().from("printer_heartbeats").select("tenant_id").eq("tenant_id", tenantA);
    expect(data ?? []).toHaveLength(1);
  });

  it("thành viên KHÔNG phải printer (chủ quán) không giả được nhịp tim", async () => {
    const { error } = await chuA.rpc("printer_heartbeat");
    expect(error, "chủ quán giả được 'cầu in còn sống'").not.toBeNull();
    // Phải là HÀM từ chối, không phải "không tìm thấy hàm" — lỗi kia cũng làm test này xanh.
    expect(error!.message).toContain("chi tai khoan cau in");
  });

  it("khách vãng lai (anon) không gọi được", async () => {
    const { error } = await anon.rpc("printer_heartbeat");
    expect(error).not.toBeNull();
    // anon bị chặn ở quyền EXECUTE (revoke), trước cả khi vào thân hàm.
    expect(error!.message).toMatch(/permission denied/i);
  });

  it("nhân viên quán A đọc được nhịp tim quán A (POS cần để quyết đường in)", async () => {
    const { data, error } = await chuA.from("printer_heartbeats").select("seen_at").eq("tenant_id", tenantA);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  it("quán B KHÔNG đọc được nhịp tim quán A", async () => {
    const { data } = await chuB.from("printer_heartbeats").select("seen_at").eq("tenant_id", tenantA);
    expect(data ?? [], "RÒ RỈ: quán B thấy nhịp tim quán A").toHaveLength(0);
  });

  it("không ai ghi thẳng vào bảng được — chỉ qua hàm", async () => {
    const xua = "2000-01-01T00:00:00.000Z";
    await chuA.from("printer_heartbeats").update({ seen_at: xua }).eq("tenant_id", tenantA);
    await printer.from("printer_heartbeats").update({ seen_at: xua }).eq("tenant_id", tenantA);
    const { data } = await adminClient()
      .from("printer_heartbeats")
      .select("seen_at")
      .eq("tenant_id", tenantA)
      .maybeSingle();
    expect(data!.seen_at, "ghi thẳng được vào bảng nhịp tim").not.toBe(xua);
  });
});

describe("Trạng thái superseded (PRINT-06)", () => {
  it("print_jobs nhận trạng thái superseded", async () => {
    const { error } = await adminClient()
      .from("print_jobs")
      .update({ status: "superseded" })
      .eq("id", fid("A", IDX.print_jobs));
    expect(error).toBeNull();
  });

  it("phiếu superseded KHÔNG lọt vào truy vấn của cầu in (chỉ lấy pending)", async () => {
    const { data } = await printer
      .from("print_jobs")
      .select("id")
      .eq("tenant_id", tenantA)
      .eq("status", "pending")
      .eq("id", fid("A", IDX.print_jobs));
    expect(data ?? []).toHaveLength(0);
  });
});

/**
 * PRINT-09 — cầu in báo kèm trạng thái máy in.
 *
 * Cầu in bản cũ ở quán gọi hàm KHÔNG tham số. Nó phải vẫn chạy (không được làm chết cầu in đang in
 * phiếu thật) và không được xóa kết quả thử máy in do bản mới ghi.
 */
describe("Trạng thái máy in trong nhịp tim", () => {
  async function dong() {
    const { data } = await adminClient()
      .from("printer_heartbeats")
      .select("seen_at, printer_ok, printer_host, printer_checked_at")
      .eq("tenant_id", tenantA)
      .single();
    return data!;
  }

  it("cầu in báo máy in KHÔNG phản hồi → ghi lại, kèm địa chỉ và mốc giờ database", async () => {
    const { error } = await printer.rpc("printer_heartbeat", {
      p_printer_ok: false,
      p_printer_host: "192.168.1.87:9100",
    });
    expect(error).toBeNull();
    const d = await dong();
    expect(d.printer_ok).toBe(false);
    expect(d.printer_host).toBe("192.168.1.87:9100");
    expect(d.printer_checked_at).toBe(d.seen_at);
  });

  it("cầu in BẢN CŨ gọi không tham số → vẫn chạy, và KHÔNG xóa kết quả máy in", async () => {
    await printer.rpc("printer_heartbeat", { p_printer_ok: true, p_printer_host: "192.168.1.87:9100" });
    const truoc = await dong();
    await new Promise((r) => setTimeout(r, 1100));

    const { error } = await printer.rpc("printer_heartbeat");
    expect(error, "cầu in bản cũ ở quán bị gãy").toBeNull();

    const sau = await dong();
    expect(sau.printer_ok).toBe(true);
    expect(sau.printer_host).toBe("192.168.1.87:9100");
    expect(sau.printer_checked_at, "mốc thử máy in bị đổi dù không thử").toBe(truoc.printer_checked_at);
    expect(Date.parse(sau.seen_at)).toBeGreaterThan(Date.parse(truoc.seen_at));
  });

  it("địa chỉ quá dài bị cắt — cột này do máy ở quán ghi, không tin độ dài", async () => {
    await printer.rpc("printer_heartbeat", { p_printer_ok: true, p_printer_host: "x".repeat(500) });
    expect((await dong()).printer_host!.length).toBeLessThanOrEqual(100);
  });

  it("chủ quán kèm tham số vẫn KHÔNG giả được", async () => {
    const { error } = await chuA.rpc("printer_heartbeat", { p_printer_ok: true, p_printer_host: "h" });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("chi tai khoan cau in");
  });
});
