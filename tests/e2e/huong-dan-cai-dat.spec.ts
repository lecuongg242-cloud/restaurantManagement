import { test, expect } from "@playwright/test";

/**
 * MKT-04 — trang công khai "Cần chuẩn bị gì": không cần đăng nhập, đủ 3 thứ bắt buộc ở đầu trang, 7 thiết bị đánh số,
 * máy in ghi đúng mã + điều kiện tương đương, chi phí dự kiến từng thiết bị, không tràn ngang ở 360px, trang chủ có lối vào.
 */
const TRANG = "/huong-dan-cai-dat";

test("trang chủ có lối vào; mở không cần đăng nhập, đủ nội dung chốt", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Xem quán cần chuẩn bị gì →" }).click();
  await expect(page).toHaveURL(new RegExp(`${TRANG}$`));

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quán cần chuẩn bị gì?");
  const batBuoc = page.locator("[data-bat-buoc] li");
  await expect(batBuoc).toHaveCount(3);
  await expect(batBuoc.nth(0)).toContainText("máy tính xách tay (laptop) hoặc máy tính để bàn");
  await expect(batBuoc.nth(1)).toContainText("Sapo SPR02");

  await expect(page.locator("[data-thiet-bi]")).toHaveCount(7);
  const mayIn = page.locator('[data-thiet-bi="2"]');
  await expect(mayIn).toContainText("Máy in hóa đơn Sapo SPR02");
  await expect(mayIn).toContainText("khổ 80mm");
  await expect(mayIn).toContainText("cổng mạng LAN");
  await expect(page.locator('[data-thiet-bi="1"]')).toContainText("Tối thiểu");
  await expect(page.locator("[data-so-do-noi]")).toHaveCount(0);
  // Mỗi thiết bị có chi phí dự kiến + bảng tổng.
  await expect(page.locator("[data-chi-phi]")).toHaveCount(7);
  await expect(mayIn.locator("[data-chi-phi]")).toContainText("1.190.000đ");
  await expect(page.locator("[data-tong-chi-phi]")).toContainText("1,5 – 1,8 triệu");

  // Ảnh thật: mọi ảnh thiết bị tải được (không ảnh vỡ).
  const anh = page.locator('main img[src*="thiet-bi"]');
  expect(await anh.count()).toBe(9);
  for (const img of await anh.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
  }

  // Bên mình hỗ trợ gì: cài đặt, nhập thực đơn, thiết lập, hướng dẫn, 24/7, tận nơi báo phí.
  const hoTro = page.locator("[data-ho-tro]");
  for (const y of ["Cài máy in và POSMenu", "Nhập thực đơn", "Thiết lập quán", "Hướng dẫn chủ quán và nhân viên", "24/7", "báo phí trước"]) {
    await expect(hoTro).toContainText(y);
  }
  await expect(hoTro).toContainText("miễn phí");

  // Chủ dự án chốt 29/09/2026: không mục "không cần mua", không mục mất mạng.
  const chu = await page.locator("main").innerText();
  expect(chu).not.toMatch(/không cần mua|mất mạng/i);

  await expect(page.locator("form#lien-he")).toBeVisible();
  await page.screenshot({ path: "docs/30-KeHoach/MKT-04/anh/1-may-tinh.png", fullPage: true });
});

test("điện thoại 360px: không tràn ngang", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(TRANG);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const tran = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(tran).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "docs/30-KeHoach/MKT-04/anh/2-dien-thoai-360.png", fullPage: true });
});
