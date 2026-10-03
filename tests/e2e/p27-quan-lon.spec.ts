import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/**
 * P27 — quản lý order quán lớn, quán demo `pho-viet` dựng bởi `node scripts/seed-quan-lon.mjs` (211 bàn, 111 món, 150 bàn
 * đang phục vụ). ORDER-21 tab nhóm món ngang · ORDER-22 tab khu một hàng · ORDER-23 gom cảnh báo · ORDER-24 dấu + lọc thẻ bàn ·
 * ORDER-04 bếp "Xong" → POS "Mang ra" → vé rời bếp (QD-032). Mỗi bước kiểm DB, không chỉ chữ trên màn.
 */
config({ path: ".env.local" });

const SLUG = "pho-viet";
const ANH = "docs/30-KeHoach/P27/anh";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

let tenant = "";

async function dangNhap(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', process.env.SEED_OWNER_A_EMAIL ?? "ownerA@pho-viet.test");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_A_PASSWORD ?? "DemoPass123!");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 }),
    page.click('button[type="submit"]'),
  ]);
}

test.beforeAll(async () => {
  const { data } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  tenant = data!.id;
  const { count } = await db.from("tables").select("id", { count: "exact", head: true }).eq("tenant_id", tenant);
  expect(count, "Chạy scripts/seed-quan-lon.mjs trước").toBeGreaterThan(200);
});

test("ORDER-21: tab nhóm món ngang lọc theo nhóm; đang tìm thì tìm mọi nhóm", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
  // ≥ 1024px: thực đơn ở tab "Thực đơn" cạnh "Sơ đồ bàn" (ORDER-25).
  await page.getByRole("tab", { name: /Thực đơn/ }).click();
  const nhom = page.getByRole("group", { name: "Nhóm món" });
  await expect(nhom.getByRole("button", { name: "Tất cả" })).toHaveAttribute("aria-pressed", "true");
  // Một hàng: cao không quá một nút.
  expect((await nhom.boundingBox())!.height).toBeLessThan(60);

  await nhom.getByRole("button", { name: "Bia – Rượu" }).click();
  await expect(page.locator("button[aria-label='Thêm Bia Tiger']")).toBeVisible();
  await expect(page.locator("button[aria-label='Thêm Phở bò chín']")).toHaveCount(0);
  await page.screenshot({ path: `${ANH}/01-tab-nhom-mon.png` });

  await page.getByLabel("Tìm món").fill("phở bò");
  await expect(page.locator("button[aria-label='Thêm Phở bò chín']")).toBeVisible();
  await page.getByLabel("Tìm món").fill("");
  await expect(page.locator("button[aria-label='Thêm Phở bò chín']")).toHaveCount(0);
  await expect(page.locator("button[aria-label='Thêm Bia Tiger']")).toBeVisible();
});

test("ORDER-22/23/24: tab khu một hàng; không còn ba băng; nút Cần in / Bàn gọi; lọc 'Cần xử lý' có dấu trên thẻ", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
  const khu = page.getByRole("group", { name: "Khu vực" });
  expect((await khu.boundingBox())!.height).toBeLessThan(60);
  await expect(page.getByText(/Đơn khách chờ duyệt \(\d+\)/)).toHaveCount(0);
  await expect(page.getByText(/Bàn đang gọi \(\d+\)/)).toHaveCount(0);

  // Lượt "Gọi thanh toán" nằm ở hàng chờ "Thanh toán" (ORDER-26), không tính ở "Bàn gọi".
  const { data: dsGoi } = await db.from("staff_calls").select("note").eq("tenant_id", tenant).eq("status", "pending");
  const calls = (dsGoi ?? []).filter((c) => !/^(gọi\s+)?thanh toán/i.test((c.note ?? "").trim())).length;
  const goi = page.getByRole("button", { name: `Bàn gọi ${calls}` });
  await expect(goi).toBeVisible();
  await goi.click();
  await expect(page.getByText(`Bàn đang gọi (${calls})`)).toBeVisible();
  await page.screenshot({ path: `${ANH}/02-ngan-ban-goi.png` });
  await page.keyboard.press("Escape");

  // Lọc "Cần xử lý": mọi thẻ hiện ra đều có dấu, số thẻ = số trên nút lọc; bàn có đơn chờ duyệt nằm trong đó.
  const loc = page.getByRole("group", { name: "Lọc trạng thái bàn" });
  const nut = loc.getByRole("button", { name: /^Cần xử lý/ });
  const n = Number((await nut.innerText()).match(/\d+/)![0]);
  expect(n).toBeGreaterThan(0);
  await nut.click();
  const the = page.locator("aside").first().locator("button[aria-pressed]").filter({ has: page.locator("[data-dau-ban]") });
  await expect(the).toHaveCount(n);
  const { data: cho } = await db
    .from("orders")
    .select("table_sessions(tables(name))")
    .eq("tenant_id", tenant)
    .eq("status", "pending_confirm")
    .not("table_session_id", "is", null)
    .limit(1);
  const tenBan = (cho![0].table_sessions as unknown as { tables: { name: string } }).tables.name;
  await expect(page.locator("aside").first().getByRole("button", { name: new RegExp(`^${tenBan}\\b`) })).toBeVisible();
  await page.screenshot({ path: `${ANH}/03-loc-can-xu-ly.png` });

  // Tablet 1024: thanh trên cùng không tràn ngang.
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  await expect(page.getByRole("button", { name: /Order chờ duyệt/ })).toBeInViewport();
  await page.screenshot({ path: `${ANH}/04-tablet-1024.png` });
});

