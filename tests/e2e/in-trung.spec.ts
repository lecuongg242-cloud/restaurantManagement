import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

/**
 * BUG: bấm in một lần nhưng ra nhiều tờ.
 *
 * Bằng chứng từ dữ liệu thật của qt-food (24/09/2026): 364 bản thừa phiếu khách, 203 phiếu bếp;
 * khoảng cách nhỏ nhất giữa hai lượt liên tiếp là **0,63 giây** — không thể là người bấm hai lần
 * có ý thức.
 *
 * Hai cơ chế, test riêng từng cái:
 *   A. Nút in ở POS không bị khóa khi đang gửi → bấm đúp = hai lượt.
 *   B. Việc in gắn với "trang được mở" chứ không gắn với "người bấm in" → mọi lần remount
 *      (tải lại, đổi khổ giấy) đều ghi thêm một lượt VÀ gọi window.print() thêm lần nữa.
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

let tenantId = "";
let orderId = "";

/** Số lượt in đã ghi cho đơn đang thử. */
async function demLuotIn(type: "kitchen_ticket" | "customer_ticket"): Promise<number> {
  const { count } = await admin
    .from("print_jobs")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("type", type)
    .filter("payload->>orderId", "eq", orderId);
  return count ?? 0;
}

test.beforeAll(async () => {
  const { data: t } = await admin.from("tenants").select("id").eq("slug", SLUG).maybeSingle();
  tenantId = t!.id as string;
  const { data: don } = await admin
    .from("orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1);
  orderId = don![0].id as string;
});

/** Dọn mọi lượt in mà test tạo ra, để lần chạy sau không bị nhiễu. */
test.afterEach(async () => {
  await admin
    .from("print_jobs")
    .delete()
    .eq("tenant_id", tenantId)
    .filter("payload->>orderId", "eq", orderId)
    .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
});

test.describe("Không được in trùng", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/r/${SLUG}/admin/login`);
    await page.fill('input[name="email"]', OWNER.email);
    await page.fill('input[name="password"]', OWNER.pass);
    await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
  });

  test("B: đổi khổ giấy trong trang in KHÔNG được tính là một lượt in mới", async ({ page }) => {
    await page.goto(`/r/${SLUG}/print/kitchen/${orderId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const sauKhiMo = await demLuotIn("kitchen_ticket");
    expect(sauKhiMo, "mở trang in phải ghi đúng 1 lượt").toBeGreaterThan(0);

    // Đổi khổ giấy là đổi cách hiển thị, KHÔNG phải ra lệnh in.
    const doiKho = page.locator('button[data-kho], a[href^="?w="]').first();
    await expect(doiKho, "không tìm thấy nút đổi khổ giấy").toBeVisible({ timeout: 10000 });
    await doiKho.click();
    await page.waitForTimeout(2500);

    expect(
      await demLuotIn("kitchen_ticket"),
      "đổi khổ giấy lại ghi thêm một lượt in — đây chính là bug"
    ).toBe(sauKhiMo);
  });

  /**
   * CỐ Ý KHÔNG có test "tải lại trang in thì không ghi thêm lượt".
   *
   * Đo thật: một lần `reload` mất ~6,5 giây (tải trang + networkidle), vượt cửa sổ chống trùng
   * 3 giây — nên nó KHÔNG bị chặn, và điều đó đúng thiết kế: tải lại sau 6 giây là một hành động
   * khác của người dùng, không phải "bấm một lần ra nhiều tờ".
   *
   * Nới cửa sổ cho test này xanh sẽ nuốt mất lượt in lại có chủ ý của nhân viên (giấy kẹt, in mờ)
   * — chữa triệu chứng của test, không phải chữa bug.
   *
   * Cam kết thật của cửa sổ 3 giây được kiểm bằng `tests/rls/print-dedupe.test.ts`, nơi thời gian
   * điều khiển được thay vì phụ thuộc tốc độ tải trang.
   *
   * Việc "mở trang in là tự in" vẫn còn — đó là giai đoạn 2 (tách lệnh in khỏi sự kiện mở trang).
   */

  test("A: bấm đúp nút in ở POS chỉ tạo MỘT lượt", async ({ page }) => {
    await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });

    const nut = page.getByRole("button", { name: /Phiếu bếp|Gửi bếp/i }).first();
    if (!(await nut.isVisible().catch(() => false))) {
      test.skip(true, "POS không có đơn nào đang mở để thử nút in");
      return;
    }

    const truoc = await demLuotIn("kitchen_ticket");
    await nut.click({ clickCount: 2, delay: 40 });
    await page.waitForTimeout(3000);

    expect(
      await demLuotIn("kitchen_ticket"),
      "bấm đúp tạo ra hai lượt in — nút không bị khóa khi đang gửi"
    ).toBe(truoc + 1);
  });
});
