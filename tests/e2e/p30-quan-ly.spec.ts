import { test, expect, chromium, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * P30 30-02 — app "TechMenu Quản lý" trên điện thoại (`/quan-ly`), MGR-01..06. Chạy trên dev server đang chạy
 * (E2E_BASE_URL), quán DEMO pho-viet (không đụng qt-food). Ảnh bằng chứng → docs/30-KeHoach/P30/anh/.
 */
const SLUG = "pho-viet";
const CHU = { email: process.env.SEED_OWNER_A_EMAIL ?? "ownerA@pho-viet.test", matKhau: process.env.SEED_OWNER_A_PASSWORD ?? "DemoPass123!" };
const TRAM = { email: "station@pho-viet.test", matKhau: "StationPass123!" };
const GOC = `/r/${SLUG}/quan-ly`;
const ANH = (ten: string) => join("docs/30-KeHoach/P30/anh", ten);
const IPHONE = { width: 390, height: 844 };

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// Đăng nhập MỘT lần, tái dùng cookie (đăng nhập dồn dập đụng giới hạn tần suất của Supabase Auth).
const statePath = join(mkdtempSync(join(tmpdir(), "ql-")), "state.json");

async function dangNhap(page: Page, email: string, matKhau: string) {
  await page.goto("/quan-ly");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', matKhau);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

test.beforeAll(async ({ baseURL }) => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL, storageState: undefined, viewport: IPHONE });
  await dangNhap(page, CHU.email, CHU.matKhau);
  await page.waitForURL((u) => u.pathname === GOC || u.pathname === "/quan-ly/chon-quan", { timeout: 60_000 });
  await page.context().storageState({ path: statePath });
  await browser.close();
});

test.describe("chưa đăng nhập", () => {
  test.use({ viewport: IPHONE });

  test("màn đăng nhập: logo, Email, Mật khẩu (hiện/ẩn), Đăng nhập; manifest riêng", async ({ page }) => {
    await page.goto("/quan-ly");
    await expect(page.getByRole("heading", { name: "TechMenu Quản lý" })).toBeVisible();
    await expect(page.getByText("Dành cho chủ quán và quản lý.")).toBeVisible();
    await page.getByRole("button", { name: "Hiện mật khẩu" }).click();
    await expect(page.locator('input[name="password"]')).toHaveAttribute("type", "text");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/quan-ly/manifest.webmanifest");
    const mf = await (await page.request.get("/quan-ly/manifest.webmanifest")).json();
    expect(mf).toMatchObject({ name: "TechMenu Quản lý", start_url: "/quan-ly", display: "standalone" });
    expect((await page.request.get("/quan-ly/bieu-tuong.png?s=192")).headers()["content-type"]).toBe("image/png");
    await page.screenshot({ path: ANH("02-quan-ly-dang-nhap.png") });
  });

  test("sai mật khẩu → câu lỗi chung", async ({ page }) => {
    await dangNhap(page, CHU.email, "sai-mat-khau");
    await expect(page.locator("p[role=alert]")).toHaveText("Email hoặc mật khẩu không đúng.");
  });

  test("tài khoản không phải chủ / quản lý → không có quyền", async ({ page }) => {
    await dangNhap(page, TRAM.email, TRAM.matKhau);
    await expect(page.locator("p[role=alert]")).toHaveText("Tài khoản này không có quyền quản lý.");
    await expect(page).toHaveURL(/\/quan-ly$/);
  });
});

