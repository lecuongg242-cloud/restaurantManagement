import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OWNER_A, OWNER_B } from "./setup";
import { adminClient, seedFixtures } from "./fixtures";
import {
  dangNhapRoiThuHoi,
  kichHoatMayQuay,
  LOI_DANG_NHAP,
  LOI_KHONG_DU_QUYEN,
  type DauVaoKichHoat,
} from "@/lib/desktop/kich-hoat";
import { bridgeEmailForSlug } from "@/lib/print/bridge-account";

/**
 * DESK-01 — kích hoạt máy quầy "TechMenu Thu ngân" bằng email + mật khẩu chủ quán hoặc quản lý chi nhánh
 * (QD-028), trên DB thật.
 *
 * Chủ quán đúng → nhận quán; máy có máy in → tài khoản `printer` đăng nhập được; máy chỉ xem → KHÔNG động tới
 * tài khoản `printer` (PC ở bếp không được cướp cầu in của máy quầy). Quản lý → vào thẳng chi nhánh của mình, không
 * chọn được chi nhánh khác. Thu ngân / sai mật khẩu → từ chối, sai email và sai mật khẩu cùng một câu.
 *
 * Đụng hai quán demo pho-viet / bun-bo (như bridge-activation.test): trả lại `settings`, xóa tài khoản `printer`
 * và người dùng tạm trong afterAll.
 */
const TAG = crypto.randomUUID().slice(0, 6);
let admin: SupabaseClient;
let tenantA = "";
let tenantB = "";
const tam: string[] = [];
const settingsCu = new Map<string, unknown>();
let quanLy = { email: "", password: "" };
let thuNgan = { email: "", password: "" };
let chuHaiQuan = { email: "", password: "" };

const vao = (x: Partial<DauVaoKichHoat>): DauVaoKichHoat => ({
  email: OWNER_A.email,
  password: OWNER_A.password,
  tenantId: null,
  coMayIn: false,
  ...x,
});

