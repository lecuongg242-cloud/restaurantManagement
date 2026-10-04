import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/**
 * P31 — màn Nhân viên làm lại theo Sapo / KiotViet / CUKCUK (chủ dự án chốt 04/10/2026): bảng gọn, "+ Thêm nhân viên" mở
 * hộp thoại (Bỏ qua · Lưu & thêm mới · Lưu), ⋯ → Sửa thông tin · Đổi PIN · Tắt · Xóa. Quán demo `pho-viet`; tài khoản thử
 * mang TAG trong email và được dọn ở cuối.
 */
config({ path: ".env.local" });

const SLUG = "pho-viet";
const TAG = `e2e${Date.now().toString(36).slice(-5)}`;
const ANH = "docs/30-KeHoach/P31/anh";
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

async function thanhVien(email: string) {
  const { data } = await db.from("memberships").select("id, user_id, display_name, role, active, pin_hash").eq("email", email);
  return data ?? [];
}

test.afterAll(async () => {
  const { data } = await db.from("memberships").select("id, user_id").like("email", `%${TAG}%`);
  for (const m of data ?? []) {
    await db.from("memberships").delete().eq("id", m.id);
    if (m.user_id) await db.auth.admin.deleteUser(m.user_id);
  }
});

test("AUTH-07/08: bảng nhân viên; thêm bằng hộp thoại; trùng email; sửa tên + vai trò (cả PIN ↔ Quản lý); đổi PIN rồi đăng nhập POS; tắt; xóa", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/admin/staff`, { waitUntil: "networkidle" });

  // Bảng gọn, không còn form luôn mở / ô PIN trên dòng.
  const bang = page.locator("[data-bang-nhan-vien]");
  await expect(bang.locator("thead th")).toHaveText(["Nhân viên", "Vai trò", "Đăng nhập bằng", "Trạng thái", "Thao tác"]);
  await expect(page.locator('input[name="secret"]')).toHaveCount(0);
  await expect(page.getByText("QD-009")).toHaveCount(0);

  // Thêm "Lan" (Thu ngân, PIN 1234) bằng "Lưu & thêm mới" → hộp thoại giữ, ô trống lại.
  const email = `lan-${TAG}@e2e.test`;
  await page.getByRole("button", { name: "+ Thêm nhân viên" }).click();
  const them = page.getByRole("dialog", { name: "Thêm nhân viên" });
  await them.locator('input[name="display_name"]').fill(`Lan ${TAG}`);
  await them.locator('input[name="email"]').fill(email);
  await expect(them.getByRole("radio", { name: /Thu ngân/ })).toBeChecked();
  await them.locator('input[name="secret"]').fill("1234");
  await page.screenshot({ path: `${ANH}/2-hop-thoai-them-1366.png` });
  await them.getByRole("button", { name: "Lưu & thêm mới" }).click();
  await expect(them.locator('input[name="display_name"]')).toHaveValue("", { timeout: 30_000 });
  await expect(them).toBeVisible();
  expect(await thanhVien(email)).toMatchObject([{ display_name: `Lan ${TAG}`, role: "cashier", active: true }]);

  // Trùng email → hộp thoại giữ, câu lỗi trong hộp thoại.
  await them.locator('input[name="display_name"]').fill("Trùng");
  await them.locator('input[name="email"]').fill(email);
  await them.locator('input[name="secret"]').fill("1111");
  await them.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(them.getByRole("alert")).toHaveText("Email đã được dùng.", { timeout: 30_000 });
  await them.getByRole("button", { name: "Bỏ qua" }).click();
  await expect(them).toBeHidden();

  // Tìm không dấu.
  await page.getByPlaceholder("Tìm theo tên, email").fill(`lan ${TAG}`);
  await expect(bang.locator("tbody tr")).toHaveCount(1);
  await expect(bang).toContainText(email);
  await page.screenshot({ path: `${ANH}/1-bang-nhan-vien-1366.png` });

  // Bấm dòng → Sửa: đổi tên + vai trò Phục vụ (cùng nhóm PIN → không hỏi PIN).
  await bang.getByText(`Lan ${TAG}`).click();
  const sua = page.getByRole("dialog", { name: "Sửa nhân viên" });
  await expect(sua).toContainText("Email là tên đăng nhập, không đổi được.");
  await sua.locator('input[name="display_name"]').fill(`Lan Anh ${TAG}`);
  await sua.getByRole("radio", { name: /Phục vụ/ }).check();
  await expect(sua.locator('input[name="secret"]')).toHaveCount(0);
  await sua.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(sua).toBeHidden({ timeout: 30_000 });
  expect(await thanhVien(email)).toMatchObject([{ display_name: `Lan Anh ${TAG}`, role: "waiter" }]);

  // Phục vụ → Quản lý: bắt mật khẩu mới; PIN bị bỏ.
  // Toast góc phải tự ẩn sau 4 giây — chờ nó đi rồi mới bấm ⋯ (dòng đầu bảng nằm ngay dưới toast).
  const menu = async () => {
    await expect(page.locator('[aria-live="polite"] [role="status"]')).toHaveCount(0, { timeout: 10_000 });
    return bang.getByRole("button", { name: `Thao tác với Lan Anh ${TAG}` });
  };
  await page.getByPlaceholder("Tìm theo tên, email").fill(TAG);
  await (await menu()).click();
  await page.getByRole("menuitem", { name: "Sửa thông tin" }).click();
  await sua.getByRole("radio", { name: /Quản lý/ }).check();
  await expect(sua.getByText("Mật khẩu mới để vào khu quản trị *")).toBeVisible();
  await sua.locator('input[name="secret"]').fill("Matkhau123!");
  await page.screenshot({ path: `${ANH}/3-sua-sang-quan-ly-1366.png` });
  await sua.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(sua).toBeHidden({ timeout: 30_000 });
  expect(await thanhVien(email)).toMatchObject([{ role: "manager", pin_hash: null }]);
  await expect(bang.locator("tbody tr").first()).toContainText("Mật khẩu");

  // Quản lý → Thu ngân: bắt PIN mới.
  await (await menu()).click();
  await page.getByRole("menuitem", { name: "Sửa thông tin" }).click();
  await sua.getByRole("radio", { name: /Thu ngân/ }).check();
  await sua.locator('input[name="secret"]').fill("5678");
  await sua.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(sua).toBeHidden({ timeout: 30_000 });
  const [tn] = await thanhVien(email);
  expect(tn.role).toBe("cashier");
  expect(tn.pin_hash).not.toBeNull();

  // ⋯ → Đổi PIN 4321 → đăng nhập POS bằng PIN mới.
  await (await menu()).click();
  await page.getByRole("menuitem", { name: "Đổi PIN" }).click();
  const doi = page.getByRole("dialog", { name: "Đổi PIN" });
  await doi.locator('input[name="secret"]').fill("4321");
  await doi.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(doi).toBeHidden({ timeout: 30_000 });
  const pos = await browser.newPage();
  await pos.goto(`/r/${SLUG}/pos/login`);
  await pos.fill('input[name="email"]', email);
  await pos.fill('input[name="secret"]', "4321");
  await Promise.all([pos.waitForURL(new RegExp(`/r/${SLUG}/pos$`), { timeout: 90_000 }), pos.click('button[type="submit"]')]);
  await pos.close();

  // ⋯ → Tắt tài khoản → sang lọc "Đã tắt".
  await (await menu()).click();
  await page.getByRole("menuitem", { name: "Tắt tài khoản" }).click();
  await expect.poll(async () => (await thanhVien(email))[0]?.active, { timeout: 30_000 }).toBe(false);
  await page.getByRole("button", { name: /Đã tắt/ }).click();
  await expect(bang).toContainText("Đã tắt");

  // ⋯ → Xóa (hỏi lại).
  page.once("dialog", (d) => d.accept());
  await (await menu()).click();
  await page.getByRole("menuitem", { name: "Xóa" }).click();
  await expect.poll(async () => (await thanhVien(email)).length, { timeout: 30_000 }).toBe(0);

  // Điện thoại 390: danh sách gọn, không tràn ngang.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/r/${SLUG}/admin/staff`, { waitUntil: "networkidle" });
  await expect(bang).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `${ANH}/4-dien-thoai-390.png`, fullPage: true });
});
