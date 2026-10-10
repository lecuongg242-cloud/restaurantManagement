import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/**
 * P38 — kéo thả sắp xếp (chủ dự án chốt 10/10/2026): món trong danh mục, tab danh mục, khu vực, bàn trong khu. Quán demo
 * `pho-viet`; dữ liệu thử mang TAG và được dọn ở cuối, thứ tự danh mục / khu vực cũ được trả lại.
 */
config({ path: ".env.local" });

const SLUG = "pho-viet";
const TAG = `E2E${Date.now().toString(36).slice(-4)}`;
const ANH = "docs/30-KeHoach/P38/anh";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
test.setTimeout(300_000);

let tenantId = "";
let catsCu: { id: string; sort_order: number }[] = [];
let areasCu: { id: string; sort_order: number }[] = [];

async function dangNhap(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', process.env.SEED_OWNER_A_EMAIL ?? "ownerA@pho-viet.test");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_A_PASSWORD ?? "DemoPass123!");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 }),
    page.click('button[type="submit"]'),
  ]);
}

/** Kéo bằng chuột thật: nhấn ở `from`, đi từng bước tới `to`, thả. */
async function keo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 5, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.waitForTimeout(200);
  await page.mouse.up();
}
const tam = async (page: Page, sel: ReturnType<Page["locator"]>) => {
  const b = (await sel.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

async function thuTu(table: string, col: string, val: string | null) {
  let q = db.from(table).select("name, sort_order").eq("tenant_id", tenantId);
  q = val === null ? q.is(col, null) : q.eq(col, val);
  const { data } = await q.order("sort_order");
  return (data ?? []).map((r) => r.name as string);
}

test.beforeAll(async () => {
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  tenantId = t!.id;
  catsCu = (await db.from("menu_categories").select("id, sort_order").eq("tenant_id", tenantId)).data ?? [];
  areasCu = (await db.from("areas").select("id, sort_order").eq("tenant_id", tenantId)).data ?? [];
});

test.afterAll(async () => {
  await db.from("menu_categories").delete().eq("tenant_id", tenantId).like("name", `%${TAG}%`);
  await db.from("areas").delete().eq("tenant_id", tenantId).like("name", `%${TAG}%`);
  await db.from("tables").delete().eq("tenant_id", tenantId).like("name", `%${TAG}%`);
  for (const c of catsCu) await db.from("menu_categories").update({ sort_order: c.sort_order }).eq("id", c.id);
  for (const a of areasCu) await db.from("areas").update({ sort_order: a.sort_order }).eq("id", a.id);
});

test("MENU-06/07/08: kéo món (chuột + bàn phím), kéo tab danh mục; không còn ↑↓ món", async ({ page }) => {
  const maxCat = Math.max(-1, ...catsCu.map((c) => c.sort_order));
  const { data: cat } = await db
    .from("menu_categories")
    .insert({ tenant_id: tenantId, name: `Nhóm ${TAG}`, sort_order: maxCat + 1 })
    .select("id")
    .single();
  await db.from("menu_items").insert(
    ["A", "B", "C"].map((n, i) => ({
      tenant_id: tenantId,
      category_id: cat!.id,
      name: `Món ${n} ${TAG}`,
      base_price: 10000,
      sort_order: i,
    }))
  );

  await page.setViewportSize({ width: 1366, height: 900 });
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/admin/menu?nhom=${cat!.id}`, { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: "Chuyển món lên" })).toHaveCount(0);
  const tay = (n: string) => page.getByRole("button", { name: `Kéo để sắp xếp: Món ${n} ${TAG}` });
  await expect(tay("A")).toBeVisible();

  // Chuột: kéo C thả lên A → C, A, B.
  await keo(page, await tam(page, tay("C")), await tam(page, tay("A")));
  await expect.poll(() => thuTu("menu_items", "category_id", cat!.id)).toEqual([`Món C ${TAG}`, `Món A ${TAG}`, `Món B ${TAG}`]);
  await expect(page.getByText("Đã lưu thứ tự.")).toBeVisible();
  await page.screenshot({ path: `${ANH}/1-keo-mon-1366.png` });

  // Bàn phím: B (cuối) → Space, ← ←, Space → B, C, A.
  await tay("B").focus();
  await page.keyboard.press("Space");
  // dnd-kit gắn bộ nghe phím sau khi nhấc (setTimeout) — chờ một nhịp, không thì phím đầu bị nuốt.
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(150);
  await page.keyboard.press("Space");
  await expect.poll(() => thuTu("menu_items", "category_id", cat!.id)).toEqual([`Món B ${TAG}`, `Món C ${TAG}`, `Món A ${TAG}`]);

  // Tải lại vẫn đúng thứ tự trên màn.
  await page.reload({ waitUntil: "networkidle" });
  const ten = await page.locator("main").getByText(new RegExp(`^Món [ABC] ${TAG}$`)).allTextContents();
  expect(ten).toEqual([`Món B ${TAG}`, `Món C ${TAG}`, `Món A ${TAG}`]);

  // Đang tìm → không có tay nắm.
  await page.getByPlaceholder("Tìm món").fill(TAG.toLowerCase());
  await expect(page.getByRole("button", { name: /^Kéo để sắp xếp/ })).toHaveCount(0);
  await page.getByPlaceholder("Tìm món").fill("");

  // Tab danh mục: tab TAG đứng cuối hàng (hàng tab cuộn ngang) — cuộn tới, kéo thả lên tab ngay trước nó → đổi chỗ.
  const nav = page.getByRole("navigation", { name: "Danh mục" });
  const tabs = nav.getByRole("link");
  const tabTag = nav.getByRole("link", { name: new RegExp(`^Nhóm ${TAG}`) });
  const soTab = await tabs.count();
  const truocTag = tabs.nth(soTab - 2);
  const tenTruoc = (await truocTag.textContent())!.replace(/\d+$/, "");
  await tabTag.scrollIntoViewIfNeeded();
  await keo(page, await tam(page, tabTag), await tam(page, truocTag));
  const thuTuDm = async () =>
    ((await db.from("menu_categories").select("name").eq("tenant_id", tenantId).order("sort_order")).data ?? []).map((r) => r.name);
  await expect.poll(async () => { const t = await thuTuDm(); return t.indexOf(`Nhóm ${TAG}`) < t.indexOf(tenTruoc); }).toBe(true);
  // Vừa kéo xong không bị chuyển tab ngoài ý muốn; trên màn TAG đã đứng trước.
  await expect(page).toHaveURL(new RegExp(`\\?nhom=${cat!.id}$`));
  await expect(tabs.nth(soTab - 2)).toHaveText(new RegExp(`^Nhóm ${TAG}`));
  await page.screenshot({ path: `${ANH}/2-keo-tab-danh-muc-1366.png` });

  // Bấm tab (không kéo) vẫn chọn tab.
  await nav.getByRole("link", { name: "Tất cả" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/menu$`));
});

