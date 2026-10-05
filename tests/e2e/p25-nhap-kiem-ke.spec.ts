import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/**
 * P25 (INV-11, INV-12) — quán demo `pho-viet`. A: một chỗ nhập hàng (tab "Nhập hôm nay" bỏ, đường cũ chuyển sang
 * "+ Nhập hàng", nút "Lấy hàng lần trước"). B: kiểm kê hiện Tồn kho / Thực tế / SL lệch / Giá trị lệch, lệch lớn phải xác nhận.
 * Mọi dữ liệu mang TAG và được dọn cuối test.
 */
config({ path: ".env.local" });

const SLUG = "pho-viet";
const TAG = `E2E-${Date.now().toString(36)}`;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
test.setTimeout(240_000);

/** Ngày kinh doanh VN (cắt 00:00 giờ VN), lùi `back` ngày. */
const vnDay = (back = 0) => new Date(Date.now() + 7 * 3600e3 - back * 86400e3).toISOString().slice(0, 10);

async function dangNhap(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', process.env.SEED_OWNER_A_EMAIL ?? "ownerA@pho-viet.test");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_A_PASSWORD ?? "DemoPass123!");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function tenantId() {
  const { data } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  return data!.id as string;
}

test("A: Nguyên liệu có tab Tồn kho thay Nhập hôm nay; đường cũ → + Nhập hàng; 'Lấy hàng lần trước' điền danh sách", async ({ page }) => {
  const tenant = await tenantId();
  const { data: ing } = await db
    .from("ingredients")
    .insert({ tenant_id: tenant, name: `${TAG} Rau`, base_unit: "g", purchase_unit: "kg", purchase_factor: 1000 })
    .select("id")
    .single();
  try {
    // Nhập hôm qua → "Lấy hàng lần trước" có nguyên liệu này.
    await db.from("stock_entries").insert([
      // P34: business_date do trigger tính từ occurred_at — đặt giờ phát sinh hôm qua.
      { tenant_id: tenant, business_date: vnDay(1), occurred_at: `${vnDay(1)}T05:00:00Z`, ingredient_id: ing!.id, kind: "receipt", qty: 500 },
      { tenant_id: tenant, business_date: vnDay(), occurred_at: new Date().toISOString(), ingredient_id: ing!.id, kind: "receipt", qty: 500 },
    ]);
    await dangNhap(page);

    await page.goto(`/r/${SLUG}/admin/inventory/stock`, { waitUntil: "networkidle" });
    const tabs = page.getByRole("navigation", { name: "Kho hàng" }).getByRole("link");
    await expect(tabs).toHaveText(["Tồn kho", "Nhập hàng", "Kiểm kê & hủy", "Nguyên liệu", "Định lượng món", "Nhà cung cấp"]);
    await expect(page.locator("[data-ton-kho]").getByText(`${TAG} Rau`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chế biến" })).toBeVisible();
    await page.screenshot({ path: "docs/30-KeHoach/P25/anh/tab-ton-kho.png", fullPage: true });

    await page.goto(`/r/${SLUG}/admin/inventory/today`);
    await expect(page).toHaveURL(new RegExp(`/r/${SLUG}/admin/nhap-hang/moi$`), { timeout: 90_000 });
    await page.getByRole("button", { name: "Lấy hàng lần trước" }).click();
    await expect(page.locator(`form select option[value="${ing!.id}"]:checked`)).toHaveCount(1);
    await page.screenshot({ path: "docs/30-KeHoach/P25/anh/nhap-hang-lay-hang-lan-truoc.png", fullPage: true });
    // Bấm lần nữa không nhân đôi dòng.
    await page.getByRole("button", { name: "Lấy hàng lần trước" }).click();
    await expect(page.locator(`form select option[value="${ing!.id}"]:checked`)).toHaveCount(1);
  } finally {
    await db.from("stock_entries").delete().eq("ingredient_id", ing!.id);
    await db.from("ingredients").delete().eq("id", ing!.id);
  }
});

test("B: sổ 10 kg, đếm 82 kg → lệch +72 kg, +5.040.000₫, 'Lệch lớn'; Hoàn thành hỏi lại; Hủy thì không ghi, Đồng ý thì ghi +72 kg", async ({ page }) => {
  const tenant = await tenantId();
  const ten = `${TAG} Thịt`;
  const { data: ing } = await db
    .from("ingredients")
    .insert({
      tenant_id: tenant, name: ten, base_unit: "g", purchase_unit: "kg", purchase_factor: 1000, must_count: true, last_unit_cost: 70,
    })
    .select("id")
    .single();
  try {
    await db.from("stock_entries").insert({ tenant_id: tenant, business_date: vnDay(), ingredient_id: ing!.id, kind: "receipt", qty: 10_000 });
    await dangNhap(page);
    await page.goto(`/r/${SLUG}/admin/inventory/count`, { waitUntil: "networkidle" });

    const o = page.getByRole("textbox", { name: `Thực tế ${ten}`, exact: true });
    const dong = page.locator("li").filter({ has: o });
    await expect(dong).toContainText("10 kg");

    // Lệch nhỏ: không bôi vàng.
    await o.fill("9");
    await expect(page.getByLabel(`SL lệch ${ten}`)).toContainText("-1 kg");
    await expect(dong).not.toHaveAttribute("data-lech-lon");

    await o.fill("82");
    await expect(page.getByLabel(`SL lệch ${ten}`)).toContainText("+72 kg");
    await expect(dong).toHaveAttribute("data-lech-lon", "");
    await expect(dong.getByText("Lệch lớn")).toBeVisible();
    const tong = page.locator("[data-tong-kiem-ke]");
    await expect(tong).toContainText("Tổng lệch tăng (1)");
    await expect(tong).toContainText("+5.040.000₫");
    await page.screenshot({ path: "docs/30-KeHoach/P25/anh/kiem-ke-lech-lon.png", fullPage: true });
    // Điện thoại 360px: không cuộn ngang, dòng lệch vẫn đọc được.
    await page.setViewportSize({ width: 360, height: 780 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await dong.screenshot({ path: "docs/30-KeHoach/P25/anh/kiem-ke-360.png" });
    await page.setViewportSize({ width: 1280, height: 720 });

    // Hủy hộp xác nhận → không ghi gì.
    let hoi = "";
    page.once("dialog", (d) => {
      hoi = d.message();
      void d.dismiss();
    });
    await page.getByRole("button", { name: "Hoàn thành" }).click();
    await expect.poll(() => hoi).toContain(`${ten}: tồn kho 10 kg, thực tế 82 kg (lệch +72 kg)`);
    const chua = await db.from("stock_entries").select("id").eq("ingredient_id", ing!.id).eq("kind", "count_adjust");
    expect(chua.data).toHaveLength(0);

    // Đồng ý → ghi lệch +72 kg = +72.000 g; tồn mới = 82 kg.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Hoàn thành" }).click();
    await expect(page.getByText(/Đã cân bằng kho — phiếu KK\d+, \d+ nguyên liệu/)).toBeVisible({ timeout: 90_000 });
    const { data: adj } = await db.from("stock_entries").select("qty").eq("ingredient_id", ing!.id).eq("kind", "count_adjust");
    expect(adj!.map((r) => Number(r.qty))).toEqual([72_000]);
  } finally {
    await db.from("stock_entries").delete().eq("ingredient_id", ing!.id);
    await db.from("ingredients").delete().eq("id", ing!.id);
  }
});
