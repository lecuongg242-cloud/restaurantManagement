import { test, expect, type Page } from "@playwright/test";
import { getPrintMode, setPrintMode, type PrintMode } from "./tenant-mode";

/**
 * PRINT-10 — chế độ in theo TỪNG quán, trên CÙNG một bản build. Trước đây là biến môi trường nhúng lúc
 * build: một công tắc cho mọi quán.
 *
 * Dấu hiệu quan sát được: chip "cầu in / máy in bếp" trên thanh công cụ POS chỉ có ở chế độ cầu in
 * (`useCauIn` không hỏi server khi quán in trình duyệt).
 */
const QUAN = [
  { slug: "pho-viet", email: "ownerA@pho-viet.test", mode: "browser" as PrintMode },
  { slug: "bun-bo", email: "ownerB@bun-bo.test", mode: "bridge" as PrintMode },
];
const PASS = "DemoPass123!";
const cu: Record<string, PrintMode> = {};

test.beforeAll(async () => {
  for (const q of QUAN) {
    cu[q.slug] = await getPrintMode(q.slug);
    await setPrintMode(q.slug, q.mode);
  }
});

test.afterAll(async () => {
  for (const q of QUAN) await setPrintMode(q.slug, cu[q.slug]);
});

async function vaoPos(page: Page, slug: string, email: string) {
  await page.goto(`/r/${slug}/admin/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
  await page.goto(`/r/${slug}/pos`, { waitUntil: "networkidle" });
}

const chipCauIn = (page: Page) =>
  page.getByRole("status", { name: /cầu in|Máy in bếp/i });

for (const q of QUAN) {
  test(`${q.slug} ở chế độ ${q.mode} → POS ${q.mode === "bridge" ? "CÓ" : "KHÔNG có"} chip cầu in`, async ({ page }) => {
    await vaoPos(page, q.slug, q.email);
    // Chờ POS dựng xong (thanh công cụ có nút tìm món) rồi mới khẳng định chip có/không.
    await expect(page.getByLabel("Tìm món").or(page.getByRole("tab", { name: "Sơ đồ bàn" })).first()).toBeVisible({ timeout: 30_000 });
    if (q.mode === "bridge") {
      await expect(chipCauIn(page)).toBeVisible({ timeout: 15_000 });
    } else {
      await page.waitForTimeout(3_000);
      await expect(chipCauIn(page)).toHaveCount(0);
    }
  });
}