test("TABLE-11: kéo bàn trong khu, kéo khu vực ở cột trái; không còn Thứ tự / Chuyển lên-xuống", async ({ page }) => {
  const maxArea = Math.max(-1, ...areasCu.map((a) => a.sort_order));
  const { data: area } = await db
    .from("areas")
    .insert({ tenant_id: tenantId, name: `Khu ${TAG}`, sort_order: maxArea + 1 })
    .select("id")
    .single();
  await db.from("tables").insert(
    ["1", "2", "3"].map((n, i) => ({ tenant_id: tenantId, area_id: area!.id, name: `B${n}${TAG}`, seats: 2, sort_order: i }))
  );

  await page.setViewportSize({ width: 1366, height: 900 });
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/admin/tables`, { waitUntil: "networkidle" });
  const cot = page.locator("aside [data-khu-vuc]");
  const bang = page.locator("[data-bang-ban]");
  const tay = (n: string) => page.getByRole("button", { name: `Kéo để sắp xếp: ${n}`, exact: true });

  // "Tất cả": bảng không có tay nắm (danh sách trộn nhiều khu).
  await expect(bang.getByRole("button", { name: /^Kéo để sắp xếp/ })).toHaveCount(0);
  await expect(page.getByText("Thứ tự", { exact: true })).toHaveCount(0);

  // Chọn khu TAG → có tay nắm; kéo B3 thả lên B1 → B3, B1, B2.
  await cot.getByRole("button", { name: new RegExp(`^Khu ${TAG}\\s*3$`) }).click();
  await expect(bang.getByRole("button", { name: /^Kéo để sắp xếp/ })).toHaveCount(3);
  await keo(page, await tam(page, bang.locator(tay(`B3${TAG}`))), await tam(page, bang.locator(tay(`B1${TAG}`))));
  await expect.poll(() => thuTu("tables", "area_id", area!.id)).toEqual([`B3${TAG}`, `B1${TAG}`, `B2${TAG}`]);
  await expect(page.getByText("Đã lưu thứ tự.")).toBeVisible();
  await page.screenshot({ path: `${ANH}/3-keo-ban-1366.png` });

  // Đang tìm → không có tay nắm.
  await page.getByPlaceholder("Tìm bàn…").fill("B1");
  await expect(bang.getByRole("button", { name: /^Kéo để sắp xếp/ })).toHaveCount(0);
  await page.getByPlaceholder("Tìm bàn…").fill("");

  // Menu ⋯ của khu không còn Chuyển lên / Chuyển xuống.
  await cot.getByRole("button", { name: `Thao tác khu Khu ${TAG}` }).click();
  await expect(page.getByRole("menuitem", { name: "Sửa tên" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Chuyển (lên|xuống)$/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Khu vực: bàn phím đưa khu TAG (cuối) lên đầu cột.
  await cot.locator(tay(`Khu ${TAG}`)).focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  for (let i = 0; i < areasCu.length; i++) {
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(300);
  }
  await page.keyboard.press("Space");
  await expect
    .poll(async () => (await db.from("areas").select("name").eq("tenant_id", tenantId).order("sort_order").limit(1).single()).data?.name)
    .toBe(`Khu ${TAG}`);
  await page.reload({ waitUntil: "networkidle" });
  // Khu đầu cột (sau "Tất cả") là khu TAG.
  await expect(cot.getByRole("button", { name: /^Kéo để sắp xếp/ }).first()).toHaveAttribute("aria-label", `Kéo để sắp xếp: Khu ${TAG}`);
  await page.screenshot({ path: `${ANH}/4-keo-khu-vuc-1366.png` });

  // 390px: không tràn ngang; chip khu vẫn bấm chọn được.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: new RegExp(`^Khu ${TAG} · 3$`) }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`^Khu ${TAG}`) })).toBeVisible();
  await page.screenshot({ path: `${ANH}/5-ban-390.png` });
});
