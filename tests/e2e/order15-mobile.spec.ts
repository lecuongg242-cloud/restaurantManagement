import { test, expect } from "@playwright/test";
import { getServiceMode, setServiceMode, getPrintMode, setPrintMode, type ServiceMode, type PrintMode } from "./tenant-mode";
import { donBan } from "./don-ban";
import { createClient } from "@supabase/supabase-js";

/**
 * E2E ORDER-15 + ORDER-16 — nhân viên cầm ĐIỆN THOẠI gõ đơn tại bàn → đơn vào thẳng `confirmed` (KHÔNG qua
 * hàng chờ duyệt) → POS quầy hiện banner "Đơn cần in phiếu" để thu ngân in.
 *
 * Từ 12-05 (ORDER-20) điện thoại dùng CHÍNH `/pos` (thanh tab Bàn · Thực đơn · Đơn); `/pos/m` chỉ còn chuyển
 * hướng để lối tắt cũ trên điện thoại phục vụ vẫn mở đúng chỗ. Dùng tenant demo `pho-viet`.
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };
const PHONE = { width: 360, height: 780 }; // khổ nhỏ nhất cam kết (ORDER-01/15)
const SHOTS = "test-results/shots";
const BAN = "T1";

let modeCu: ServiceMode = "table";
let printCu: PrintMode = "browser";
let tenantId = "";

test.beforeAll(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  tenantId = (await admin.from("tenants").select("id").eq("slug", SLUG).single()).data!.id as string;
  modeCu = await getServiceMode(SLUG);
  printCu = await getPrintMode(SLUG);
  await setServiceMode(SLUG, "table");
  await setPrintMode(SLUG, "browser");
  await donBan(tenantId, [BAN]);
});

test.afterAll(async () => {
  await donBan(tenantId, [BAN]);
  await setServiceMode(SLUG, modeCu);
  await setPrintMode(SLUG, printCu);
});

test("ORDER-15: gõ đơn từ điện thoại ở 360px → ORDER-16: POS quầy nhắc in phiếu", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: PHONE, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();

  await phone.goto(`/r/${SLUG}/admin/login`);
  await phone.fill('input[name="email"]', OWNER.email);
  await phone.fill('input[name="password"]', OWNER.pass);
  await Promise.all([phone.waitForLoadState("networkidle"), phone.click('button[type="submit"]')]);

  // Lối tắt CŨ `/pos/m` trên điện thoại phục vụ → mở đúng POS mới.
  await phone.goto(`/r/${SLUG}/pos/m`, { waitUntil: "networkidle" });
  await expect(phone).toHaveURL(new RegExp(`/r/${SLUG}/pos$`));
  const nav = phone.getByRole("navigation", { name: "Chuyển màn POS" });
  await expect(nav).toBeVisible({ timeout: 30000 });

  // Bước 1 — chọn bàn ở tab Bàn → tự sang Thực đơn.
  await nav.getByRole("button", { name: /^Bàn/ }).click();
  await phone.getByRole("button", { name: new RegExp(`^${BAN}\\b`) }).click();
  await expect(phone.getByLabel("Tìm món")).toBeVisible();
  await phone.screenshot({ path: `${SHOTS}/order15-1-thuc-don.png` });

  // Bước 2 — thêm một món (món có tùy chọn → hộp chọn, chờ nó hiện).
  await phone.locator('button[aria-label^="Thêm "]:not([disabled])').first().click();
  const themVaoGio = phone.getByRole("button", { name: /^Thêm vào giỏ/ });
  const thanhGio = phone.getByRole("button", { name: /^Giỏ hàng: [1-9]/ });
  await expect(themVaoGio.or(thanhGio).first()).toBeVisible({ timeout: 10000 });
  if (await themVaoGio.isVisible()) await themVaoGio.click();

  // Bước 3 — đếm đơn ở tab Đơn, rồi gửi từ ngăn Giỏ hàng (thanh giỏ ở đáy tab Thực đơn). Nhân viên gõ hộ
  // nên KHÔNG hỏi tên/SĐT khách (khác giỏ khách QR — ORDER-10).
  await nav.getByRole("button", { name: /^Đơn/ }).click();
  const truoc = await phone.getByText(/Đơn #\d+/).count();
  await nav.getByRole("button", { name: /^Thực đơn/ }).click();
  await thanhGio.click();
  const gio = phone.getByRole("dialog", { name: /^Giỏ hàng/ });
  await expect(gio.getByText(/Tên khách/)).toHaveCount(0);
  await gio.getByRole("button", { name: /^Xác nhận thêm \d+ món/ }).click();
  await expect(gio).toBeHidden({ timeout: 20000 });
  await nav.getByRole("button", { name: /^Đơn/ }).click();
  await expect(phone.getByText(/Đơn #\d+/)).toHaveCount(truoc + 1, { timeout: 20000 });
  await phone.screenshot({ path: `${SHOTS}/order15-2-da-gui.png` });

  // ORDER-16 — POS quầy (tablet ngang) phải tự nhắc in phiếu cho đơn vừa gõ.
  const counter = await ctx.newPage();
  await counter.setViewportSize({ width: 1366, height: 768 });
  await counter.goto(`/r/${SLUG}/pos`);
  await expect(counter.getByText(/Đơn cần in phiếu \(\d+\)/)).toBeVisible({ timeout: 30000 });
  await expect(counter.locator("button", { hasText: new RegExp(`^Bàn ${BAN}`) }).first()).toBeVisible();
  await counter.screenshot({ path: `${SHOTS}/order16-banner-can-in.png` });

  await ctx.close();
});
