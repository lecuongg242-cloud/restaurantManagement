import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { getServiceMode, setServiceMode, type ServiceMode } from "./tenant-mode";

config({ path: ".env.local" });
config();

/**
 * P16 phần còn mở, trên quán demo pho-viet (dữ liệu `npm run seed:demo`: 45 ngày, 9 bàn / 3 khu, đơn có người nhận,
 * người thu, món hủy có người hủy, giảm giá có người duyệt):
 *  - 16-03: bảng "Hiệu quả bàn" trên quán có bàn thật (bật chế độ bàn tạm thời).
 *  - 16-02: bấm tên nhân viên → danh sách hóa đơn đã thu / đơn đã nhận / món đã hủy; tổng khớp dòng tổng.
 *  - 16-04: tải file Excel đang xem (lưu ra test-results để mở bằng Excel thật).
 *  - 16-01: xóa bàn đang có khách → báo lỗi, bàn còn nguyên.
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };
const REPORTS = `/r/${SLUG}/admin/reports`;
const TAG = crypto.randomUUID().slice(0, 6);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let modeCu: ServiceMode = "counter";
let tenantId = "";
const banTam: string[] = [];

async function dangNhap(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.pass);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45_000 }), page.click('button[type="submit"]')]);
}
const soTien = (s: string) => Number(s.replace(/[^\d]/g, ""));

test.beforeAll(async () => {
  tenantId = (await admin.from("tenants").select("id").eq("slug", SLUG).single()).data!.id;
  modeCu = await getServiceMode(SLUG);
  await setServiceMode(SLUG, "table");
});

test.afterAll(async () => {
  await setServiceMode(SLUG, modeCu);
  if (banTam.length) {
    await admin.from("table_sessions").update({ status: "closed", closed_at: new Date().toISOString() }).in("table_id", banTam);
    await admin.from("tables").delete().in("id", banTam);
  }
});

test("16-03: quán có bàn → bảng Hiệu quả bàn có từng bàn, lượt, phút ngồi, doanh thu", async ({ page }) => {
  await dangNhap(page);
  await page.goto(`${REPORTS}?preset=30d`, { waitUntil: "networkidle" });
  const khoi = page.locator("section, div").filter({ has: page.getByRole("heading", { name: "Hiệu quả bàn" }) }).last();
  await expect(khoi).toBeVisible();
  await expect(khoi.locator("tbody tr").first()).toBeVisible();
  expect(await khoi.locator("tbody tr").count()).toBeGreaterThanOrEqual(5);
  await khoi.scrollIntoViewIfNeeded();
  await khoi.screenshot({ path: "docs/30-KeHoach/P16/anh/4-hieu-qua-ban.png" });
});

test("16-02: bấm tên thu ngân → hóa đơn đã thu; tổng các trang = cột Tổng thu; có góc Món đã hủy", async ({ page }) => {
  test.setTimeout(300_000); // đi hết ~8 trang trên dev server
  await dangNhap(page);
  await page.goto(`${REPORTS}?preset=30d`, { waitUntil: "networkidle" });
  const khoi = page.locator("[data-khoi-nhan-vien]");
  await khoi.getByRole("tab", { name: /Theo thu ngân/ }).click();
  const dong = khoi.locator("tbody tr").filter({ has: page.locator("[data-nv-chi-tiet]") }).first();
  const ten = (await dong.locator("[data-nv-chi-tiet]").innerText()).trim();
  const tongThu = soTien(await dong.locator("td").nth(4).innerText());
  const soHd = Number(await dong.locator("td").nth(1).innerText());
  await dong.locator("[data-nv-chi-tiet]").click();

  await expect(page).toHaveURL(/reports\/nhan-vien\?.*xem=thu/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(ten);
  await expect(page.getByRole("tab", { name: "Hóa đơn đã thu", selected: true })).toBeVisible();
  await page.screenshot({ path: "docs/30-KeHoach/P16/anh/5-chi-tiet-thu-ngan.png", fullPage: true });

  // Đi hết các trang, cộng cột Số tiền.
  let cong = 0;
  let dem = 0;
  for (;;) {
    const cot = await page.locator("[data-chi-tiet-nhan-vien] tbody tr td:last-child").allInnerTexts();
    cong += cot.reduce((s, x) => s + soTien(x), 0);
    dem += cot.length;
    const sau = page.getByRole("link", { name: "Sau →" });
    if (!(await sau.isVisible().catch(() => false))) break;
    const truoc = page.url();
    await sau.click();
    await page.waitForURL((u) => u.href !== truoc, { timeout: 60_000 });
    await page.waitForLoadState("networkidle");
  }
  expect(cong).toBe(tongThu);
  expect(dem).toBe(soHd);

  await page.getByRole("tab", { name: "Món đã hủy" }).click();
  await expect(page).toHaveURL(/xem=huy/);
  await expect(page.getByText("Không có dòng nào trong kỳ này.").or(page.locator("[data-chi-tiet-nhan-vien]"))).toBeVisible();
  await page.getByRole("link", { name: "← Báo cáo" }).click();
  await expect(page).toHaveURL(/reports\?preset=30d/);
});

test("16-04: Xuất Excel tải về một .xlsx", async ({ page }) => {
  await dangNhap(page);
  await page.goto(`${REPORTS}?preset=30d`, { waitUntil: "networkidle" });
  const [tai] = await Promise.all([page.waitForEvent("download"), page.click("[data-xuat-excel]")]);
  expect(tai.suggestedFilename()).toMatch(/\.xlsx$/);
  await tai.saveAs("docs/30-KeHoach/P16/anh/bao-cao-30-ngay.xlsx"); // để mở tay bằng Excel / Google Sheets
});

test("16-01: xóa bàn đang có khách → báo lỗi, bàn còn nguyên", async ({ page }) => {
  const ten = `Tạm ${TAG}`;
  const { data: ban } = await admin.from("tables").insert({ tenant_id: tenantId, name: ten }).select("id").single();
  banTam.push(ban!.id);
  await admin.from("table_sessions").insert({ tenant_id: tenantId, table_id: ban!.id, status: "open" });

  await dangNhap(page);
  await page.goto(`/r/${SLUG}/admin/tables`, { waitUntil: "networkidle" });
  page.once("dialog", (d) => d.accept());
  const the = page.locator("div.rounded-md").filter({ has: page.getByText(ten, { exact: true }) }).last();
  await the.getByRole("button", { name: "Xóa" }).click();
  await expect(page.getByText(/đang có khách — thanh toán hoặc chuyển bàn trước khi xóa/)).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: "docs/30-KeHoach/P16/anh/6-chan-xoa-ban.png" });
  expect((await admin.from("tables").select("id").eq("id", ban!.id)).data).toHaveLength(1);
});
