import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

/**
 * P15 trên trình duyệt thật — chuỗi TẠM hai chi nhánh: B1 = quán demo pho-viet, B2 = chi nhánh mới do create_branch tạo.
 *
 *  1. BRANCH-07: đơn ở B2 KHÔNG hiện ở POS / KDS của B1 (kể cả đơn tới qua realtime sau khi mở màn), dù người đăng nhập
 *     là chủ chuỗi — vào được cả hai chi nhánh. Đối chứng: đơn ở B1 hiện ở B1; KDS của B2 chỉ thấy đơn B2.
 *  2. BRANCH-08: gia hạn cả chuỗi — cả hai chi nhánh quá ân hạn → chủ đăng nhập bị đưa thẳng tới trang Gia hạn (giá gói
 *     × 2 chi nhánh) → super-admin bấm "Ghi nhận gia hạn chuỗi" ở /super → hai chi nhánh cùng một ngày hết hạn, admin mở lại.
 *
 * pho-viet đang thuộc thương hiệu khác (thương hiệu thử của chủ dự án) → TẠM gỡ `brand_id` rồi afterAll trả lại nguyên
 * trạng: brand_id, paid_until, status; xóa chi nhánh tạm, thương hiệu tạm, quyền do chuỗi cấp, tài khoản super-admin tạm.
 */
const B1 = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };
const TAG = crypto.randomUUID().slice(0, 6);
const B2 = `e2e-cn2-${TAG}`;
const BRAND = `e2e-chuoi-${TAG}`;
const MON_B1 = `E2E-B1-${TAG}`;
const MON_B2 = `E2E-B2-${TAG}`;
const MON_B2_SAU = `E2E-B2-rt-${TAG}`;
const MON_B1_SAU = `E2E-B1-rt-${TAG}`;

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let b1Id = "";
let b2Id = "";
let brandId = "";
let suId = "";
const SU = { email: `e2e-su-${TAG}@test.local`, pass: crypto.randomBytes(18).toString("base64url") };
let goc: { brand_id: string | null; paid_until: string | null; status: string } | null = null;
let quyenTruoc = 0;
const donTam: string[] = [];

/** Tập (user, quán) đang có quyền — phải giữ nguyên sau khi dọn. */
async function demQuyen() {
  const { count } = await admin.from("memberships").select("id", { count: "exact", head: true }).eq("active", true);
  return count ?? 0;
}

function ngay(n: number) {
  const vn = new Date(Date.now() + 7 * 3600e3 - 4 * 3600e3); // ngày hạn dùng đổi lúc 04:00 giờ VN
  vn.setUTCDate(vn.getUTCDate() + n);
  return vn.toISOString().slice(0, 10);
}

async function taoDon(tenantId: string, ten: string) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error } = await admin.from("orders").insert({
    id, tenant_id: tenantId, channel: "takeaway", source: "staff", status: "confirmed", confirmed_at: now,
    kitchen_no: 900 + Math.floor(Math.random() * 99), note: `E2E ${TAG}`,
  });
  if (error) throw error;
  const { error: e2 } = await admin.from("order_items").insert({
    tenant_id: tenantId, order_id: id, name_snapshot: ten, unit_price_snapshot: 10000, qty: 1, status: "queued",
  });
  if (e2) throw e2;
  donTam.push(id);
}

async function dangNhap(page: Page, slug: string) {
  await page.goto(`/r/${slug}/admin/login`);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.pass);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45_000 }), page.click('button[type="submit"]')]);
}

/** Chờ kênh realtime của màn (KDS) báo "Subscribed to PostgreSQL" — tạo đơn trước lúc đó thì không có sự kiện nào. */
function choDangKy(page: Page) {
  return new Promise<void>((xong) => {
    page.on("websocket", (ws) => {
      ws.on("framereceived", (f) => {
        if (String(f.payload).includes("Subscribed to PostgreSQL")) xong();
      });
    });
  });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  quyenTruoc = await demQuyen();
  const { data: t } = await admin.from("tenants").select("id, brand_id, paid_until, status").eq("slug", B1).single();
  b1Id = t!.id;
  goc = { brand_id: t!.brand_id, paid_until: t!.paid_until, status: t!.status };
  if (goc.brand_id) await admin.from("tenants").update({ brand_id: null }).eq("id", b1Id);

  const { data: u } = await admin.auth.admin.createUser({ email: SU.email, password: SU.pass, email_confirm: true });
  suId = u.user!.id;
  await admin.from("super_admins").insert({ user_id: suId });
  const su: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error: eDn } = await su.auth.signInWithPassword({ email: SU.email, password: SU.pass });
  if (eDn) throw eDn;

  const { data: bid, error } = await su.rpc("create_brand", { p_name: `E2E Chuỗi ${TAG}`, p_slug: BRAND });
  if (error) throw error;
  brandId = bid as string;
  const a = await su.rpc("attach_tenant_to_brand", { p_tenant: b1Id, p_brand: brandId });
  if (a.error) throw a.error;
  const c = await su.rpc("create_branch", { p_brand: brandId, p_name: `E2E CN2 ${TAG}`, p_slug: B2 });
  if (c.error) throw c.error;
  b2Id = (await admin.from("tenants").select("id").eq("slug", B2).single()).data!.id;
  // Hạn dùng chung, còn xa: phần cách ly không dính màn "Hết hạn".
  await admin.from("tenants").update({ paid_until: ngay(30), status: "active" }).in("id", [b1Id, b2Id]);
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  if (donTam.length) await admin.from("orders").delete().in("id", donTam);
  if (b2Id) await admin.from("tenants").delete().eq("id", b2Id);
  if (brandId) {
    await admin.from("subscription_payments").delete().eq("brand_id", brandId);
    await admin.from("memberships").delete().eq("brand_id", brandId); // quyền do chuỗi cấp
    await admin.from("brands").delete().eq("id", brandId);
  }
  if (goc) await admin.from("tenants").update(goc).eq("id", b1Id);
  if (suId) {
    await admin.from("super_admins").delete().eq("user_id", suId);
    await admin.auth.admin.deleteUser(suId);
  }
  expect(await demQuyen(), "tập quyền (user, quán) phải trả về như trước").toBe(quyenTruoc);
});

