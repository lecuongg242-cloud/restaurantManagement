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
/** Phiên bản app đang thử (khớp desktop/package.json) — không ghi cứng, mỗi lần lên bản không phải sửa test. */
const PHIEN_BAN: string = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8")).version;
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
  expect(kq).toEqual({ req: "undefined", proc: "undefined", td: { phienBan: PHIEN_BAN, coCauIn: false }, tm: "undefined" });

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
    // P33 DESK-14: USB → máy in Windows thật của máy chạy test, đã ẩn máy in ảo; "Tải lại" đọc lại được.
    await trang.check('input[name="quay"][value="usb"]');
    const laMayAo = (t: string) => /Print to PDF|XPS Document Writer|OneNote|^Fax$/.test(t);
    expect((await trang.locator("#quay-ten option").allTextContents()).some(laMayAo)).toBe(false);
    await trang.click("#tai-lai-usb");
    await expect(trang.locator("#tai-lai-usb")).toHaveText("Tải lại");
    await expect(trang.locator("#tai-lai-usb")).toBeEnabled();
    expect((await trang.locator("#quay-ten option").allTextContents()).some(laMayAo)).toBe(false);

    await trang.check('input[name="quay"][value="khong"]');
    await trang.locator('[data-in-thu="bep"]').click();
    await expect(trang.locator("#kq-bep")).toHaveText("Đã gửi — kiểm tra giấy ra ở máy in.");
    await doiDen(() => mayIn.nhan.length === 1, 5_000, "máy in nhận tờ in thử");
    await trang.setViewportSize({ width: 1280, height: 1100 });
    await trang.screenshot({ path: ANH("3-cai-dat-may-in.png"), fullPage: true });

    await trang.click("#luu");
    await expect(trang.locator("#man")).toHaveText("pos:quan-thu");
    const td = await trang.evaluate(() => (window as unknown as { __kq: { td: unknown } }).__kq.td);
    expect(td).toEqual({ phienBan: PHIEN_BAN, coCauIn: true });

    await doiDen(() => may.nhipTim.some((n) => n.p_agent === `app/${PHIEN_BAN}` && n.p_printer_ok === true), 30_000, "nhịp tim cầu in trong app");
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

test("☰ Quản trị → cửa sổ riêng, phiên riêng: POS vẫn là thu ngân; thu ngân bị từ chối; tab mới cùng phiên; tải tệp; đăng xuất máy xóa phiên quản trị (DESK-13)", async () => {
  const { app: a, trang } = await moApp();
  const anhP30 = (ten: string) => path.join("docs/30-KeHoach/P30/anh", ten);
  await dangNhap(trang, "chu@quan.vn", false);
  await bamMenu(a, "Thu ngân");
  // Thu ngân đăng nhập POS ở cửa sổ chính.
  await expect(trang.locator("#man")).toHaveText("pos:quan-thu");
  await trang.goto(`${may.url}/dang-nhap-thu?vai=cashier`);
  await expect(trang.locator("#phien")).toHaveText("cashier");
  expect(await nhanMenu(a)).toEqual(expect.arrayContaining(["Thu ngân", "Màn bếp", "Quản trị"]));

  const [qt] = await Promise.all([a.waitForEvent("window"), bamMenu(a, "Quản trị")]);
  await expect(qt.locator("#email")).toBeVisible();
  expect(qt.url()).toContain("/r/quan-thu/admin/login?chi-quan-tri=1");
  const tieuDe = () => a.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w: { getTitle(): string }) => w.getTitle()).sort());
  await expect.poll(tieuDe).toContain("Quản trị — Quán Thử");

  // Thu ngân đăng nhập nhầm cửa quản trị → báo không có quyền.
  await qt.fill("#email", "thu@quan.vn");
  await qt.click("#dn");
  await expect(qt.getByRole("alert")).toHaveText("Tài khoản này không có quyền quản trị.");

  // Chủ quán → vào admin; trang admin không chạm được Node / lệnh có quyền của app.
  await qt.goto(`${may.url}/r/quan-thu/admin/login?chi-quan-tri=1`);
  await qt.fill("#email", "chu@quan.vn");
  await qt.click("#dn");
  await expect(qt.locator("#man")).toHaveText("admin:quan-thu");
  expect(await qt.evaluate(() => (window as unknown as { __kq: unknown }).__kq)).toEqual({ req: "undefined", proc: "undefined", tm: "undefined" });
  await qt.screenshot({ path: anhP30("01-windows-quan-tri.png") });

  // POS ở cửa sổ chính VẪN là thu ngân sau khi chủ đăng nhập quản trị.
  await trang.reload();
  await expect(trang.locator("#phien")).toHaveText("cashier");

  // Bấm Quản trị lần nữa → không mở cửa sổ thứ ba.
  await bamMenu(a, "Quản trị");
  expect(await a.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2);

  // "In mã QR" mở tab mới → cửa sổ con CÙNG phiên quản trị (không ra trình duyệt, không mất đăng nhập).
  const [con] = await Promise.all([a.waitForEvent("window"), qt.evaluate(() => document.getElementById("qr")!.click())]);
  await expect(con.locator("#man")).toHaveText("qr:owner");
  expect(await a.evaluate(() => (globalThis as unknown as { __moNgoai: string[] }).__moNgoai)).toEqual([]);
  await con.close();

  // Xuất Excel → tải được tệp (hộp "Lưu tệp" thay bằng đường dẫn cố định).
  const tep = path.join(thuMuc, "bao-cao.xlsx");
  await a.evaluate(({ session }, tep) => {
    session.fromPartition("persist:quan-tri").on("will-download", (_e: unknown, item: { setSavePath(p: string): void }) => item.setSavePath(tep));
  }, tep);
  await qt.evaluate(() => document.getElementById("xuat")!.click());
  await expect.poll(() => fs.existsSync(tep) && fs.readFileSync(tep, "utf8")).toBe("XLSX");

  // Đăng xuất máy quầy → đóng cửa sổ Quản trị + xóa đăng nhập quản trị.
  await a.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox;
  });
  await bamMenu(a, "Đăng xuất máy quầy");
  await expect(trang.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  expect(await a.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  expect(await a.evaluate(async ({ session }) => (await session.fromPartition("persist:quan-tri").cookies.get({})).length)).toBe(0);
});

