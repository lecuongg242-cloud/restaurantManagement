import { test, expect, chromium } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/**
 * P10 — Nguyên liệu & định lượng trên trình duyệt thật (INV-01..03). Chỉ chạy trên tenant DEMO
 * `pho-viet`; mọi dữ liệu tạo ra mang tiền tố E2E + dấu thời gian và được dọn ở afterAll.
 */
config({ path: ".env.local" });

const SLUG = "pho-viet";
const EMAIL = process.env.SEED_OWNER_A_EMAIL ?? "ownerA@pho-viet.test";
const PASSWORD = process.env.SEED_OWNER_A_PASSWORD ?? "DemoPass123!";
const BASE = `/r/${SLUG}/admin/inventory`;
const TAG = `E2E-${Date.now().toString(36)}`;

const statePath = join(mkdtempSync(join(tmpdir(), "inv-")), "state.json");

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function cleanup() {
  const db = admin();
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  const { data: ing } = await db.from("ingredients").select("id").eq("tenant_id", t!.id).like("name", `${TAG}%`);
  const ids = (ing ?? []).map((r) => r.id);
  if (ids.length === 0) return;
  await db.from("recipe_lines").delete().in("ingredient_id", ids);
  await db.from("recipe_lines").delete().in("parent_ingredient_id", ids);
  await db.from("ingredients").delete().in("id", ids);
}

test.beforeAll(async ({ baseURL }) => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL, storageState: undefined });
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.waitForURL(`**/r/${SLUG}/admin`, { timeout: 30_000 });
  await page.context().storageState({ path: statePath });
  await browser.close();
});

test.afterAll(cleanup);

test.use({ storageState: statePath });

async function addIngredient(
  page: import("@playwright/test").Page,
  o: { name: string; kind?: "prepared"; unit?: "g" | "ml"; purchaseUnit?: string; factor?: string; price?: string; batch?: string }
) {
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Thêm nguyên liệu", exact: true }) });
  await form.locator('input[name="name"]').fill(o.name);
  if (o.kind) await form.locator('select[name="kind"]').selectOption(o.kind);
  if (o.unit) await form.locator('select[name="base_unit"]').selectOption(o.unit);
  if (o.purchaseUnit) {
    await form.locator('input[name="purchase_unit"]').fill(o.purchaseUnit);
    await form.locator('input[name="purchase_factor"]').fill(o.factor!);
  }
  if (o.price) await form.getByPlaceholder("280.000").fill(o.price);
  if (o.batch) await form.locator('input[name="batch_output_qty"]').fill(o.batch);
  await form.getByRole("button", { name: "Thêm nguyên liệu", exact: true }).click();
  await expect(page.getByText(o.name, { exact: true })).toBeVisible();
}

test("khai nguyên liệu + định lượng → thấy giá vốn/phần (INV-01, INV-02)", async ({ page }) => {
  await page.goto(BASE);
  await addIngredient(page, { name: `${TAG} Bò`, purchaseUnit: "kg", factor: "1000", price: "280000" });
  await expect(page.getByText("280.000₫ / kg")).toBeVisible();

  await page.goto(`${BASE}/recipes`);
  const card = page.locator("li").filter({ has: page.locator("summary") }).first();
  await card.locator("summary").click();
  await card.getByRole("combobox").first().selectOption({ label: `${TAG} Bò` });
  await card.getByRole("textbox").first().fill("100");
  await card.getByRole("button", { name: "Lưu định lượng" }).first().click();
  // 100 g × 280đ = 28.000đ
  await expect(card.getByText(/Giá vốn 28\.000₫/)).toBeVisible();

  // Dọn định lượng của món demo ngay: món đó dùng chung với test khác.
  const { data: t } = await admin().from("tenants").select("id").eq("slug", SLUG).single();
  const { data: ing } = await admin().from("ingredients").select("id").eq("tenant_id", t!.id).eq("name", `${TAG} Bò`);
  await admin().from("recipe_lines").delete().eq("ingredient_id", ing![0].id);
});

test("công thức vòng bị chặn, không lưu (INV-03)", async ({ page }) => {
  await page.goto(BASE);
  await addIngredient(page, { name: `${TAG} X`, kind: "prepared", unit: "ml", batch: "1000" });
  await addIngredient(page, { name: `${TAG} Y`, kind: "prepared", unit: "ml", batch: "1000" });

  const cardOf = (name: string) =>
    page.locator("li").filter({ has: page.getByText(name, { exact: true }) });

  // X dùng Y
  const x = cardOf(`${TAG} X`);
  await x.getByRole("combobox").first().selectOption({ label: `${TAG} Y (bán thành phẩm)` });
  await x.getByRole("textbox").last().fill("10");
  await x.getByRole("button", { name: "Lưu định lượng" }).click();
  await expect(page.getByText("Đã lưu định lượng.")).toBeVisible();

  // Y dùng X → vòng
  const y = cardOf(`${TAG} Y`);
  await y.getByRole("combobox").first().selectOption({ label: `${TAG} X (bán thành phẩm)` });
  await y.getByRole("textbox").last().fill("10");
  await y.getByRole("button", { name: "Lưu định lượng" }).click();
  await expect(page.getByText(/Công thức bị vòng/)).toBeVisible();

  const { data: t } = await admin().from("tenants").select("id").eq("slug", SLUG).single();
  const { data: yRow } = await admin().from("ingredients").select("id").eq("tenant_id", t!.id).eq("name", `${TAG} Y`);
  const { count } = await admin()
    .from("recipe_lines")
    .select("id", { count: "exact", head: true })
    .eq("parent_ingredient_id", yRow![0].id);
  expect(count).toBe(0);
});

test("360px không cuộn ngang", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of [BASE, `${BASE}/recipes`]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
