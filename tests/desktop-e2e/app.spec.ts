import { test, expect, _electron, type ElectronApplication, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mayChuGia, mayInGia, doiDen } from "../desktop/gia-lap";

/**
 * P21 — điều khiển CHÍNH app "TechMenu Thu ngân" (desktop/) với máy chủ + Supabase giả. DESK-01..06.
 * Mỗi test một thư mục dữ liệu riêng (TECHMENU_USER_DATA) — không đụng cấu hình máy thật.
 */
// TECHMENU_EXE = đường dẫn TechMenuThuNgan.exe ĐÃ CÀI → chạy cả bộ test trên bản đóng gói (asar, resources/cau-in).
const EXE = process.env.TECHMENU_EXE;
const ELECTRON = EXE ?? path.resolve("desktop/node_modules/electron/dist/electron.exe");
const APP = path.resolve("desktop");
const THAM_SO = EXE ? [] : [APP];
/** Ảnh bằng chứng cho 21-SUMMARY (chụp từ chính cửa sổ app). */
const ANH = (ten: string) => path.join("docs/30-KeHoach/P21/anh", ten);

type May = Awaited<ReturnType<typeof mayChuGia>>;
let may: May;
let thuMuc: string;
let app: ElectronApplication | null = null;

type MucMenu = { label: string; visible: boolean; click: () => void };

function moiTruong(apiBase: string, them: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...them };
  delete env.ELECTRON_RUN_AS_NODE; // VS Code đặt biến này — còn thì electron.exe chạy như Node, không mở cửa sổ
  env.TECHMENU_API_BASE = apiBase;
  env.TECHMENU_USER_DATA = thuMuc;
  return env;
}

async function moApp(apiBase = may.url, them: Record<string, string> = {}): Promise<{ app: ElectronApplication; trang: Page }> {
  app = await _electron.launch({ executablePath: ELECTRON, args: THAM_SO, env: moiTruong(apiBase, them) as Record<string, string> });
  // Chặn mở trình duyệt thật khi bấm liên kết ngoài — ghi lại để kiểm.
  await app.evaluate(({ shell }) => {
    (globalThis as unknown as { __moNgoai: string[] }).__moNgoai = [];
    shell.openExternal = async (u: string) => {
      (globalThis as unknown as { __moNgoai: string[] }).__moNgoai.push(u);
    };
  });
  const trang = await app.firstWindow();
  return { app, trang };
}

async function dongApp() {
  if (!app) return;
  const a = app;
  app = null;
  await a.evaluate(({ app: e }) => e.quit()).catch(() => {});
  await a.close().catch(() => {});
}

async function dangNhap(trang: Page, email: string, coMayIn: boolean, matKhau = "dung-mat-khau") {
  await trang.fill("#email", email);
  await trang.fill("#mat-khau", matKhau);
  await trang.check(`input[name="co-may-in"][value="${coMayIn ? "co" : "khong"}"]`);
  await trang.click("#nut");
}

async function bamMenu(a: ElectronApplication, nhan: string) {
  await a.evaluate(({ Menu }, nhan) => {
    const muc = Menu.getApplicationMenu()!.items[0].submenu!.items.find((i: MucMenu) => i.label === nhan);
    if (!muc) throw new Error(`Không có mục menu ${nhan}`);
    muc.click();
  }, nhan);
}

const nhanMenu = (a: ElectronApplication) =>
  a.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items[0].submenu!.items.filter((i: MucMenu) => i.visible).map((i: MucMenu) => i.label));

test.beforeEach(async () => {
  may = await mayChuGia();
  thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), "techmenu-e2e-"));
});

