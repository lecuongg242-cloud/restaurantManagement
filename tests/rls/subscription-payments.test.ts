import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B } from "./setup";
import { adminClient, cleanupFixtures, seedFixtures } from "./fixtures";
import { GRACE_DAYS, hanSauGiaHan, homNayHanDung } from "@/lib/tenant/subscription";

/**
 * SUB-04 — gia hạn tay (0058). Chỉ super-admin ghi nhận được; cộng hạn + nhật ký trong MỘT giao dịch;
 * owner đọc được nhật ký của quán mình, vai khác không thấy gì.
 *
 * DB dùng chung với quán thật ⇒ chỉ đụng tenant demo B (và một dòng nhật ký giả của A để kiểm cách
 * ly). Tài khoản tạm (super-admin, manager, cashier) mật khẩu ngẫu nhiên, xóa sạch ở afterAll.
 */
const NOTE = "TEST-P13-04";

type TamThoi = { id: string; email: string; password: string };
const tamThoi: TamThoi[] = [];
let tenantA: string;
let tenantB: string;
let superAdmin: SupabaseClient;
let ownerB: SupabaseClient;
let managerB: SupabaseClient;
let cashierB: SupabaseClient;

async function taoTaiKhoan(nhan: string): Promise<TamThoi> {
  const email = `p13-${nhan}-${crypto.randomUUID().slice(0, 8)}@test.local`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data, error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("không tạo được user tạm");
  const t = { id: data.user.id, email, password };
  tamThoi.push(t);
  return t;
}

async function nhanVienB(role: "manager" | "cashier"): Promise<SupabaseClient> {
  const u = await taoTaiKhoan(role);
  const { error } = await adminClient()
    .from("memberships")
    .insert({ tenant_id: tenantB, user_id: u.id, role, display_name: NOTE, active: true });
  if (error) throw error;
  return signInAs(u.email, u.password);
}

async function paidUntilB(): Promise<string | null> {
  const { data } = await adminClient().from("tenants").select("paid_until").eq("id", tenantB).single();
  return data!.paid_until as string | null;
}

async function soDongNhatKyB(): Promise<number> {
  const { count } = await adminClient()
    .from("subscription_payments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantB);
  return count ?? 0;
}

async function setPaidUntilB(v: string | null) {
  const { error } = await adminClient().from("tenants").update({ paid_until: v }).eq("id", tenantB);
  if (error) throw error;
}

function ngayCach(n: number): string {
  const t = homNayHanDung();
  return new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10) + n)).toISOString().slice(0, 10);
}

beforeAll(async () => {
  const ids = await seedFixtures();
  tenantA = ids.tenantA;
  tenantB = ids.tenantB;
  await setPaidUntilB(null);

  const su = await taoTaiKhoan("super");
  const { error } = await adminClient().from("super_admins").insert({ user_id: su.id });
  if (error) throw error;
  superAdmin = await signInAs(su.email, su.password);
  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);
  managerB = await nhanVienB("manager");
  cashierB = await nhanVienB("cashier");

  // Một dòng nhật ký của A (ghi thẳng bằng service role) để kiểm owner B không thấy.
  const { error: e2 } = await adminClient().from("subscription_payments").insert({
    tenant_id: tenantA,
    months: 1,
    amount: 1,
    paid_until_after: "2999-01-01",
    note: NOTE,
  });
  if (e2) throw e2;
}, 120_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("subscription_payments").delete().in("tenant_id", [tenantA, tenantB]).eq("note", NOTE);
  await setPaidUntilB(null);
  const ids = tamThoi.map((t) => t.id);
  if (ids.length) {
    await admin.from("super_admins").delete().in("user_id", ids);
    await admin.from("memberships").delete().in("user_id", ids);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }
  await cleanupFixtures();
}, 120_000);

function ghiNhan(client: SupabaseClient, o: Partial<{ months: number; amount: number; note: string; start: boolean }> = {}) {
  return client.rpc("record_subscription_payment", {
    p_tenant: tenantB,
    p_months: o.months ?? 1,
    p_amount: o.amount ?? 300000,
    p_note: o.note ?? NOTE,
    p_start_limited: o.start ?? false,
  });
}

describe("record_subscription_payment — quyền", () => {
  it.each([
    ["owner", () => ownerB],
    ["manager", () => managerB],
    ["cashier", () => cashierB],
  ])("%s gọi → bị từ chối, không đổi gì", async (_ten, c) => {
    await setPaidUntilB(ngayCach(10));
    const truoc = await soDongNhatKyB();
    const { error } = await ghiNhan(c());
    expect(error?.code).toBe("42501");
    expect(await paidUntilB()).toBe(ngayCach(10));
    expect(await soDongNhatKyB()).toBe(truoc);
  }, 60_000);

  it("không ai chèn nhật ký trực tiếp (kể cả owner, super-admin qua phiên)", async () => {
    for (const c of [ownerB, superAdmin]) {
      const { error } = await c.from("subscription_payments").insert({
        tenant_id: tenantB, months: 1, amount: 0, paid_until_after: "2999-01-01", note: NOTE,
      });
      expect(error).not.toBeNull();
    }
  }, 60_000);
});

