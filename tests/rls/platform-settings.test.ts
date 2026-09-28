import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A } from "./setup";
import { adminClient } from "./fixtures";

/**
 * 0060 — `platform_settings` chỉ super-admin đọc/ghi qua phiên; owner quán không đọc, không ghi. Bảng dùng
 * chung với production ⇒ chụp dòng hiện có trước, trả lại nguyên trạng ở afterAll. Super-admin là tài
 * khoản tạm, mật khẩu ngẫu nhiên, xóa sau khi chạy.
 */
let goc: Record<string, unknown> | null = null;
let suId = "";
let superAdmin: SupabaseClient;
let owner: SupabaseClient;

beforeAll(async () => {
  const admin = adminClient();
  goc = (await admin.from("platform_settings").select("*").maybeSingle()).data;
  const email = `p13-platform-${crypto.randomUUID().slice(0, 8)}@test.local`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("không tạo được user tạm");
  suId = data.user.id;
  await admin.from("super_admins").insert({ user_id: suId });
  superAdmin = await signInAs(email, password);
  owner = await signInAs(OWNER_A.email, OWNER_A.password);
}, 120_000);

afterAll(async () => {
  const admin = adminClient();
  if (goc) await admin.from("platform_settings").upsert(goc);
  else await admin.from("platform_settings").delete().eq("id", true);
  await admin.from("super_admins").delete().eq("user_id", suId);
  if (suId) await admin.auth.admin.deleteUser(suId);
}, 120_000);

describe("platform_settings — RLS", () => {
  it("super-admin ghi và đọc được", async () => {
    const { error } = await superAdmin
      .from("platform_settings")
      .upsert({ id: true, bank_bin: "970436", bank_account_no: "0123456789", bank_account_name: "TEST RLS" });
    expect(error).toBeNull();
    const { data } = await superAdmin.from("platform_settings").select("bank_account_name").maybeSingle();
    expect(data?.bank_account_name).toBe("TEST RLS");
  }, 60_000);

  it("owner quán đọc = 0 dòng, ghi bị chặn, dữ liệu không đổi", async () => {
    const { data } = await owner.from("platform_settings").select("id");
    expect(data ?? []).toHaveLength(0);
    await owner.from("platform_settings").upsert({ id: true, bank_account_no: "999999999" });
    await owner.from("platform_settings").update({ bank_account_no: "999999999" }).eq("id", true);
    const { data: sau } = await adminClient().from("platform_settings").select("bank_account_no").maybeSingle();
    expect(sau?.bank_account_no).toBe("0123456789");
  }, 60_000);

  it("ràng buộc: số TK / BIN sai định dạng, dòng thứ hai → bị từ chối", async () => {
    expect((await superAdmin.from("platform_settings").update({ bank_account_no: "12ab" }).eq("id", true)).error).not.toBeNull();
    expect((await superAdmin.from("platform_settings").update({ bank_bin: "12" }).eq("id", true)).error).not.toBeNull();
    expect((await adminClient().from("platform_settings").insert({ id: false })).error).not.toBeNull();
  }, 60_000);
});

describe("platform_plans (0061) — RLS", () => {
  const TEN = "TEST-RLS-GOI";
  afterAll(async () => {
    await adminClient().from("platform_plans").delete().eq("name", TEN);
  });

  it("super-admin thêm, sửa, đọc được gói; ràng buộc giá > 0 và thời hạn 1–120", async () => {
    const { data, error } = await superAdmin.from("platform_plans").insert({ name: TEN, months: 24, price: 5_500_000 }).select("id");
    expect(error).toBeNull();
    const id = data![0].id as string;
    expect((await superAdmin.from("platform_plans").update({ price: 5_000_000 }).eq("id", id)).error).toBeNull();
    expect((await superAdmin.from("platform_plans").update({ price: 0 }).eq("id", id)).error).not.toBeNull();
    expect((await superAdmin.from("platform_plans").update({ months: 0 }).eq("id", id)).error).not.toBeNull();
    const { data: doc } = await superAdmin.from("platform_plans").select("price").eq("id", id).single();
    expect(doc?.price).toBe(5_000_000);
  }, 60_000);

  it("owner quán đọc = 0 dòng, không thêm/sửa/xóa được", async () => {
    const { data } = await owner.from("platform_plans").select("id");
    expect(data ?? []).toHaveLength(0);
    expect((await owner.from("platform_plans").insert({ name: TEN, months: 1, price: 1 })).error).not.toBeNull();
    await owner.from("platform_plans").update({ price: 1 }).eq("name", TEN);
    await owner.from("platform_plans").delete().eq("name", TEN);
    const { data: con } = await adminClient().from("platform_plans").select("price").eq("name", TEN);
    expect(con).toEqual([{ price: 5_000_000 }]);
  }, 60_000);
});
