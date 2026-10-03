import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/**
 * P20 — hai quyết định giao diện chốt 30/09/2026 (`00-GiaoDien.md`): G1 mục menu "Nhập hàng" (danh sách + "+ Nhập hàng",
 * đường cũ tự chuyển), G4 "+ Nhà cung cấp" mở hộp thoại (lưu được thì đóng, lỗi thì giữ). Quán demo `pho-viet`.
 */
config({ path: ".env.local" });

const SLUG = "pho-viet";
const TAG = `E2E-${Date.now().toString(36)}`;
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

test("G1 + PURCH-08 (P28): một mục 'Kho hàng' → Tồn kho; tab Nhập hàng → danh sách → + Nhập hàng (tab cha vẫn sáng); đường cũ tự chuyển", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/admin`, { waitUntil: "networkidle" });
  // Sidebar: một mục "Kho hàng", không còn ba mục rời.
  for (const cu of ["Nguyên liệu", "Nhập hàng", "Nhà cung cấp"]) await expect(page.getByRole("link", { name: cu, exact: true })).toHaveCount(0);
  const kho = page.getByRole("link", { name: "Kho hàng" });
  await kho.click();
  await expect(page).toHaveURL(new RegExp(`/r/${SLUG}/admin/inventory/stock$`), { timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "Kho hàng", level: 1 })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Kho hàng" }).getByRole("link");
  await expect(tabs).toHaveText(["Tồn kho", "Nhập hàng", "Kiểm kê & hủy", "Nguyên liệu", "Định lượng món", "Nhà cung cấp"]);
  await expect(tabs.filter({ hasText: "Tồn kho" })).toHaveAttribute("aria-current", "page");
  await expect(kho).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: "docs/30-KeHoach/P28/anh/1-kho-hang-ton-kho-1366.png" });

  await tabs.filter({ hasText: "Nhập hàng" }).click();
  await expect(page).toHaveURL(new RegExp(`/r/${SLUG}/admin/nhap-hang$`), { timeout: 90_000 });
  await page.getByRole("link", { name: "+ Nhập hàng" }).click();
  await expect(page).toHaveURL(/\/nhap-hang\/moi$/, { timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "Lập phiếu nhập" })).toBeVisible();
  await expect(tabs.filter({ hasText: "Nhập hàng" })).toHaveAttribute("aria-current", "page");
  await expect(kho).toHaveAttribute("aria-current", "page");

  await tabs.filter({ hasText: "Nhà cung cấp" }).click();
  await expect(page).toHaveURL(new RegExp(`/r/${SLUG}/admin/nha-cung-cap$`), { timeout: 90_000 });
  await expect(kho).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: "docs/30-KeHoach/P28/anh/2-kho-hang-nha-cung-cap-1366.png" });

  await page.goto(`/r/${SLUG}/admin/inventory/phieu-nhap`);
  await expect(page).toHaveURL(new RegExp(`/r/${SLUG}/admin/nhap-hang$`), { timeout: 90_000 });

  // Điện thoại 390: hàng tab cuộn ngang trong chính nó, trang không tràn.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/r/${SLUG}/admin/inventory/stock`, { waitUntil: "networkidle" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "docs/30-KeHoach/P28/anh/3-kho-hang-390.png" });
});

test("G4: + Nhà cung cấp mở hộp thoại; lưu được thì đóng; SĐT trùng thì báo lỗi, hộp thoại vẫn mở", async ({ page }) => {
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  const phone = `09${Date.now().toString().slice(-8)}`;
  try {
    await dangNhap(page);
    await page.goto(`/r/${SLUG}/admin/nha-cung-cap`, { waitUntil: "networkidle" });
    const hop = page.getByRole("dialog", { name: "Thêm nhà cung cấp" });
    await expect(hop).toBeHidden();
    await page.getByRole("button", { name: "+ Nhà cung cấp" }).click();
    await expect(hop).toBeVisible();
    await hop.getByRole("textbox", { name: /Tên nhà cung cấp/ }).fill(`${TAG} Mối cá`);
    await hop.getByRole("textbox", { name: "Số điện thoại" }).fill(phone);
    await hop.getByRole("button", { name: "Lưu" }).click();
    await expect(page.getByText(/Đã thêm nhà cung cấp NCC\d{6}/)).toBeVisible({ timeout: 60_000 });
    await expect(hop).toBeHidden();
    await expect(page.locator("[data-danh-sach-ncc]").getByText(`${TAG} Mối cá`)).toBeVisible();

    await page.getByRole("button", { name: "+ Nhà cung cấp" }).click();
    await hop.getByRole("textbox", { name: /Tên nhà cung cấp/ }).fill(`${TAG} Trùng số`);
    await hop.getByRole("textbox", { name: "Số điện thoại" }).fill(phone);
    await hop.getByRole("button", { name: "Lưu" }).click();
    await expect(page.getByText("Số điện thoại này đã có ở một nhà cung cấp khác.")).toBeVisible({ timeout: 60_000 });
    await expect(hop).toBeVisible();
    await hop.getByRole("button", { name: "Bỏ qua" }).click();
    await expect(hop).toBeHidden();
  } finally {
    await db.from("suppliers").delete().eq("tenant_id", t!.id).like("name", `${TAG}%`);
  }
});
