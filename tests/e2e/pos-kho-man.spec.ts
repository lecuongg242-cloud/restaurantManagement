import { test, expect, type Page, type Locator } from "@playwright/test";
import { getServiceMode, setServiceMode, getPrintMode, setPrintMode, type ServiceMode, type PrintMode } from "./tenant-mode";

/**
 * ORDER-19 — POS dùng được trên iPad / tablet DỌC (600–1023 px): chọn bàn qua ngăn kéo, gọi món, xem
 * bill, thu tiền — không tràn ngang, nút ≥ 44 px. Khổ ≥ 1024 được chặn riêng bằng ảnh ở
 * `pos-kho-lon.spec.ts`.
 *
 * Màn POS có `overflow-hidden` ⇒ `scrollWidth` của trang không bao giờ lộ phần tràn. Đo thẳng: mép phải
 * của mọi nút thanh công cụ và của hộp thoại phải nằm trong khung nhìn.
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };
let modeCu: ServiceMode = "table";
let printCu: PrintMode = "browser";

test.beforeAll(async () => {
  modeCu = await getServiceMode(SLUG);
  printCu = await getPrintMode(SLUG);
  await setServiceMode(SLUG, "table");
  await setPrintMode(SLUG, "browser");
});

test.afterAll(async () => {
  await setServiceMode(SLUG, modeCu);
  await setPrintMode(SLUG, printCu);
});

async function vaoPos(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.pass);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
  await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
  await expect(page.getByLabel("Tìm món")).toBeVisible({ timeout: 30_000 });
}

async function trongKhung(page: Page, loc: Locator, ten: string) {
  const box = await loc.boundingBox();
  const w = page.viewportSize()!.width;
  expect(box, `${ten} không hiện`).not.toBeNull();
  expect(box!.x, `${ten} tràn trái`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${ten} tràn phải (${box!.x + box!.width} > ${w})`).toBeLessThanOrEqual(w + 0.5);
}

async function nutDuLon(loc: Locator, ten: string) {
  const box = await loc.boundingBox();
  expect(box!.height, `${ten} thấp hơn 44px`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `${ten} hẹp hơn 44px`).toBeGreaterThanOrEqual(44);
}

const KHO = [
  { w: 768, h: 1024, ban: "T1" },
  { w: 820, h: 1180, ban: "T2" },
  { w: 800, h: 1280, ban: "T3" },
];

for (const { w, h, ban } of KHO) {
  test.describe(`${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test(`gọi món → bill → thu tiền (bàn ${ban})`, async ({ page }) => {
      await vaoPos(page);

      // Cột sơ đồ bàn cố định ẩn; thanh công cụ nằm trọn trong khung, nút đủ lớn.
      const chonBan = page.getByRole("button", { name: /Chọn bàn/ });
      const choDuyet = page.getByRole("button", { name: /Order chờ duyệt/ });
      for (const [loc, ten] of [
        [chonBan, "nút Chọn bàn"],
        [page.getByRole("link", { name: "Đặt bàn" }), "Đặt bàn"],
        [page.getByRole("link", { name: "Đơn online" }), "Đơn online"],
        [choDuyet, "Chờ duyệt"],
      ] as const) {
        await trongKhung(page, loc, ten);
        await nutDuLon(loc, ten);
      }
      const thucDon = await page.getByLabel("Tìm món").boundingBox();
      expect(thucDon!.width, "cột thực đơn quá hẹp").toBeGreaterThanOrEqual(200);

      // Chọn bàn qua ngăn kéo → ngăn kéo tự đóng, nút đổi tên bàn.
      await chonBan.click();
      const nganKeo = page.getByRole("dialog", { name: "Sơ đồ bàn" });
      await expect(nganKeo).toBeVisible();
      await nganKeo.getByRole("button", { name: new RegExp(`^${ban}\\b`) }).click();
      await expect(nganKeo).toBeHidden();
      // Khớp CHÍNH XÁC nút chọn bàn — băng "Đơn cần in phiếu" có thể có chip "Bàn T2 #…".
      await expect(page.getByRole("button", { name: new RegExp(`^Bàn ${ban}$`) })).toBeVisible();

      // Gọi một món.
      await page.getByRole("button", { name: /^Thêm / }).first().click();
      // Món có tùy chọn bắt buộc mở hộp chọn (đang hiện dần) — CHỜ một trong hai rồi mới xử lý.
      const themVaoGio = page.getByRole("button", { name: /Thêm vào giỏ/ });
      const xacNhan = page.getByRole("button", { name: /^Xác nhận thêm \d+ món/ });
      await expect(themVaoGio.or(xacNhan)).toBeVisible({ timeout: 10_000 });
      if (await themVaoGio.isVisible()) {
        await trongKhung(page, themVaoGio, "Thêm vào giỏ");
        await expect(themVaoGio).toBeEnabled();
        await themVaoGio.click();
      }
      await trongKhung(page, xacNhan, "Xác nhận thêm");
      await xacNhan.click();
      await expect(page.getByText(/Đơn #\d+/).first()).toBeVisible({ timeout: 15_000 });

      // Bill → thu tiền.
      await page.getByRole("button", { name: /^(Tính tiền|Xem hóa đơn)/ }).click();
      const thuTien = page.getByRole("button", { name: /Thu tiền/ }).first();
      await expect(thuTien).toBeVisible({ timeout: 15_000 });
      await trongKhung(page, thuTien, "Thu tiền");
      await thuTien.click();
      const hopThu = page.getByRole("dialog", { name: "Thu tiền" });
      await trongKhung(page, hopThu, "hộp Thu tiền");
      await hopThu.getByRole("button", { name: /Chuyển khoản/ }).click();
      await hopThu.getByRole("button", { name: /Xác nhận thu/ }).click();
      await expect(hopThu.getByText("Đã thanh toán")).toBeVisible({ timeout: 15_000 });
      await page.screenshot({ path: `test-results/pos-tablet-${w}x${h}.png` });
    });
  });
}

test.describe("máy ngủ dậy / có mạng lại", () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test("realtime bị cắt + có thay đổi → sự kiện 'online': POS tự hiện thay đổi trong ≤ 5 giây", async ({ page }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const { data: t } = await admin.from("tenants").select("id").eq("slug", SLUG).single();
    const { data: ban } = await admin.from("tables").select("id, name").eq("tenant_id", t!.id).eq("name", "V1").single();

    // Cắt HẲN realtime: WebSocket được "nối" nhưng không chạm server ⇒ không sự kiện nào tới. Đây là
    // tình trạng của máy vừa ngủ dậy. (setOffline của trình duyệt KHÔNG cắt WebSocket đang mở — bản đầu
    // của test này xanh cả khi tắt hook, tức là không chứng minh gì.)
    await page.routeWebSocket(/\/realtime\//, () => {});
    await vaoPos(page);
    await expect(page.getByText(/Bàn đang gọi/)).toHaveCount(0);

    const { data: goi } = await admin
      .from("staff_calls")
      .insert({ tenant_id: t!.id, table_id: ban!.id, table_name: ban!.name, note: "e2e-thuc-day" })
      .select("id")
      .single();
    try {
      // Đối chứng: realtime đã bị cắt thật — thay đổi KHÔNG tự tới.
      await page.waitForTimeout(2_000);
      await expect(page.getByText(/Bàn đang gọi/)).toHaveCount(0);

      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(page.getByText(/Bàn đang gọi/)).toBeVisible({ timeout: 5_000 });
    } finally {
      await admin.from("staff_calls").delete().eq("id", goi!.id);
    }
  });
});
