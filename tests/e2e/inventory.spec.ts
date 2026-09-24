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
  for (const path of [BASE, `${BASE}/recipes`, `${BASE}/today`, `${BASE}/count`]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("nhập 1 kg → POS 'còn ~5'; dùng hết → nhãn vàng, vẫn thêm được; khách không thấy (INV-04, INV-07)", async ({ page }) => {
  const db = admin();
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  const tenant = t!.id as string;

  // Món demo KHÔNG có nhóm tùy chọn → bấm là vào giỏ ngay.
  const { data: links } = await db.from("menu_item_modifier_groups").select("item_id").eq("tenant_id", tenant);
  const withGroups = new Set((links ?? []).map((l) => l.item_id));
  const { data: items } = await db
    .from("menu_items")
    .select("id, name")
    .eq("tenant_id", tenant)
    .eq("active", true)
    .eq("is_available", true)
    .order("sort_order");
  const item = (items ?? []).find((i) => !withGroups.has(i.id))!;
  expect(item, "cần một món demo không có tùy chọn").toBeTruthy();

  const ingName = `${TAG} Bò POS`;
  const { data: ing } = await db
    .from("ingredients")
    .insert({ tenant_id: tenant, name: ingName, base_unit: "g", purchase_unit: "kg", purchase_factor: 1000 })
    .select("id")
    .single();
  await db.from("recipe_lines").insert({ tenant_id: tenant, ingredient_id: ing!.id, menu_item_id: item.id, qty: 200 });
  const orderIds: string[] = [];

  try {
    // Nhập 1 kg qua màn thật → sổ lưu 1000 g (INV-04)
    await page.goto(`${BASE}/today`);
    await page.getByRole("button", { name: "+ Thêm nguyên liệu khác" }).click();
    await page.getByRole("combobox", { name: "Nguyên liệu" }).last().selectOption({ label: ingName });
    await page.getByRole("textbox", { name: /Số lượng/ }).last().fill("1");
    await page.getByRole("button", { name: "Ghi phiếu nhập" }).click();
    await expect(page.getByText(/Đã nhập 1 nguyên liệu/)).toBeVisible();
    const { data: se } = await db.from("stock_entries").select("qty").eq("ingredient_id", ing!.id);
    expect(se!.map((r) => Number(r.qty))).toEqual([1000]);

    const card = () => page.locator("li").filter({ has: page.getByRole("button", { name: `Thêm ${item.name}` }) });
    await page.goto(`/r/${SLUG}/pos`);
    await expect(card().getByText("còn ~5")).toBeVisible();

    // Bán 5 phần (1.000 g ÷ 200 g) — mốc sau phiếu nhập, trước now().
    await page.waitForTimeout(1500);
    const { data: o } = await db
      .from("orders")
      .insert({ tenant_id: tenant, channel: "takeaway", source: "staff", status: "confirmed", confirmed_at: new Date(Date.now() - 500).toISOString(), note: TAG })
      .select("id")
      .single();
    orderIds.push(o!.id);
    await db.from("order_items").insert({
      tenant_id: tenant, order_id: o!.id, menu_item_id: item.id, name_snapshot: item.name, unit_price_snapshot: 1000, qty: 5,
    });

    await page.reload();
    await expect(card().getByText("Có thể đã hết — hãy hỏi bếp")).toBeVisible();

    // Vẫn thêm vào giỏ được: không khóa món (QD-017 C2). pho-viet bán tại quầy → thực đơn bấm
    // được ngay, món vào "Đơn mới" và nút "Tạo đơn" bật lên.
    const add = card().getByRole("button", { name: `Thêm ${item.name}` });
    await expect(add).toBeEnabled();
    await add.click();
    await expect(page.getByRole("button", { name: /^Tạo đơn/ })).toBeEnabled();
    const { data: still } = await db.from("menu_items").select("is_available").eq("id", item.id).single();
    expect(still!.is_available).toBe(true);

    // Trang khách không lộ số phần (QD-017 C4)
    const html = await (await page.request.get(`/r/${SLUG}/menu`)).text();
    expect(html).not.toContain("còn ~");
    expect(html).not.toContain("hỏi bếp");
  } finally {
    await db.from("orders").delete().in("id", orderIds);
    await db.from("stock_entries").delete().eq("ingredient_id", ing!.id);
    await db.from("recipe_lines").delete().eq("ingredient_id", ing!.id);
    await db.from("ingredients").delete().eq("id", ing!.id);
  }

  // Hồi quy INV-10: hết dữ liệu sổ → POS không còn nhãn nào
  await page.reload();
  await expect(page.getByText("Có thể đã hết — hãy hỏi bếp")).toHaveCount(0);
  await expect(page.getByText(/^còn ~\d+$/)).toHaveCount(0);
});

test("kiểm kê lệch 200 g + phiếu hủy có lý do (INV-08)", async ({ page }) => {
  const db = admin();
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  const tenant = t!.id as string;
  const name = `${TAG} Tôm`;
  const { data: ing } = await db
    .from("ingredients")
    .insert({ tenant_id: tenant, name, base_unit: "g", purchase_unit: "kg", purchase_factor: 1000, must_count: true })
    .select("id")
    .single();
  const { businessDate } = await import("@/lib/inventory/day");
  await db.from("stock_entries").insert({
    tenant_id: tenant, business_date: businessDate(), ingredient_id: ing!.id, kind: "receipt", qty: 1000,
  });

  try {
    await page.goto(`${BASE}/count`);
    await expect(page.getByText(/tính cho ngày \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    const row = page.locator("li").filter({ hasText: name });
    await expect(row.getByText("Sổ: 1 kg")).toBeVisible();
    await row.getByRole("textbox").fill("0,8");
    await page.getByRole("button", { name: "Ghi kiểm kê" }).click();
    await expect(page.getByText(/Đã ghi kiểm kê/)).toBeVisible();
    const { data: adj } = await db.from("stock_entries").select("qty").eq("ingredient_id", ing!.id).eq("kind", "count_adjust");
    expect(adj!.map((r) => Number(r.qty))).toEqual([-200]);

    // "Khác" mà không ghi chú → bị từ chối, không ghi
    const waste = page.locator("form").filter({ has: page.getByRole("button", { name: "Ghi phiếu hủy" }) });
    await waste.locator('select[name="ingredient_id"]').selectOption({ label: `${name} (kg)` });
    await waste.locator('input[name="qty"]').fill("0,1");
    await waste.locator('select[name="reason"]').selectOption("khac");
    await waste.getByRole("button", { name: "Ghi phiếu hủy" }).click();
    await expect(page.getByText(/cần ghi chú/)).toBeVisible();

    await waste.locator('select[name="ingredient_id"]').selectOption({ label: `${name} (kg)` });
    await waste.locator('input[name="qty"]').fill("0,1");
    await waste.locator('select[name="reason"]').selectOption("hong");
    await waste.getByRole("button", { name: "Ghi phiếu hủy" }).click();
    await expect(page.getByText(`Đã ghi hủy ${name}.`)).toBeVisible();
    const { data: w } = await db.from("stock_entries").select("qty, reason").eq("ingredient_id", ing!.id).eq("kind", "waste");
    expect(w).toEqual([{ qty: -100, reason: "hong" }]);
  } finally {
    await db.from("stock_entries").delete().eq("ingredient_id", ing!.id);
    await db.from("ingredients").delete().eq("id", ing!.id);
  }
});
