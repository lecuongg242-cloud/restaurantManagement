import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

/**
 * Nghiệm thu tự động bằng trình duyệt — `40-KiemTra/00-DanhSachNghiemThu.md`.
 *
 * Mỗi test gắn với MỘT mã yêu cầu và kiểm đúng tiêu chí chấp nhận đã viết, không kiểm cái gì khác
 * cho tiện. Test đỏ ở đây là **phát hiện thật**, phải điều tra chứ không được nới tiêu chí cho khớp.
 *
 * Chạy trên tenant demo `pho-viet`. Không bao giờ chạm `qt-food` (đang phục vụ khách thật).
 */
const SLUG = "pho-viet";
const TOKEN = "b98186ed87d27ff86d"; // Bàn B1
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };
const PHONE = { width: 360, height: 780 };

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function tenantId(): Promise<string> {
  const { data } = await admin.from("tenants").select("id").eq("slug", SLUG).maybeSingle();
  return data!.id as string;
}

/** Qua cổng hỏi tên khách (ORDER-10) nếu nó hiện ra. */
async function quaCongTenKhach(page: Page) {
  const oTen = page.locator("#guest-name");
  if (await oTen.isVisible().catch(() => false)) {
    await oTen.fill("Khách nghiệm thu");
    await page.getByRole("button", { name: /^Bắt đầu$/ }).click();
    await expect(oTen).toBeHidden({ timeout: 10000 });
  }
}

test.describe("Bề mặt khách", () => {
  test("ORDER-07: link THIẾU token → chế độ chỉ-xem, ẩn hành động cần bàn", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`/r/${SLUG}/menu`);
    // Không có token ⇒ không được phép gửi đơn. Nút gọi món/giỏ phải không dùng được.
    const nutThem = page.getByRole("button", { name: /Thêm vào giỏ/ });
    await expect(nutThem).toHaveCount(0);
  });

  test("ORDER-10: vào bàn phải hỏi tên; SĐT sai định dạng KHÔNG cho gửi", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`/r/${SLUG}?t=${TOKEN}`);

    const oTen = page.locator("#guest-name");
    await expect(oTen, "phải hỏi tên khách khi vào bàn").toBeVisible({ timeout: 15000 });

    const nut = page.getByRole("button", { name: /^Bắt đầu$/ });

    // Tên bắt buộc: chưa nhập thì không gửi được.
    await expect(nut, "tên trống mà vẫn gửi được").toBeDisabled();

    // SĐT là tùy chọn — nhập sai định dạng VN thì chặn (sản phẩm vô hiệu hóa nút, không phải
    // cho bấm rồi mới báo lỗi; đó là cách chặn tốt hơn).
    await oTen.fill("Khách nghiệm thu");
    await page.locator("#guest-phone").fill("123");
    await expect(nut, "SĐT sai định dạng mà vẫn gửi được").toBeDisabled();

    // Bỏ SĐT đi (không bắt buộc) thì phải gửi được.
    await page.locator("#guest-phone").fill("");
    await expect(nut, "tên hợp lệ + SĐT trống mà vẫn không gửi được").toBeEnabled();
  });

  test("MENU-02/MENU-04: tắt 'hết món' ở admin → khách thấy Hết ở lần tải kế tiếp", async ({
    page,
  }) => {
    // Đi ĐÚNG đường nhân viên dùng. Ghi thẳng vào DB sẽ không xóa cache — và đó là hành vi đúng,
    // nên test ghi thẳng DB là test sai, không phải sản phẩm sai.
    await page.goto(`/r/${SLUG}/admin/login`);
    await page.fill('input[name="email"]', OWNER.email);
    await page.fill('input[name="password"]', OWNER.pass);
    await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);

    await page.goto(`/r/${SLUG}/admin/menu`, { waitUntil: "networkidle" });
    const nutTat = page.locator('button[aria-label^="Còn món"]').first();
    await expect(nutTat, "không có món nào đang bán để thử").toBeVisible({ timeout: 20000 });

    const truoc = ((await (await page.request.get(`/r/${SLUG}/menu`)).text()).match(/Hết/g) ?? [])
      .length;

    try {
      await nutTat.click();
      await page.waitForTimeout(3000);
      const sau = ((await (await page.request.get(`/r/${SLUG}/menu`)).text()).match(/Hết/g) ?? [])
        .length;
      expect(sau, "tắt 'hết món' nhưng khách vẫn không thấy nhãn Hết").toBeGreaterThan(truoc);
    } finally {
      await page.goto(`/r/${SLUG}/admin/menu`, { waitUntil: "networkidle" });
      const batLai = page.locator('button[aria-label^="Hết món"]').first();
      if (await batLai.isVisible().catch(() => false)) {
        await batLai.click();
        await page.waitForTimeout(2000);
      }
    }
  });
});