describe("record_subscription_payment — cộng hạn trong một giao dịch", () => {
  it("quán KHÔNG GIỚI HẠN → mặc định từ chối (tránh biến qt-food thành có hạn)", async () => {
    await setPaidUntilB(null);
    const { error } = await ghiNhan(superAdmin);
    expect(error).not.toBeNull();
    expect(await paidUntilB()).toBeNull();
  }, 60_000);

  it("chủ động chuyển sang có hạn → hạn = hôm nay + 1 tháng", async () => {
    await setPaidUntilB(null);
    const { data, error } = await ghiNhan(superAdmin, { start: true });
    expect(error).toBeNull();
    expect(data.paid_until_before).toBeNull();
    expect(await paidUntilB()).toBe(hanSauGiaHan(homNayHanDung(), homNayHanDung(), 1));
  }, 60_000);

  it("hạn còn 10 ngày + 3 tháng → cộng từ hạn cũ; đúng 1 dòng nhật ký mới, ghi người ghi nhận", async () => {
    await setPaidUntilB(ngayCach(10));
    const truoc = await soDongNhatKyB();
    const { data, error } = await ghiNhan(superAdmin, { months: 3, amount: 900000 });
    expect(error).toBeNull();
    const ky = hanSauGiaHan(ngayCach(10), homNayHanDung(), 3);
    expect(await paidUntilB()).toBe(ky);
    expect(await soDongNhatKyB()).toBe(truoc + 1);
    expect(data).toMatchObject({ months: 3, amount: 900000, paid_until_before: ngayCach(10), paid_until_after: ky });
    expect(data.recorded_by).toBe(tamThoi[0].id);
  }, 60_000);

  it("hạn đã qua 20 ngày + 1 tháng → cộng từ hôm nay", async () => {
    await setPaidUntilB(ngayCach(-20));
    const { error } = await ghiNhan(superAdmin);
    expect(error).toBeNull();
    expect(await paidUntilB()).toBe(hanSauGiaHan(ngayCach(-20), homNayHanDung(), 1));
  }, 60_000);

  it("lỗi giữa chừng (nhật ký vi phạm ràng buộc SAU khi đã cập nhật hạn) → không đổi gì", async () => {
    await setPaidUntilB(ngayCach(5));
    const truoc = await soDongNhatKyB();
    const { error } = await ghiNhan(superAdmin, { note: "x".repeat(600) });
    expect(error).not.toBeNull();
    expect(await paidUntilB()).toBe(ngayCach(5));
    expect(await soDongNhatKyB()).toBe(truoc);
  }, 60_000);

  it("số tháng ≤ 0 / số tiền âm → từ chối", async () => {
    expect((await ghiNhan(superAdmin, { months: 0 })).error).not.toBeNull();
    expect((await ghiNhan(superAdmin, { amount: -1 })).error).not.toBeNull();
  }, 60_000);
});

describe("subscription_payments — RLS đọc", () => {
  it("owner B đọc được nhật ký quán mình, 0 dòng của quán A", async () => {
    await setPaidUntilB(ngayCach(30));
    const { data: cuaB } = await ownerB.from("subscription_payments").select("id").eq("tenant_id", tenantB);
    expect((cuaB ?? []).length).toBeGreaterThan(0);
    const { data: cuaA } = await ownerB.from("subscription_payments").select("id").eq("tenant_id", tenantA);
    expect(cuaA ?? []).toHaveLength(0);
  }, 60_000);

  it.each([
    ["manager", () => managerB],
    ["cashier", () => cashierB],
  ])("%s B đọc = 0 dòng", async (_ten, c) => {
    await setPaidUntilB(ngayCach(30));
    const { data, error } = await c().from("subscription_payments").select("id");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  }, 60_000);

  it("super-admin đọc được nhật ký mọi quán", async () => {
    const { data } = await superAdmin.from("subscription_payments").select("tenant_id").in("tenant_id", [tenantA, tenantB]);
    const quan = new Set((data ?? []).map((r) => r.tenant_id));
    expect(quan.has(tenantA) && quan.has(tenantB)).toBe(true);
  }, 60_000);
});

