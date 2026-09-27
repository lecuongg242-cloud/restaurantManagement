import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { getServiceMode, setServiceMode, getPrintMode, setPrintMode, type ServiceMode, type PrintMode } from "./tenant-mode";
import { donBan } from "./don-ban";

/**
 * PRINT-14/15/16 — ĐẦU-CUỐI, không cần máy in thật: điện thoại bấm "In hóa đơn" → server xếp phiếu kèm bản
 * chụp → CẦU IN THẬT (scripts/print-bridge.mjs, kích hoạt bằng mã như lúc cài) tải ảnh có dấu → lệnh in ảnh
 * → "máy in quầy" giả (máy chủ TCP) nhận byte. Byte đó được dựng NGƯỢC thành ảnh để người xem tờ giấy sẽ ra.
 */
const SLUG = "pho-viet";
const OWNER = { email: "ownerA@pho-viet.test", pass: "DemoPass123!" };
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3005";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let tenantId = "";
let modeCu: ServiceMode = "table";
let printCu: PrintMode = "browser";
let cauIn: ChildProcess | null = null;
let thuMuc = "";
const mayIn: net.Server[] = [];
const nhanQuay: Buffer[] = [];

function mayInGia(cong: number, nhan?: Buffer[]) {
  const sv = net.createServer((sock) => {
    const phan: Buffer[] = [];
    sock.on("data", (d) => phan.push(d));
    // Cầu in thử kết nối máy in mỗi nhịp tim (mở rồi đóng, không byte nào) — không phải một tờ in.
    sock.on("end", () => {
      const buf = Buffer.concat(phan);
      if (buf.length) nhan?.push(buf);
    });
    sock.on("error", () => {});
  });
  sv.listen(cong, "127.0.0.1");
  mayIn.push(sv);
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  tenantId = (await admin.from("tenants").select("id").eq("slug", SLUG).single()).data!.id as string;
  modeCu = await getServiceMode(SLUG);
  printCu = await getPrintMode(SLUG);
  await setServiceMode(SLUG, "table");

  // Kích hoạt cầu in bằng mã — y như người lắp tại quán (đặt luôn quán sang chế độ cầu in).
  const ma = Array.from({ length: 8 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[crypto.randomInt(31)]).join("");
  await admin.from("bridge_activation_codes").insert({
    tenant_id: tenantId,
    code_hash: crypto.createHash("sha256").update(`cau-in:${ma}`).digest("hex"),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  const kh = await request.post("/api/bridge/activate", { data: { code: ma } });
  expect(kh.status(), await kh.text()).toBe(200);
  const cfg = await kh.json();

  mayInGia(9110); // bếp
  mayInGia(9111, nhanQuay); // quầy
  thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), "cau-in-e2e-"));
  for (const f of ["print-bridge.mjs", "print-raw.ps1"]) fs.copyFileSync(path.join("scripts", f), path.join(thuMuc, f));
  fs.writeFileSync(
    path.join(thuMuc, ".env.local"),
    [
      `NEXT_PUBLIC_SUPABASE_URL=${cfg.supabaseUrl}`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${cfg.anonKey}`,
      `PRINT_BRIDGE_EMAIL=${cfg.email}`,
      `PRINT_BRIDGE_PASSWORD=${cfg.password}`,
      `POS_URL=${BASE}/r/${SLUG}/pos`,
      "PRINTER_HOST=127.0.0.1",
      "PRINTER_PORT=9110",
      "COUNTER_PRINTER=lan:127.0.0.1:9111",
      "UPDATE_CHECK_MS=86400000",
    ].join("\n")
  );
  cauIn = spawn(process.execPath, ["print-bridge.mjs"], { cwd: thuMuc, stdio: "ignore" });

  // Chờ cầu in báo sống KÈM máy in quầy — điều kiện để server nhận xếp hóa đơn.
  await expect
    .poll(async () => (await admin.from("printer_heartbeats").select("counter_target").eq("tenant_id", tenantId).maybeSingle()).data?.counter_target, {
      timeout: 30_000,
    })
    .toBe("lan:127.0.0.1:9111");
});

test.afterAll(async () => {
  cauIn?.kill();
  // Không để lại phiên/đơn dở trên bàn demo cho spec khác (băng "Đơn cần in phiếu" đổi tên nút).
  await donBan(tenantId, ["T2", "T3"]);
  for (const sv of mayIn) sv.close();
  await setServiceMode(SLUG, modeCu);
  await setPrintMode(SLUG, printCu);
  await admin.from("printer_heartbeats").delete().eq("tenant_id", tenantId);
  await admin.from("bridge_activation_codes").delete().eq("tenant_id", tenantId);
  const email = `print-${SLUG}@bridge.local`;
  await admin.from("memberships").delete().eq("tenant_id", tenantId).eq("email", email);
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users.find((x) => x.email === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
  if (thuMuc) fs.rmSync(thuMuc, { recursive: true, force: true });
});

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, screenshot: "only-on-failure" });

async function vaoPos(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.pass);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
  await page.goto(`/r/${SLUG}/pos`, { waitUntil: "networkidle" });
}

/** Byte lệnh in ảnh (ESC @ + các dải GS v 0 …) → PNG xám để người xem. */
function dungNguocAnh(lenh: Buffer): { png: Buffer; rong: number; cao: number } {
  const dong: Buffer[] = [];
  let rongByte = 0;
  for (let i = 0; i < lenh.length; ) {
    if (lenh[i] === 0x1d && lenh[i + 1] === 0x76 && lenh[i + 2] === 0x30) {
      rongByte = lenh[i + 4] | (lenh[i + 5] << 8);
      const h = lenh[i + 6] | (lenh[i + 7] << 8);
      for (let y = 0; y < h; y++) dong.push(lenh.subarray(i + 8 + y * rongByte, i + 8 + (y + 1) * rongByte));
      i += 8 + h * rongByte;
    } else i++;
  }
  const rong = rongByte * 8;
  const tho = Buffer.concat(
    dong.map((d) => {
      const r = Buffer.alloc(rong + 1); // byte lọc 0
      for (let x = 0; x < rong; x++) r[x + 1] = d[x >> 3] & (0x80 >> (x & 7)) ? 0 : 255;
      return r;
    })
  );
  const khoi = (loai: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(loai), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(rong, 0);
  ihdr.writeUInt32BE(dong.length, 4);
  ihdr[8] = 8;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    khoi("IHDR", ihdr),
    khoi("IDAT", zlib.deflateSync(tho)),
    khoi("IEND", Buffer.alloc(0)),
  ]);
  return { png, rong, cao: dong.length };
}

test("điện thoại thu tiền → In hóa đơn → hóa đơn CÓ DẤU ra máy in quầy qua cầu in", async ({ page }) => {
  await vaoPos(page);
  const nav = page.getByRole("navigation", { name: "Chuyển màn POS" });
  await nav.getByRole("button", { name: /^Bàn/ }).click();
  await page.getByRole("button", { name: /^T3\b/ }).click();
  await page.getByRole("button", { name: /^Thêm / }).nth(1).click();
  const themVaoGio = page.getByRole("button", { name: /Thêm vào giỏ/ });
  await expect(themVaoGio.or(nav.getByLabel(/món chưa gửi/)).first()).toBeVisible();
  if (await themVaoGio.isVisible()) await themVaoGio.click();
  await nav.getByRole("button", { name: /^Đơn/ }).click();
  await page.getByRole("button", { name: /^Xác nhận thêm \d+ món/ }).click();
  await expect(page.getByRole("button", { name: /^(Tính tiền|Xem hóa đơn)/ })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole("button", { name: /^(Tính tiền|Xem hóa đơn)/ }).click();

  await page.getByRole("button", { name: /Thu tiền/ }).first().click();
  const hop = page.getByRole("dialog", { name: "Thu tiền" });
  await hop.getByRole("button", { name: /Chuyển khoản/ }).click();
  await hop.getByRole("button", { name: /Xác nhận thu/ }).click();
  await expect(hop.getByText("Đã thanh toán")).toBeVisible({ timeout: 15_000 });

  const truoc = nhanQuay.length;
  const batDau = Date.now();
  await hop.getByRole("button", { name: /In hóa đơn/ }).click();
  // Điện thoại KHÔNG mở hộp thoại in — báo đã gửi ra máy in quầy.
  await expect(page.getByRole("status").filter({ hasText: /máy in quầy/ })).toBeVisible({ timeout: 15_000 });

  // Cầu in in xong → "máy in quầy" nhận được lệnh in ảnh.
  await expect.poll(() => nhanQuay.length, { timeout: 30_000 }).toBeGreaterThan(truoc);
  const msRaGiay = Date.now() - batDau;
  const lenh = nhanQuay[nhanQuay.length - 1];
  expect(lenh.subarray(0, 2)).toEqual(Buffer.from([0x1b, 0x40]));
  const anh = dungNguocAnh(lenh);
  expect(anh.rong).toBe(576);
  expect(anh.cao).toBeGreaterThan(100);
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync("test-results/giay-hoa-don-tu-dien-thoai.png", anh.png);
  console.log(`BAM-IN → MAY-IN-QUAY NHAN: ${msRaGiay} ms · ${lenh.length} byte · anh ${anh.rong}×${anh.cao}`);

  // Phiếu trong hàng đợi đã `printed`.
  const { data: job } = await admin
    .from("print_jobs")
    .select("status, target_station")
    .eq("tenant_id", tenantId)
    .eq("type", "receipt")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  expect(job).toMatchObject({ status: "printed", target_station: "counter" });
});

test("điện thoại bấm Phiếu khách → phiếu khách có dấu ra máy in quầy", async ({ page }) => {
  await vaoPos(page);
  const nav = page.getByRole("navigation", { name: "Chuyển màn POS" });
  await nav.getByRole("button", { name: /^Bàn/ }).click();
  await page.getByRole("button", { name: /^T2\b/ }).click();
  await page.getByRole("button", { name: /^Thêm / }).nth(1).click();
  const themVaoGio = page.getByRole("button", { name: /Thêm vào giỏ/ });
  await expect(themVaoGio.or(nav.getByLabel(/món chưa gửi/)).first()).toBeVisible();
  if (await themVaoGio.isVisible()) await themVaoGio.click();
  await nav.getByRole("button", { name: /^Đơn/ }).click();
  await page.getByRole("button", { name: /^Xác nhận thêm \d+ món/ }).click();

  const truoc = nhanQuay.length;
  await page.getByRole("button", { name: /Phiếu khách/ }).last().click();
  await expect(page.getByRole("status").filter({ hasText: /máy in quầy/ })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => nhanQuay.length, { timeout: 30_000 }).toBeGreaterThan(truoc);
  const anh = dungNguocAnh(nhanQuay[nhanQuay.length - 1]);
  fs.writeFileSync("test-results/giay-phieu-khach-tu-dien-thoai.png", anh.png);
  expect(anh.rong).toBe(576);
});

test("cầu in CHẾT → điện thoại báo lỗi rõ, KHÔNG xếp phiếu nào vào hàng đợi", async ({ page }) => {
  cauIn?.kill();
  cauIn = null;
  await admin
    .from("printer_heartbeats")
    .update({ seen_at: new Date(Date.now() - 10 * 60_000).toISOString() })
    .eq("tenant_id", tenantId);
  const { count: truoc } = await admin
    .from("print_jobs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("type", ["receipt", "customer_ticket"]);

  await vaoPos(page);
  const nav = page.getByRole("navigation", { name: "Chuyển màn POS" });
  await nav.getByRole("button", { name: /^Bàn/ }).click();
  await page.getByRole("button", { name: /^T2\b/ }).click();
  await nav.getByRole("button", { name: /^Đơn/ }).click();
  await page.getByRole("button", { name: /Phiếu khách/ }).last().click();

  await expect(page.getByRole("alert").filter({ hasText: /Cầu in/ })).toBeVisible({ timeout: 15_000 });
  const { count: sau } = await admin
    .from("print_jobs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("type", ["receipt", "customer_ticket"]);
  expect(sau).toBe(truoc);
});
