import { test, expect, type Page, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getServiceMode, setServiceMode, getPrintMode, setPrintMode, type ServiceMode, type PrintMode } from "./tenant-mode";
import { donBan } from "./don-ban";

/**
 * P23 — Ghép bàn cho khách đoàn (TABLE-03..06, nghiệm thu 23-01 #1–#3, #6, #7, #9, #11).
 * Quán demo `pho-viet` (database dùng chung). Tránh B1, T1 — bàn chủ dự án hay thử tay.
 * Nhóm: V1 (bàn chính) + V2, B2, B3, B4 ⇒ hóa đơn "Bàn V1 +4".
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };
const BAN = ["V1", "V2", "B2", "B3", "B4"];
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let modeCu: ServiceMode = "table";
let printCu: PrintMode = "browser";
let tenantId = "";

test.use({ screenshot: "only-on-failure" });

test.beforeAll(async () => {
  modeCu = await getServiceMode(SLUG);
  printCu = await getPrintMode(SLUG);
  await setServiceMode(SLUG, "table");
  await setPrintMode(SLUG, "browser");
  tenantId = (await admin.from("tenants").select("id").eq("slug", SLUG).single()).data!.id as string;
  await donBan(tenantId, BAN);
});

test.afterAll(async () => {
  await donBan(tenantId, BAN);
  await setServiceMode(SLUG, modeCu);
  await setPrintMode(SLUG, printCu);
});

async function dangNhap(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.pass);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
}

/** Ảnh bằng chứng cho báo cáo P23 — chỉ khi chạy với CHUP_ANH=1. */
async function chup(page: Page, ten: string) {
  if (process.env.CHUP_ANH === "1") await page.screenshot({ path: `docs/30-KeHoach/P23/anh/${ten}.png` });
}

async function banDb() {
  const { data } = await admin.from("tables").select("name, status, group_session_id").eq("tenant_id", tenantId).in("name", BAN);
  return new Map((data ?? []).map((t) => [t.name as string, t]));
}

/** Không tràn ngang (cùng cách đo với pos-dien-thoai.spec). */
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

/** Tích các bàn trong hộp "Ghép bàn" rồi Xác nhận. */
async function ghep(page: Page, tich: string[], soBan: number) {
  const hop = page.getByRole("dialog", { name: "Ghép bàn" });
  await expect(hop).toBeVisible();
  await expect(hop.getByRole("heading", { name: "Ghép bàn với V1" })).toBeVisible();
  for (const b of tich) await hop.getByRole("checkbox", { name: new RegExp(`^${b}\\b`) }).click();
  await hop.getByRole("button", { name: `Xác nhận (${soBan} bàn)` }).click();
  await expect(hop).toBeHidden({ timeout: 15_000 });
}

