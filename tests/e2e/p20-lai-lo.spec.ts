import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/**
 * P20 / 20-04 trên trình duyệt thật, quán demo `pho-viet` (REPORT-20): chủ khai "Thuế nộp nhà nước" 10% doanh thu →
 * Báo cáo có khối "Kết quả kinh doanh" với dòng thuế + lợi nhuận sau thuế, dòng nối không lệch, xuất Excel được. Quản lý:
 * không thấy khối, gọi thẳng đường xuất → 403 (QD-027 C5). Cài đặt thuế của quán demo trả lại như cũ cuối test.
 */
config({ path: ".env.local" });

const SLUG = "pho-viet";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
test.setTimeout(300_000);

async function dangNhap(page: Page, email: string, password: string) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 }),
    page.click('button[type="submit"]'),
  ]);
}

test("chủ thấy kết quả kinh doanh + thuế; quản lý không thấy, xuất file 403", async ({ page, browser }) => {
  const { data: t } = await db.from("tenants").select("id, settings").eq("slug", SLUG).single();
  const settingsCu = t!.settings;
  const email = `p20ll-manager-${crypto.randomUUID().slice(0, 6)}@test.local`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data: u } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  await db.from("memberships").insert({ tenant_id: t!.id, user_id: u.user!.id, role: "manager", display_name: "P20LL", active: true });

  try {
    await dangNhap(page, process.env.SEED_OWNER_A_EMAIL ?? "ownerA@pho-viet.test", process.env.SEED_OWNER_A_PASSWORD ?? "DemoPass123!");
    await page.goto(`/r/${SLUG}/admin/settings`, { waitUntil: "networkidle" });
    const the = page.locator("#thue");
    await the.getByRole("textbox", { name: "Tên thuế 1" }).fill("Thuế khoán");
    await the.getByRole("textbox", { name: "Tỷ lệ % 1" }).fill("10");
    await the.getByRole("combobox", { name: "Tính trên 1" }).selectOption("revenue");
    for (let i = 2; i <= 5; i++) await the.getByRole("textbox", { name: `Tên thuế ${i}` }).fill("");
    await the.getByRole("button", { name: "Lưu thuế" }).click();
    await expect(page.getByText("Đã lưu 1 dòng thuế.")).toBeVisible({ timeout: 60_000 });

    await page.goto(`/r/${SLUG}/admin/reports?preset=30d`, { waitUntil: "networkidle" });
    const kq = page.locator("[data-ket-qua-kinh-doanh]");
    await expect(kq).toBeVisible({ timeout: 60_000 });
    await expect(kq.getByText("Thuế khoán 10% doanh thu (ước tính)")).toBeVisible();
    await expect(kq.getByText("Lợi nhuận sau thuế")).toBeVisible();
    await expect(kq.getByText(/Dòng nối: Doanh thu thuần/)).toBeVisible();
    await expect(kq.getByText(/lệch/)).toHaveCount(0);
    const res = await page.request.get(`/r/${SLUG}/admin/reports/ket-qua-kinh-doanh?preset=30d`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("spreadsheetml");

    // Quản lý: vào Báo cáo được nhưng không có khối; đường xuất → 403.
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await dangNhap(p2, email, password);
    await p2.goto(`/r/${SLUG}/admin/reports?preset=30d`, { waitUntil: "networkidle" });
    await expect(p2.getByRole("heading", { name: "Báo cáo dòng tiền" })).toBeVisible({ timeout: 60_000 });
    await expect(p2.locator("[data-ket-qua-kinh-doanh]")).toHaveCount(0);
    expect((await p2.request.get(`/r/${SLUG}/admin/reports/ket-qua-kinh-doanh?preset=30d`)).status()).toBe(403);
    await ctx.close();
  } finally {
    await db.from("tenants").update({ settings: settingsCu }).eq("id", t!.id);
    await db.from("memberships").delete().eq("user_id", u.user!.id);
    await db.auth.admin.deleteUser(u.user!.id);
  }
});
