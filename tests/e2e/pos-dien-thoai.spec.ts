import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getServiceMode, setServiceMode, getPrintMode, setPrintMode, type ServiceMode, type PrintMode } from "./tenant-mode";
import { donBan } from "./don-ban";

const BAN_TEST = ["T1", "T2", "T3", "V1"];

/**
 * ORDER-20 — POS ĐẦY ĐỦ trên điện thoại (< 640 px): thanh tab dưới Bàn · Thực đơn · Đơn; mọi việc của máy
 * quầy làm được bằng một tay; hộp thoại vừa màn hình; không tràn ngang.
 *
 * Chạy trên quán demo `pho-viet` (database dùng chung). Mỗi luồng tự thu tiền để trả bàn về trống.
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let modeCu: ServiceMode = "table";
let printCu: PrintMode = "browser";
let tenantId = "";

test.beforeAll(async () => {
  modeCu = await getServiceMode(SLUG);
  printCu = await getPrintMode(SLUG);
  await setServiceMode(SLUG, "table");
  await setPrintMode(SLUG, "browser");
  tenantId = (await admin.from("tenants").select("id").eq("slug", SLUG).single()).data!.id as string;
  await donBan(tenantId, BAN_TEST);
});

test.afterAll(async () => {
  await donBan(tenantId, BAN_TEST);
  await setServiceMode(SLUG, modeCu);
  await setPrintMode(SLUG, printCu);
});

// Mặc định 390×844 (iPhone 12–15). Chạy thêm khổ nhỏ: POS_W=360 POS_H=800 npx playwright test …
const W = Number(process.env.POS_W ?? 390);
const H = Number(process.env.POS_H ?? 844);
test.use({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, screenshot: "only-on-failure" });

async function vaoPos(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.pass);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
  await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
  await expect(page.getByRole("navigation", { name: "Chuyển màn POS" })).toBeVisible({ timeout: 30_000 });
}

/**
 * Không tràn ngang: mọi nút/liên kết ĐANG HIỆN nằm trong khung nhìn — trừ phần tử trong vùng cuộn ngang có
 * chủ đích (dải tab khu vực). Màn POS `overflow-hidden` nên `scrollWidth` của trang không lộ tràn.
 */
async function khongTran(page: Page, noi: string) {
  const tran = await page.evaluate(() => {
    const w = window.innerWidth;
    const trongCuonNgang = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
      return false;
    };
    return [...document.querySelectorAll("button, a, input, [role=dialog]")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const s = getComputedStyle(el);
        if (s.visibility === "hidden" || s.display === "none") return false;
        return (r.right > w + 1 || r.left < -1) && !trongCuonNgang(el);
      })
      .map((el) => `${el.tagName} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}"`);
  });
  expect(tran, `tràn ngang ở ${noi}`).toEqual([]);
}

async function tab(page: Page, ten: "Bàn" | "Thực đơn" | "Đơn") {
  await page.getByRole("navigation", { name: "Chuyển màn POS" }).getByRole("button", { name: new RegExp(`^${ten}`) }).click();
}

async function themMon(page: Page, thuTu = 0) {
  await page.getByRole("button", { name: /^Thêm / }).nth(thuTu).click();
  const themVaoGio = page.getByRole("button", { name: /Thêm vào giỏ/ });
  // Món vào giỏ = thanh giỏ ở đáy thực đơn đổi sang "Giỏ hàng: N món" (N ≥ 1).
  const daVaoGio = page.getByRole("button", { name: /^Giỏ hàng: [1-9]/ });
  await expect(themVaoGio.or(daVaoGio).first()).toBeVisible({ timeout: 10_000 });
  if (await themVaoGio.isVisible()) {
    await khongTran(page, "hộp tùy chọn món");
    await themVaoGio.click();
  }
}

