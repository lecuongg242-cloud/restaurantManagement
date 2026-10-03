import { test, expect, chromium } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { getServiceMode, setServiceMode } from "./tenant-mode";

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
    // Đơn vị quen (kg, lít…) → hệ số tự tính, không có ô gõ; đơn vị riêng (vỉ, bao…) → gõ tay.
    const tuTinh = form.locator("[data-he-so-tu-tinh]");
    if (await tuTinh.count()) {
      await expect(tuTinh).toContainText(`= ${Number(o.factor).toLocaleString("vi-VN")} `);
      await expect(tuTinh).toContainText("tự tính");
    } else {
      await form.locator('input[name="purchase_factor"]').fill(o.factor!);
    }
  }
  if (o.price) await form.getByPlaceholder("280.000").fill(o.price);
  if (o.batch) await form.locator('input[name="batch_output_qty"]').fill(o.batch);
  await form.getByRole("button", { name: "Thêm nguyên liệu", exact: true }).click();
  // Tên chính của thẻ nguyên liệu (ô chọn công thức của bán thành phẩm cũng chứa tên mọi nguyên liệu).
  await expect(page.locator("span.font-medium").getByText(o.name, { exact: true })).toBeVisible();
}

test("khai nguyên liệu + định lượng → thấy giá vốn/phần (INV-01, INV-02)", async ({ page }) => {
  await page.goto(BASE);
  await addIngredient(page, { name: `${TAG} Bò`, purchaseUnit: "kg", factor: "1000", price: "280000" });
  await expect(page.getByText("280.000₫ / kg")).toBeVisible();

  await page.goto(`${BASE}/recipes`);
  // Món CHƯA khai định lượng — món đã có định lượng (dữ liệu kho demo P26) sẽ bị ghi đè dòng đầu rồi bị dọn mất.
  const tenMon = await page
    .locator("li")
    .filter({ has: page.locator("summary", { hasText: "Chưa khai định lượng" }) })
    .first()
    .locator("summary span.font-medium")
    .first()
    .evaluate((el) => el.firstChild?.textContent?.trim() ?? "");
  const card = page.locator("li").filter({ has: page.locator("summary span.font-medium", { hasText: tenMon }) }).first();
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
  for (const path of [BASE, `${BASE}/recipes`, `${BASE}/stock`, `${BASE}/count`, `/r/${SLUG}/admin/nhap-hang/moi`]) {
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
  // Ca này bấm món ngay không chọn bàn → cần chế độ bán tại quầy. Tự đặt rồi trả lại, không dựa vào cài đặt đang có của
  // tenant demo dùng chung (pho-viet đã bị đổi sang "table" → nút thêm món khóa, cùng kiểu lỗi 522963b).
  const modeCu = await getServiceMode(SLUG);

  // Món demo KHÔNG có nhóm tùy chọn (bấm là vào giỏ) và CHƯA có định lượng. Định lượng mới áp cho cả đơn của ngày chưa chốt
  // (QD-017 D1) — dữ liệu kho demo P26 có đơn trưa nay, nên nhập đủ cho số đã bán hôm nay CỘNG 5 phần → vẫn phải ra "còn ~5".
  // (Không tạo món riêng: thực đơn POS qua unstable_cache, món chèn thẳng DB không hiện.)
  const { data: links } = await db.from("menu_item_modifier_groups").select("item_id").eq("tenant_id", tenant);
  const withGroups = new Set((links ?? []).map((l) => l.item_id));
  const { data: rl } = await db.from("recipe_lines").select("menu_item_id").eq("tenant_id", tenant).not("menu_item_id", "is", null);
  const withRecipe = new Set((rl ?? []).map((r) => r.menu_item_id));
  const { data: items } = await db
    .from("menu_items")
    .select("id, name")
    .eq("tenant_id", tenant)
    .eq("active", true)
    .eq("is_available", true)
    .order("sort_order");
  const homNay = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10) + "T00:00:00+07:00";
  const { data: sold } = await db
    .from("order_items")
    .select("menu_item_id, qty, status, orders!inner(confirmed_at)")
    .eq("tenant_id", tenant)
    .neq("status", "cancelled")
    .gte("orders.confirmed_at", new Date(homNay).toISOString());
  const soldQty = (id: string) => (sold ?? []).filter((r) => r.menu_item_id === id).reduce((a, r) => a + Number(r.qty), 0);
  const item = (items ?? [])
    .filter((i) => !withGroups.has(i.id) && !withRecipe.has(i.id))
    .sort((a, b) => soldQty(a.id) - soldQty(b.id))[0];
  expect(item, "cần một món demo không có tùy chọn, chưa có định lượng").toBeTruthy();
  const daBan = soldQty(item.id);

  const ingName = `${TAG} Bò POS`;
  const { data: ing } = await db
    .from("ingredients")
    .insert({ tenant_id: tenant, name: ingName, base_unit: "g", purchase_unit: "kg", purchase_factor: 1000 })
    .select("id")
    .single();
  await db.from("recipe_lines").insert({ tenant_id: tenant, ingredient_id: ing!.id, menu_item_id: item.id, qty: 200 });
  const orderIds: string[] = [];
  const receiptIds: string[] = [];

  try {
    await setServiceMode(SLUG, "counter");
    // Nhập 1 kg qua màn thật → sổ lưu 1000 g (INV-04)
    await page.goto(`/r/${SLUG}/admin/nhap-hang/moi`);
    await page.getByRole("button", { name: "+ Thêm nguyên liệu khác" }).click();
    await page.getByRole("combobox", { name: "Nguyên liệu" }).last().selectOption({ label: ingName });
    await page.getByRole("textbox", { name: /Số lượng/ }).last().fill(String((daBan + 5) * 0.2).replace(".", ","));
    // P20: mỗi lần "Hoàn thành" là một phiếu nhập; không NCC, không giá → dòng sổ như nhập buổi sáng cũ.
    await page.getByRole("button", { name: "Hoàn thành" }).click();
    await expect(page.getByText(/Đã nhập hàng — phiếu PN\d{6}/)).toBeVisible();
    const { data: se } = await db.from("stock_entries").select("qty, purchase_receipt_id").eq("ingredient_id", ing!.id);
    expect(se!.map((r) => Number(r.qty))).toEqual([(daBan + 5) * 200]);
    receiptIds.push(se![0].purchase_receipt_id as string);

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
    await db.from("purchase_receipts").delete().in("id", receiptIds);
    await db.from("recipe_lines").delete().eq("ingredient_id", ing!.id);
    await db.from("ingredients").delete().eq("id", ing!.id);
    await setServiceMode(SLUG, modeCu);
  }

  // Hồi quy INV-10: hết dữ liệu sổ của món → món không còn nhãn (quán demo có kho thật P26 nên món khác vẫn có thể có nhãn)
  await page.reload();
  const theMon = page.locator("li").filter({ has: page.getByRole("button", { name: `Thêm ${item.name}` }) });
  await expect(theMon.getByText("Có thể đã hết — hãy hỏi bếp")).toHaveCount(0);
  await expect(theMon.getByText(/^còn ~\d+$/)).toHaveCount(0);
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
    await expect(row.getByText("1 kg", { exact: true })).toBeVisible(); // cột Tồn kho
    await row.getByRole("textbox").fill("0,8");
    // P25 (INV-11): lệch 20% — không phải lệch lớn, không hỏi lại.
    await expect(page.getByLabel(`SL lệch ${name}`)).toContainText("-0,2 kg");
    await page.getByRole("button", { name: "Hoàn thành" }).click();
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

test("báo cáo: chưa khai nguyên liệu thì không có khối P10; khai rồi thì có, dòng nối khớp KPI (REPORT-13, INV-10)", async ({ page, browser, baseURL }) => {
  const REPORTS = `/r/${SLUG}/admin/reports?preset=30d`;
  await cleanup();

  // Phần "chưa khai": khối P10 ẩn khi quán KHÔNG có nguyên liệu nào (report-server `if (!count) return null`). pho-viet là
  // quán demo dùng chung — chủ dự án khai nguyên liệu thử ở đó (01/10/2026: "Thịt ngựa"), nên kiểm trên bun-bo.
  const EMPTY = "bun-bo";
  const { data: bb } = await admin().from("tenants").select("id").eq("slug", EMPTY).single();
  const { count: soNl } = await admin().from("ingredients").select("id", { count: "exact", head: true }).eq("tenant_id", bb!.id);
  expect(soNl, `${EMPTY} phải chưa khai nguyên liệu nào để kiểm INV-10`).toBe(0);
  const ctx = await browser.newContext({ baseURL });
  try {
    const p2 = await ctx.newPage();
    await p2.goto(`/r/${EMPTY}/admin/login`);
    await p2.fill('input[name="email"]', process.env.SEED_OWNER_B_EMAIL ?? "ownerB@bun-bo.test");
    await p2.fill('input[name="password"]', process.env.SEED_OWNER_B_PASSWORD ?? "DemoPass123!");
    await Promise.all([p2.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 }), p2.click('button[type="submit"]')]);
    await p2.goto(`/r/${EMPTY}/admin/reports?preset=30d`);
    await expect(p2.getByRole("heading", { name: "Báo cáo dòng tiền" })).toBeVisible();
    await expect(p2.getByRole("heading", { name: "Lãi gộp theo món" })).toHaveCount(0);
    await expect(p2.getByRole("heading", { name: "Hao hụt" })).toHaveCount(0);
  } finally {
    await ctx.close();
  }

  // Dựng một hóa đơn đã thanh toán HÔM NAY: món có định lượng 100 g × 200đ/g = 20.000đ giá vốn,
  // bán 50.000đ → khối lãi gộp phải có dòng "tạm tính" và dòng nối phải khớp KPI trên cùng trang.
  const db = admin();
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  const tenant = t!.id as string;
  // Món RIÊNG của test (ẩn khỏi thực đơn): món demo có sẵn còn đơn thật khác trong ngày → lãi/phần không còn là của mỗi
  // hóa đơn này (01/10/2026: "Bún bò Huế" 2 phần có giá hôm nay → 35.000₫ thay vì 30.000₫).
  const { data: cats } = await db.from("menu_categories").select("id").eq("tenant_id", tenant).limit(1);
  const { data: item } = await db
    .from("menu_items")
    .insert({ tenant_id: tenant, category_id: cats![0].id, name: `${TAG} Món báo cáo`, base_price: 50_000, active: false })
    .select("id, name")
    .single();
  const { data: ing } = await db
    .from("ingredients")
    .insert({ tenant_id: tenant, name: `${TAG} Báo cáo`, base_unit: "g", last_unit_cost: 200, last_cost_at: new Date().toISOString() })
    .select("id")
    .single();
  await db.from("recipe_lines").insert({ tenant_id: tenant, ingredient_id: ing!.id, menu_item_id: item!.id, qty: 100 });
  const { data: o } = await db
    .from("orders")
    .insert({ tenant_id: tenant, channel: "takeaway", source: "staff", status: "completed", confirmed_at: new Date().toISOString(), note: TAG })
    .select("id")
    .single();
  const { data: oi } = await db
    .from("order_items")
    .insert({ tenant_id: tenant, order_id: o!.id, menu_item_id: item!.id, name_snapshot: item!.name, unit_price_snapshot: 50_000, qty: 1, status: "served" })
    .select("id")
    .single();
  const { data: b } = await db
    .from("bills")
    .insert({ tenant_id: tenant, status: "paid", subtotal: 50_000, total: 50_000, paid_at: new Date().toISOString(), note: TAG })
    .select("id")
    .single();
  await db.from("bill_items").insert({ tenant_id: tenant, bill_id: b!.id, order_item_id: oi!.id, qty_allocated: 1, unit_price_snapshot: 50_000, amount: 50_000 });

  try {
    await page.goto(REPORTS);
    await expect(page.getByRole("heading", { name: "Lãi gộp theo món" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hao hụt" })).toBeVisible();

    const row = page.locator("tr", { hasText: item!.name });
    await expect(row.getByText("20.000₫").first()).toBeVisible(); // giá vốn/phần
    await expect(row.getByText("30.000₫").first()).toBeVisible(); // lãi/phần
    await expect(page.getByText(/phần của hôm nay — tạm tính/)).toBeVisible();

    const kpi = (await page.locator("p", { hasText: /^Doanh thu$/ }).locator("xpath=following-sibling::p[1]").first().innerText()).trim();
    const line = await page.getByText(/^Doanh thu .* = món \(đã trừ giảm giá\)/).innerText();
    expect(line.startsWith(`Doanh thu ${kpi} =`), `${line} ≠ KPI ${kpi}`).toBe(true);
  } finally {
    await db.from("bill_items").delete().eq("bill_id", b!.id);
    await db.from("bills").delete().eq("id", b!.id);
    await db.from("orders").delete().eq("id", o!.id);
    await db.from("recipe_lines").delete().eq("ingredient_id", ing!.id);
    await db.from("ingredients").delete().eq("id", ing!.id);
    await db.from("menu_items").delete().eq("id", item!.id);
  }
});
