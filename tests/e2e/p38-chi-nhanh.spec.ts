import { test, expect, type Page } from "@playwright/test";
import { config } from "dotenv";

/**
 * BRANCH-09 (QD-023 D2'', chủ dự án 11/10/2026) — mục "Chi nhánh" chỉ có khi super-admin đã đăng ký chuỗi cho quán.
 * Quán lẻ demo `bun-bo`: không có mục, gõ URL thì về Tổng quan. Chuỗi demo `pho-viet` (thương hiệu phoviet): vẫn có.
 * Chỉ ĐỌC, không ghi gì.
 */
config({ path: ".env.local" });
test.setTimeout(180_000);

async function dangNhap(page: Page, slug: string, email: string) {
  await page.goto(`/r/${slug}/admin/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "DemoPass123!");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 }),
    page.click('button[type="submit"]'),
  ]);
}

test("quán lẻ: không có mục Chi nhánh, mở URL về Tổng quan", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await dangNhap(page, "bun-bo", process.env.SEED_OWNER_B_EMAIL ?? "ownerB@bun-bo.test");
  await page.goto("/r/bun-bo/admin", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "Thực đơn", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Chi nhánh" })).toHaveCount(0);

  await page.goto("/r/bun-bo/admin/chi-nhanh");
  await expect(page).toHaveURL(/\/r\/bun-bo\/admin$/);

  // App Quản lý › Thêm: cũng không có.
  await page.goto("/r/bun-bo/quan-ly/them", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: /Bàn & QR/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Chi nhánh/ })).toHaveCount(0);
});

test("chuỗi: vẫn có mục Chi nhánh và trang mở được", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await dangNhap(page, "pho-viet", process.env.SEED_OWNER_A_EMAIL ?? "ownerA@pho-viet.test");
  await page.goto("/r/pho-viet/admin", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Chi nhánh" }).click();
  await expect(page).toHaveURL(/\/admin\/chi-nhanh$/);
  await expect(page.getByRole("heading", { name: "Chi nhánh", level: 1 })).toBeVisible();
  await expect(page.getByText(/^Chuỗi .+ · \d+ chi nhánh/)).toBeVisible();
});
