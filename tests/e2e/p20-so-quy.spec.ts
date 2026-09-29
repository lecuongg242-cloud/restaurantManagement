import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/**
 * P20 / 20-02 trên trình duyệt thật, quán demo `pho-viet` (CASH-01..04): số dư đầu kỳ → phiếu chi "Điện" → hủy phiếu chi;
 * Tồn quỹ đổi đúng từng bước (đo CHÊNH LỆCH nên không phụ thuộc tiền bán hàng thật của quán demo); xuất file; 360px không
 * cuộn ngang. Phiếu tạo trong test được xóa cuối test.
 */
config({ path: ".env.local" });

const SLUG = "pho-viet";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

test.setTimeout(300_000);

async function dangNhap(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', process.env.SEED_OWNER_A_EMAIL ?? "ownerA@pho-viet.test");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_A_PASSWORD ?? "DemoPass123!");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 }),
    page.click('button[type="submit"]'),
  ]);
}

const tonQuy = async (page: Page) =>
  Number((await page.locator("[data-tong-quy] > *").nth(3).innerText()).replace(/\D/g, "").replace(/^$/, "0")) *
  ((await page.locator("[data-tong-quy] > *").nth(3).innerText()).includes("-") ? -1 : 1);

test("số dư đầu kỳ → phiếu chi → hủy: tồn quỹ đúng từng bước; xuất file", async ({ page }) => {
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  const tenant = t!.id as string;
  const batDau = new Date().toISOString();
  // Quán demo đã có số dư tiền mặt thì form số dư không hiện — gỡ tạm, trả lại cuối test.
  const { data: cu } = await db.from("cash_vouchers").update({ status: "cancelled" })
    .eq("tenant_id", tenant).eq("source", "opening").eq("fund", "cash").eq("status", "active").select("id");

  try {
    await dangNhap(page);
    const SO = `/r/${SLUG}/admin/so-quy?quy=cash&preset=today`;
    await page.goto(SO, { waitUntil: "networkidle" });
    const t0 = await tonQuy(page);

    await page.getByRole("textbox", { name: "Số tiền" }).fill("2000000");
    await page.getByRole("button", { name: "Lưu số dư" }).click();
    await expect(page.getByText("Đã ghi số dư đầu kỳ.")).toBeVisible({ timeout: 60_000 });
    await page.goto(SO, { waitUntil: "networkidle" });
    expect(await tonQuy(page)).toBe(t0 + 2_000_000);

    await page.getByRole("link", { name: "+ Phiếu chi" }).click();
    await page.waitForURL(/so-quy\/moi/, { timeout: 90_000 });
    await page.waitForLoadState("networkidle");
    await page.getByRole("combobox", { name: /Loại chi/ }).selectOption({ label: "Điện" });
    await expect(page.getByRole("checkbox", { name: /Hạch toán vào kết quả kinh doanh/ })).toBeChecked();
    await page.getByRole("textbox", { name: /Giá trị/ }).fill("850000");
    await page.getByRole("textbox", { name: "Ghi chú" }).fill("Tiền điện E2E");
    await page.getByRole("button", { name: "Lưu phiếu chi" }).click();
    await expect(page.getByText(/Đã lập phiếu chi PC\d{6}/)).toBeVisible({ timeout: 90_000 });
    await page.goto(SO, { waitUntil: "networkidle" });
    expect(await tonQuy(page)).toBe(t0 + 1_150_000);
    await expect(page.locator("[data-so-quy]").getByText("Điện")).toBeVisible();

    // Xuất file đúng sổ đang xem.
    const res = await page.request.get(`/r/${SLUG}/admin/so-quy/export?quy=cash&preset=today`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("spreadsheetml");

    // Hủy phiếu chi → tồn quỹ quay lại.
    await page.locator("[data-so-quy]").getByRole("link", { name: /^PC\d{6}$/ }).first().click();
    await page.waitForURL(/so-quy\/[0-9a-f-]{36}$/, { timeout: 90_000 });
    await page.waitForLoadState("networkidle");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Hủy phiếu" }).click();
    await expect(page.getByText("Đã hủy phiếu.")).toBeVisible({ timeout: 60_000 });
    await page.goto(SO, { waitUntil: "networkidle" });
    expect(await tonQuy(page)).toBe(t0 + 2_000_000);

    await page.setViewportSize({ width: 360, height: 780 });
    await page.reload({ waitUntil: "networkidle" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  } finally {
    await db.from("cash_vouchers").delete().eq("tenant_id", tenant).eq("source", "opening").gte("created_at", batDau);
    await db.from("cash_vouchers").delete().eq("tenant_id", tenant).eq("note", "Tiền điện E2E");
    if (cu?.length) await db.from("cash_vouchers").update({ status: "active" }).in("id", cu.map((x) => x.id));
  }
});
