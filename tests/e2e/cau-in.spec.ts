import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

/**
 * PRINT-08 — cầu in chết thì phiếu bếp phải tự đi đường khác, không nằm `pending` mãi.
 *
 * Lỗi gốc 24/09/2026: cầu in qt-food chết, nhưng nút "Phiếu bếp" vẫn xếp phiếu vào hàng đợi
 * THÀNH CÔNG → đường lui sang in trình duyệt không bao giờ bật → bếp không nhận được gì.
 *
 * Chạy trên tenant DEMO pho-viet. Nhịp tim được dựng thẳng trong bảng thay vì chạy cầu in thật:
 * thứ cần chứng minh là QUYẾT ĐỊNH ĐƯỜNG IN của server, và cách này điều khiển được nó hoàn toàn.
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

let tenantId = "";
let batDau = "";

async function datNhipTim(seenAt: string | null, mayIn: boolean | null = null) {
  await admin.from("printer_heartbeats").delete().eq("tenant_id", tenantId);
  if (seenAt) {
    await admin.from("printer_heartbeats").insert({
      tenant_id: tenantId,
      seen_at: seenAt,
      printer_ok: mayIn,
      printer_host: mayIn === null ? null : "192.168.1.234:9100",
      printer_checked_at: mayIn === null ? null : seenAt,
    });
  }
}

/** Lượt phiếu bếp mới nhất được ghi kể từ lúc test bắt đầu. */
async function luotMoiNhat(): Promise<{ status: string } | null> {
  const { data } = await admin
    .from("print_jobs")
    .select("status")
    .eq("tenant_id", tenantId)
    .eq("type", "kitchen_ticket")
    .gte("created_at", batDau)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

async function vaoPos(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.pass);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
  await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
}

test.beforeAll(async () => {
  const { data: t } = await admin.from("tenants").select("id").eq("slug", SLUG).single();
  tenantId = t!.id as string;
});

test.beforeEach(() => {
  batDau = new Date().toISOString();
});

test.afterEach(async () => {
  // Dọn mọi lượt in test tạo ra + nhịp tim giả. Không để lại phiếu `pending` cho ai lấy.
  await admin.from("print_jobs").delete().eq("tenant_id", tenantId).gte("created_at", batDau);
  await datNhipTim(null);
});

test("cầu in CHẾT → phiếu bếp in bằng trình duyệt, KHÔNG nằm pending", async ({ page }) => {
  await datNhipTim(new Date(Date.now() - 10 * 60_000).toISOString()); // chết 10 phút trước
  await vaoPos(page);

  await expect(page.getByText(/Cầu in bếp mất kết nối/), "POS không báo cầu in chết").toBeVisible({
    timeout: 45_000,
  });

  // Chip ở dải "Đơn cần in phiếu" in phiếu bếp qua đúng PrintAdapter như nút "Phiếu bếp".
  const nut = page.getByRole("button", { name: /^Bàn .*#\d+/ }).first();
  test.skip(!(await nut.isVisible().catch(() => false)), "POS pho-viet không có đơn cần in để thử");
  await nut.click();

  await expect
    .poll(async () => (await luotMoiNhat())?.status ?? "chua-co", { timeout: 20_000 })
    .toBe("printed");
});

test("cầu in SỐNG → phiếu bếp vào hàng đợi cho cầu in", async ({ page }) => {
  await datNhipTim(new Date().toISOString());
  await vaoPos(page);

  await expect(page.getByText(/Cầu in bếp mất kết nối|Chưa có cầu in/)).toHaveCount(0);

  // Chip ở dải "Đơn cần in phiếu" in phiếu bếp qua đúng PrintAdapter như nút "Phiếu bếp".
  const nut = page.getByRole("button", { name: /^Bàn .*#\d+/ }).first();
  test.skip(!(await nut.isVisible().catch(() => false)), "POS pho-viet không có đơn cần in để thử");
  await nut.click();

  await expect
    .poll(async () => (await luotMoiNhat())?.status ?? "chua-co", { timeout: 20_000 })
    .toBe("pending");
});

/**
 * PRINT-09 — chip thiết bị in thường trực trên thanh công cụ POS. Nhân viên đứng quầy mới là người
 * cần biết máy in bếp có chạy không; trước đây chỉ chủ quán thấy, trong /admin/printers.
 */
test.describe("Chip thiết bị in trên POS", () => {
  test("cầu in sống + máy in phản hồi → 'Máy in bếp sẵn sàng', không có băng đỏ", async ({ page }) => {
    await datNhipTim(new Date().toISOString(), true);
    await vaoPos(page);
    await expect(page.getByRole("status", { name: /Máy in bếp sẵn sàng/ })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/không phản hồi|mất kết nối/i)).toHaveCount(0);
  });

  test("máy in KHÔNG phản hồi → chip đỏ + băng cảnh báo kèm IP", async ({ page }) => {
    await datNhipTim(new Date().toISOString(), false);
    await vaoPos(page);
    await expect(page.getByRole("status", { name: /Máy in bếp không phản hồi/ })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("alert").filter({ hasText: "192.168.1.234:9100" })).toBeVisible();
  });

  test("cầu in chết → chip nói về CẦU IN", async ({ page }) => {
    await datNhipTim(new Date(Date.now() - 10 * 60_000).toISOString(), true);
    await vaoPos(page);
    await expect(page.getByRole("status", { name: /Cầu in mất kết nối/ })).toBeVisible({ timeout: 45_000 });
  });
});