describe("vòng đầy đủ: quán bị khóa → ghi nhận → mở lại ngay", () => {
  it("B quá ân hạn: owner B bị chặn, super-admin vẫn đọc được; ghi nhận xong owner B đọc lại được", async () => {
    await setPaidUntilB(ngayCach(-GRACE_DAYS - 1));
    const b1 = await signInAs(OWNER_B.email, OWNER_B.password);
    expect((await b1.from("orders").select("id").eq("tenant_id", tenantB)).data ?? []).toHaveLength(0);
    // Super-admin vẫn thấy quán + thành viên (nhánh is_super_admin() của tenants/memberships) để ghi nhận
    // và hỗ trợ. orders/bills không có nhánh đó từ trước — /super đọc chúng bằng service role.
    const { data: suQuan } = await superAdmin.from("tenants").select("id").eq("id", tenantB);
    expect(suQuan ?? []).toHaveLength(1);
    const { data: suTv } = await superAdmin.from("memberships").select("id").eq("tenant_id", tenantB);
    expect((suTv ?? []).length).toBeGreaterThan(0);

    const { error } = await ghiNhan(superAdmin);
    expect(error).toBeNull();

    const b2 = await signInAs(OWNER_B.email, OWNER_B.password);
    expect(((await b2.from("orders").select("id").eq("tenant_id", tenantB)).data ?? []).length).toBeGreaterThan(0);
  }, 60_000);
});

describe("0059 — /super ghi nhận theo NGÀY chọn và VĨNH VIỄN", () => {
  const theoNgay = (c: SupabaseClient, until: string, start = false) =>
    c.rpc("record_subscription_until", { p_tenant: tenantB, p_until: until, p_amount: 500000, p_note: NOTE, p_start_limited: start });
  const vinhVien = (c: SupabaseClient) =>
    c.rpc("record_subscription_lifetime", { p_tenant: tenantB, p_amount: 9000000, p_note: NOTE });

  it("owner/manager gọi → 42501, không đổi gì", async () => {
    await setPaidUntilB(ngayCach(10));
    for (const c of [ownerB, managerB]) {
      expect((await theoNgay(c, ngayCach(100))).error?.code).toBe("42501");
      expect((await vinhVien(c)).error?.code).toBe("42501");
    }
    expect(await paidUntilB()).toBe(ngayCach(10));
  }, 60_000);

  it("chọn ngày → hạn = ĐÚNG ngày chọn, 1 dòng nhật ký (months rỗng)", async () => {
    await setPaidUntilB(ngayCach(10));
    const truoc = await soDongNhatKyB();
    const { data, error } = await theoNgay(superAdmin, ngayCach(45));
    expect(error).toBeNull();
    expect(await paidUntilB()).toBe(ngayCach(45));
    expect(await soDongNhatKyB()).toBe(truoc + 1);
    expect(data).toMatchObject({ lifetime: false, months: null, paid_until_before: ngayCach(10), paid_until_after: ngayCach(45) });
  }, 60_000);

  it("chọn ngày không sau hạn hiện tại / không sau hôm nay → từ chối, không đổi gì", async () => {
    await setPaidUntilB(ngayCach(30));
    expect((await theoNgay(superAdmin, ngayCach(20))).error).not.toBeNull();
    await setPaidUntilB(ngayCach(-20));
    expect((await theoNgay(superAdmin, ngayCach(0))).error).not.toBeNull();
    expect(await paidUntilB()).toBe(ngayCach(-20));
  }, 60_000);

  it("quán không giới hạn: chọn ngày cần cờ chuyển sang có hạn", async () => {
    await setPaidUntilB(null);
    expect((await theoNgay(superAdmin, ngayCach(30))).error).not.toBeNull();
    expect(await paidUntilB()).toBeNull();
    expect((await theoNgay(superAdmin, ngayCach(30), true)).error).toBeNull();
    expect(await paidUntilB()).toBe(ngayCach(30));
  }, 60_000);

  it("vĩnh viễn: quán đang KHÓA → không giới hạn, mở lại ngay; nhật ký lifetime", async () => {
    await setPaidUntilB(ngayCach(-GRACE_DAYS - 1));
    const { data, error } = await vinhVien(superAdmin);
    expect(error).toBeNull();
    expect(await paidUntilB()).toBeNull();
    expect(data).toMatchObject({ lifetime: true, months: null, paid_until_after: null, amount: 9000000 });
    const b = await signInAs(OWNER_B.email, OWNER_B.password);
    expect(((await b.from("orders").select("id").eq("tenant_id", tenantB)).data ?? []).length).toBeGreaterThan(0);
    // Sau khi vĩnh viễn, ghi nhận theo tháng bấm nhầm vẫn bị chặn như mọi quán không giới hạn.
    expect((await ghiNhan(superAdmin)).error).not.toBeNull();
  }, 60_000);

  it("nhật ký không nhận dòng sai kiểu (lifetime mà có hạn mới)", async () => {
    const { error } = await adminClient().from("subscription_payments").insert({
      tenant_id: tenantB, lifetime: true, months: 1, amount: 0, paid_until_after: "2999-01-01", note: NOTE,
    });
    expect(error).not.toBeNull();
  }, 60_000);
});