test.describe("máy tính 1280×800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  const soDo = (page: Page) => page.locator("aside").filter({ has: page.getByRole("button", { name: /^Bán mang về/ }) }).first();
  const moSoDo = async (page: Page) => {
    const tab = page.getByRole("tab", { name: "Sơ đồ bàn" });
    if (await tab.isVisible()) await tab.click();
  };
  const chonBan = async (page: Page, ten: string) => {
    await moSoDo(page);
    await soDo(page).getByRole("button", { name: new RegExp(`^${ten}\\b`) }).click();
    await expect(page.getByRole("heading", { name: `Bàn ${ten}` })).toBeVisible();
  };
  const goiMon = async (page: Page, panel: Locator) => {
    // Máy ≥ 1024px: thực đơn ở tab "Thực đơn" (P27 ORDER-25) — có thể đang mở "Sơ đồ bàn" sau khi kiểm thẻ bàn.
    const tabMon = page.getByRole("tab", { name: /Thực đơn/ });
    if (await tabMon.isVisible()) await tabMon.click();
    await page.getByRole("button", { name: /^Thêm / }).first().click();
    const themVaoGio = page.getByRole("button", { name: /Thêm vào giỏ/ });
    const gui = panel.getByRole("button", { name: /^Xác nhận thêm \d+ món/ });
    await expect(themVaoGio.or(gui).first()).toBeVisible({ timeout: 10_000 });
    if (await themVaoGio.isVisible()) await themVaoGio.click();
    const truoc = await panel.getByText(/Đơn #\d+/).count();
    await gui.click();
    await expect(panel.getByText(/Đơn #\d+/)).toHaveCount(truoc + 1, { timeout: 15_000 });
  };

  test("ghép 5 bàn → gọi chung → B3 gọi lẻ → bỏ ghép B2 → một hóa đơn 'V1 +3' → thu đủ → mọi bàn trống", async ({ page, context }) => {
    await dangNhap(page);
    await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
    await expect(page.getByText("Chọn một bàn để xem đơn.")).toBeVisible({ timeout: 30_000 });
    const panel = page.locator("aside").filter({ has: page.getByRole("button", { name: "Bỏ chọn bàn" }) });

    // #1 Ghép từ bàn TRỐNG V1.
    await chonBan(page, "V1");
    await panel.getByRole("button", { name: "Ghép bàn" }).click();
    for (const b of ["V2", "B2", "B3", "B4"])
      await page.getByRole("dialog", { name: "Ghép bàn" }).getByRole("checkbox", { name: new RegExp(`^${b}\\b`) }).click();
    await chup(page, "23-01-hop-ghep-ban");
    await page.getByRole("button", { name: "Xác nhận (5 bàn)" }).click();
    await expect(page.getByRole("dialog", { name: "Ghép bàn" })).toBeHidden({ timeout: 15_000 });
    await expect(panel.getByText(/Nhóm V1 · 5 bàn · Mở lúc/)).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByRole("button", { name: "Nhóm 5 bàn" })).toBeVisible();
    await moSoDo(page);
    await expect(soDo(page).getByRole("button", { name: /^V2\b/ })).toContainText("Nhóm V1");
    await expect(soDo(page).getByRole("button", { name: /^V1\b/ })).toContainText("Nhóm V1 · 5 bàn");
    const db = await banDb();
    for (const b of BAN) expect(db.get(b)?.status, b).toBe("occupied");

    // #2 Gọi chung trên V1 → chip "Đơn cần in phiếu" ghi nhóm.
    await goiMon(page, panel);
    await expect(panel.getByText(/Đơn #\d+ · V1/)).toBeVisible();
    await page.getByRole("button", { name: /^Cần in \d+$/ }).click({ timeout: 15_000 });
    await expect(page.getByRole("dialog").getByRole("button", { name: /Bàn V1 \(nhóm V1\)/ }).first()).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");

    // Chạm bàn phụ V2 → cùng đơn, cùng tạm tính cả nhóm.
    const tamTinh = await panel.getByText("Tạm tính (cả nhóm)").locator("..").innerText();
    await chonBan(page, "V2");
    await expect(panel.getByText(/Đơn #\d+ · V1/)).toBeVisible();
    expect(await panel.getByText("Tạm tính (cả nhóm)").locator("..").innerText()).toBe(tamTinh);

    // #3 B3 gọi lẻ → đơn ghi B3, giỏ ghi "cho B3", màn bếp ghi "B3 (nhóm V1)".
    await chonBan(page, "B3");
    await page.getByRole("button", { name: /^Thêm / }).first().click();
    const themVaoGio = page.getByRole("button", { name: /Thêm vào giỏ/ });
    if (await themVaoGio.isVisible().catch(() => false)) await themVaoGio.click();
    await expect(panel.getByText(/Đang thêm cho B3 \(1\)/)).toBeVisible();
    const truoc = await panel.getByText(/Đơn #\d+/).count();
    await panel.getByRole("button", { name: /^Xác nhận thêm \d+ món/ }).click();
    await expect(panel.getByText(/Đơn #\d+/)).toHaveCount(truoc + 1, { timeout: 15_000 });
    await expect(panel.getByText(/Đơn #\d+ · B3/)).toBeVisible();
    await chup(page, "23-01-panel-nhom-b3");
    const bep = await context.newPage();
    await bep.goto(`/r/${SLUG}/kds`, { waitUntil: "networkidle" });
    await expect(bep.getByText(/B3 \(nhóm V1\)/).first()).toBeVisible({ timeout: 15_000 });
    await chup(bep, "23-01-man-bep");
    await bep.close();

    // Hộp ghép: B3 còn món chưa thu ⇒ khóa; bỏ ghép B2 (không có món) được.
    await panel.getByRole("button", { name: "Nhóm 5 bàn" }).click();
    const hop = page.getByRole("dialog", { name: "Ghép bàn" });
    await expect(hop.getByRole("checkbox", { name: /^B3\b/ })).toContainText("còn 1 món chưa thu");
    await expect(hop.getByRole("checkbox", { name: /^B3\b/ })).toBeDisabled();
    await expect(hop.getByRole("checkbox", { name: /^V1\b/ })).toContainText("Bàn chính");
    await chup(page, "23-01-hop-nhom-khoa-b3");
    await hop.getByRole("checkbox", { name: /^B2\b/ }).click();
    await hop.getByRole("button", { name: "Xác nhận (4 bàn)" }).click();
    await expect(hop).toBeHidden({ timeout: 15_000 });
    await moSoDo(page);
    await expect(soDo(page).getByRole("button", { name: /^B2\b/ })).toContainText("Trống", { timeout: 15_000 });
    await expect(soDo(page).getByRole("button", { name: /^B2\b/ })).not.toContainText("Nhóm");

    // #6 Tính tiền từ bàn phụ B4 → MỘT hóa đơn cho nhóm. B2 vừa bỏ ghép và không gọi món ⇒ còn V2, B3, B4: "V1 +3".
    await chonBan(page, "B4");
    await panel.getByRole("button", { name: /^(Tính tiền|Xem hóa đơn)/ }).click();
    const hopBill = page.getByRole("dialog", { name: "Hóa đơn" });
    await expect(hopBill.getByRole("heading", { name: /Hóa đơn · Bàn V1 \+3/ })).toBeVisible({ timeout: 15_000 });

    // Tách bill → Theo đơn: có nhãn bàn gọi.
    await hopBill.getByRole("button", { name: /Tách bill/ }).click();
    const hopTach = page.getByRole("dialog", { name: "Tách hóa đơn" });
    await expect(hopTach.getByText(/Đơn #\d+ · B3/)).toBeVisible();
    await chup(page, "23-01-tach-theo-don");
    await hopTach.getByRole("button", { name: "Đóng" }).click();
    await expect(hopTach).toBeHidden();

    // #9 Thu đủ ⇒ phiên đóng, mọi bàn trống, không còn trỏ nhóm.
    const thu = hopBill.getByRole("button", { name: /Thu tiền/ }).first();
    await thu.click();
    const hopThu = page.getByRole("dialog", { name: "Thu tiền" });
    await hopThu.getByRole("button", { name: /Chuyển khoản/ }).click();
    await hopThu.getByRole("button", { name: /Xác nhận thu/ }).click();
    await expect(hopThu.getByText("Đã thanh toán")).toBeVisible({ timeout: 15_000 });
    await hopThu.getByRole("button", { name: /^Xong$/ }).click();

    await expect
      .poll(async () => [...(await banDb()).values()].every((t) => t.status === "available" && !t.group_session_id), {
        timeout: 15_000,
      })
      .toBe(true);
  });
});

for (const [w, h] of [[390, 844], [360, 800]] as const)
test.describe(`điện thoại ${w}×${h}`, () => {
  test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });

  test("#11 hộp Ghép bàn vừa màn hình, nút ≥ 44px, ghép + bỏ ghép được", async ({ page }) => {
    await donBan(tenantId, BAN);
    await dangNhap(page);
    await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
    const nav = page.getByRole("navigation", { name: "Chuyển màn POS" });
    await expect(nav).toBeVisible({ timeout: 30_000 });
    await nav.getByRole("button", { name: /^Bàn/ }).click();
    await page.getByRole("button", { name: /^V1\b/ }).click();
    await nav.getByRole("button", { name: /^Đơn/ }).click();
    const nut = page.getByRole("button", { name: "Ghép bàn" });
    expect((await nut.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await nut.click();
    await khongTran(page, "hộp Ghép bàn");
    const hop = page.getByRole("dialog", { name: "Ghép bàn" });
    expect((await hop.getByRole("button", { name: /^Xác nhận/ }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await ghep(page, ["V2"], 2);
    await expect(page.getByText(/Nhóm V1 · 2 bàn · Mở lúc/)).toBeVisible({ timeout: 15_000 });
    await khongTran(page, "tab Đơn của nhóm");
    await chup(page, `23-01-dien-thoai-${w}`);

    // Bỏ ghép V2 (không có món) ⇒ bàn về trống.
    await page.getByRole("button", { name: "Nhóm 2 bàn" }).click();
    await page.getByRole("dialog", { name: "Ghép bàn" }).getByRole("checkbox", { name: /^V2\b/ }).click();
    await page.getByRole("button", { name: "Xác nhận (1 bàn)" }).click();
    await expect.poll(async () => (await banDb()).get("V2")?.group_session_id ?? null, { timeout: 15_000 }).toBeNull();
  });
});