test.describe("BRANCH-07 — đơn chi nhánh này không hiện ở chi nhánh kia", () => {
  test("POS + KDS của B1 chỉ thấy đơn B1 (cả đơn tới sau qua realtime); KDS B2 chỉ thấy đơn B2", async ({ page }) => {
    await taoDon(b1Id, MON_B1);
    await taoDon(b2Id, MON_B2);
    await dangNhap(page, B1);

    const dangKy = choDangKy(page);
    await page.goto(`/r/${B1}/kds`, { waitUntil: "networkidle" });
    await expect(page.getByText(MON_B1)).toBeVisible();
    await dangKy;
    await expect(page.getByText(MON_B2)).toHaveCount(0);

    // Đơn mới tới khi màn đang mở: B2 trước, rồi B1 (đối chứng realtime chạy). Khi đơn B1 đã hiện, đơn B2 vẫn không.
    await taoDon(b2Id, MON_B2_SAU);
    await taoDon(b1Id, MON_B1_SAU);
    await expect(page.getByText(MON_B1_SAU)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(MON_B2_SAU)).toHaveCount(0);
    await page.screenshot({ path: "docs/30-KeHoach/P15/anh/10-kds-b1-cach-ly.png" });

    await page.goto(`/r/${B1}/pos`, { waitUntil: "networkidle" });
    await expect(page.getByText(/E2E-B1-/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/E2E-B2-/)).toHaveCount(0);

    await page.goto(`/r/${B2}/kds`, { waitUntil: "networkidle" });
    await expect(page.getByText(MON_B2)).toBeVisible();
    await expect(page.getByText(MON_B2_SAU)).toBeVisible();
    await expect(page.getByText(/E2E-B1-/)).toHaveCount(0);
  });
});

test.describe("BRANCH-08 — gia hạn cả chuỗi", () => {
  test("quá ân hạn → trang Gia hạn chuỗi → super-admin ghi nhận → hai chi nhánh cùng hạn, admin mở lại", async ({ page, browser }) => {
    await admin.from("tenants").update({ paid_until: ngay(-10) }).eq("id", b1Id);
    await admin.from("tenants").update({ paid_until: ngay(-12) }).eq("id", b2Id);

    await dangNhap(page, B1);
    await expect(page).toHaveURL(new RegExp(`/r/${B1}/admin/gia-han`));
    await expect(page.getByText(/× 2 chi nhánh/).first()).toBeVisible();
    await expect(page.getByText(/GIAHAN/).first()).toBeVisible();
    await page.screenshot({ path: "docs/30-KeHoach/P15/anh/11-gia-han-chuoi-khoa.png", fullPage: true });

    // Super-admin ghi nhận trên /super (phiên riêng).
    const ctx = await browser.newContext();
    const sp = await ctx.newPage();
    await sp.goto("/super/login");
    await sp.fill('input[name="email"]', SU.email);
    await sp.fill('input[name="password"]', SU.pass);
    await Promise.all([sp.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45_000 }), sp.click('button[type="submit"]')]);
    await sp.goto("/super/thuong-hieu", { waitUntil: "networkidle" });
    const khoi = sp.locator(`section[data-brand="${BRAND}"]`);
    await expect(khoi).toContainText("2 chi nhánh");
    await khoi.getByPlaceholder("Ghi chú (mã GD…)").fill(`E2E ${TAG}`);
    await khoi.getByRole("button", { name: "Ghi nhận gia hạn chuỗi" }).click();
    await expect(khoi.getByText(/Đã gia hạn cả chuỗi tới/)).toBeVisible({ timeout: 30_000 });
    await ctx.close();

    const { data: t } = await admin.from("tenants").select("paid_until").in("id", [b1Id, b2Id]);
    const han = new Set((t ?? []).map((r) => r.paid_until));
    expect(han.size, "hai chi nhánh phải cùng một ngày hết hạn").toBe(1);
    expect([...han][0]! > ngay(0)).toBe(true);
    const { count } = await admin.from("subscription_payments").select("id", { count: "exact", head: true }).eq("brand_id", brandId);
    expect(count).toBe(1);

    await page.goto(`/r/${B1}/admin/menu`, { waitUntil: "networkidle" });
    await expect(page.getByText("Hết hạn sử dụng")).toHaveCount(0);
    await page.goto(`/r/${B2}/admin/menu`, { waitUntil: "networkidle" });
    await expect(page.getByText("Hết hạn sử dụng")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/r/${B2}/admin/menu`));
  });
});