async function taoNguoi(nhan: string) {
  const email = `desk-${nhan}-${TAG}@test.local`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Không tạo được người dùng tạm: ${error?.message}`);
  tam.push(data.user.id);
  return { id: data.user.id, email, password };
}

beforeAll(async () => {
  const ids = await seedFixtures();
  tenantA = ids.tenantA;
  tenantB = ids.tenantB;
  admin = adminClient();
  const { data } = await admin.from("tenants").select("id, settings").in("id", [tenantA, tenantB]);
  for (const r of data ?? []) settingsCu.set(r.id, r.settings);

  const ql = await taoNguoi("manager");
  await admin.from("memberships").insert({ tenant_id: tenantA, user_id: ql.id, role: "manager", display_name: "DESK", active: true });
  quanLy = ql;
  const tn = await taoNguoi("cashier");
  await admin.from("memberships").insert({ tenant_id: tenantA, user_id: tn.id, role: "cashier", display_name: "DESK", active: true });
  thuNgan = tn;
  const chu = await taoNguoi("owner2");
  await admin.from("memberships").insert([
    { tenant_id: tenantA, user_id: chu.id, role: "owner", display_name: "DESK", active: true },
    { tenant_id: tenantB, user_id: chu.id, role: "owner", display_name: "DESK", active: true },
  ]);
  chuHaiQuan = chu;
}, 120_000);

afterAll(async () => {
  for (const [id, settings] of settingsCu) await admin.from("tenants").update({ settings }).eq("id", id);
  await admin.from("bridge_activation_codes").delete().in("tenant_id", [tenantA, tenantB]);
  await admin.from("memberships").delete().in("user_id", tam);
  for (const id of tam) await admin.auth.admin.deleteUser(id);
  for (const slug of [OWNER_A.slug, OWNER_B.slug]) {
    const email = bridgeEmailForSlug(slug);
    await admin.from("memberships").delete().eq("email", email);
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const u = data?.users.find((x) => (x.email ?? "").toLowerCase() === email);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
}, 120_000);

describe("kích hoạt máy quầy bằng tài khoản chủ quán / quản lý", () => {
  it("máy chỉ xem → nhận quán, KHÔNG có tài khoản printer, không tạo mã", async () => {
    const truoc = await admin.from("bridge_activation_codes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantA);
    const kq = await kichHoatMayQuay(admin, dangNhapRoiThuHoi, vao({ coMayIn: false }));
    expect(kq).toEqual({ loai: "xong", slug: OWNER_A.slug, tenantName: expect.any(String), may: null });
    const sau = await admin.from("bridge_activation_codes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantA);
    expect(sau.count).toBe(truoc.count);
  }, 60_000);

  it("máy có máy in → tài khoản printer của đúng quán, đăng nhập được, quán chuyển sang bridge", async () => {
    const kq = await kichHoatMayQuay(admin, dangNhapRoiThuHoi, vao({ coMayIn: true }));
    if (kq.loai !== "xong" || !kq.may) throw new Error(`Không kích hoạt được: ${JSON.stringify(kq)}`);
    expect(kq.may.email).toBe(bridgeEmailForSlug(OWNER_A.slug));
    expect(await dangNhapRoiThuHoi(kq.may.email, kq.may.password)).toBeTruthy();
    const { data } = await admin.from("tenants").select("settings").eq("id", tenantA).single();
    expect((data!.settings as { print_mode?: string }).print_mode).toBe("bridge");
  }, 60_000);

  it("kích hoạt lần hai (máy khác) → mật khẩu printer cũ hết hiệu lực", async () => {
    const lan1 = await kichHoatMayQuay(admin, dangNhapRoiThuHoi, vao({ coMayIn: true }));
    const lan2 = await kichHoatMayQuay(admin, dangNhapRoiThuHoi, vao({ coMayIn: true }));
    if (lan1.loai !== "xong" || !lan1.may || lan2.loai !== "xong" || !lan2.may) throw new Error("Không kích hoạt được");
    expect(await dangNhapRoiThuHoi(lan1.may.email, lan1.may.password)).toBeNull();
    expect(await dangNhapRoiThuHoi(lan2.may.email, lan2.may.password)).toBeTruthy();
  }, 60_000);

  it("sai mật khẩu và email không tồn tại → cùng một câu lỗi", async () => {
    const saiMk = await kichHoatMayQuay(admin, dangNhapRoiThuHoi, vao({ password: "sai-mat-khau-123" }));
    const saiEmail = await kichHoatMayQuay(admin, dangNhapRoiThuHoi, vao({ email: `khong-co-${TAG}@test.local` }));
    expect(saiMk).toEqual({ loai: "loi", status: 400, error: LOI_DANG_NHAP });
    expect(saiEmail).toEqual(saiMk);
  }, 60_000);

  it("quản lý chi nhánh → vào thẳng chi nhánh của mình, không có bước chọn chi nhánh", async () => {
    const kq = await kichHoatMayQuay(admin, dangNhapRoiThuHoi, vao({ ...quanLy, coMayIn: false }));
    expect(kq).toEqual({ loai: "xong", slug: OWNER_A.slug, tenantName: expect.any(String), may: null });
  }, 60_000);

  it("quản lý chọn chi nhánh khác → từ chối", async () => {
    const kq = await kichHoatMayQuay(admin, dangNhapRoiThuHoi, vao({ ...quanLy, tenantId: tenantB }));
    expect(kq).toEqual({ loai: "loi", status: 403, error: LOI_KHONG_DU_QUYEN });
  }, 60_000);

  it("thu ngân → từ chối", async () => {
    const kq = await kichHoatMayQuay(admin, dangNhapRoiThuHoi, vao({ ...thuNgan, coMayIn: true }));
    expect(kq).toEqual({ loai: "loi", status: 403, error: LOI_KHONG_DU_QUYEN });
  }, 60_000);

  it("chủ hai quán → danh sách chọn chi nhánh; chọn một → nhận đúng quán đó", async () => {
    const ds = await kichHoatMayQuay(admin, dangNhapRoiThuHoi, vao({ ...chuHaiQuan }));
    if (ds.loai !== "chon-chi-nhanh") throw new Error(`Mong danh sách chi nhánh, nhận ${JSON.stringify(ds)}`);
    expect(ds.chiNhanh.map((c) => c.id).sort()).toEqual([tenantA, tenantB].sort());
    const kq = await kichHoatMayQuay(admin, dangNhapRoiThuHoi, vao({ ...chuHaiQuan, tenantId: tenantB }));
    expect(kq).toMatchObject({ loai: "xong", slug: OWNER_B.slug, may: null });
  }, 60_000);

  it("chọn chi nhánh không thuộc mình → từ chối", async () => {
    const kq = await kichHoatMayQuay(admin, dangNhapRoiThuHoi, vao({ tenantId: tenantB }));
    expect(kq).toEqual({ loai: "loi", status: 403, error: LOI_KHONG_DU_QUYEN });
  }, 60_000);
  // Quán tạm ngưng: tests/desktop/kich-hoat.test.ts (giả lập DB — không tạm ngưng quán demo dùng chung).
});
