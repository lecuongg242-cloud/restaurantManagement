import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/**
 * P32 — tab danh mục ngang cho Thực đơn admin (chủ dự án chốt 04/10/2026): bấm tab = lọc, tab giữ trong `?nhom=`,
 * "+ Danh mục" mở hộp thoại và chuyển sang tab mới. Quán demo `pho-viet`; danh mục thử mang TAG và được dọn ở cuối.
 */
config({ path: ".env.local" });

const SLUG = "pho-viet";
const TAG = `E2E${Date.now().toString(36).slice(-4)}`;
const ANH = "docs/30-KeHoach/P32/anh";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
test.setTimeout(240_000);

async function dangNhap(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', process.env.SEED_OWNER_A_EMAIL ?? "ownerA@pho-viet.test");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_A_PASSWORD ?? "DemoPass123!");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 }),
    page.click('button[type="submit"]'),
  ]);
}

test.afterAll(async () => {
  await db.from("menu_categories").delete().like("name", `%${TAG}%`);
});

test("MENU-05: tab danh mục lọc; giữ tab khi bật/tắt món; + Danh mục sang tab mới; 390px không tràn", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/admin/menu`, { waitUntil: "networkidle" });

  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  const { data: cats } = await db
    .from("menu_categories")
    .select("id, name")
    .eq("tenant_id", t!.id)
    .order("sort_order")
    .order("created_at");
  const { count: soMon } = await db.from("menu_items").select("id", { count: "exact", head: true }).eq("tenant_id", t!.id);

  // Hàng tab: Tất cả (tổng món) + mỗi danh mục một tab; không còn ô "Tên danh mục mới".
  const nav = page.getByRole("navigation", { name: "Danh mục" });
  await expect(nav.getByRole("link")).toHaveCount(cats!.length + 1);
  await expect(nav.getByRole("link").first()).toHaveText(`Tất cả${soMon}`);
  await expect(nav.getByRole("link", { name: "Tất cả" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Tên danh mục mới")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sửa tên" })).toHaveCount(cats!.length);

  // Bấm tab danh mục đầu → chỉ còn danh mục đó.
  const dau = cats![0];
  await nav.getByRole("link", { name: new RegExp(`^${dau.name}`) }).click();
  await expect(page).toHaveURL(new RegExp(`\\?nhom=${dau.id}$`));
  await expect(page.getByRole("button", { name: "Sửa tên" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: dau.name, exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: new RegExp(`^${dau.name}`) })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Tất cả" })).not.toHaveAttribute("aria-current", "page");
  await page.mouse.move(700, 700);
  await page.screenshot({ path: `${ANH}/1-tab-danh-muc-1366.png` });

  // Ô "Tìm món": gõ không dấu → tìm trong MỌI danh mục (kể cả khi đang ở tab khác); xóa ô → về tab đang chọn.
  const { data: monKhac } = await db
    .from("menu_items")
    .select("name, category_id")
    .eq("tenant_id", t!.id)
    .neq("category_id", dau.id)
    .limit(1)
    .single();
  const khongDau = monKhac!.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
  const tim = page.getByPlaceholder("Tìm món");
  await tim.fill(khongDau);
  await expect(page.getByText(monKhac!.name, { exact: true }).first()).toBeVisible();
  await expect(page.locator("main").getByText(dau.name, { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${ANH}/4-tim-mon-1366.png` });
  await tim.fill("khong co mon nao ten nhu the nay");
  await expect(page.getByText("Không tìm thấy món.")).toBeVisible();
  await tim.fill("");
  await expect(page.getByRole("button", { name: "Sửa tên" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: dau.name, exact: true })).toBeVisible();

  // Bật/tắt món trong tab → vẫn ở tab đó.
  const nut = page.locator('button[aria-label^="Còn món"]').first();
  if (await nut.isVisible()) {
    await nut.click();
    await expect(page.locator('button[aria-label^="Hết món"]').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(new RegExp(`\\?nhom=${dau.id}$`));
    await expect(page.getByRole("button", { name: "Sửa tên" })).toHaveCount(1);
    await page.locator('button[aria-label^="Hết món"]').first().click();
    await expect(page.locator('button[aria-label^="Hết món"]')).toHaveCount(0, { timeout: 20_000 });
  }

  // "+ Danh mục" → hộp thoại → lưu xong sang tab danh mục mới.
  const ten = `Món thử ${TAG}`;
  await page.getByRole("button", { name: "+ Danh mục" }).click();
  const hop = page.getByRole("dialog", { name: "Thêm danh mục" });
  await hop.locator('input[name="name"]').fill(ten);
  await page.screenshot({ path: `${ANH}/2-hop-thoai-danh-muc-1366.png` });
  await hop.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(hop).toBeHidden({ timeout: 30_000 });
  const { data: moi } = await db.from("menu_categories").select("id").eq("tenant_id", t!.id).eq("name", ten).single();
  await expect(page).toHaveURL(new RegExp(`\\?nhom=${moi!.id}$`), { timeout: 30_000 });
  await expect(nav.getByRole("link", { name: new RegExp(`^${ten}`) })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: `+ Thêm món vào "${ten}"` })).toBeVisible();

  // Danh mục đã xóa / id lạ → về Tất cả.
  await page.goto(`/r/${SLUG}/admin/menu?nhom=00000000-0000-0000-0000-000000000000`, { waitUntil: "networkidle" });
  await expect(nav.getByRole("link", { name: "Tất cả" })).toHaveAttribute("aria-current", "page");

  // Điện thoại 390: hàng tab cuộn ngang trong chính nó, trang không tràn.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/r/${SLUG}/admin/menu?nhom=${dau.id}`, { waitUntil: "networkidle" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `${ANH}/3-dien-thoai-390.png` });
});
