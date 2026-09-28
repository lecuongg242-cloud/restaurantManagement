import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

/**
 * P18 18-02 (AI-03) — màn "Nhập hôm nay": gợi ý nhập theo dự báo + nút "Điền theo gợi ý".
 *
 * Chưa quán nào khai định lượng, nên test tự dựng trên quán DEMO pho-viet: một nguyên liệu + định lượng cho món bán
 * nhiều nhất trong dự báo hôm nay, và (vì dữ liệu demo ngẫu nhiên, sai lệch backtest > 25% nên dự báo bị ẩn) tạm đặt
 * sai lệch của lượt dự báo mới nhất về 18%. Mọi thứ trả lại như cũ ở afterAll.
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const TEN = `E2E thịt ${Date.now().toString(36)}`;

let tenantId = "";
let runDate = "";
let mapeCu: number | null = null;
let ingId = "";
let monId = "";
let slHomNay = 0;

test.beforeAll(async () => {
  tenantId = (await admin.from("tenants").select("id").eq("slug", SLUG).single()).data!.id as string;
  const { data: run } = await admin.from("forecast_runs").select("run_date, mape_revenue").eq("tenant_id", tenantId).order("run_date", { ascending: false }).limit(1).single();
  test.skip(!run, "pho-viet chưa có lượt dự báo — chạy: node scripts/du-bao-dem.mjs --quan pho-viet");
  runDate = run!.run_date as string;
  mapeCu = run!.mape_revenue === null ? null : Number(run!.mape_revenue);
  const homNay = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const { data: mon } = await admin
    .from("forecasts")
    .select("item_key, value")
    .eq("tenant_id", tenantId)
    .eq("run_date", runDate)
    .eq("metric", "item_qty")
    .eq("target_date", homNay)
    .not("item_key", "like", "ten:%")
    .neq("item_key", "khac")
    .order("value", { ascending: false })
    .limit(1)
    .single();
  test.skip(!mon, "dự báo hôm nay của pho-viet không có món nào");
  monId = mon!.item_key as string;
  slHomNay = Number(mon!.value);
  await admin.from("forecast_runs").update({ mape_revenue: 18 }).eq("tenant_id", tenantId).eq("run_date", runDate);
  const { data: ing } = await admin
    .from("ingredients")
    .insert({ tenant_id: tenantId, name: TEN, kind: "purchased", base_unit: "g", purchase_unit: "kg", purchase_factor: 1000, yield_pct: 90 })
    .select("id")
    .single();
  ingId = ing!.id as string;
  await admin.from("recipe_lines").insert({ tenant_id: tenantId, ingredient_id: ingId, menu_item_id: monId, qty: 150 });
});

test.afterAll(async () => {
  if (ingId) {
    await admin.from("recipe_lines").delete().eq("ingredient_id", ingId);
    await admin.from("ingredients").delete().eq("id", ingId);
  }
  if (runDate) await admin.from("forecast_runs").update({ mape_revenue: mapeCu }).eq("tenant_id", tenantId).eq("run_date", runDate);
});

test("gợi ý = món dự báo × 150 g ÷ 90% + 10%, làm tròn lên kg; 'Điền theo gợi ý' chép vào phiếu nhập", async ({ page }) => {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.pass);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
  await page.goto(`/r/${SLUG}/admin/inventory/today`, { waitUntil: "networkidle" });

  const kg = Math.ceil(((slHomNay * 150) / 0.9) * 1.1 / 1000 - 1e-9);
  const khoi = page.locator("[data-goi-y-nhap]");
  await expect(khoi).toBeVisible();
  const dong = khoi.locator("tr").filter({ hasText: TEN });
  await expect(dong).toContainText(`${kg} kg`);
  await page.screenshot({ path: "docs/30-KeHoach/P18/anh/3-goi-y-nhap.png", fullPage: true });

  await page.getByRole("button", { name: "Điền theo gợi ý" }).click();
  // Dòng của nguyên liệu vừa thêm: ô chọn đang chọn nó, ô số lượng = gợi ý.
  const o = page.locator("form select").filter({ has: page.locator(`option[value="${ingId}"]:checked`) });
  await expect(o).toHaveCount(1);
  const soLuong = o.locator("xpath=..").getByRole("textbox", { name: /Số lượng/ });
  await expect(soLuong).toHaveValue(String(kg));
});
