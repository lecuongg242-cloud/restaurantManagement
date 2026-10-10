import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { taoXlsx } from "../../lib/reports/xlsx";

config({ path: ".env.local" });
config();

/**
 * P36 — Bàn & QR làm lại (TABLE-07…10): Thêm hàng loạt, Nhập Excel, thao tác nhiều bàn, bố cục khu trái / bảng phải,
 * điện thoại 360px. Chạy trên quán demo `pho-viet` trong khu tạm "E2E P36 …" (tạo và xóa trong spec, không đụng bàn cũ).
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };
const ANH = "docs/30-KeHoach/P36/anh";
const TAG = `E2E P36 ${Date.now().toString(36)}`;
const KHU = TAG;
const KHU_VIP = `${TAG} VIP`;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let tenantId = "";

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeAll(async () => {
  const { data } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  tenantId = data!.id as string;
});

test.afterAll(async () => {
  const { data: areas } = await db.from("areas").select("id").eq("tenant_id", tenantId).like("name", `${TAG}%`);
  const ids = (areas ?? []).map((a) => a.id as string);
  if (ids.length) {
    await db.from("tables").delete().in("area_id", ids);
    await db.from("areas").delete().in("id", ids);
  }
});

async function vao(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.pass);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
  await page.goto(`/r/${SLUG}/admin/tables`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Bàn & QR" })).toBeVisible({ timeout: 30_000 });
}

async function areaId(name: string) {
  const { data } = await db.from("areas").select("id").eq("tenant_id", tenantId).eq("name", name).single();
  return data!.id as string;
}

async function banTrongKhu(name: string) {
  const { data } = await db
    .from("tables")
    .select("id, name, seats, qr_token, sort_order, area_id")
    .eq("area_id", await areaId(name))
    .order("sort_order");
  return data ?? [];
}

const cotKhu = (page: Page) => page.locator("aside:has([data-khu-vuc])");
const khuTrai = (page: Page) => cotKhu(page).locator("[data-khu-vuc]");

test("TABLE-07/08/09/10: thêm hàng loạt, nhập Excel, chọn nhiều bàn", async ({ page }) => {
  await vao(page);

  // TABLE-10: khu vực cột trái, có "Tất cả"; không còn chuỗi "QR: xxxx…".
  await expect(khuTrai(page).getByRole("button", { name: /^Tất cả/ })).toBeVisible();
  await expect(page.getByText(/^QR: /)).toHaveCount(0);

  // Thêm khu bằng nút + ở cột trái.
  await cotKhu(page).getByRole("button", { name: "Thêm khu vực" }).click();
  await cotKhu(page).getByPlaceholder(/Tên khu/).fill(KHU);
  await cotKhu(page).getByRole("button", { name: "Lưu" }).click();
  await expect(khuTrai(page).getByRole("button", { name: new RegExp(`^${KHU}\\s*0$`) })).toBeVisible();
  await khuTrai(page).getByRole("button", { name: new RegExp(`^${KHU}\\s*0$`) }).click();
  await expect(page.getByText("Khu này chưa có bàn.")).toBeVisible();

  // TABLE-07: Thêm hàng loạt 20 bàn, 6 ghế.
  await page.getByRole("button", { name: "Thêm hàng loạt" }).first().click();
  const dlg = page.getByRole("dialog", { name: "Thêm hàng loạt" });
  await expect(dlg.locator('select[name="area_id"]')).toHaveValue(await areaId(KHU));
  await dlg.getByLabel("Số lượng").fill("20");
  await dlg.getByLabel("Số ghế").fill("6");
  await expect(dlg.getByText("Bàn 1, Bàn 2, Bàn 3, …, Bàn 20")).toBeVisible();
  await page.screenshot({ path: `${ANH}/p36-them-hang-loat.png` });
  await dlg.getByRole("button", { name: "Tạo 20 bàn" }).click();
  await expect(page.getByText("Đã thêm 20 bàn.")).toBeVisible();
  let rows = await banTrongKhu(KHU);
  expect(rows.map((r) => r.name)).toEqual(Array.from({ length: 20 }, (_, i) => `Bàn ${i + 1}`));
  expect(rows.every((r) => r.seats === 6)).toBe(true);
  expect(new Set(rows.map((r) => r.qr_token)).size).toBe(20);

  // Trùng tên → bỏ qua và báo tên.
  await page.getByRole("button", { name: "Thêm hàng loạt" }).first().click();
  await dlg.getByLabel("Số bắt đầu").fill("19");
  await dlg.getByLabel("Số lượng").fill("3");
  await dlg.getByRole("button", { name: "Tạo 3 bàn" }).click();
  await expect(page.getByText("Đã thêm 1 bàn. Bỏ qua 2 bàn trùng tên: Bàn 19, Bàn 20.")).toBeVisible();
  expect((await banTrongKhu(KHU)).length).toBe(21);

  // TABLE-08: Nhập Excel — 1 bàn mới, 1 dòng thiếu tên, 1 dòng trùng, 1 bàn vào khu chưa có (tự tạo).
  const file = taoXlsx([
    {
      ten: "Bàn",
      cot: [{ nhan: "Tên bàn" }, { nhan: "Khu vực" }, { nhan: "Số ghế" }],
      dong: [
        ["Bàn 22", KHU, 4],
        [null, KHU, 4],
        ["Bàn 1", KHU, 4],
        ["VIP 1", KHU_VIP, 10],
      ],
    },
  ]);
  await page.getByRole("button", { name: "Nhập Excel" }).first().click();
  const imp = page.getByRole("dialog", { name: "Nhập bàn từ Excel" });
  await expect(imp.getByRole("link", { name: "Tải file mẫu" })).toHaveAttribute("href", `/r/${SLUG}/admin/tables/mau-nhap`);
  await imp.locator('input[type="file"]').setInputFiles({
    name: "ban.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: file,
  });
  await imp.getByRole("button", { name: "Nhập" }).click();
  await expect(
    page.getByText(`Đã nhập 2 bàn, tạo khu mới: ${KHU_VIP}. Bỏ qua 2 dòng: dòng 3 thiếu tên bàn, dòng 4 trùng tên Bàn 1.`)
  ).toBeVisible();
  expect((await banTrongKhu(KHU)).map((r) => r.name).at(-1)).toBe("Bàn 22");
  const vip = await banTrongKhu(KHU_VIP);
  expect(vip.map((r) => [r.name, r.seats])).toEqual([["VIP 1", 10]]);

  // File mẫu tải được, đúng .xlsx.
  const mau = await page.request.get(`/r/${SLUG}/admin/tables/mau-nhap`);
  expect(mau.status()).toBe(200);
  expect(mau.headers()["content-type"]).toContain("spreadsheetml");

  // File không phải xlsx → báo lỗi.
  await page.getByRole("button", { name: "Nhập Excel" }).first().click();
  await imp.locator('input[type="file"]').setInputFiles({ name: "ban.xlsx", mimeType: "text/plain", buffer: Buffer.from("abc") });
  await imp.getByRole("button", { name: "Nhập" }).click();
  await expect(page.getByText("File không đọc được. Hãy dùng file mẫu.")).toBeVisible();

  // TABLE-09: chọn tất cả bàn trong khu → đổi số ghế.
  await khuTrai(page).getByRole("button", { name: new RegExp(`^${KHU}\\s*22$`) }).click();
  const bang = page.locator("[data-bang-ban]");
  await expect(bang.locator("tbody tr")).toHaveCount(22);
  await bang.getByLabel("Chọn tất cả bàn đang hiện").check();
  const bar = page.getByRole("region", { name: "Thao tác bàn đã chọn" });
  await expect(bar.getByText("Đã chọn 22 bàn")).toBeVisible();
  await page.screenshot({ path: `${ANH}/p36-chon-nhieu.png` });
  await bar.getByLabel("Số ghế mới").fill("8");
  await bar.getByRole("button", { name: "Đổi số ghế" }).click();
  await expect(page.getByText("Đã đổi 22 bàn sang 8 ghế.")).toBeVisible();
  expect((await banTrongKhu(KHU)).every((r) => r.seats === 8)).toBe(true);
  await expect(bar).toHaveCount(0);

  // Chọn 2 bàn → In QR (chỉ 2 bàn) → Chuyển khu sang VIP.
  await bang.getByLabel("Chọn Bàn 21").check();
  await bang.getByLabel("Chọn Bàn 22").check();
  const ids = (await banTrongKhu(KHU)).filter((r) => r.name === "Bàn 21" || r.name === "Bàn 22").map((r) => r.id);
  const href = await bar.getByRole("link", { name: "In QR" }).getAttribute("href");
  expect(href).toContain("?ids=");
  expect(ids.every((id) => href!.includes(id))).toBe(true);
  const inQr = await page.request.get(href!);
  const html = await inQr.text();
  expect((html.match(/>Quét để gọi món</g) ?? []).length).toBe(2);

  await bar.locator('select[name="area_id"]').selectOption(await areaId(KHU_VIP));
  await bar.getByRole("button", { name: "Chuyển khu" }).click();
  await expect(page.getByText("Đã chuyển 2 bàn.")).toBeVisible();
  expect((await banTrongKhu(KHU_VIP)).map((r) => r.name)).toEqual(["VIP 1", "Bàn 21", "Bàn 22"]);

  // Xóa nhiều bàn (hỏi lại).
  await bang.getByLabel("Chọn Bàn 19").check();
  await bang.getByLabel("Chọn Bàn 20").check();
  page.once("dialog", (d) => d.accept());
  await bar.getByRole("button", { name: "Xóa" }).click();
  await expect(page.getByText("Đã xóa 2 bàn.")).toBeVisible();
  expect((await banTrongKhu(KHU)).map((r) => r.name)).toEqual(Array.from({ length: 18 }, (_, i) => `Bàn ${i + 1}`));

  // "+ Thêm bàn" → "Lưu & thêm tiếp" tăng số cuối.
  await page.getByRole("button", { name: "Thêm bàn" }).first().click();
  const add = page.getByRole("dialog", { name: "Thêm bàn" });
  await add.getByLabel("Tên bàn").fill("Bàn 30");
  await add.getByRole("button", { name: "Lưu & thêm tiếp" }).click();
  await expect(add.getByLabel("Tên bàn")).toHaveValue("Bàn 31");
  await add.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(add).toHaveCount(0);
  expect((await banTrongKhu(KHU)).map((r) => r.name).slice(-2)).toEqual(["Bàn 30", "Bàn 31"]);

  // Tìm bàn.
  await page.getByLabel("Tìm bàn").fill("bàn 3");
  await expect(bang.locator("tbody tr")).toHaveCount(3); // Bàn 3, Bàn 30, Bàn 31
  await page.getByLabel("Tìm bàn").fill("");
  await page.screenshot({ path: `${ANH}/p36-ban-qr-1440.png` });
});

test("TABLE-10: điện thoại 360px — khu thành chip, không tràn ngang", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await vao(page);
  await expect(cotKhu(page)).toBeHidden();
  await page.getByRole("button", { name: new RegExp(`^${KHU} · `) }).first().click();
  await expect(page.getByRole("button", { name: /^Thao tác bàn / }).first()).toBeVisible();
  const tran = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(tran).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: /^Thao tác bàn / }).first().click();
  await expect(page.getByRole("menuitem", { name: "Xem / In QR" })).toBeVisible();
  await page.screenshot({ path: `${ANH}/p36-ban-qr-360.png` });
});
