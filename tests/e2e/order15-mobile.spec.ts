import { test, expect, type Page } from "@playwright/test";
import { getServiceMode, setServiceMode, type ServiceMode } from "./tenant-mode";

/**
 * E2E ORDER-15 + ORDER-16 — nhân viên cầm ĐIỆN THOẠI gõ đơn tại bàn (/pos/m) → đơn vào thẳng
 * `confirmed` (KHÔNG qua hàng chờ duyệt) → POS quầy hiện banner "Đơn cần in phiếu" để thu ngân in.
 *
 * Chạy trên server đang chạy (E2E_BASE_URL). Dùng tenant demo `pho-viet` như p3.spec.ts.
 */
const SLUG = "pho-viet";
const OWNER_EMAIL = "ownerA@pho-viet.test";
const OWNER_PASS = "DemoPass123!";
const PHONE = { width: 360, height: 780 }; // khổ nhỏ nhất cam kết (ORDER-01/15)
const SHOTS = "test-results/shots"; // trong repo, đã gitignore

async function loginStaff(page: Page) {
  await page.goto(`/r/${SLUG}/pos/m`);
  if (page.url().includes("/login")) {
    await page.locator('input[name="email"]').fill(OWNER_EMAIL);
    await page.locator('input[name="secret"]').fill(OWNER_PASS);
    await page.getByRole("button", { name: /Đăng nhập/ }).click();
    await page.waitForFunction(() => !location.pathname.includes("/login"), null, {
      timeout: 60000,
    });
  }
  await page.goto(`/r/${SLUG}/pos/m`);
}

/**
 * Hai bộ test này thao tác trên SƠ ĐỒ BÀN ở POS — sơ đồ chỉ render khi quán ở chế độ bàn.
 * Tự dựng điều kiện rồi trả lại nguyên trạng, thay vì phụ thuộc cài đặt sẵn có của tenant dùng chung.
 */
let modeCu: ServiceMode = "table";

test.beforeAll(async () => {
  modeCu = await getServiceMode(SLUG);
  await setServiceMode(SLUG, "table");
});

test.afterAll(async () => {
  await setServiceMode(SLUG, modeCu);
});

test("ORDER-15: gõ đơn từ điện thoại ở 360px → ORDER-16: POS quầy nhắc in phiếu", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: PHONE });
  const phone = await ctx.newPage();

  await loginStaff(phone);

  // Bước 1 — danh sách bàn.
  await expect(phone.getByText("Gọi món tại bàn")).toBeVisible({ timeout: 30000 });
  const tableTile = phone.locator("main section li button").first();
  await tableTile.waitFor({ timeout: 20000 });
  const tableName = (await tableTile.locator("span").first().innerText()).trim();
  await phone.screenshot({ path: `${SHOTS}/order15-1-chon-ban.png` });
  await tableTile.click();

  // Bước 2 — thực đơn của đúng bàn đó.
  await expect(phone.getByText(`Bàn ${tableName}`).first()).toBeVisible();

  // Không vỡ ở 360px: trang không được cuộn NGANG.
  const overflowX = await phone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflowX).toBeLessThanOrEqual(1);

  // Thêm một món còn bán (món có tùy chọn → sheet mở, bấm xác nhận).
  const item = phone.locator('button[aria-label^="Thêm "]:not([disabled])').first();
  await item.waitFor({ timeout: 20000 });
  await item.click();
  // Món có tùy chọn → sheet mở, nút xác nhận kèm giá ("Thêm vào giỏ 50.000₫"). Sheet mount sau
  // animation nên PHẢI waitFor (isVisible() không retry — cùng bẫy đã ghi trong p3.spec.ts).
  const addBtn = phone.getByRole("button", { name: /^Thêm vào giỏ/ });
  try {
    await addBtn.waitFor({ state: "visible", timeout: 5000 });
    await addBtn.click();
  } catch {
    /* món không có tùy chọn → đã vào thẳng giỏ */
  }

  // Thanh giỏ dính đáy → mở giỏ → gửi.
  const cartBar = phone.getByRole("button", { name: /Xem giỏ/ });
  await expect(cartBar).toBeVisible({ timeout: 10000 });
  await phone.screenshot({ path: `${SHOTS}/order15-2-thuc-don.png` });
  await cartBar.click();

  // Giỏ của nhân viên KHÔNG hỏi tên/SĐT khách (khác giỏ khách QR — ORDER-10).
  await expect(phone.locator("#cust-name")).toHaveCount(0);
  await expect(phone.getByText("Chưa có tên")).toHaveCount(0);

  const submit = phone.getByRole("button", { name: /^Gửi về quầy$/ });
  await expect(submit).toBeEnabled();
  await phone.screenshot({ path: `${SHOTS}/order15-3-gio.png` });
  await submit.click();

  // Xác nhận tại chỗ — nhân viên biết chắc đơn đã đi trước khi rời bàn.
  await expect(phone.getByText(/Đã gửi về quầy · Bàn/)).toBeVisible({ timeout: 20000 });
  await phone.screenshot({ path: `${SHOTS}/order15-4-da-gui.png` });

  // ORDER-16 — POS quầy (tablet ngang) phải tự nhắc in phiếu cho đơn vừa gõ.
  const counter = await ctx.newPage();
  await counter.setViewportSize({ width: 1366, height: 768 });
  await counter.goto(`/r/${SLUG}/pos`);
  await expect(counter.getByText(/Đơn cần in phiếu \(\d+\)/)).toBeVisible({ timeout: 30000 });
  await expect(
    counter.locator("button", { hasText: new RegExp(`^Bàn ${tableName}`) }).first()
  ).toBeVisible();
  await counter.screenshot({ path: `${SHOTS}/order16-banner-can-in.png` });

  await ctx.close();
});
