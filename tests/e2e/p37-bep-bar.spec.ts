import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { getServiceMode, setServiceMode, getPrintMode, setPrintMode, type ServiceMode, type PrintMode } from "./tenant-mode";

config({ path: ".env.local" });
config();

/**
 * P37 — in theo bếp/bar (PRINT-19/20/22/23) trên quán demo `pho-viet`:
 *  - Quản trị › Máy in › tab Bếp / Bar: thêm "Quầy pha chế" + tích một nhóm món + 2 liên → DB đúng;
 *  - POS: đơn có món của 2 nhóm → "Phiếu bếp" → 2 phiếu `pending`, mỗi phiếu đúng nơi + đúng món;
 *  - hủy món đồ uống đã gửi bếp → phiếu HỦY MÓN ra đúng quầy pha chế;
 *  - tab Bếp / Bar ở 360px không tràn ngang.
 * Nhịp tim cầu in dựng thẳng trong bảng (như cau-in.spec) — cái cần chứng minh là phiếu server xếp ra. Dọn hết khi xong.
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };
const ANH = "docs/30-KeHoach/P37/anh";
const TAG = `E2E Bar ${Date.now().toString(36)}`.slice(0, 30);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let tenantId = "";
let modeCu: ServiceMode = "table";
let printCu: PrintMode = "browser";
let nhipCu: Record<string, unknown> | null = null;
const batDau = new Date(Date.now() - 5_000).toISOString();
/** Món đơn giản (không nhóm tùy chọn) ở hai nhóm khác nhau. */
let monBar = { name: "", category: "", categoryName: "" };
let monBep = { name: "", category: "" };

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeAll(async () => {
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  tenantId = t!.id as string;
  modeCu = await getServiceMode(SLUG);
  printCu = await getPrintMode(SLUG);
  await setServiceMode(SLUG, "table");
  await setPrintMode(SLUG, "bridge");
  const { data: nhip } = await db.from("printer_heartbeats").select("*").eq("tenant_id", tenantId).maybeSingle();
  nhipCu = nhip;
  await db.from("printer_heartbeats").upsert({ tenant_id: tenantId, seen_at: new Date().toISOString(), printer_ok: true, version: 5 });

  const { data: mon } = await db
    .from("menu_items")
    .select("name, category_id, is_available, menu_categories!inner(name, active, station_id), menu_item_modifier_groups(group_id)")
    .eq("tenant_id", tenantId)
    .eq("is_available", true)
    .order("name");
  const don = (mon ?? []).filter(
    (m) =>
      ((m.menu_item_modifier_groups as unknown[]) ?? []).length === 0 &&
      (m.menu_categories as unknown as { active: boolean; station_id: string | null }).active &&
      !(m.menu_categories as unknown as { station_id: string | null }).station_id
  );
  const a = don[0];
  const b = don.find((m) => m.category_id !== a?.category_id);
  if (!a || !b) throw new Error("Quán demo cần ≥ 2 nhóm món có món không tùy chọn");
  monBar = { name: a.name as string, category: a.category_id as string, categoryName: (a.menu_categories as unknown as { name: string }).name };
  monBep = { name: b.name as string, category: b.category_id as string };
});

test.afterAll(async () => {
  // Đơn spec tạo: hủy (không xóa) — như p35. Phiếu in spec tạo: xóa, không để `pending` cho cầu in thật lấy.
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
    await db.from("order_items").update({ status: "cancelled", cancel_reason: "e2e p37" }).in("order_id", ids);
    await db.from("orders").update({ status: "cancelled", cancel_reason: "e2e p37" }).in("id", ids);
  }
  await db.from("print_jobs").delete().eq("tenant_id", tenantId).gte("created_at", batDau);
  await db.from("kitchen_stations").delete().eq("tenant_id", tenantId).like("name", "E2E Bar%");
  if (nhipCu) await db.from("printer_heartbeats").upsert(nhipCu);
  else await db.from("printer_heartbeats").delete().eq("tenant_id", tenantId);
  await setServiceMode(SLUG, modeCu);
  await setPrintMode(SLUG, printCu);
});

async function dangNhap(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.pass);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
}

async function themMon(page: Page, ten: string) {
  await page.getByLabel("Tìm món").fill(ten);
  await page.getByRole("button", { name: `Thêm ${ten}`, exact: true }).first().click();
  await page.getByLabel("Tìm món").fill("");
}

const tieuDe = (page: Page, no: number) => page.getByText(new RegExp(`^Đơn #${no}\\d{2}:\\d{2}`));
const theDon = (page: Page, no: number) => page.locator("div.rounded-lg").filter({ has: tieuDe(page, no) }).last();

