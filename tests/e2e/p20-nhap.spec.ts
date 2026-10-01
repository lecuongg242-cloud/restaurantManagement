import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/**
 * P20 / 20-01 trên trình duyệt thật, màn điện thoại 360px, quán demo `pho-viet` (PURCH-01..04):
 * nhập hàng có nhà cung cấp + giá → trả một phần → Hoàn thành → phiếu PN trong tab "Phiếu nhập", nợ NCC đúng;
 * "Hủy bỏ" → tồn kho và nợ trở lại như trước. Mọi dữ liệu mang TAG và được dọn cuối test.
 */
config({ path: ".env.local" });

const SLUG = "pho-viet";
const EMAIL = process.env.SEED_OWNER_A_EMAIL ?? "ownerA@pho-viet.test";
const PASSWORD = process.env.SEED_OWNER_A_PASSWORD ?? "DemoPass123!";
const TAG = `E2E-${Date.now().toString(36)}`;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

test.use({ viewport: { width: 360, height: 780 } });
test.setTimeout(240_000);

async function dangNhap(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 }),
    page.click('button[type="submit"]'),
  ]);
}

test("nhập hàng có NCC, trả một phần, hủy bỏ trả lại tồn và nợ (360px)", async ({ page }) => {
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  const tenant = t!.id as string;
  const { data: ings } = await db
    .from("ingredients")
    .insert([
      { tenant_id: tenant, name: `${TAG} Bò`, base_unit: "g", purchase_unit: "kg", purchase_factor: 1000 },
      { tenant_id: tenant, name: `${TAG} Hành`, base_unit: "g", purchase_unit: "kg", purchase_factor: 1000 },
    ])
    .select("id, name");
  const { data: ncc } = await db
    .from("suppliers")
    .insert({ tenant_id: tenant, code: `${TAG}-NCC`, name: `${TAG} Mối bò` })
    .select("id")
    .single();
  const receiptIds: string[] = [];

  try {
    await dangNhap(page);
    await page.goto(`/r/${SLUG}/admin/nhap-hang/moi`, { waitUntil: "networkidle" });
    // Không tràn ngang trên 360px.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

    await page.getByRole("combobox", { name: "Nhà cung cấp" }).selectOption({ label: `${TAG} Mối bò` });
    for (const [name, qty, price] of [[`${TAG} Bò`, "2", "280000"], [`${TAG} Hành`, "0,5", "30000"]] as const) {
      await page.getByRole("button", { name: "+ Thêm nguyên liệu khác" }).click();
      await page.getByRole("combobox", { name: "Nguyên liệu" }).last().selectOption({ label: name });
      await page.getByRole("textbox", { name: /Số lượng/ }).last().fill(qty);
      await page.getByRole("textbox", { name: "Đơn giá (không bắt buộc)" }).last().fill(price);
    }
    const tien = page.locator("[data-tien-phieu-nhap]");
    await expect(tien.getByText("575.000₫").first()).toBeVisible(); // 560.000 + 15.000
    await page.getByRole("textbox", { name: "Tiền trả NCC" }).fill("200000");
    await expect(tien.getByText("Tính vào công nợ: 375.000₫")).toBeVisible();
    await page.getByRole("button", { name: "Hoàn thành" }).click();
    // Lần đầu mở trang chi tiết phiếu, server dev phải biên dịch — chờ lâu hơn mặc định.
    await expect(page.getByText(/Đã nhập hàng — phiếu PN\d{6}/)).toBeVisible({ timeout: 90_000 });
    await expect(page).toHaveURL(/\/nhap-hang\/[0-9a-f-]{36}$/);
    const receiptId = page.url().split("/").pop()!;
    receiptIds.push(receiptId);

    const { data: se } = await db.from("stock_entries").select("ingredient_id, qty, unit_cost").eq("purchase_receipt_id", receiptId);
    expect(se!.map((r) => [Number(r.qty), Number(r.unit_cost)]).sort()).toEqual([[2000, 280], [500, 30]].sort());
    await expect(page.getByText("Đã nhập hàng").first()).toBeVisible();

    // Tab "Phiếu nhập" có phiếu vừa tạo; NCC nợ 375.000.
    await page.goto(`/r/${SLUG}/admin/nhap-hang`, { waitUntil: "networkidle" });
    const ds = page.locator("[data-danh-sach-phieu-nhap]");
    await expect(ds.getByText(/PN\d{6}/).first()).toBeVisible();
    // Danh sách cho biết nhập gì + còn nợ bao nhiêu; bấm vào dòng (không cần trúng mã phiếu) mở chi tiết.
    const hang = ds.getByText(`${TAG} Bò 2 kg · ${TAG} Hành 0,5 kg`);
    await expect(hang).toBeVisible();
    await expect(ds.getByText("375.000₫")).toBeVisible();
    await hang.click();
    await expect(page).toHaveURL(new RegExp(`/nhap-hang/${receiptId}$`), { timeout: 60_000 });
    await page.goto(`/r/${SLUG}/admin/nha-cung-cap?q=${encodeURIComponent(TAG)}`);
    await expect(page.locator("[data-danh-sach-ncc]").getByText("375.000₫")).toBeVisible();

    // Hủy bỏ (ngày kho chưa chốt) → dòng sổ biến mất, phiếu chi hủy theo, nợ về 0.
    await page.goto(`/r/${SLUG}/admin/nhap-hang/${receiptId}`, { waitUntil: "networkidle" });
    // Hộp xác nhận PHẢI hiện (bấm trước khi trang nạp xong JS thì không có bước xác nhận).
    let hoi = "";
    page.once("dialog", async (d) => {
      hoi = d.message();
      await d.accept();
    });
    await page.getByRole("button", { name: "Hủy bỏ" }).click();
    expect(hoi).toContain("Tồn kho và công nợ được trả lại");
    await expect
      .poll(async () => (await db.from("purchase_receipts").select("status").eq("id", receiptId).single()).data?.status, {
        timeout: 60_000,
      })
      .toBe("cancelled");
    await expect(page.getByText("Đã hủy phiếu nhập.")).toBeVisible({ timeout: 60_000 });
    const { data: se2 } = await db.from("stock_entries").select("id").eq("purchase_receipt_id", receiptId);
    expect(se2).toHaveLength(0);
    const { data: v } = await db.from("cash_vouchers").select("status").eq("purchase_receipt_id", receiptId);
    expect(v!.map((x) => x.status)).toEqual(["cancelled"]);
    await page.goto(`/r/${SLUG}/admin/nha-cung-cap?q=${encodeURIComponent(TAG)}`);
    await expect(page.locator("[data-danh-sach-ncc]").getByText("375.000₫")).toHaveCount(0);
  } finally {
    // Dọn theo NCC của test — kể cả khi test dừng trước lúc đọc được id phiếu từ URL.
    const { data: rs } = await db.from("purchase_receipts").select("id").eq("supplier_id", ncc!.id);
    receiptIds.push(...(rs ?? []).map((r) => r.id as string));
    await db.from("stock_entries").delete().in("purchase_receipt_id", receiptIds);
    await db.from("cash_vouchers").delete().in("purchase_receipt_id", receiptIds);
    await db.from("purchase_receipts").delete().in("id", receiptIds);
    await db.from("suppliers").delete().eq("id", ncc!.id);
    await db.from("ingredients").delete().in("id", (ings ?? []).map((i) => i.id));
  }
});

