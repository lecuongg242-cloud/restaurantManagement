import { test, expect, type Page } from "@playwright/test";

/**
 * E2E P3 — chuỗi giá trị cốt lõi: khách gọi món QR → POS duyệt → KDS làm món → phục vụ →
 * in phiếu bếp. Kiểm cả REALTIME không-reload (KDS nhận vé, khách đổi trạng thái).
 * Chạy trên dev server (E2E_BASE_URL, mặc định :3005). Dữ liệu order reset trước khi chạy.
 */
const SLUG = "pho-viet";
const TOKEN = "b98186ed87d27ff86d"; // Bàn B1
const OWNER_EMAIL = "ownerA@pho-viet.test";
const OWNER_PASS = "DemoPass123!";
const SHOTS = "C:/Users/admin/AppData/Local/Temp/claude/d--outside-restaurantManagement/3e8be3f9-d496-4fcf-b2fb-7f0ffaa78ca4/scratchpad/shots";

async function loginStaff(page: Page, surface: "pos" | "kds") {
  await page.goto(`/r/${SLUG}/${surface}`);
  if (page.url().includes("/login")) {
    await page.locator('input[name="email"]').fill(OWNER_EMAIL);
    await page.locator('input[name="password"]').fill(OWNER_PASS);
    await page.getByRole("button", { name: /Đăng nhập thiết bị/ }).click();
    await page.waitForURL(`**/r/${SLUG}/${surface}`, { timeout: 20000 });
  }
}

test("P3 chuỗi order đầu-cuối + realtime", async ({ browser }) => {
  const ctx = await browser.newContext();
  const cust = await ctx.newPage();
  const pos = await ctx.newPage();
  const kds = await ctx.newPage();
  let orderId = "";

  await test.step("1. Khách gọi món QR → pending_confirm", async () => {
    await cust.goto(`/r/${SLUG}/menu?t=${TOKEN}`);
    await expect(cust.getByText("Bàn B1")).toBeVisible();
    // Chạm món có Size bắt buộc → sheet tùy chọn
    await cust.getByRole("button", { name: "Phở bò tái", exact: true }).click();
    await cust.getByRole("button", { name: /Thêm vào giỏ/ }).click();
    // Giỏ → gửi
    await cust.getByRole("button", { name: /Xem giỏ/ }).click();
    await cust.getByRole("button", { name: "Gửi order" }).click();
    await cust.waitForURL(/\/order\//, { timeout: 20000 });
    orderId = cust.url().split("/order/")[1].split("?")[0];
    await expect(cust.getByRole("heading", { name: "Chờ xác nhận" })).toBeVisible();
    await cust.screenshot({ path: `${SHOTS}/01-khach-cho-xac-nhan.png`, fullPage: true });
  });

  await test.step("2. Đăng nhập POS + KDS (owner)", async () => {
    await loginStaff(pos, "pos");
    await loginStaff(kds, "kds");
    await expect(pos.getByRole("button", { name: /chờ duyệt/i })).toBeVisible();
  });

  await test.step("3. POS duyệt → KDS nhận vé REALTIME (không reload)", async () => {
    await pos.getByRole("button", { name: /chờ duyệt/i }).click();
    await expect(pos.getByText("Bàn B1")).toBeVisible();
    const t0 = Date.now();
    await pos.getByRole("button", { name: "Duyệt", exact: true }).click();
    // KDS: vé xuất hiện KHÔNG reload
    await expect(kds.getByText("Bàn B1")).toBeVisible({ timeout: 20000 });
    console.log(`  [realtime] KDS nhận vé sau ~${Date.now() - t0}ms (không reload)`);
    await kds.screenshot({ path: `${SHOTS}/02-kds-nhan-ve.png`, fullPage: true });
  });

  await test.step("4. Khách thấy 'Đã xác nhận' REALTIME", async () => {
    const t0 = Date.now();
    await expect(cust.getByRole("heading", { name: "Đã xác nhận" })).toBeVisible({ timeout: 20000 });
    console.log(`  [realtime] Khách đổi 'Đã xác nhận' sau ~${Date.now() - t0}ms (không reload)`);
  });

  await test.step("5. KDS Bắt đầu → Xong; khách thấy 'Sẵn sàng'", async () => {
    await kds.getByRole("button", { name: "Bắt đầu" }).first().click();
    await expect(kds.getByRole("button", { name: "Xong", exact: true })).toBeVisible({ timeout: 20000 });
    await kds.getByRole("button", { name: "Xong", exact: true }).first().click();
    await expect(cust.getByRole("heading", { name: "Sẵn sàng" })).toBeVisible({ timeout: 20000 });
    console.log("  [realtime] Khách thấy 'Sẵn sàng' (không reload)");
  });

  await test.step("6. POS phục vụ + đóng phiên", async () => {
    await pos.goto(`/r/${SLUG}/pos`);
    await pos.locator("button", { hasText: "B1" }).first().click();
    await expect(pos.getByText(/Đơn #/)).toBeVisible({ timeout: 20000 });
    await pos.getByRole("button", { name: "Đã phục vụ" }).first().click();
    await pos.getByRole("button", { name: "Đóng phiên" }).click({ timeout: 20000 });
    await pos.screenshot({ path: `${SHOTS}/03-pos-sau-dong-phien.png`, fullPage: true });
  });

  await test.step("7. In phiếu bếp render đúng nội dung", async () => {
    await pos.goto(`/r/${SLUG}/print/kitchen/${orderId}?w=80`);
    await expect(pos.getByText(/PHIẾU BẾP/)).toBeVisible();
    await expect(pos.getByText(/Bàn:/)).toBeVisible();
    await expect(pos.getByText(/Phở bò tái/)).toBeVisible();
    await pos.screenshot({ path: `${SHOTS}/04-phieu-bep-80mm.png`, fullPage: true });
  });

  await ctx.close();
});