test("PRINT-19/20/22/23: tạo bếp/bar trên web → phiếu tách theo nơi, số liên, phiếu hủy món", async ({ page }) => {
  await dangNhap(page);

  // ---- PRINT-19: tab Bếp / Bar ----
  await page.goto(`/r/${SLUG}/admin/printers?tab=bep-bar`, { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "Bếp / Bar" })).toHaveAttribute("aria-current", "page");
  const bang = page.locator("[data-bep-bar]");
  await expect(bang.getByText("Các nhóm còn lại (mặc định)")).toBeVisible();
  await page.getByRole("button", { name: "Thêm bếp/bar" }).click();
  const hop = page.getByRole("dialog", { name: "Thêm bếp/bar" });
  await hop.getByLabel("Tên").fill(TAG);
  await hop.getByRole("checkbox", { name: new RegExp(`^${monBar.categoryName}`) }).check();
  await hop.getByLabel("Số liên").selectOption("2");
  await page.screenshot({ path: `${ANH}/01-them-bep-bar.png` });
  await hop.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText(`Đã lưu "${TAG}" · 1 nhóm món.`)).toBeVisible();
  const { data: st } = await db.from("kitchen_stations").select("id, copies, per_item").eq("tenant_id", tenantId).eq("name", TAG).single();
  expect(st).toMatchObject({ copies: 2, per_item: false });
  const { data: cat } = await db.from("menu_categories").select("station_id").eq("id", monBar.category).single();
  expect(cat!.station_id).toBe(st!.id);
  await expect(bang.getByRole("row", { name: new RegExp(TAG) })).toContainText(monBar.categoryName);
  await page.screenshot({ path: `${ANH}/02-tab-bep-bar.png` });

  // ---- PRINT-20/22: POS đơn có món của 2 nơi → 2 phiếu ----
  await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Khách không bàn/ }).click();
  await themMon(page, monBar.name);
  await themMon(page, monBep.name);
  await page.getByRole("button", { name: /^Tạo đơn · / }).click();
  let don: { id: string; kitchen_no: number } | null = null;
  await expect
    .poll(async () => {
      const { data } = await db
        .from("orders")
        .select("id, kitchen_no")
        .eq("tenant_id", tenantId)
        .eq("source", "staff")
        .gte("created_at", batDau)
        .order("created_at", { ascending: false })
        .limit(1);
      don = (data?.[0] as typeof don) ?? null;
      return don?.kitchen_no ?? null;
    }, { timeout: 15_000 })
    .toBeTruthy();
  const the = theDon(page, don!.kitchen_no);
  await the.getByRole("button", { name: /Phiếu bếp/ }).click();

  type Job = { type: string; target_station: string; status: string; payload: { items: { name: string }[]; stationName: string | null; copies: number } };
  const jobs = async (type: string) => {
    const { data } = await db
      .from("print_jobs")
      .select("type, target_station, status, payload")
      .eq("tenant_id", tenantId)
      .eq("type", type)
      .contains("payload", { orderId: don!.id });
    return (data ?? []) as Job[];
  };
  await expect.poll(async () => (await jobs("kitchen_ticket")).length, { timeout: 20_000 }).toBe(2);
  const ve = await jobs("kitchen_ticket");
  const bar = ve.find((j) => j.target_station === st!.id)!;
  const bep = ve.find((j) => j.target_station === "kitchen")!;
  expect(bar.status).toBe("pending");
  expect(bar.payload.items.map((i) => i.name)).toEqual([monBar.name]);
  expect(bar.payload).toMatchObject({ stationName: TAG, copies: 2 });
  expect(bep.payload.items.map((i) => i.name)).toEqual([monBep.name]);
  expect(bep.payload.stationName).toBeTruthy(); // quán > 1 nơi → phiếu Bếp chính cũng ghi tên nơi
  // Chip trạng thái coi 2 phiếu của một lượt là MỘT lần gửi (không "×2").
  await expect(the.getByText(/×2/)).toHaveCount(0);

  // ---- PRINT-23: hủy món đồ uống đã gửi bếp → phiếu HỦY MÓN ra quầy pha chế ----
  await the.getByRole("listitem").filter({ hasText: monBar.name }).getByRole("button", { name: "Hủy" }).click();
  const huy = page.getByRole("dialog", { name: "Hủy món" });
  await huy.getByPlaceholder(/Khách đổi ý/).fill("Khách đổi ý e2e");
  await huy.getByRole("button", { name: "Xác nhận hủy" }).click();
  await expect.poll(async () => (await jobs("cancel_ticket")).length, { timeout: 20_000 }).toBe(1);
  const [h] = (await jobs("cancel_ticket")) as unknown as { target_station: string; payload: { items: { name: string }[]; reason: string; cancelledBy: string | null } }[];
  expect(h.target_station).toBe(st!.id);
  expect(h.payload.items.map((i) => i.name)).toEqual([monBar.name]);
  expect(h.payload.reason).toBe("Khách đổi ý e2e");
  expect(h.payload.cancelledBy).toBeTruthy();

  // Cầu in bản cũ (≤ 4, app Windows 1.0.5 / Android) không lấy phiếu hủy → không xếp, kẻo phiếu nằm chờ mãi.
  await db.from("printer_heartbeats").update({ version: 4, seen_at: new Date().toISOString() }).eq("tenant_id", tenantId);
  await the.getByRole("listitem").filter({ hasText: monBep.name }).getByRole("button", { name: "Hủy" }).click();
  await huy.getByPlaceholder(/Khách đổi ý/).fill("Thử cầu in cũ");
  await huy.getByRole("button", { name: "Xác nhận hủy" }).click();
  await expect(huy).toBeHidden({ timeout: 15_000 });
  const { data: daHuy } = await db.from("order_items").select("status").eq("order_id", don!.id).eq("name_snapshot", monBep.name).single();
  expect(daHuy!.status).toBe("cancelled");
  expect(await jobs("cancel_ticket")).toHaveLength(1);
  await db.from("printer_heartbeats").update({ version: 5 }).eq("tenant_id", tenantId);
});

test("tab Bếp / Bar ở 360px: không tràn ngang", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/admin/printers?tab=bep-bar`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Thêm bếp/bar" })).toBeVisible();
  const tran = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(tran).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${ANH}/03-bep-bar-360.png`, fullPage: true });
});
