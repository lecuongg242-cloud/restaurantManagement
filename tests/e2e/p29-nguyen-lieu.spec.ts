import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/**
 * P29 — tab "Nguyên liệu" làm lại theo Sapo / KiotViet / CUKCUK (chủ dự án chốt 04/10/2026): bảng + tìm + lọc Đang dùng / Đã
 * ẩn, "+ Thêm nguyên liệu" mở hộp thoại (Bỏ qua · Lưu & thêm mới · Lưu), quy đổi "1 thùng = 24 cái". Quán demo `pho-viet`;
 * nguyên liệu thử mang TAG và được dọn ở cuối.
 */
config({ path: ".env.local" });

const SLUG = "pho-viet";
const TAG = `E2E${Date.now().toString(36).slice(-4)}`;
const ANH = "docs/30-KeHoach/P29/anh";
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
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  const { data: ids } = await db.from("ingredients").select("id").eq("tenant_id", t!.id).like("name", `%${TAG}%`);
  const list = (ids ?? []).map((x) => x.id);
  if (list.length) {
    await db.from("stock_entries").delete().in("ingredient_id", list);
    await db.from("ingredients").delete().in("id", list);
  }
});

test("PURCH-09: bảng nguyên liệu; hộp thoại thêm (Lưu & thêm mới, 1 thùng = 24 cái, tồn ban đầu); trùng tên giữ hộp thoại; tìm không dấu; ẩn / hiện lại", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/admin/inventory`, { waitUntil: "networkidle" });

  // Bảng, không còn form luôn mở.
  const bang = page.locator("[data-bang-nguyen-lieu]");
  await expect(bang.locator("thead th")).toHaveText(["Tên nguyên liệu", "Loại", "Đơn vị", "Giá vốn", "Tồn kho", "Dùng được", "Kiểm cuối ngày", ""]);
  await expect(page.locator('input[name="name"]')).toHaveCount(0);
  await page.screenshot({ path: `${ANH}/1-bang-nguyen-lieu-1366.png` });

  // Thêm "Bia thử": cái, 1 thùng = 24 cái, 360.000₫ / thùng, tồn ban đầu 2 thùng → "Lưu & thêm mới" giữ hộp thoại, ô trống lại.
  const bia = `Bia thử ${TAG}`;
  await page.getByRole("button", { name: "+ Thêm nguyên liệu" }).click();
  const hop = page.getByRole("dialog", { name: "Thêm nguyên liệu" });
  await hop.locator('input[name="name"]').fill(bia);
  await hop.locator('select[name="base_unit"]').selectOption("cai");
  await hop.locator('input[name="purchase_unit"]').fill("thùng");
  await hop.locator('input[name="purchase_factor"]').fill("24");
  await hop.getByPlaceholder("280.000").fill("360000");
  await expect(hop.getByText("₫ / thùng")).toBeVisible();
  await hop.locator('input[name="opening_qty"]').fill("2");
  await expect(hop.locator("[data-ton-dau]")).toContainText("thùng");
  await page.screenshot({ path: `${ANH}/2-hop-thoai-them-1366.png` });
  await hop.getByRole("button", { name: "Lưu & thêm mới" }).click();
  await expect(hop.locator('input[name="name"]')).toHaveValue("", { timeout: 30_000 });
  await expect(hop).toBeVisible();
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  const { data: ing } = await db
    .from("ingredients")
    .select("id, base_unit, purchase_unit, purchase_factor, last_unit_cost")
    .eq("tenant_id", t!.id)
    .eq("name", bia)
    .single();
  expect(ing).toMatchObject({ base_unit: "cai", purchase_unit: "thùng", purchase_factor: 24, last_unit_cost: 15000 });
  const { data: e } = await db.from("stock_entries").select("qty, note").eq("ingredient_id", ing!.id);
  expect(e).toEqual([{ qty: 48, note: "Tồn đầu kỳ" }]);

  // Trùng tên → hộp thoại giữ nguyên, báo lỗi trong hộp thoại.
  await hop.locator('input[name="name"]').fill(bia);
  await hop.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(hop.getByRole("alert")).toContainText(`Đã có nguyên liệu tên "${bia}"`);
  await expect(hop).toBeVisible();
  await hop.getByRole("button", { name: "Bỏ qua" }).click();
  await expect(hop).toBeHidden();

  // Dòng mới trong bảng: đơn vị, giá theo thùng, tồn 2 thùng.
  const dong = bang.locator("tr").filter({ has: page.getByRole("button", { name: bia, exact: true }) });
  await expect(dong).toContainText("1 thùng = 24 cái");
  await expect(dong).toContainText("360.000₫ / thùng");
  await expect(dong).toContainText("2 thùng (48 cái)");

  // Tìm không dấu.
  await page.getByPlaceholder("Tìm nguyên liệu").fill(`bia thu ${TAG.toLowerCase()}`);
  await expect(bang.locator("tbody tr")).toHaveCount(1);

  // Sửa → "Ẩn nguyên liệu" → sang "Đã ẩn" → "Hiện lại".
  await page.getByRole("button", { name: bia, exact: true }).click();
  const sua = page.getByRole("dialog", { name: "Sửa nguyên liệu" });
  await expect(sua.locator('input[name="name"]')).toHaveValue(bia);
  await sua.getByRole("button", { name: "Ẩn nguyên liệu" }).click();
  await expect(sua).toBeHidden({ timeout: 30_000 });
  await expect(bang.locator("tbody tr")).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole("button", { name: /^Đã ẩn/ }).click();
  const an = bang.locator("tr").filter({ hasText: bia });
  await an.getByRole("button", { name: "Hiện lại" }).click();
  await page.getByRole("button", { name: /^Đang dùng/ }).click();
  await expect(page.getByRole("button", { name: bia, exact: true })).toBeVisible({ timeout: 30_000 });

  // Điện thoại 390: không tràn ngang.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByPlaceholder("Tìm nguyên liệu").fill("");
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${ANH}/3-nguyen-lieu-390.png` });
});