/** Bản đã cài: bấm ☰ → Kiểm tra cập nhật, ghi lại câu hộp thoại (hộp thoại thật được thay bằng bản ghi). */
async function kiemTraCapNhatTren(apiBase: string): Promise<string[]> {
  const { app: a } = await moApp(apiBase);
  await a.evaluate(({ dialog }) => {
    const g = globalThis as unknown as { __hoi: string[] };
    g.__hoi = [];
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const o = args.find((x) => x && typeof x === "object" && "message" in (x as object)) as { message: string };
      g.__hoi.push(o.message);
      return { response: 1, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
  });
  await bamMenu(a, "Kiểm tra cập nhật");
  await expect.poll(() => a.evaluate(() => (globalThis as unknown as { __hoi: string[] }).__hoi.length), { timeout: 30_000 }).toBe(1);
  return a.evaluate(() => (globalThis as unknown as { __hoi: string[] }).__hoi);
}

test("bản đã cài: Kiểm tra cập nhật khi nguồn cập nhật lỗi → báo rõ, không treo, không báo bản mới", async () => {
  test.skip(!EXE, "chỉ bản đóng gói mới có tự cập nhật (TECHMENU_EXE)");
  // Máy chủ giả không có /api/desktop/update/latest.yml (404).
  expect(await kiemTraCapNhatTren(may.url)).toEqual(["Chưa kiểm được bản mới — kiểm tra mạng rồi thử lại."]);
});

test("bản đã cài: Kiểm tra cập nhật hỏi máy chủ production thật → không báo nhầm bản cũ hơn là bản mới", async () => {
  test.skip(!EXE, "chỉ bản đóng gói mới có tự cập nhật (TECHMENU_EXE)");
  const cai = JSON.parse(fs.readFileSync("desktop/package.json", "utf8")).version as string;
  const hoi = await kiemTraCapNhatTren("https://restaurant-management-zeta.vercel.app");
  // Máy chủ đang có bản <= bản đã cài → "Đã là bản mới nhất"; có bản mới hơn thật → "Đang tải bản …".
  const dung = hoi[0] === `Đã là bản mới nhất (${cai}).` || hoi[0].startsWith("Đang tải bản ");
  expect(dung, hoi[0]).toBe(true);
  console.log("Máy chủ production trả lời:", hoi[0]);
});
