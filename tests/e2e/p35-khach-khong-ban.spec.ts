import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { getServiceMode, setServiceMode, getPrintMode, setPrintMode, type ServiceMode, type PrintMode } from "./tenant-mode";

config({ path: ".env.local" });
config();

/**
 * P35 — quán chế độ BÀN bán cả khách không bàn (sáng ăn sáng, tối lẩu theo bàn). ORDER-27/28:
 *  - khung Đơn mới có công tắc "Tại quán · Mang về", mặc định Tại quán, đơn kế quay lại Tại quán;
 *  - `orders.eat_in` lưu đúng lựa chọn; lượt gọi thêm theo đơn gốc;
 *  - thẻ đơn và màn bếp ghi đúng "Tại quán" / "Mang về".
 * Chạy trên quán demo `pho-viet` (DB dùng chung với quán thật — chỉ đụng quán demo, hủy đơn đã tạo khi xong).
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };
const ANH = "docs/30-KeHoach/P35/anh";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let modeCu: ServiceMode = "table";
let printCu: PrintMode = "browser";
let tenantId = "";
const batDau = new Date(Date.now() - 5_000).toISOString();

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeAll(async () => {
  modeCu = await getServiceMode(SLUG);
  printCu = await getPrintMode(SLUG);
  await setServiceMode(SLUG, "table");
  await setPrintMode(SLUG, "browser");
  const { data } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  tenantId = data!.id as string;
});

test.afterAll(async () => {
  // Hủy (không xóa) mọi đơn không bàn spec này tạo — để hàng chờ của quán demo sạch cho lượt chạy sau.
  const { data: don } = await db
    .from("orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("channel", "takeaway")
    .eq("source", "staff")
    .gte("created_at", batDau)
    .not("status", "in", "(completed,cancelled)");
  const ids = (don ?? []).map((d) => d.id as string);
  if (ids.length) {
    await db.from("order_items").update({ status: "cancelled", cancel_reason: "e2e p35" }).in("order_id", ids);
    await db.from("orders").update({ status: "cancelled", cancel_reason: "e2e p35" }).in("id", ids);
  }
  await setServiceMode(SLUG, modeCu);
  await setPrintMode(SLUG, printCu);
});

async function vaoPos(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.pass);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
  await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: "Sơ đồ bàn" })).toBeVisible({ timeout: 30_000 });
}

async function themMon(page: Page) {
  await page.getByRole("button", { name: /^Thêm / }).first().click();
  const themVaoGio = page.getByRole("button", { name: /Thêm vào giỏ/ });
  if (await themVaoGio.isVisible({ timeout: 2_000 }).catch(() => false)) await themVaoGio.click();
}

/** Dòng tiêu đề thẻ đơn: "Đơn #12" + giờ "13:52" + nhãn nơi — chữ dính liền nhau trong cây truy cập. */
const tieuDe = (page: Page, no: number) => page.getByText(new RegExp(`^Đơn #${no}\\d{2}:\\d{2}`));
/** Thẻ đơn trong hàng chờ: khối viền TRONG CÙNG chứa dòng tiêu đề (khối ngoài đứng trước trong DOM). */
const theDon = (page: Page, no: number) => page.locator("div.rounded-lg").filter({ has: tieuDe(page, no) }).last();

/** Đơn không bàn mới nhất do spec này tạo. */
async function donMoiNhat() {
  const { data } = await db
    .from("orders")
    .select("id, kitchen_no, eat_in, parent_order_id")
    .eq("tenant_id", tenantId)
    .eq("channel", "takeaway")
    .eq("source", "staff")
    .gte("created_at", batDau)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data as { id: string; kitchen_no: number; eat_in: boolean; parent_order_id: string | null };
}

