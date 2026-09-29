import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/**
 * P20 / 20-03 trên trình duyệt thật, quán demo `pho-viet` (PURCH-05): "Điều chỉnh" nợ đầu kỳ 5tr + phiếu nhập 3tr chưa trả
 * → "Thanh toán" 4tr → nợ còn 4tr, sổ quỹ có phiếu chi 4tr "Trả nợ nhà cung cấp". Dữ liệu mang TAG, dọn cuối test.
 */
config({ path: ".env.local" });

const SLUG = "pho-viet";
const TAG = `E2E-${Date.now().toString(36)}`;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
test.setTimeout(300_000);

async function dangNhap(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', process.env.SEED_OWNER_A_EMAIL ?? "ownerA@pho-viet.test");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_A_PASSWORD ?? "DemoPass123!");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 }),
    page.click('button[type="submit"]'),
  ]);
}

test("điều chỉnh nợ đầu kỳ + thanh toán một phần → nợ đúng, sổ quỹ có phiếu chi", async ({ page }) => {
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  const tenant = t!.id as string;
  const { data: ncc } = await db.from("suppliers").insert({ tenant_id: tenant, code: TAG, name: `${TAG} Mối gạo` }).select("id").single();
  const now = new Date().toISOString();
  // Nền: một phiếu đã nhập 3tr, chưa trả (dựng thẳng — luồng nhập hàng đã có E2E riêng ở p20-nhap).
  const { data: pn } = await db
    .from("purchase_receipts")
    .insert({
      tenant_id: tenant, code: `${TAG}-PN`, supplier_id: ncc!.id, status: "done", doc_date: "2026-09-01", stock_date: "2026-09-01",
      subtotal: 3_000_000, total: 3_000_000, completed_at: now,
    })
    .select("id")
    .single();

  try {
    await dangNhap(page);
    const NO = `/r/${SLUG}/admin/nha-cung-cap/${ncc!.id}?tab=debt`;
    await page.goto(NO, { waitUntil: "networkidle" });
    await expect(page.locator("[data-tong-no]")).toHaveText("3.000.000₫");

    // Điều chỉnh: công nợ tồn đầu kỳ 5tr.
    await page.getByRole("combobox", { name: "Loại" }).selectOption("plus");
    await page.getByRole("textbox", { name: "Giá trị nợ điều chỉnh" }).fill("5000000");
    await page.getByRole("textbox", { name: "Mô tả" }).fill("Công nợ tồn đầu kỳ");
    await page.getByRole("button", { name: "Điều chỉnh", exact: true }).click();
    await expect(page.getByText("Đã điều chỉnh công nợ.")).toBeVisible({ timeout: 60_000 });
    await page.goto(NO, { waitUntil: "networkidle" });
    await expect(page.locator("[data-tong-no]")).toHaveText("8.000.000₫");

    // Thanh toán 4tr, không tích phiếu → trả phiếu cũ trước (phiếu 3tr hết nợ, còn 1tr trả trước bù vào nợ đầu kỳ).
    await page.getByRole("textbox", { name: "Trả cho NCC" }).fill("4000000");
    await page.getByRole("button", { name: "Tạo phiếu chi" }).click();
    await expect(page.getByText(/Đã tạo phiếu chi PC\d{6}/)).toBeVisible({ timeout: 60_000 });
    await page.goto(NO, { waitUntil: "networkidle" });
    await expect(page.locator("[data-tong-no]")).toHaveText("4.000.000₫");
    await expect(page.locator("[data-no-ncc]").getByText("Trả trước (tiền đã trả chưa gắn phiếu nào)")).toBeVisible();

    // Sổ quỹ tiền mặt hôm nay có phiếu chi 4tr.
    await page.goto(`/r/${SLUG}/admin/so-quy?quy=cash&preset=today`, { waitUntil: "networkidle" });
    const dong = page.locator("[data-so-quy] tr").filter({ hasText: "Trả nợ nhà cung cấp" }).filter({ hasText: `${TAG} Mối gạo` });
    await expect(dong).toHaveCount(1);
    await expect(dong.getByText("4.000.000₫")).toBeVisible();
  } finally {
    await db.from("cash_vouchers").delete().eq("supplier_id", ncc!.id);
    await db.from("supplier_debt_adjustments").delete().eq("supplier_id", ncc!.id);
    if (pn) await db.from("purchase_receipts").delete().eq("id", pn.id);
    await db.from("suppliers").delete().eq("id", ncc!.id);
  }
});