test.describe("chủ quán", () => {
  test.use({ storageState: statePath, viewport: IPHONE });

  test("Tổng quan: doanh thu, 3 thẻ, Đang phục vụ, 5 tab", async ({ page }) => {
    await page.goto(GOC);
    await expect(page.getByText(/^Doanh thu · hôm nay$/)).toBeVisible();
    for (const t of ["Số hóa đơn", "TB/hóa đơn", "Món hủy", "Đang phục vụ"]) await expect(page.getByText(t, { exact: true })).toBeVisible();
    const tab = page.getByRole("navigation", { name: "Các mục của app Quản lý" });
    for (const t of ["Tổng quan", "Hóa đơn", "Báo cáo", "Thực đơn", "Thêm"]) await expect(tab.getByRole("link", { name: t })).toBeVisible();
    await page.screenshot({ path: ANH("03-quan-ly-tong-quan.png"), fullPage: true });
  });

  test("doanh thu + số hóa đơn KHỚP báo cáo admin cùng kỳ (7 ngày qua)", async ({ page }) => {
    const soSau = async (nhan: RegExp) => (await page.locator("p", { hasText: nhan }).first().locator("xpath=following-sibling::p[1]").innerText()).trim();
    await page.goto(`${GOC}?ky=7-ngay`);
    const dt = await soSau(/^Doanh thu · 7 ngày qua$/);
    const hd = await soSau(/^Số hóa đơn$/);
    await page.goto(`/r/${SLUG}/admin/reports?preset=7d`);
    expect(await soSau(/^Doanh thu$/)).toBe(dt);
    expect(await soSau(/^Số hóa đơn$/)).toBe(hd);
    // Tab Hóa đơn đếm cùng số.
    await page.goto(`${GOC}/hoa-don?ky=7-ngay`);
    await expect(page.getByText(new RegExp(`^${hd} hóa đơn · 7 ngày qua$`))).toBeVisible();
  });

  test("Hóa đơn: danh sách → chi tiết (món, Tổng, Thanh toán) → quay lại", async ({ page }) => {
    await page.goto(`${GOC}/hoa-don?ky=thang-nay`);
    await page.screenshot({ path: ANH("04-quan-ly-hoa-don.png"), fullPage: true });
    const dong = page.locator("main, body").getByRole("link", { name: /#\d+/ }).first();
    test.skip((await dong.count()) === 0, "pho-viet chưa có hóa đơn tháng này");
    await dong.click();
    await expect(page.getByRole("heading", { name: /^Hóa đơn #\d+/ })).toBeVisible();
    for (const t of ["Món", "Thanh toán"]) await expect(page.getByRole("heading", { name: t })).toBeVisible();
    await expect(page.getByText("Tổng", { exact: true })).toBeVisible();
    await page.screenshot({ path: ANH("05-quan-ly-chi-tiet-hoa-don.png"), fullPage: true });
    await page.getByRole("link", { name: "Hóa đơn", exact: true }).first().click();
    await expect(page).toHaveURL(/\/quan-ly\/hoa-don\?ky=thang-nay$/);
  });

  test("Báo cáo: các khối mở/gập + Xem báo cáo đầy đủ", async ({ page }) => {
    await page.goto(`${GOC}/bao-cao?ky=thang-nay`);
    for (const t of ["Kết quả kinh doanh", "Theo nhóm món", "Theo món", "Theo phương thức thanh toán", "Theo nhân viên", "Món bị hủy", "Giảm giá"]) {
      await expect(page.locator("summary", { hasText: t })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Xem báo cáo đầy đủ" })).toHaveAttribute("href", `/r/${SLUG}/admin/reports?preset=month`);
    await page.screenshot({ path: ANH("06-quan-ly-bao-cao.png"), fullPage: true });
  });

  test("Thực đơn: tắt Còn → Hết lưu xuống DB (POS/QR đọc cùng cột); bật lại", async ({ page }) => {
    await page.goto(`${GOC}/thuc-don`);
    const cong = page.getByRole("switch").first();
    const nhan = (await cong.getAttribute("aria-label"))!;
    const ten = nhan.replace(/: (Còn|Hết)$/, "");
    const { data: mon } = await db().from("menu_items").select("id, is_available").eq("name", ten).limit(1).single();
    const banDau = mon!.is_available as boolean;
    await cong.click();
    await expect.poll(async () => (await db().from("menu_items").select("is_available").eq("id", mon!.id).single()).data!.is_available, { timeout: 5_000 }).toBe(!banDau);
    await page.screenshot({ path: ANH("07-quan-ly-thuc-don.png") });
    await page.getByRole("switch", { name: new RegExp(`^${ten.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`) }).click();
    await expect.poll(async () => (await db().from("menu_items").select("is_available").eq("id", mon!.id).single()).data!.is_available).toBe(banDau);
  });

  test("Thực đơn: Sửa món đổi giá → lưu → trả lại giá cũ (mô tả giữ nguyên)", async ({ page }) => {
    await page.goto(`${GOC}/thuc-don`);
    const nut = page.getByRole("button", { name: /^Sửa món / }).first();
    const ten = (await nut.getAttribute("aria-label"))!.replace(/^Sửa món /, "");
    const { data: truoc } = await db().from("menu_items").select("id, base_price, description, source_id").eq("name", ten).limit(1).single();
    test.skip(!!truoc!.source_id, "món nối chuỗi — đổi giá sẽ khóa giá");
    const doiGia = async (gia: number) => {
      await page.getByRole("button", { name: `Sửa món ${ten}` }).click();
      await expect(page.getByRole("heading", { name: "Sửa món" })).toBeVisible();
      const o = page.getByLabel("Giá bán");
      await o.fill(String(gia));
      await page.getByRole("button", { name: "Lưu" }).click();
      await expect.poll(async () => (await db().from("menu_items").select("base_price").eq("id", truoc!.id).single()).data!.base_price).toBe(gia);
    };
    await doiGia(Number(truoc!.base_price) + 1000);
    await page.screenshot({ path: ANH("08-quan-ly-sua-mon.png") });
    await doiGia(Number(truoc!.base_price));
    const sau = (await db().from("menu_items").select("description").eq("id", truoc!.id).single()).data!;
    expect(sau.description).toBe(truoc!.description);
  });

  test("Thêm: tài khoản, Quản trị đầy đủ, Đăng xuất", async ({ page }) => {
    await page.goto(`${GOC}/them`);
    for (const t of ["Kho hàng", "Sổ quỹ", "Nhân viên", "Bàn & QR", "Cài đặt"]) await expect(page.getByRole("link", { name: t })).toBeVisible();
    await expect(page.getByRole("link", { name: "Kho hàng" })).toHaveAttribute("href", `/r/${SLUG}/admin/inventory/stock`);
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
    await expect(page.getByText("Bản web")).toBeVisible();
    await page.screenshot({ path: ANH("09-quan-ly-them.png"), fullPage: true });
  });

  test("không tràn ngang ở 360px — mọi tab", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const duong of ["", "/hoa-don?ky=thang-nay", "/bao-cao?ky=thang-nay", "/thuc-don", "/them"]) {
      await page.goto(GOC + duong);
      await page.locator("details").evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
      const tran = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(tran, `tràn ngang ở ${duong || "Tổng quan"}`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("tải app Quản lý (30-03, MGR-08)", () => {
  test.use({ viewport: IPHONE });

  test("/tai-app-quan-ly công khai: phần Android + 3 bước iPhone + mở bản web", async ({ page }) => {
    await page.goto("/tai-app-quan-ly");
    await expect(page.getByRole("heading", { name: "TechMenu Quản lý" })).toBeVisible();
    for (const t of ["Điện thoại Android", "iPhone"]) await expect(page.getByRole("heading", { name: t })).toBeVisible();
    await expect(page.getByText("“Thêm vào MH chính”")).toBeVisible();
    await expect(page.getByRole("link", { name: "Hoặc mở bản web ngay →" })).toHaveAttribute("href", "/quan-ly");
    await page.screenshot({ path: ANH("10-tai-app-quan-ly.png"), fullPage: true });
  });

  test.describe("chủ quán", () => {
    test.use({ storageState: statePath, viewport: { width: 1280, height: 900 } });
    // Chủ dự án bỏ thẻ "App quản lý trên điện thoại" khỏi Tổng quan (10/10/2026); trang /tai-app-quan-ly vẫn giữ.
    test("Tổng quan admin không còn thẻ 'App quản lý trên điện thoại'", async ({ page }) => {
      await page.goto(`/r/${SLUG}/admin`);
      await expect(page.getByRole("heading", { name: /^Chào / })).toBeVisible();
      await expect(page.getByText("App quản lý trên điện thoại")).toHaveCount(0);
    });
  });
});