test("ORDER-25: tab Sơ đồ bàn rộng toàn vùng (≥ 6 cột ở 1920); chọn bàn → Thực đơn; đóng bàn → về Sơ đồ bàn", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: "Sơ đồ bàn" })).toHaveAttribute("aria-selected", "true");
  const the = page.locator("aside").first().getByRole("button", { name: /^A0[1-9]\b/ });
  const ys = await the.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(ys.filter((y) => y === ys[0]).length, "số thẻ trên cùng một hàng").toBeGreaterThanOrEqual(6);
  await page.screenshot({ path: `${ANH}/07-so-do-ban-1920.png` });
  await page.locator("aside").first().getByRole("button", { name: /^A02\b/ }).click();
  await expect(page.getByRole("tab", { name: /Thực đơn · Bàn A02/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Tìm món")).toBeVisible();
  await page.getByRole("button", { name: "Bỏ chọn bàn" }).click();
  await expect(page.getByRole("tab", { name: "Sơ đồ bàn" })).toHaveAttribute("aria-selected", "true");
});

test("ORDER-26: khách 'Gọi thanh toán' → hàng chờ 'Thanh toán N' → bấm bàn mở hóa đơn → thu đủ → lượt gọi tự xong, bàn rời hàng chờ", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  // Một bàn đang phục vụ, chưa có hóa đơn mở, chưa chờ duyệt.
  const { data: ss } = await db
    .from("table_sessions")
    .select("id, table_id, tables(name)")
    .eq("tenant_id", tenant)
    .eq("status", "open")
    .limit(60);
  const { data: bills } = await db.from("bills").select("table_session_id").eq("tenant_id", tenant).eq("status", "open");
  const { data: cho } = await db.from("orders").select("table_session_id").eq("tenant_id", tenant).eq("status", "pending_confirm");
  const ban = new Set([...(bills ?? []), ...(cho ?? [])].map((x) => x.table_session_id));
  const s = (ss ?? []).find((x) => !ban.has(x.id) && /^[ABC]\d{2}$/.test((x.tables as unknown as { name: string }).name))!;
  const tenBan = (s.tables as unknown as { name: string }).name;
  const { data: call } = await db
    .from("staff_calls")
    .insert({ tenant_id: tenant, table_id: s.table_id, table_name: tenBan, note: "Thanh toán · Chuyển khoản" })
    .select("id")
    .single();

  await dangNhap(page);
  await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
  const nut = page.getByRole("button", { name: /^Thanh toán \d+$/ });
  await nut.click();
  const dong = page.locator("[data-pos-popover] li button").filter({ hasText: `Bàn ${tenBan}` });
  await expect(dong).toContainText("Chuyển khoản");
  await page.screenshot({ path: `${ANH}/08-hang-cho-thanh-toan.png` });
  await dong.click();
  // Mở thẳng hóa đơn của bàn → Thu tiền (chuyển khoản) → xác nhận.
  const thu = page.getByRole("button", { name: /Thu tiền/ }).first();
  await expect(thu).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${ANH}/09-mo-hoa-don-tu-hang-cho.png` });
  await thu.click();
  const hop = page.getByRole("dialog", { name: "Thu tiền" });
  await hop.getByRole("button", { name: /Chuyển khoản/ }).click();
  await hop.getByRole("button", { name: /Xác nhận thu/ }).click();
  await expect
    .poll(async () => (await db.from("staff_calls").select("status").eq("id", call!.id).single()).data!.status, { timeout: 30_000 })
    .toBe("resolved");
  const { data: s2 } = await db.from("table_sessions").select("status").eq("id", s.id).single();
  expect(s2!.status).toBe("closed");
  await page.reload({ waitUntil: "networkidle" });
  const con = page.getByRole("button", { name: /^Thanh toán \d+$/ });
  if (await con.count()) {
    await con.click();
    await expect(page.locator("[data-pos-popover] li button").filter({ hasText: `Bàn ${tenBan}` })).toHaveCount(0);
  }
});

test("ORDER-26: đã 'Tính tiền' (vào hàng chờ) rồi khách gọi thêm → dòng hàng chờ báo '+N món gọi thêm'; mở hóa đơn từ hàng chờ → món mới vào hóa đơn", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const { data: ss } = await db
    .from("table_sessions")
    .select("id, table_id, tables(name)")
    .eq("tenant_id", tenant)
    .eq("status", "open")
    .limit(60);
  const { data: bills } = await db.from("bills").select("table_session_id").eq("tenant_id", tenant).eq("status", "open");
  const { data: cho } = await db.from("orders").select("table_session_id").eq("tenant_id", tenant).eq("status", "pending_confirm");
  const ban = new Set([...(bills ?? []), ...(cho ?? [])].map((x) => x.table_session_id));
  const s = (ss ?? []).find((x) => !ban.has(x.id) && /^[ABC]\d{2}$/.test((x.tables as unknown as { name: string }).name))!;
  const tenBan = (s.tables as unknown as { name: string }).name;

  // Thu ngân bấm "Tính tiền" → bàn vào hàng chờ.
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
  await page.locator("aside").first().getByRole("button", { name: new RegExp(`^${tenBan}\\b`) }).click();
  await page.getByRole("button", { name: "Tính tiền" }).click();
  await expect
    .poll(async () => (await db.from("bills").select("id").eq("table_session_id", s.id).eq("status", "open")).data?.length, { timeout: 30_000 })
    .toBe(1);

  // Khách gọi thêm 2 phần qua QR (đơn đã duyệt, xuống bếp).
  const { data: mon } = await db.from("menu_items").select("id, name, base_price").eq("tenant_id", tenant).eq("is_available", true).limit(1).single();
  const { data: don } = await db
    .from("orders")
    .insert({ tenant_id: tenant, table_session_id: s.id, table_id: s.table_id, channel: "dine_in", source: "qr", status: "confirmed", confirmed_at: new Date().toISOString() })
    .select("id")
    .single();
  await db.from("order_items").insert({
    tenant_id: tenant, order_id: don!.id, menu_item_id: mon!.id, name_snapshot: mon!.name, unit_price_snapshot: mon!.base_price, qty: 2, status: "queued",
  });

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Thanh toán \d+$/ }).click();
  const dong = page.locator("[data-pos-popover] li button").filter({ hasText: `Bàn ${tenBan}` });
  await expect(dong).toContainText("+2 món gọi thêm");
  await page.screenshot({ path: `${ANH}/10-goi-them-sau-tinh-tien.png` });

  // Mở hóa đơn từ hàng chờ → món mới tự vào hóa đơn; dòng hàng chờ hết báo.
  await dong.click();
  await expect(page.getByRole("button", { name: /Thu tiền/ }).first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => {
      const { data: b } = await db.from("bills").select("id").eq("table_session_id", s.id).eq("status", "open").single();
      const { data: bi } = await db.from("bill_items").select("order_item_id, order_items!inner(order_id)").eq("bill_id", b!.id).eq("order_items.order_id", don!.id);
      return bi?.length ?? 0;
    }, { timeout: 30_000 })
    .toBe(1);
  await page.screenshot({ path: `${ANH}/11-hoa-don-da-gom-mon-goi-them.png` });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Thanh toán \d+$/ }).click();
  await expect(page.locator("[data-pos-popover] li button").filter({ hasText: `Bàn ${tenBan}` })).not.toContainText("món gọi thêm");
});

test("ORDER-04: bếp 'Xong' → POS 'Mang ra' → món rời bếp; 'Trả lại' đưa về Chờ chế biến; đơn tự đổi trạng thái", async ({ browser }) => {
  // Đơn tại bàn còn ≥ 2 món chờ làm.
  const { data: rows } = await db
    .from("orders")
    .select("id, status, table_session_id, table_sessions(tables(name)), order_items(id, name_snapshot, status, delivered_at)")
    .eq("tenant_id", tenant)
    .eq("status", "confirmed")
    .not("table_session_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);
  const order = (rows ?? []).find((o) => (o.order_items as { status: string }[]).filter((i) => i.status === "queued").length >= 2)!;
  expect(order, "cần một đơn tại bàn có ≥ 2 món chờ làm").toBeTruthy();
  const items = (order.order_items as { id: string; name_snapshot: string; status: string }[]).filter((i) => i.status === "queued");
  const [mon1, mon2] = items;
  const tenBan = (order.table_sessions as unknown as { tables: { name: string } }).tables.name;

  const bep = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await dangNhap(bep);
  await bep.goto(`/r/${SLUG}/kds`, { waitUntil: "networkidle" });
  const ve = bep.locator(`li[data-order-id="${order.id}"]`);
  await ve.scrollIntoViewIfNeeded();
  await ve.getByRole("button", { name: `Xong ${mon1.name_snapshot}` }).first().click();
  await expect(bep.locator(`li[data-done-order-id="${order.id}"]`)).toContainText(mon1.name_snapshot, { timeout: 30_000 });
  const { data: a } = await db.from("order_items").select("status").eq("id", mon1.id).single();
  expect(a!.status).toBe("ready");
  const { data: o1 } = await db.from("orders").select("status").eq("id", order.id).single();
  expect(o1!.status).toBe("preparing");
  await bep.screenshot({ path: `${ANH}/05-kds-hai-cot.png` });

  // POS: món hiện "Xong – chờ mang ra" + nút "Mang ra"; bấm → delivered_at; KDS bỏ món.
  const pos = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await dangNhap(pos);
  await pos.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
  await pos.getByPlaceholder(/Tìm bàn/).fill(tenBan);
  await pos.getByRole("button", { name: `Bàn ${tenBan}`, exact: false }).first().click();
  const mangRa = pos.getByRole("button", { name: `Mang ra ${mon1.name_snapshot}` }).first();
  await expect(mangRa).toBeVisible();
  await expect(pos.getByText("Xong – chờ mang ra").first()).toBeVisible();
  // Bếp đã làm xong → không còn nút "Hủy" trên dòng món đó (chủ dự án 03/10/2026).
  await expect(pos.locator("li").filter({ has: mangRa }).getByRole("button", { name: /^Hủy$/ })).toHaveCount(0);
  await pos.screenshot({ path: `${ANH}/06-pos-mang-ra.png` });
  await mangRa.click();
  await expect.poll(async () => (await db.from("order_items").select("delivered_at").eq("id", mon1.id).single()).data!.delivered_at, { timeout: 30_000 }).not.toBeNull();
  await expect(pos.getByText("Đã mang ra").first()).toBeVisible();
  await bep.reload({ waitUntil: "networkidle" });
  await expect(bep.locator(`li[data-done-order-id="${order.id}"]`)).toHaveCount(0);

  // "Trả lại": món 2 Xong rồi Trả lại → quay về Chờ chế biến, DB queued.
  const ve2 = bep.locator(`li[data-order-id="${order.id}"]`);
  await ve2.getByRole("button", { name: `Xong ${mon2.name_snapshot}` }).first().click();
  const xong = bep.locator(`li[data-done-order-id="${order.id}"]`);
  await expect(xong).toContainText(mon2.name_snapshot, { timeout: 30_000 });
  await xong.getByRole("button", { name: `Trả lại ${mon2.name_snapshot}` }).first().click();
  await expect(xong).toHaveCount(0, { timeout: 30_000 });
  const { data: b } = await db.from("order_items").select("status, delivered_at").eq("id", mon2.id).single();
  expect(b).toEqual({ status: "queued", delivered_at: null });
  await pos.close();
  await bep.close();
});
