import { test, expect, type Page } from "@playwright/test";
import { getServiceMode, setServiceMode, getPrintMode, setPrintMode, type ServiceMode, type PrintMode } from "./tenant-mode";

/**
 * ORDER-19 — CỔNG CHẶN khổ ≥ 1024: POS co giãn cho tablet dọc KHÔNG được đổi một pixel nào ở khổ mà
 * qt-food dùng hằng ngày (tablet ngang, laptop quầy).
 *
 * Ảnh gốc chụp TRƯỚC khi sửa bố cục (`--update-snapshots`), trên dữ liệu demo `pho-viet`. Ảnh gốc
 * không commit (`.gitignore`): nó phụ thuộc dữ liệu của database dùng chung. Trước mỗi lần sửa bố cục
 * POS: chụp lại gốc trên code CHƯA sửa, rồi mới sửa và chạy lại để so.
 *
 *   npx playwright test tests/e2e/pos-kho-lon.spec.ts --update-snapshots   # trên code chưa sửa
 *   npx playwright test tests/e2e/pos-kho-lon.spec.ts                      # sau khi sửa
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };
let modeCu: ServiceMode = "table";
let printCu: PrintMode = "browser";

test.beforeAll(async () => {
  modeCu = await getServiceMode(SLUG);
  printCu = await getPrintMode(SLUG);
  await setServiceMode(SLUG, "table");
  // Chip thiết bị in chỉ có ở chế độ cầu in và đổi theo nhịp tim — cố định chế độ trình duyệt.
  await setPrintMode(SLUG, "browser");
});

test.afterAll(async () => {
  await setServiceMode(SLUG, modeCu);
  await setPrintMode(SLUG, printCu);
});

async function vaoPos(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.pass);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
  await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
  await expect(page.getByLabel("Tìm món")).toBeVisible({ timeout: 30_000 });
}

const KHO = [
  { w: 1280, h: 800 },
  { w: 1024, h: 768 },
];

for (const { w, h } of KHO) {
  test.describe(`${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test("chưa chọn bàn", async ({ page }) => {
      await vaoPos(page);
      await expect(page).toHaveScreenshot(`pos-trong-${w}.png`, { fullPage: false });
    });

    test("đã chọn bàn B2", async ({ page }) => {
      await vaoPos(page);
      await page.getByRole("button", { name: /^B2\b/ }).click();
      await page.waitForTimeout(500);
      await expect(page).toHaveScreenshot(`pos-ban-b2-${w}.png`, { fullPage: false });
    });

    test("bán mang về", async ({ page }) => {
      await vaoPos(page);
      await page.getByRole("button", { name: /^Bán mang về/ }).click();
      await page.waitForTimeout(500);
      await expect(page).toHaveScreenshot(`pos-mang-ve-${w}.png`, { fullPage: false });
    });
  });
}