test("ORDER-27/28/29: đơn không bàn chọn Tại quán / Mang về, gọi thêm theo đơn gốc, bếp + báo cáo ghi đúng", async ({ page, context }) => {
  await vaoPos(page);

  // Ô trên sơ đồ bàn đổi tên — không còn nói mọi đơn không bàn là mang về.
  const o = page.getByRole("button", { name: /^Khách không bàn/ });
  await expect(o).toContainText("Khách không bàn");
  await o.click();
  await expect(page.getByRole("heading", { name: "Khách không bàn" })).toBeVisible();

  // Mặc định Tại quán.
  const taiQuan = page.getByRole("button", { name: "Tại quán", exact: true });
  const mangVe = page.getByRole("button", { name: "Mang về", exact: true });
  await expect(taiQuan).toHaveAttribute("aria-pressed", "true");
  await expect(mangVe).toHaveAttribute("aria-pressed", "false");

  // ---- Đơn 1: Tại quán ----
  await themMon(page);
  await page.screenshot({ path: `${ANH}/01-don-moi-tai-quan.png` });
  await page.getByRole("button", { name: /^Tạo đơn · / }).click();
  await expect.poll(async () => (await donMoiNhat())?.kitchen_no, { timeout: 15_000 }).toBeTruthy();
  const don1 = await donMoiNhat();
  expect(don1.eat_in).toBe(true);
  const the1 = theDon(page, don1.kitchen_no);
  await expect(tieuDe(page, don1.kitchen_no)).toContainText("Tại quán", { timeout: 15_000 });

  // ---- Đơn 2: Mang về; xong thì công tắc quay về Tại quán ----
  await mangVe.click();
  await expect(mangVe).toHaveAttribute("aria-pressed", "true");
  await themMon(page);
  await page.getByRole("button", { name: /^Tạo đơn · / }).click();
  await expect.poll(async () => (await donMoiNhat())?.id, { timeout: 15_000 }).not.toBe(don1.id);
  const don2 = await donMoiNhat();
  expect(don2.eat_in).toBe(false);
  await expect(taiQuan).toHaveAttribute("aria-pressed", "true");
  await expect(tieuDe(page, don2.kitchen_no)).toContainText("Mang về", { timeout: 15_000 });

  // ---- Gọi thêm vào đơn 1 (Tại quán), sau khi đã bấm Mang về: lượt gọi thêm vẫn Tại quán ----
  await mangVe.click();
  await the1.getByRole("button", { name: /Gọi thêm/ }).click();
  await expect(page.getByText(new RegExp(`Đang thêm vào Đơn #${don1.kitchen_no}`))).toBeVisible();
  await expect(page.getByRole("group", { name: "Khách ăn ở đâu" })).toHaveCount(0);
  await themMon(page);
  await page.getByRole("button", { name: /^Gửi bếp lượt gọi thêm/ }).click();
  await expect.poll(async () => (await donMoiNhat())?.parent_order_id, { timeout: 15_000 }).toBe(don1.id);
  const don3 = await donMoiNhat();
  expect(don3.eat_in).toBe(true);
  await page.screenshot({ path: `${ANH}/02-hang-cho-tai-quan-mang-ve.png` });

  // ---- Màn bếp ----
  const bep = await context.newPage();
  await bep.setViewportSize({ width: 1280, height: 800 });
  await bep.goto(`/r/${SLUG}/kds`, { waitUntil: "networkidle" });
  const ve = (no: number) => bep.locator("div.rounded-lg.border-2").filter({ hasText: new RegExp(`#${no}(?!\\d)`) }).first();
  await expect(ve(don1.kitchen_no)).toContainText("Tại quán", { timeout: 15_000 });
  await expect(ve(don2.kitchen_no)).toContainText("Mang về");
  await expect(ve(don3.kitchen_no)).toContainText("Tại quán");
  await ve(don1.kitchen_no).scrollIntoViewIfNeeded();
  await ve(don1.kitchen_no).screenshot({ path: `${ANH}/03a-ve-bep-tai-quan.png` });
  await ve(don2.kitchen_no).scrollIntoViewIfNeeded();
  await ve(don2.kitchen_no).screenshot({ path: `${ANH}/03b-ve-bep-mang-ve.png` });
  await bep.close();

  // ---- Phiếu bếp in: đơn không bàn in thẳng nơi phục vụ ("ĐƠN #N TẠI QUÁN"), không "Bàn: —" ----
  const phieu = await context.newPage();
  await phieu.goto(`/r/${SLUG}/print/kitchen/${don1.id}?w=80`);
  await expect(phieu.getByText(/PHIẾU BẾP/)).toBeVisible();
  await expect(phieu.getByText("TẠI QUÁN", { exact: true })).toBeVisible();
  await expect(phieu.getByText(/Bàn:/)).toHaveCount(0);
  await phieu.screenshot({ path: `${ANH}/04-phieu-bep-tai-quan.png`, fullPage: true });
  await phieu.close();

  // ---- ORDER-29: thu tiền đơn Tại quán (cả lượt gọi thêm) + đơn Mang về → báo cáo tách đúng hai dòng ----
  for (const no of [don1.kitchen_no, don2.kitchen_no]) {
    await theDon(page, no).getByRole("button", { name: /Thu tiền & hoàn tất/ }).click();
    const hop = page.getByRole("dialog", { name: "Thu tiền" });
    await hop.getByRole("button", { name: /Chuyển khoản/ }).click();
    await hop.getByRole("button", { name: /Xác nhận thu/ }).click();
    await expect(hop.getByText("Đã thanh toán")).toBeVisible({ timeout: 15_000 });
    await hop.getByRole("button", { name: /^Xong$/ }).click();
    await expect(hop).toBeHidden();
  }

  const tien = async (ids: string[]) => {
    const { data } = await db.from("order_items").select("unit_price_snapshot, qty, status").in("order_id", ids);
    return (data ?? []).filter((r) => r.status !== "cancelled").reduce((s, r) => s + r.unit_price_snapshot * r.qty, 0);
  };
  const tienTaiQuan = await tien([don1.id, don3.id]);
  const tienMangVe = await tien([don2.id]);

  // Hôm nay chỉ có đơn của spec này là "Tại quán" ở quán demo (đơn cũ = eat_in false) ⇒ khớp tới từng đồng.
  const homNay = new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);
  const tu = new Date(`${homNay}T00:00:00+07:00`).toISOString();
  const den = new Date(new Date(tu).getTime() + 24 * 3600_000).toISOString();
  const { data: dong } = await db.rpc("report_by_channel", { p_tenant: tenantId, p_from: tu, p_to: den });
  const doanhThuTaiQuan = ((dong ?? []) as { channel: string; has_table: boolean; eat_in: boolean; revenue: number }[])
    .filter((r) => r.channel === "takeaway" && !r.has_table && r.eat_in)
    .reduce((s, r) => s + Number(r.revenue), 0);
  expect(doanhThuTaiQuan).toBe(tienTaiQuan);

  await page.goto(`/r/${SLUG}/admin/reports?preset=today`, { waitUntil: "networkidle" });
  const noi = page.getByRole("heading", { name: "Theo nơi phục vụ" }).locator("xpath=..");
  await expect(noi.getByText("Tại quán")).toBeVisible();
  await expect(noi.getByText("Mang về")).toBeVisible();
  await noi.scrollIntoViewIfNeeded();
  await noi.screenshot({ path: `${ANH}/05-bao-cao-noi-phuc-vu.png` });

  // App Quản lý › Hóa đơn: cột nơi ghi đúng từng hóa đơn.
  await page.goto(`/r/${SLUG}/quan-ly/hoa-don`, { waitUntil: "networkidle" });
  await expect(page.getByText(/^Tại quán · #\d+/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^Mang về · #\d+/).first()).toBeVisible();
  expect(tienMangVe).toBeGreaterThan(0);
});
