import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { getPrintMode, setPrintMode, getServiceMode, setServiceMode, type PrintMode } from "./tenant-mode";

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

let printModeCu: PrintMode = "browser";

test.beforeAll(async () => {
  const { data: t } = await admin.from("tenants").select("id").eq("slug", SLUG).single();
  tenantId = t!.id as string;
  // Spec này kiểm đường cầu in → quán phải ở chế độ cầu in (PRINT-10: chế độ theo từng quán, trước đây
  // spec ngầm dựa vào biến môi trường chung của cả hệ thống).
  printModeCu = await getPrintMode(SLUG);
  await setPrintMode(SLUG, "bridge");
});

test.afterAll(async () => {
  await setPrintMode(SLUG, printModeCu);
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

  await expect(page.getByText(/Máy in quầy mất kết nối/), "POS không báo cầu in chết").toBeVisible({
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

  await expect(page.getByText(/Máy in quầy mất kết nối|Chưa có cầu in/)).toHaveCount(0);

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

/**
 * P17 17-02 (OFFLINE-03) — wifi quán mất: cả quán thấy băng "Máy in quầy mất kết nối" kèm số phiếu chờ và danh
 * sách phiếu; phiếu quá 30 phút ghi "Không in bù". Điện thoại gửi phiếu bếp lúc đó → vào hàng chờ (in bù khi cầu in
 * lên mạng dự phòng), không mở hộp thoại in vô ích.
 */
test.describe("P17 — cầu in mất kết nối, cảnh báo toàn quán", () => {
  async function phieuGia(phutTruoc: number, soDon: number) {
    await admin.from("print_jobs").insert({
      tenant_id: tenantId,
      type: "kitchen_ticket",
      target_station: "kitchen",
      status: "pending",
      created_at: new Date(Date.now() - phutTruoc * 60_000).toISOString(),
      payload: { orderId: crypto.randomUUID(), kitchenNo: soDon, tableName: "E2E", items: [{ name: "Phở thử", qty: 2 }] },
    });
  }

  test.beforeEach(async () => {
    // Mốc dọn lùi 1 giờ: phiếu giả có created_at trong quá khứ.
    batDau = new Date(Date.now() - 3600_000).toISOString();
  });

  test("POS: băng đỏ + số phiếu chờ + danh sách, phiếu > 30 phút ghi Không in bù", async ({ page }) => {
    await datNhipTim(new Date(Date.now() - 5 * 60_000).toISOString());
    await phieuGia(40, 901);
    await phieuGia(3, 902);
    await vaoPos(page);
    const bang = page.locator("[data-cau-in-mat-ket-noi]");
    await expect(bang).toContainText("Máy in quầy mất kết nối từ", { timeout: 45_000 });
    await expect(bang).toContainText("2 phiếu đang chờ in");
    await expect(bang).toContainText("Bật phát wifi trên điện thoại quản lý.");
    await bang.getByRole("button", { name: /Xem phiếu chờ \(2\)/ }).click();
    const ds = bang.locator("[data-phieu-cho]");
    await expect(ds.locator("li").filter({ hasText: "Đơn #901" })).toContainText("Không in bù — đã quá 30 phút");
    await expect(ds.locator("li").filter({ hasText: "Đơn #902" })).not.toContainText("Không in bù");
    await expect(ds).toContainText("2× Phở thử");
    await page.screenshot({ path: "docs/30-KeHoach/P17/anh/2-bang-phieu-cho.png" });
  });

  test("KDS cũng thấy băng", async ({ page }) => {
    await datNhipTim(new Date(Date.now() - 5 * 60_000).toISOString());
    await phieuGia(2, 903);
    await vaoPos(page);
    await page.goto(`/r/${SLUG}/kds`, { waitUntil: "networkidle" });
    await expect(page.locator("[data-cau-in-mat-ket-noi]")).toContainText("1 phiếu đang chờ in", { timeout: 45_000 });
  });

  test("quán chế độ trình duyệt → không bao giờ thấy băng", async ({ page }) => {
    await setPrintMode(SLUG, "browser");
    try {
      await datNhipTim(new Date(Date.now() - 5 * 60_000).toISOString());
      await phieuGia(2, 904);
      await vaoPos(page);
      await page.waitForTimeout(3000);
      await expect(page.locator("[data-cau-in-mat-ket-noi]")).toHaveCount(0);
    } finally {
      await setPrintMode(SLUG, "bridge");
    }
  });

  test("điện thoại gửi phiếu bếp khi cầu in chết → vào hàng chờ (pending), không in trình duyệt", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const modeCu = await getServiceMode(SLUG);
    await setServiceMode(SLUG, "table");
    try {
      await datNhipTim(new Date(Date.now() - 5 * 60_000).toISOString());
      await vaoPos(page);
      // Bàn demo B1 luôn có đơn đang mở (xem ảnh 1-man-offline.png): Bàn → B1 → Đơn → "Phiếu bếp".
      const nav = page.getByRole("navigation", { name: "Chuyển màn POS" });
      await nav.getByRole("button", { name: /^Bàn/ }).click();
      await page.getByRole("button", { name: /^B1\b/ }).first().click();
      await nav.getByRole("button", { name: /^Đơn/ }).click();
      const nut = page.getByRole("button", { name: "Phiếu bếp" }).first();
      test.skip(!(await nut.isVisible({ timeout: 10_000 }).catch(() => false)), "bàn B1 của pho-viet không có đơn để thử");
      // Mốc lùi (batDau, 1 giờ trước): đồng hồ máy dev lệch database được vài chục giây; test này không có phiếu giả.
      const moc = batDau;
      await nut.click();
      await expect
        .poll(
          async () =>
            (
              await admin
                .from("print_jobs")
                .select("status")
                .eq("tenant_id", tenantId)
                .eq("type", "kitchen_ticket")
                .gte("created_at", moc)
                .order("created_at", { ascending: false })
                .limit(1)
            ).data?.[0]?.status ?? "chua-co",
          // Server action của Next chạy NỐI TIẾP trên một trang: lệnh xếp phiếu đứng sau các lượt hỏi trạng thái
          // in của từng đơn (bàn B1 demo có ~19 đơn) ⇒ chờ dài.
          { timeout: 45_000 }
        )
        .toBe("pending");
      await expect(page.getByText(/máy in quầy đang mất kết nối/)).toBeVisible();
    } finally {
      await setServiceMode(SLUG, modeCu);
    }
  });
});
