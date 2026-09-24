import { test, expect, type Page } from "@playwright/test";
import { getServiceMode, setServiceMode, type ServiceMode } from "./tenant-mode";

/**
 * E2E P3 — chuỗi giá trị cốt lõi: khách gọi món QR → POS duyệt → KDS làm món → phục vụ →
 * in phiếu bếp. Kiểm cả REALTIME không-reload (KDS nhận vé, khách đổi trạng thái).
 * Chạy trên dev server (E2E_BASE_URL, mặc định :3005). Dữ liệu order reset trước khi chạy.
 */
const SLUG = "pho-viet";
const TOKEN = "b98186ed87d27ff86d"; // Bàn B1
const OWNER_EMAIL = "ownerA@pho-viet.test";
const OWNER_PASS = "DemoPass123!";
const GUEST_NAME = "Khách E2E";
const SHOTS = "test-results/shots"; // trong repo, đã gitignore

/**
 * Đăng nhập trạm POS/KDS (QD-009): email + PIN/mật khẩu, ô mật khẩu tên là `secret`
 * (không phải `password` — đó là form owner ở /admin/login).
 */
async function loginStaff(page: Page, surface: "pos" | "kds") {
  await page.goto(`/r/${SLUG}/${surface}`);
  if (page.url().includes("/login")) {
    await page.locator('input[name="email"]').fill(OWNER_EMAIL);
    await page.locator('input[name="secret"]').fill(OWNER_PASS);
    await page.getByRole("button", { name: /Đăng nhập/ }).click();
    // Chờ ra khỏi /login (server action redirect); timeout rộng vì dev server có thể đang
    // compile lần đầu bề mặt POS/KDS.
    await page.waitForFunction(() => !location.pathname.includes("/login"), null, {
      timeout: 60000,
    });
  }
}

/**
 * Modal bắt buộc nhập tên khi vào bàn (ORDER-10) — điền để đi tiếp.
 * Modal chỉ mount sau hydrate + đọc sessionStorage, nên PHẢI `waitFor` (isVisible() không
 * retry và bỏ qua tham số timeout → sẽ trả false rồi để gate chặn mọi click sau đó).
 */
async function passGuestGate(page: Page) {
  const nameInput = page.locator("#guest-name");
  try {
    await nameInput.waitFor({ state: "visible", timeout: 10000 });
  } catch {
    return; // đã có thông tin trong phiên → không hỏi lại
  }
  await nameInput.fill(GUEST_NAME);
  await page.getByRole("button", { name: /^Bắt đầu$/ }).click();
  await expect(nameInput).toBeHidden({ timeout: 10000 });
}

/** Món đầu tiên còn bán được (bỏ qua món đang tắt "Hết"), để test không phụ thuộc seed. */
async function firstOrderableItem(page: Page) {
  const cards = page.locator("main section button:not([disabled])");
  await cards.first().waitFor({ timeout: 20000 });
  return cards.first();
}

/**
 * Hai bộ test này thao tác trên SƠ ĐỒ BÀN ở POS — sơ đồ chỉ render khi quán ở chế độ bàn.
 * Tự dựng điều kiện rồi trả lại nguyên trạng, thay vì phụ thuộc cài đặt sẵn có của tenant dùng chung.
 */
let modeCu: ServiceMode = "table";

test.beforeAll(async () => {
  modeCu = await getServiceMode(SLUG);
  await setServiceMode(SLUG, "table");
});

test.afterAll(async () => {
  await setServiceMode(SLUG, modeCu);
});