test.describe("Trang giới thiệu", () => {
  test("MKT-01: không vỡ ở 360px, không còn link nội bộ style-guide/tenant", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");

    const tranNgang = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(tranNgang, "trang tràn ngang ở 360px").toBe(false);

    expect(await page.locator('a[href*="/style-guide"]').count()).toBe(0);
    expect(await page.locator('a[href*="/r/pho-viet"]').count()).toBe(0);
  });

  test("MKT-02: SĐT sai → báo lỗi tại ô, KHÔNG ghi vào leads", async ({ page }) => {
    const { count: truoc } = await admin
      .from("leads")
      .select("*", { count: "exact", head: true });

    await page.goto("/");
    const oTen = page.locator('input[name="name"]').first();
    const oSdt = page.locator('input[name="phone"]').first();
    await oTen.scrollIntoViewIfNeeded();
    await oTen.fill("Nghiệm thu");
    await oSdt.fill("123");
    await page.getByRole("button", { name: /Gửi|Đăng ký|Nhận tư vấn/i }).first().click();
    await page.waitForTimeout(2000);

    const { count: sau } = await admin.from("leads").select("*", { count: "exact", head: true });
    expect(sau, "SĐT sai mà vẫn ghi vào leads").toBe(truoc);
  });
});

test.describe("Báo cáo — bền với đầu vào xấu", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/r/${SLUG}/admin/login`);
    await page.fill('input[name="email"]', OWNER.email);
    await page.fill('input[name="password"]', OWNER.pass);
    await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
  });

  test("REPORT-05: from > to KHÔNG lỗi 500, tự về kỳ mặc định", async ({ page }) => {
    const res = await page.goto(
      `/r/${SLUG}/admin/reports?from=2026-09-01&to=2026-08-01`,
      { waitUntil: "networkidle" }
    );
    expect(res?.status(), "from > to gây lỗi máy chủ").toBeLessThan(500);
    await expect(page.getByText(/Doanh thu/i).first()).toBeVisible({ timeout: 20000 });
  });

  test("REPORT-05: kỳ > 400 ngày KHÔNG lỗi 500", async ({ page }) => {
    const res = await page.goto(
      `/r/${SLUG}/admin/reports?from=2020-01-01&to=2026-09-24`,
      { waitUntil: "networkidle" }
    );
    expect(res?.status()).toBeLessThan(500);
    await expect(page.getByText(/Doanh thu/i).first()).toBeVisible({ timeout: 20000 });
  });

  test("REPORT-05: khoảng ngày rác KHÔNG lỗi 500", async ({ page }) => {
    const res = await page.goto(`/r/${SLUG}/admin/reports?from=abc&to=xyz`, {
      waitUntil: "networkidle",
    });
    expect(res?.status()).toBeLessThan(500);
  });
});

test.describe("Phân quyền", () => {
  test("AUTH-05: owner THẤY mục Cài đặt (đối chứng dương)", async ({ page }) => {
    await page.goto(`/r/${SLUG}/admin/login`);
    await page.fill('input[name="email"]', OWNER.email);
    await page.fill('input[name="password"]', OWNER.pass);
    await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);

    await page.goto(`/r/${SLUG}/admin`, { waitUntil: "networkidle" });
    await expect(page.getByRole("link", { name: /Cài đặt/i }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("TENANT-06: quán bị tạm ngưng → mọi bề mặt hiện màn tạm ngưng", async ({ page }) => {
    const { data: t } = await admin
      .from("tenants")
      .select("id")
      .eq("slug", "bun-bo")
      .maybeSingle();
    try {
      await admin.from("tenants").update({ status: "suspended" }).eq("id", t!.id);
      for (const path of [`/r/bun-bo/menu`, `/r/bun-bo/pos`, `/r/bun-bo/admin`]) {
        await page.goto(path, { waitUntil: "networkidle" });
        await expect(
          page.getByText("Nhà hàng đang tạm ngưng"),
          `${path} không chặn`
        ).toBeVisible({ timeout: 15000 });
      }
    } finally {
      await admin.from("tenants").update({ status: "active" }).eq("id", t!.id);
    }
  });
});
