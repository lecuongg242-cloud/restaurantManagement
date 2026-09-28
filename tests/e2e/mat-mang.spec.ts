import { test, expect } from "@playwright/test";

/**
 * P17 17-01 (OFFLINE-01) — máy quầy mất mạng: không trắng màn, vẫn xem được bàn / đơn / thực đơn lúc mất mạng,
 * nút ghi khóa kèm lý do, có mạng lại thì quay về POS. Quán demo `pho-viet`, chỉ đọc — không tạo đơn nào.
 *
 * Mô phỏng bằng `context.setOffline` (DevTools). Nghiệm thu thật là rút dây mạng máy quầy — xem 17-SUMMARY.
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };

test.use({ viewport: { width: 1280, height: 800 }, serviceWorkers: "allow" });

test("mất mạng → tải lại POS → màn xem offline có dữ liệu; có mạng lại → quay về POS", async ({ page, context }) => {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.pass);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
  await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });

  // Service worker đã nạp sẵn trang offline + bản chụp đã ghi vào IndexedDB.
  await expect
    .poll(
      () =>
        page.evaluate(async (url) => {
          const coTrang = !!(await caches.match(url));
          const coBanChup = await new Promise<boolean>((ok) => {
            const r = indexedDB.open("pos-offline", 1);
            r.onsuccess = () => {
              try {
                const g = r.result.transaction("ban-chup").objectStore("ban-chup").get("pho-viet");
                g.onsuccess = () => ok(!!g.result);
                g.onerror = () => ok(false);
              } catch {
                ok(false);
              }
            };
            r.onerror = () => ok(false);
          });
          return coTrang && coBanChup;
        }, `/r/${SLUG}/pos/offline`),
      { timeout: 30_000 }
    )
    .toBe(true);

  // Đang ở POS mà mất mạng: dòng chữ đỏ hiện ngay, không cần tải lại.
  await context.setOffline(true);
  await expect(page.locator("[data-network-banner]")).toContainText("Mất mạng");

  // Tải lại khi mất mạng → không trắng màn: chuyển sang màn xem offline.
  await page.reload().catch(() => {});
  await expect(page).toHaveURL(new RegExp(`/r/${SLUG}/pos/offline$`), { timeout: 20_000 });
  const view = page.locator("[data-offline-view]");
  await expect(view).toContainText("Mất mạng — đang xem dữ liệu lúc");
  await expect(view).toContainText("Dùng điện thoại (4G/5G) để gọi món và thu tiền.");

  // Thực đơn đọc được từ bản chụp.
  await page.getByRole("button", { name: "Thực đơn" }).click();
  await expect(view.locator("li").first()).toBeVisible();

  // Bàn: chọn một bàn → nút ghi bị khóa, có lý do.
  const tabBan = page.getByRole("button", { name: /^Bàn \(/ });
  if (await tabBan.count()) {
    await tabBan.click();
    await view.locator("main button").first().click();
    const nut = page.getByRole("button", { name: "Gọi thêm món / Thu tiền" });
    await expect(nut).toBeDisabled();
    await expect(page.locator("#ly-do-khoa")).toContainText("Mất mạng — máy này không gửi được");
  }

  await page.screenshot({ path: "docs/30-KeHoach/P17/anh/1-man-offline.png" });

  // Có mạng lại → nút quay về POS.
  await context.setOffline(false);
  // Dò mạng mỗi 20 giây — chờ tối đa một lượt dò + dư.
  await expect(page.getByRole("link", { name: "Quay lại POS" })).toBeVisible({ timeout: 30_000 });
});