test.afterEach(async () => {
  await dongApp();
  await may.dong();
  fs.rmSync(thuMuc, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
});

test("lần đầu → màn Đăng nhập; sai mật khẩu → báo lỗi, không lưu gì", async () => {
  const { trang } = await moApp();
  await expect(trang.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  await trang.setViewportSize({ width: 1280, height: 800 });
  await trang.screenshot({ path: ANH("1-dang-nhap.png") });
  await dangNhap(trang, "chu@quan.vn", false, "sai");
  await expect(trang.getByRole("alert")).toHaveText("Email hoặc mật khẩu không đúng.");
  expect(fs.existsSync(path.join(thuMuc, "cau-hinh.json"))).toBe(false);
});

test("máy chỉ xem → mở Màn bếp; trang web không chạm được Node; liên kết ngoài mở trình duyệt; mở lại vào thẳng", async () => {
  let { app: a, trang } = await moApp();
  await dangNhap(trang, "chu@quan.vn", false);
  await expect(trang.locator("#man")).toHaveText("kds:quan-thu");

  const kq = await trang.evaluate(() => (window as unknown as { __kq: Record<string, unknown> }).__kq);
  expect(kq).toEqual({ req: "undefined", proc: "undefined", td: { phienBan: "1.0.1", coCauIn: false }, tm: "undefined" });

  // Bấm bằng DOM: app chặn điều hướng (đúng ý) nên Playwright sẽ chờ mãi một điều hướng không bao giờ tới.
  await trang.evaluate(() => document.getElementById("ngoai")!.click());
  await expect.poll(() => a.evaluate(() => (globalThis as unknown as { __moNgoai: string[] }).__moNgoai)).toEqual(["https://example.com/"]);
  expect(trang.url()).toContain("/r/quan-thu/kds");

  // Cấu hình không chứa mật khẩu chủ quán.
  expect(fs.readFileSync(path.join(thuMuc, "cau-hinh.json"), "utf8")).not.toContain("dung-mat-khau");

  // Chuyển Thu ngân qua menu ☰, đóng hẳn app, mở lại → vào đúng màn đã chọn, không hỏi đăng nhập.
  await bamMenu(a, "Thu ngân");
  await expect(trang.locator("#man")).toHaveText("pos:quan-thu");
  await dongApp();
  ({ app: a, trang } = await moApp());
  await expect(trang.locator("#man")).toHaveText("pos:quan-thu");
  expect(await nhanMenu(a)).not.toContain("Đổi chi nhánh");
});

test("chủ chuỗi → chọn chi nhánh; menu có Đổi chi nhánh", async () => {
  const { app: a, trang } = await moApp();
  await dangNhap(trang, "chuoi@quan.vn", false);
  await expect(trang.getByRole("button", { name: "Chi nhánh 2" })).toBeVisible();
  await trang.setViewportSize({ width: 1280, height: 800 });
  await trang.screenshot({ path: ANH("2-chon-chi-nhanh.png") });
  await trang.getByRole("button", { name: "Chi nhánh 2" }).click();
  await expect(trang.locator("#man")).toHaveText("kds:chi-nhanh-2");
  expect(may.kichHoat.at(-1)).toMatchObject({ tenantId: "22222222-2222-2222-2222-222222222222" });
  expect(await nhanMenu(a)).toContain("Đổi chi nhánh");
});

test("máy quầy có máy in → Cài đặt máy in, In thử ra giấy, Lưu → POS; cầu in trong app báo sống với nguồn app", async () => {
  const mayIn = await mayInGia();
  try {
    const { app: a, trang } = await moApp();
    await dangNhap(trang, "chu@quan.vn", true);
    await expect(trang.getByRole("heading", { name: "Cài đặt máy in" })).toBeVisible();

    await trang.check('input[name="bep"][value="lan"]');
    await trang.fill("#bep-ip", "127.0.0.1");
    await trang.fill("#bep-cong", String(mayIn.port));
    await trang.check('input[name="quay"][value="khong"]');
    await trang.locator('[data-in-thu="bep"]').click();
    await expect(trang.locator("#kq-bep")).toHaveText("Đã gửi — kiểm tra giấy ra ở máy in.");
    await doiDen(() => mayIn.nhan.length === 1, 5_000, "máy in nhận tờ in thử");
    await trang.setViewportSize({ width: 1280, height: 1100 });
    await trang.screenshot({ path: ANH("3-cai-dat-may-in.png"), fullPage: true });

    await trang.click("#luu");
    await expect(trang.locator("#man")).toHaveText("pos:quan-thu");
    const td = await trang.evaluate(() => (window as unknown as { __kq: { td: unknown } }).__kq.td);
    expect(td).toEqual({ phienBan: "1.0.1", coCauIn: true });

    await doiDen(() => may.nhipTim.some((n) => n.p_agent === "app/1.0.1" && n.p_printer_ok === true), 30_000, "nhịp tim cầu in trong app");
    const ch = fs.readFileSync(path.join(thuMuc, "cau-hinh.json"), "utf8");
    expect(ch).not.toContain("mk-printer"); // mật khẩu printer chỉ lưu dạng mã hóa
    expect(ch).not.toContain("dung-mat-khau");

    // Bấm ✕ → xuống khay: cửa sổ ẩn, app + cầu in vẫn chạy.
    await a.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect.poll(() => a.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
    const truoc = may.nhipTim.length;
    await doiDen(() => may.nhipTim.length > truoc, 40_000, "vẫn báo sống khi đã xuống khay");
  } finally {
    await mayIn.dong();
  }
});

test("mở lần hai → không sinh bản thứ hai, cửa sổ cũ hiện lên", async () => {
  const { app: a, trang } = await moApp();
  await expect(trang.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  await a.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  const lan2 = spawn(ELECTRON, THAM_SO, { env: moiTruong(may.url), stdio: "ignore" });
  const ma = await new Promise<number | null>((r) => lan2.once("exit", r));
  expect(ma).toBe(0);
  await expect.poll(() => a.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
  expect(await a.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});

test("mất mạng lúc mở app → màn 'đang thử lại' của app, có mạng lại thì tự vào POS", async () => {
  let { trang } = await moApp();
  await dangNhap(trang, "chu@quan.vn", false);
  await expect(trang.locator("#man")).toHaveText("kds:quan-thu");
  await dongApp();

  // Máy chủ tắt: cấu hình vẫn trỏ tới địa chỉ cũ.
  const diaChi = may.url;
  await may.dong();
  ({ trang } = await moApp(diaChi));
  await expect(trang.getByRole("heading", { name: "Chưa kết nối được — đang thử lại" })).toBeVisible();
  expect(trang.url()).toMatch(/^file:/);
  await trang.setViewportSize({ width: 1280, height: 800 });
  await trang.screenshot({ path: ANH("4-mat-mang.png") });

  // Mở lại máy chủ ở đúng cổng → lần thử lại kế tiếp vào được Màn bếp.
  const cong = Number(new URL(diaChi).port);
  may = await mayChuGia({ cong });
  await expect(trang.locator("#man")).toHaveText("kds:quan-thu", { timeout: 20_000 });
});

test("cầu in cũ giữ khóa mà lúc mở app dò không thấy → app VẪN hỏi gỡ (lỗi gặp ở qt-food 29/09/2026)", async () => {
  // Giả cầu in cũ: một tiến trình giữ cổng khóa 47291 của print-bridge.mjs. TECHMENU_KIEM_CAU_IN_CU=1 chạy bước dò lúc mở
  // app như bản cài thật — máy test không có tác vụ CauInBep nên bước dò KHÔNG thấy gì, đúng tình huống ở quán.
  const khoa = net.createServer();
  await new Promise<void>((r) => khoa.listen(47291, "127.0.0.1", () => r()));
  try {
    const { app: a, trang } = await moApp(may.url, { TECHMENU_KIEM_CAU_IN_CU: "1" });
    await a.evaluate(({ dialog }) => {
      const g = globalThis as unknown as { __hoi: string[] };
      g.__hoi = [];
      dialog.showMessageBox = (async (...args: unknown[]) => {
        const o = args.find((x) => x && typeof x === "object" && "message" in (x as object)) as { message: string };
        g.__hoi.push(o.message);
        return { response: 1, checkboxChecked: false }; // "Để sau"
      }) as typeof dialog.showMessageBox;
    });
    await dangNhap(trang, "chu@quan.vn", true);
    await expect(trang.getByRole("heading", { name: "Cài đặt máy in" })).toBeVisible();
    await expect
      .poll(() => a.evaluate(() => (globalThis as unknown as { __hoi: string[] }).__hoi), { timeout: 30_000 })
      .toContain("Máy này đang chạy cầu in cũ.");
  } finally {
    await new Promise<void>((r) => khoa.close(() => r()));
  }
});