test("chọn 'Chưa trả (ghi nợ)' → không phiếu chi, nợ = cần trả; chưa chọn NCC thì được nhắc", async ({ page }) => {
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  const tenant = t!.id as string;
  const { data: ings } = await db
    .from("ingredients")
    .insert({ tenant_id: tenant, name: `${TAG} Gạo`, base_unit: "kg" })
    .select("id")
    .single();
  const { data: ncc } = await db.from("suppliers").insert({ tenant_id: tenant, code: `${TAG}-GN`, name: `${TAG} Mối gạo` }).select("id").single();
  try {
    await dangNhap(page);
    await page.goto(`/r/${SLUG}/admin/nhap-hang/moi`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "+ Thêm nguyên liệu khác" }).click();
    await page.getByRole("combobox", { name: "Nguyên liệu" }).last().selectOption({ label: `${TAG} Gạo` });
    await page.getByRole("textbox", { name: /Số lượng/ }).last().fill("50");
    await page.getByRole("textbox", { name: "Đơn giá (không bắt buộc)" }).last().fill("20000");
    await page.getByRole("radio", { name: "Chưa trả (ghi nợ)" }).check();
    await expect(page.getByRole("textbox", { name: "Tiền trả NCC" })).toBeDisabled();
    await expect(page.getByText("Chọn nhà cung cấp ở trên để ghi nợ.")).toBeVisible();
    await page.getByRole("combobox", { name: "Nhà cung cấp" }).selectOption({ label: `${TAG} Mối gạo` });
    await expect(page.locator("[data-tien-phieu-nhap]").getByText("Tính vào công nợ: 1.000.000₫")).toBeVisible();
    await page.getByRole("button", { name: "Hoàn thành" }).click();
    await expect(page.getByText(/Đã nhập hàng — phiếu PN\d{6}/)).toBeVisible({ timeout: 90_000 });
    const { data: pr } = await db.from("purchase_receipts").select("id, total").eq("supplier_id", ncc!.id).single();
    expect(pr!.total).toBe(1_000_000);
    expect((await db.from("cash_vouchers").select("id").eq("purchase_receipt_id", pr!.id)).data).toHaveLength(0);
  } finally {
    const { data: rs } = await db.from("purchase_receipts").select("id").eq("supplier_id", ncc!.id);
    const ids = (rs ?? []).map((r) => r.id as string);
    await db.from("stock_entries").delete().in("purchase_receipt_id", ids);
    await db.from("purchase_receipts").delete().in("id", ids);
    await db.from("suppliers").delete().eq("id", ncc!.id);
    await db.from("ingredients").delete().eq("id", ings!.id);
  }
});