/** Mở ngăn "Giỏ hàng" từ thanh giỏ ở đáy tab Thực đơn. */
async function moGio(page: Page) {
  await tab(page, "Thực đơn");
  await page.getByRole("button", { name: /^Giỏ hàng: [1-9]/ }).click();
  const gio = page.getByRole("dialog", { name: /^Giỏ hàng/ });
  await expect(gio).toBeVisible();
  await khongTran(page, "ngăn Giỏ hàng");
  return gio;
}

/**
 * Gửi giỏ (từ ngăn Giỏ hàng) và CHỜ lượt gửi xong thật (số đơn tăng một) — bàn có thể còn đơn cũ nên
 * "có Đơn #" không đủ.
 */
async function guiMon(page: Page) {
  await tab(page, "Đơn");
  const truoc = await page.getByText(/Đơn #\d+/).count();
  const gio = await moGio(page);
  await gio.getByRole("button", { name: /^Xác nhận thêm \d+ món/ }).click();
  await expect(gio).toBeHidden({ timeout: 15_000 });
  await tab(page, "Đơn");
  await expect(page.getByText(/Đơn #\d+/)).toHaveCount(truoc + 1, { timeout: 15_000 });
}

async function thuTienChuyenKhoan(page: Page) {
  const thuTien = page.getByRole("button", { name: /Thu tiền/ }).first();
  await expect(thuTien).toBeVisible({ timeout: 15_000 });
  await thuTien.click();
  const hop = page.getByRole("dialog", { name: "Thu tiền" });
  await khongTran(page, "hộp Thu tiền");
  await hop.getByRole("button", { name: /Chuyển khoản/ }).click();
  await hop.getByRole("button", { name: /Xác nhận thu/ }).click();
  await expect(hop.getByText("Đã thanh toán")).toBeVisible({ timeout: 15_000 });
  await hop.getByRole("button", { name: /^Xong$/ }).click();
}

async function chonBan(page: Page, ban: string) {
  await tab(page, "Bàn");
  await khongTran(page, "tab Bàn");
  await page.getByRole("button", { name: new RegExp(`^${ban}\\b`) }).click();
  // Chọn bàn xong tự sang Thực đơn.
  await expect(page.getByLabel("Tìm món")).toBeVisible();
}

test("1–3: gọi món có ghi chú → bếp nhận → gọi thêm gom một bill → hủy món có lý do → thu tiền", async ({ page, context }) => {
  await vaoPos(page);
  await khongTran(page, "màn đầu");
  await chonBan(page, "T1");
  await khongTran(page, "tab Thực đơn");

  // (1) món có tùy chọn + ghi chú → gửi → bếp nhận.
  await themMon(page, 0);
  // Ghi chú món nằm trong ngăn Giỏ hàng (tab Đơn chỉ còn món đã gửi).
  const gio = await moGio(page);
  await gio.getByPlaceholder(/Ghi chú/).first().fill("ít cay");
  await gio.getByRole("button", { name: "Đóng giỏ hàng" }).click();
  await expect(gio).toBeHidden();
  await guiMon(page);
  const bep = await context.newPage();
  await bep.goto(`/r/${SLUG}/kds`, { waitUntil: "networkidle" });
  await expect(bep.getByText("T1").first()).toBeVisible({ timeout: 15_000 });
  await expect(bep.getByText(/ít cay/).first()).toBeVisible();
  await bep.close();

  // (2) gọi thêm lượt 2 → cùng phiên bàn (một bill) có thêm một lượt. Đếm TƯƠNG ĐỐI: bàn có thể còn phiên
  // dở từ lần chạy trước (database dùng chung).
  const donTruoc = await page.getByText(/Đơn #\d+/).count();
  await tab(page, "Thực đơn");
  await themMon(page, 1);
  await guiMon(page);
  await expect(page.getByText(/Đơn #\d+/)).toHaveCount(donTruoc + 1);

  // (3) hủy một món đã gửi, bắt buộc lý do (chủ quán không cần PIN). Đơn hủy hết món thì POS ẩn hẳn đơn đó
  // khỏi panel — không có chữ "Đã hủy" nào để tìm; kiểm bằng số đơn giảm đi một.
  const donTruocHuy = await page.getByText(/Đơn #\d+/).count();
  // Đơn mới nhất nằm trên cùng panel ⇒ nút "Hủy" đầu tiên là món vừa gửi.
  await page.getByRole("button", { name: /^Hủy$/ }).first().click();
  const hopHuy = page.getByRole("dialog").filter({ hasText: /Hủy món/ });
  await expect(hopHuy).toBeVisible();
  await khongTran(page, "hộp hủy món");
  await hopHuy.getByPlaceholder(/Khách đổi ý/).fill("Khách đổi ý");
  await hopHuy.getByRole("button", { name: /Xác nhận hủy/ }).click();
  await expect(page.getByText(/Đơn #\d+/)).toHaveCount(donTruocHuy - 1, { timeout: 15_000 });

  await page.getByRole("button", { name: /^(Tính tiền|Xem hóa đơn)/ }).click();
  await khongTran(page, "hộp Hóa đơn");
  await thuTienChuyenKhoan(page);
  // Thu xong + bấm Xong → về sơ đồ bàn, màn Hóa đơn đóng luôn (không phải bấm ✕ thêm).
  await expect(page.getByRole("dialog", { name: "Hóa đơn" })).toBeHidden();
});

test("6: bán mang về → tạo đơn → thu tiền & hoàn tất", async ({ page }) => {
  await vaoPos(page);
  await tab(page, "Bàn");
  await page.getByRole("button", { name: /^Khách không bàn/ }).click();
  await themMon(page, 0);
  // Giỏ đơn không bàn nằm ở thanh giỏ tab Thực đơn — tạo đơn ngay tại đó, không sang tab Đơn.
  await page.getByRole("button", { name: /^Giỏ hàng: [1-9]/ }).click();
  const gio = page.getByRole("dialog", { name: "Giỏ hàng" });
  await expect(gio).toBeVisible();
  await khongTran(page, "ngăn Giỏ hàng");
  await gio.getByRole("button", { name: /^Tạo đơn/ }).click();
  await expect(gio).toBeHidden({ timeout: 15_000 });
  await tab(page, "Đơn");
  await khongTran(page, "tab Đơn mang về");
  // Tab Đơn giờ chỉ còn danh sách đơn — khung "Đơn mới" không còn ở đây trên điện thoại.
  await expect(page.getByText("Đơn mới", { exact: true })).toBeHidden();
  const hoanTat = page.getByRole("button", { name: /Thu tiền & hoàn tất/ }).first();
  await expect(hoanTat).toBeVisible({ timeout: 15_000 });
  await hoanTat.click();
  const hop = page.getByRole("dialog", { name: "Thu tiền" });
  await khongTran(page, "hộp Thu tiền mang về");
  await hop.getByRole("button", { name: /Chuyển khoản/ }).click();
  await hop.getByRole("button", { name: /Xác nhận thu/ }).click();
  await expect(hop.getByText("Đã thanh toán")).toBeVisible({ timeout: 15_000 });
});

test("7: gọi nhân viên → chạm để xử lý", async ({ page }) => {
  const { data: ban } = await admin.from("tables").select("id, name").eq("tenant_id", tenantId).eq("name", "V1").single();
  const { data: goi } = await admin
    .from("staff_calls")
    .insert({ tenant_id: tenantId, table_id: ban!.id, table_name: ban!.name, note: "e2e-dien-thoai" })
    .select("id")
    .single();
  try {
    await vaoPos(page);
    // Điện thoại: băng "Bàn đang gọi" gọn thành nút "Bàn gọi N" → mở danh sách từ đáy màn.
    const nutGoi = page.getByRole("button", { name: /^Bàn gọi \d/ });
    await expect(nutGoi).toBeVisible();
    await khongTran(page, "hàng nút thông báo");
    await nutGoi.click();
    const cuaToi = page.getByRole("button", { name: /Bàn V1/ }).filter({ hasText: "e2e-dien-thoai" });
    await khongTran(page, "danh sách bàn đang gọi");
    await cuaToi.click();
    // Quán demo có thể còn lượt gọi khác (DB dùng chung) — chỉ chắc lượt CỦA TEST biến mất.
    await expect(cuaToi).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await admin.from("staff_calls").delete().eq("id", goi!.id);
  }
});

test("món thêm vào TRONG LÚC đang gửi không bị mất (lỗi tìm ra ở 12-05)", async ({ page }) => {
  await vaoPos(page);
  await chonBan(page, "T2");
  await themMon(page, 0);
  await tab(page, "Đơn");
  const truoc = await page.getByText(/Đơn #\d+/).count();
  const gio = await moGio(page);

  // Làm chậm ĐÚNG MỘT server action (lượt gửi này) 2 giây: nó chắc chắn còn đang chờ khi thêm món thứ hai.
  let daLamCham = false;
  await page.route("**/*", async (route) => {
    if (!daLamCham && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      daLamCham = true;
      await new Promise((r) => setTimeout(r, 2000));
    }
    await route.continue();
  });
  await gio.getByRole("button", { name: /^Xác nhận thêm 1 món/ }).click();
  // Đóng ngăn ngay khi lượt gửi còn đang chờ, rồi thêm món thứ hai.
  await gio.getByRole("button", { name: "Đóng giỏ hàng" }).click();
  await expect(gio).toBeHidden();
  await themMon(page, 1);

  // Lượt gửi đầu xong → đúng một đơn mới, và món thứ hai VẪN còn trong giỏ.
  await tab(page, "Đơn");
  await expect(page.getByText(/Đơn #\d+/)).toHaveCount(truoc + 1, { timeout: 15_000 });
  await tab(page, "Thực đơn");
  await expect(page.getByRole("button", { name: /^Giỏ hàng: / })).toHaveAccessibleName("Giỏ hàng: 1 món");
  await guiMon(page);
  await page.getByRole("button", { name: /^(Tính tiền|Xem hóa đơn)/ }).click();
  await thuTienChuyenKhoan(page);
});

/** Hộp Hóa đơn đang mở: thu tiền MỌI hóa đơn còn mở (sau tách bill có nhiều hóa đơn). */
async function thuHetHoaDon(page: Page) {
  const hopBill = page.getByRole("dialog", { name: "Hóa đơn" });
  for (let lan = 0; lan < 4; lan++) {
    // Thu hết → màn Hóa đơn tự đóng sau "Xong".
    if (lan > 0 && (await hopBill.isHidden())) return;
    const thu = hopBill.getByRole("button", { name: /Thu tiền/ });
    // Hộp tải lại sau gộp/tách (vòng xoay) — chờ tải xong rồi mới kết luận "đã thu hết".
    await expect(
      thu.or(hopBill.getByRole("button", { name: /In lại hóa đơn|·.*₫/ })).first()
    ).toBeVisible({ timeout: 15_000 });
    if (await thu.isVisible().catch(() => false)) {
      await thuTienChuyenKhoan(page);
      continue;
    }
    // Hóa đơn đang chọn đã thu — chuyển sang hóa đơn khác trên thanh chọn (nếu còn).
    const khac = hopBill.getByRole("button", { name: /·.*₫/ });
    const n = await khac.count();
    let doi = false;
    for (let i = 0; i < n; i++) {
      await khac.nth(i).click();
      if (await thu.isVisible().catch(() => false)) {
        doi = true;
        break;
      }
    }
    if (!doi) return;
  }
}

test("4: tách bill theo món + giảm 10% một hóa đơn → thu từng hóa đơn", async ({ page }) => {
  await vaoPos(page);
  await chonBan(page, "T3");
  await themMon(page, 0);
  await tab(page, "Thực đơn");
  await themMon(page, 1);
  await guiMon(page);

  await page.getByRole("button", { name: /^(Tính tiền|Xem hóa đơn)/ }).click();
  const hopBill = page.getByRole("dialog", { name: "Hóa đơn" });
  await expect(hopBill).toBeVisible();
  await hopBill.getByRole("button", { name: /Tách bill/ }).click();
  const hopTach = page.getByRole("dialog", { name: "Tách hóa đơn" });
  await khongTran(page, "hộp Tách hóa đơn");
  await hopTach.getByRole("button", { name: "Tăng số lượng" }).first().click();
  await hopTach.getByRole("button", { name: /^Tách theo món$/ }).click();
  await expect(hopBill.getByRole("button", { name: /·.*₫/ })).toHaveCount(2, { timeout: 15_000 });
  await khongTran(page, "hộp Hóa đơn sau tách");

  await hopBill.getByRole("button", { name: /Điều chỉnh/ }).click();
  const hopDc = page.getByRole("dialog", { name: "Điều chỉnh hóa đơn" });
  await khongTran(page, "hộp Điều chỉnh");
  await hopDc.getByRole("button", { name: /^%$/ }).click();
  await hopDc.getByLabel("Phần trăm giảm").fill("10");
  await hopDc.getByRole("button", { name: /^Lưu/ }).click();
  await expect(hopDc).toBeHidden({ timeout: 15_000 });
  await expect(hopBill.getByText(/Giảm giá/).first()).toBeVisible();

  await thuHetHoaDon(page);
});

test("5: gộp hai bàn → thu một lần", async ({ page }) => {
  await vaoPos(page);
  await chonBan(page, "T2");
  await themMon(page, 1);
  await guiMon(page);
  await chonBan(page, "V1");
  await themMon(page, 1);
  await guiMon(page);

  await page.getByRole("button", { name: /^(Tính tiền|Xem hóa đơn)/ }).click();
  const hopBill = page.getByRole("dialog", { name: "Hóa đơn" });
  await hopBill.getByRole("button", { name: /Gộp bàn/ }).click();
  const hopGop = page.getByRole("dialog", { name: "Gộp bàn" });
  await khongTran(page, "hộp Gộp bàn");
  await hopGop.getByRole("checkbox", { name: /T2/ }).check();
  await hopGop.getByRole("button", { name: /^Gộp bàn$/ }).click();
  await expect(hopGop).toBeHidden({ timeout: 15_000 });
  // Phiên bàn có thể còn hóa đơn đã thu từ lượt trước (DB dùng chung) — thu MỌI hóa đơn còn mở.
  await thuHetHoaDon(page);

  // Một lần thu đóng cả hai bàn.
  const { data: tb } = await admin.from("tables").select("id").eq("tenant_id", tenantId).eq("name", "T2").single();
  const { data: mo } = await admin.from("table_sessions").select("id").eq("table_id", tb!.id).eq("status", "open");
  expect(mo ?? [], "bàn T2 vẫn còn phiên mở sau khi thu hóa đơn gộp").toHaveLength(0);
});

test("7: duyệt đơn QR của khách + xác nhận đặt bàn", async ({ page, request }) => {
  // Đơn QR thật qua API khách (bàn V1) — chọn món không có tùy chọn bắt buộc.
  const { data: ban } = await admin.from("tables").select("id, qr_token").eq("tenant_id", tenantId).eq("name", "V1").single();
  // Dọn đơn QR còn CHỜ DUYỆT của bàn V1 do lượt chạy trước để lại — nếu không, ngăn kéo có nhiều đơn "Bàn V1"
  // và test duyệt nhầm đơn cũ.
  const { data: phienV1 } = await admin.from("table_sessions").select("id").eq("table_id", ban!.id);
  await admin
    .from("orders")
    .update({ status: "cancelled", cancel_reason: "e2e dọn đơn chờ cũ" })
    .in("table_session_id", (phienV1 ?? []).map((p) => p.id))
    .eq("status", "pending_confirm");
  // Chọn món KHÔNG có nhóm tùy chọn bắt buộc bằng truy vấn, gửi đúng MỘT request — thử lần lượt từng món
  // sẽ chạm giới hạn 10 đơn/phút/bàn (TENANT-07) và nhận 429.
  const { data: mon } = await admin.from("menu_items").select("id").eq("tenant_id", tenantId).eq("is_available", true);
  const { data: batBuoc } = await admin
    .from("menu_item_modifier_groups")
    .select("item_id, modifier_groups!inner(required, min_select)")
    .in("item_id", (mon ?? []).map((m) => m.id));
  const coBatBuoc = new Set(
    (batBuoc ?? [])
      .filter((g) => {
        const nhom = g.modifier_groups as unknown as { required: boolean; min_select: number };
        return nhom.required || nhom.min_select > 0;
      })
      .map((g) => g.item_id)
  );
  const monTron = (mon ?? []).find((m) => !coBatBuoc.has(m.id));
  expect(monTron, "quán demo không có món nào không bắt buộc tùy chọn").toBeTruthy();
  const r = await request.post(`/r/${SLUG}/api/order`, {
    data: { qrToken: ban!.qr_token, customerName: "Khách E2E", lines: [{ itemId: monTron!.id, qty: 1, optionIds: [] }] },
  });
  expect(r.status(), await r.text()).toBe(200);
  const donId = (await r.json()).orderId as string;

  const tenKhach = `E2E Đặt bàn ${Date.now() % 100000}`;
  const { data: datBan } = await admin
    .from("reservations")
    .insert({
      tenant_id: tenantId,
      customer_name: tenKhach,
      customer_phone: "0900000000",
      party_size: 2,
      reserved_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
    })
    .select("id")
    .single();

  try {
    await vaoPos(page);
    await page.getByRole("button", { name: /^Chờ duyệt \d/ }).click();
    const nganKeo = page.getByRole("dialog").filter({ hasText: /Chờ duyệt/ });
    // Ngăn kéo trượt từ phải vào — đo lúc đang trượt là báo động giả. Chờ nó đứng yên đã.
    await expect
      .poll(async () => {
        const b = await nganKeo.boundingBox();
        return b ? Math.round(b.x + b.width) : 99999;
      })
      .toBeLessThanOrEqual(W);
    await khongTran(page, "ngăn kéo Chờ duyệt");
    await nganKeo.getByRole("listitem").filter({ hasText: "Bàn V1" }).getByRole("button", { name: /^Duyệt$/ }).first().click();
    await expect
      .poll(async () => (await admin.from("orders").select("status").eq("id", donId).single()).data!.status, { timeout: 15_000 })
      .toBe("confirmed");

    await page.goto(`/r/${SLUG}/pos/reservations`, { waitUntil: "networkidle" });
    await khongTran(page, "trang Đặt bàn");
    const dong = page.getByRole("listitem").filter({ hasText: tenKhach });
    await dong.getByRole("button", { name: /^Xác nhận$/ }).click();
    await expect(dong.getByText("Đã xác nhận")).toBeVisible({ timeout: 15_000 });
  } finally {
    await admin.from("reservations").delete().eq("id", datBan!.id);
  }
});

test("8: trang Đơn online vừa màn hình điện thoại", async ({ page }) => {
  await vaoPos(page);
  await page.goto(`/r/${SLUG}/pos/online`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Đơn online" })).toBeVisible({ timeout: 30_000 });
  await khongTran(page, "trang Đơn online");
  await page.getByRole("link", { name: /Về màn POS/ }).click();
  await expect(page.getByRole("navigation", { name: "Chuyển màn POS" })).toBeVisible({ timeout: 30_000 });
});