test("P3 chuỗi order đầu-cuối + realtime", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const cust = await ctx.newPage();
  const pos = await ctx.newPage();
  const kds = await ctx.newPage();
  let orderId = "";
  let itemName = ""; // món thật lấy từ menu (không hardcode: seed có thể tắt món)
  const kdsB1 = kds.getByText("Bàn B1");
  let kdsB1Before = 0; // số vé B1 đang có trước khi duyệt (DB dev không nhất thiết sạch)
  /** Vé KDS CỦA ĐƠN NÀY — neo theo data-order-id nên vé cũ trong DB không gây nhiễu. */
  const kdsTicket = () => kds.locator(`li[data-order-id="${orderId}"]`);

  await test.step("1. Khách gọi món QR → pending_confirm", async () => {
    await cust.goto(`/r/${SLUG}/menu?t=${TOKEN}`);
    await passGuestGate(cust);
    await expect(cust.getByText("Bàn B1")).toBeVisible();
    // Chạm món → nếu món có nhóm tùy chọn thì mở sheet, không thì thêm thẳng vào giỏ
    const item = await firstOrderableItem(cust);
    itemName = ((await item.getAttribute("aria-label")) ?? "").trim();
    expect(itemName).not.toBe("");
    const addBtn = cust.getByRole("button", { name: /Thêm vào giỏ/ });
    const cartBtn = cust.getByRole("button", { name: /Xem giỏ/ });
    await expect(async () => {
      await item.click();
      await expect(addBtn.or(cartBtn).first()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });
    if (await addBtn.isVisible().catch(() => false)) await addBtn.click();
    // Giỏ → gửi. Ăn tại bàn KHÔNG có ô nhập tên/SĐT nữa (đã lấy ở modal khi vào bàn),
    // chỉ hiện lại tên kèm nút "Sửa" (ORDER-10).
    await cartBtn.click();
    await expect(cust.locator("#cust-name")).toHaveCount(0);
    await expect(cust.getByText(GUEST_NAME)).toBeVisible();
    await expect(cust.getByRole("button", { name: "Sửa" })).toBeVisible();
    await cust.getByRole("button", { name: "Gửi order" }).click();
    await cust.waitForURL(/\/order\//, { timeout: 20000 });
    orderId = cust.url().split("/order/")[1].split("?")[0];
    await expect(cust.getByRole("heading", { name: "Chờ xác nhận" })).toBeVisible();
    await cust.screenshot({ path: `${SHOTS}/01-khach-cho-xac-nhan.png`, fullPage: true });
  });

  await test.step("2. Đăng nhập POS + KDS (owner)", async () => {
    await loginStaff(pos, "pos");
    await loginStaff(kds, "kds");
    await expect(pos.getByRole("button", { name: /chờ duyệt/i })).toBeVisible();
  });

  await test.step("3. POS duyệt → KDS nhận vé REALTIME (không reload)", async () => {
    await pos.getByRole("button", { name: /chờ duyệt/i }).click();
    // Neo vào ĐÚNG đơn vừa gửi: drawer có thể đang liệt kê nhiều đơn chờ khác.
    const pendingRow = pos.locator(`li[data-order-id="${orderId}"]`);
    await expect(pendingRow).toBeVisible({ timeout: 20000 });
    await expect(pendingRow.getByText("Bàn B1")).toBeVisible();
    await expect(pendingRow.getByText(GUEST_NAME)).toBeVisible();
    // Chốt hiện trạng KDS TRƯỚC khi duyệt: DB dev có thể còn vé cũ chưa phục vụ → mọi
    // assertion sau đây phải neo vào vé MỚI, không giả định KDS sạch.
    kdsB1Before = await kdsB1.count();
    const t0 = Date.now();
    await pendingRow.getByRole("button", { name: "Duyệt", exact: true }).click();
    // KDS: vé CỦA ĐƠN NÀY xuất hiện KHÔNG reload
    await expect(kdsTicket()).toHaveCount(1, { timeout: 20000 });
    console.log(`  [realtime] KDS nhận vé sau ~${Date.now() - t0}ms (không reload)`);
    await expect(kdsB1).toHaveCount(kdsB1Before + 1);
    await expect(kdsTicket().getByText("Bàn B1")).toBeVisible();
    await expect(kdsTicket().getByText(/^#\d+$/)).toBeVisible(); // có số thứ tự bếp
    await kds.screenshot({ path: `${SHOTS}/02-kds-nhan-ve.png`, fullPage: true });
  });

  await test.step("4. Khách thấy 'Đã xác nhận' REALTIME", async () => {
    // Stepper khách dine-in CHỈ 2 bước, dừng ở "Đã xác nhận" (QĐ 22/07; kế hoạch P3 §5 C2).
    // "Đang chuẩn bị" là nhãn của đơn ONLINE (ONLINE_STEP_LABEL) — không dùng ở đây.
    const t0 = Date.now();
    await expect(cust.getByRole("heading", { name: "Đã xác nhận" })).toBeVisible({ timeout: 20000 });
    console.log(`  [realtime] Khách đổi 'Đã xác nhận' sau ~${Date.now() - t0}ms (không reload)`);
  });

  await test.step("5. KDS chỉ để XEM (không nút thao tác)", async () => {
    await expect(kdsTicket()).toBeVisible();
    await expect(kdsTicket().getByText(itemName)).toBeVisible();
    await expect(kds.getByRole("button", { name: "Bắt đầu" })).toHaveCount(0);
    await expect(kds.getByRole("button", { name: "Xong", exact: true })).toHaveCount(0);
    await kds.screenshot({ path: `${SHOTS}/02-kds-readonly.png`, fullPage: true });
  });

  await test.step("6. POS: đơn hiện trong phiên bàn; khách vẫn dừng ở 'Đã xác nhận'", async () => {
    await pos.goto(`/r/${SLUG}/pos`);
    // Khoanh vào SƠ ĐỒ BÀN (aside): banner "Đơn khách chờ duyệt" cũng có chip mang tên bàn,
    // nếu không khoanh sẽ bấm trúng chip banner và mở drawer thay vì chọn bàn.
    await pos.locator("aside").getByRole("button", { name: /^B1/ }).first().click();
    await expect(pos.getByText(/Đơn #/).first()).toBeVisible({ timeout: 20000 });
    // Khách dine-in KHÔNG có bước "Đã phục vụ" (stepper 2 bước) — vẫn dừng ở "Đã xác nhận"
    await expect(cust.getByRole("heading", { name: "Đã xác nhận" })).toBeVisible();
    await pos.screenshot({ path: `${SHOTS}/03-pos-phien-ban.png`, fullPage: true });
  });

  await test.step("7. In phiếu bếp render đúng nội dung (tab mới)", async () => {
    const printPage = await ctx.newPage(); // như window.open thực tế
    await printPage.goto(`/r/${SLUG}/print/kitchen/${orderId}?w=80`);
    await expect(printPage.getByText(/PHIẾU BẾP/)).toBeVisible();
    await expect(printPage.getByText(/ĐƠN #\d+/)).toBeVisible(); // số thứ tự bếp trên phiếu
    await expect(printPage.getByText(/Bàn:/)).toBeVisible();
    await expect(printPage.getByText(itemName)).toBeVisible();
    await printPage.screenshot({ path: `${SHOTS}/04-phieu-bep-80mm.png`, fullPage: true });
  });

  await ctx.close();
});

/**
 * LỖI THỜI SO VỚI P4 — cần chốt lại luồng trước khi viết.
 * Kế hoạch P3 §5 C5/C6 và §6 D3/D4 mô tả nhân viên bấm "Đã phục vụ" từng món trên POS rồi
 * "Đóng phiên". Nút đó KHÔNG còn: P4 (dòng tiền) đổi nghĩa `order_items.status = 'served'`
 * thành **"đã thu"** do `payBill` đánh dấu, và phiên bàn TỰ đóng khi thu hết
 * (xem components/pos/OrderPanel.tsx — nhãn 'Đã thu', `canClose`).
 * → Muốn kiểm "vé tự ẩn khỏi KDS" (ORDER-04/D4) thì phải đi qua luồng thanh toán P4
 *   (PaymentDialog), không phải bấm phục vụ. Chưa viết vì cần chốt: e2e P3 có bao luôn
 *   thanh toán, hay tách sang spec P4 riêng?
 */
test.fixme("P3 phục vụ + đóng phiên (chờ chốt: đã chuyển sang luồng thanh toán P4)", async () => {});
