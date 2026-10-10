import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";

config({ path: ".env.local", quiet: true });

/**
 * PRINT-17 — chủ quán tải bộ cài cầu in ngay ở Admin → Máy in; bộ cài KÈM MÃ kích hoạt trong file
 * `bo-cai\ma-kich-hoat.txt` nên cài không phải gõ mã. Cần bộ cài đã đưa lên (`print-pack.ps1 -Upload`). Chỉ owner/manager ĐÚNG quán tải được.
 */
const SLUG = "pho-viet";
const ROUTE = `/r/${SLUG}/admin/printers/bo-cai`;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** Nội dung một mục trong zip (store/deflate), tên so sau khi đổi "\" → "/". */
function docMucZip(zip: Buffer, ten: string): string | null {
  let eocd = zip.length - 22;
  while (zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < zip.readUInt16LE(eocd + 10); i++) {
    const dai = zip.readUInt16LE(p + 28);
    if (zip.subarray(p + 46, p + 46 + dai).toString("utf8").replace(/\\/g, "/") === ten) {
      const l = zip.readUInt32LE(p + 42);
      const bd = l + 30 + zip.readUInt16LE(l + 26) + zip.readUInt16LE(l + 28);
      const raw = zip.subarray(bd, bd + zip.readUInt32LE(p + 20));
      return (zip.readUInt16LE(p + 10) === 8 ? zlib.inflateRawSync(raw) : raw).toString("utf8");
    }
    p += 46 + dai + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return null;
}

async function dangNhapAdmin(page: Page, slug: string, email: string) {
  await page.goto(`/r/${slug}/admin/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "DemoPass123!");
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
}

test("chủ quán bấm 'Tải bộ cài' → zip có bo-cai/ma-kich-hoat.txt; mã có thật trong DB, đúng quán, chưa dùng, hạn 30 phút", async ({ page }) => {
  // Server tải bộ cài 33 MB từ Storage, chèn mã, đưa lại lên: vài giây ở Vercel, tới ~1 phút từ máy dev.
  test.setTimeout(180_000);
  const tenantId = (await admin.from("tenants").select("id").eq("slug", SLUG).single()).data!.id as string;
  await dangNhapAdmin(page, SLUG, "ownerA@pho-viet.test");
  await page.goto(`/r/${SLUG}/admin/settings`, { waitUntil: "networkidle" });
  await expect(page.getByText(/kèm sẵn mã kích hoạt/)).toBeVisible();
  const nut = page.getByRole("button", { name: /^Tải bộ cài cầu in \(\d+ MB\)$/ });

  // noWaitAfter: bấm là gửi form; phản hồi là file tải (không chuyển trang) và tới sau vài chục giây.
  const [tai] = await Promise.all([page.waitForEvent("download", { timeout: 150_000 }), nut.click({ noWaitAfter: true })]);
  expect(tai.suggestedFilename()).toBe("cau-in.zip");
  const buf = fs.readFileSync(await tai.path());
  expect(buf.subarray(0, 2).toString()).toBe("PK");
  expect(buf.length).toBeGreaterThan(20 * 1024 * 1024); // kèm node.exe
  expect(docMucZip(buf, "CAI-DAT.bat")).toContain("bo-cai");

  const ma = (docMucZip(buf, "bo-cai/ma-kich-hoat.txt") ?? "").trim();
  expect(ma).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  const bam = crypto.createHash("sha256").update(`cau-in:${ma}`).digest("hex");
  const { data: dong } = await admin
    .from("bridge_activation_codes")
    .select("tenant_id, used_at, expires_at, created_by")
    .eq("code_hash", bam)
    .single();
  try {
    expect(dong!.tenant_id).toBe(tenantId);
    expect(dong!.used_at).toBeNull();
    expect(dong!.created_by).not.toBeNull();
    const conLai = new Date(dong!.expires_at).getTime() - Date.now();
    expect(conLai).toBeGreaterThan(25 * 60_000);
    expect(conLai).toBeLessThanOrEqual(30 * 60_000 + 5_000);
  } finally {
    await admin.from("bridge_activation_codes").delete().eq("code_hash", bam);
  }
});

test("chưa đăng nhập → 401", async ({ request }) => {
  expect((await request.post(ROUTE, { maxRedirects: 0 })).status()).toBe(401);
});

test("chủ quán KHÁC (bun-bo) → 401 ở route của pho-viet", async ({ page }) => {
  await dangNhapAdmin(page, "bun-bo", "ownerB@bun-bo.test");
  expect((await page.request.post(ROUTE, { maxRedirects: 0 })).status()).toBe(401);
});

test("tài khoản trạm → 403", async ({ page }) => {
  await page.goto(`/r/${SLUG}/pos/login`);
  await page.fill('input[name="email"]', "station@pho-viet.test");
  await page.fill('input[name="secret"]', "StationPass123!");
  await Promise.all([page.waitForURL(new RegExp(`/r/${SLUG}/pos$`)), page.click('button[type="submit"]')]);
  expect((await page.request.post(ROUTE, { maxRedirects: 0 })).status()).toBe(403);
});

test("form gửi từ trang LẠ (Origin khác) → 403, không phát mã", async ({ page }) => {
  await dangNhapAdmin(page, SLUG, "ownerA@pho-viet.test");
  const r = await page.request.post(ROUTE, { maxRedirects: 0, headers: { origin: "https://trang-la.example" } });
  expect(r.status()).toBe(403);
});

test("?loi= chỉ nhận mã cố định — link lạ không chèn được câu lên trang", async ({ page }) => {
  await dangNhapAdmin(page, SLUG, "ownerA@pho-viet.test");
  await page.goto(`/r/${SLUG}/admin/settings?loi=${encodeURIComponent("Gọi 0900000000 để kích hoạt")}`);
  await expect(page.getByText("Gọi 0900000000")).toHaveCount(0);
  await page.goto(`/r/${SLUG}/admin/settings?loi=gioi-han`);
  await expect(page.getByRole("alert").filter({ hasText: "thử lại sau 10 phút" })).toBeVisible();
});

test("bucket không công khai: anon không tải thẳng được", async () => {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.storage.from("bridge-installer").download("cau-in.zip");
  expect(data).toBeNull();
  expect(error).not.toBeNull();
  const pub = anon.storage.from("bridge-installer").getPublicUrl("cau-in.zip").data.publicUrl;
  expect((await fetch(pub)).status).toBeGreaterThanOrEqual(400);
});
