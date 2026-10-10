// desktop/main.mjs — "TechMenu Thu ngân": ứng dụng Windows cho máy quầy (P21, QD-026).
//
// Vỏ Electron mở CHÍNH trang POS / Màn bếp trên web (không viết lại giao diện), cộng cầu in chạy bên trong app
// (scripts/print-bridge.mjs) — thay cho lối tắt Chrome in thẳng + tác vụ nền `CauInBep`. Như KiotViet Thu ngân:
// cài xong mở màn Đăng nhập, sau đó là Thu ngân / Màn bếp, menu ☰.
//
// An toàn (DESK-04): trang web chạy trong sandbox, không chạm được Node/tệp máy; chỉ điều hướng trong tên miền app;
// kênh IPC có quyền (kích hoạt, cài máy in) chỉ nhận lệnh từ trang cục bộ của app.
import { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell, safeStorage, nativeImage, powerMonitor, session } from "electron";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import electronUpdater from "electron-updater";
import { docCauHinh, ghiCauHinh, xoaCauHinh, tuPhanHoiKichHoat, duongDanManHinh, chuanHoaMayIn } from "./lib/cau-hinh.mjs";
import { moiTruongCauIn } from "./lib/moi-truong.mjs";
import { taiDanhSachNoi, chuanHoaMayNoi } from "./lib/noi-in.mjs";
import { QuanLyCauIn, inThu } from "./lib/cau-in.mjs";
import { phatHienCauInCu, goCauInCu, mayInTuEnvCu } from "./lib/cau-in-cu.mjs";
import { duocCaiBanMoi, KIEM_MOI_MS } from "./lib/cap-nhat.mjs";
import { docMayInWindows, phanLoaiMayIn, giuMayDaLuu } from "./lib/may-in-usb.mjs";
import fs from "node:fs";

const { autoUpdater } = electronUpdater;
const THU_MUC_APP = path.dirname(fileURLToPath(import.meta.url));
const TEN_APP = "TechMenu Thu ngân";

/** Máy chủ: cài sẵn lúc build; TECHMENU_API_BASE chỉ để chạy bản dev / test. Đổi sang techmenu.vn khi có tên miền. */
const API_BASE = (process.env.TECHMENU_API_BASE || "https://restaurant-management-zeta.vercel.app").replace(/\/+$/, "");

// Test E2E chạy app trong thư mục dữ liệu riêng, không đụng cấu hình máy thật.
if (process.env.TECHMENU_USER_DATA) app.setPath("userData", process.env.TECHMENU_USER_DATA);
app.setAppUserModelId("vn.techmenu.thungan");

const TEP_CAU_HINH = () => path.join(app.getPath("userData"), "cau-hinh.json");
const THU_MUC_TRANG = path.join(THU_MUC_APP, "trang");
/** Tệp cầu in: trong gói cài nằm ở resources/cau-in (extraResources); chạy từ repo thì lấy thẳng scripts/. */
const THU_MUC_CAU_IN = app.isPackaged ? path.join(process.resourcesPath, "cau-in") : path.join(THU_MUC_APP, "..", "scripts");
const TEP_CAU_IN = path.join(THU_MUC_CAU_IN, "print-bridge.mjs");
const BIEU_TUONG = path.join(THU_MUC_APP, "build", "icon.png");

let cuaSo = null;
let khay = null;
let cauHinh = null;
let dangThoat = false;
let daBaoXuongKhay = false;
let daHoiCauInCu = false;
let dangHoiCauInCu = false;
let choHoiViBiChan = false;
/** Cầu in của app bị cầu in khác trên máy giữ khóa (mã thoát 3) — khay hiện mục "Gỡ cầu in cũ". */
let biChanBoiCauInKhac = false;
let trangThaiIn = { chay: false };
let banMoi = { daTaiXong: false, phienBan: null, dangTai: false };

// ── Một bản duy nhất (DESK-03): mở lần hai → hiện cửa sổ đang chạy, không sinh tiến trình / cầu in thứ hai ──
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => hienCuaSo());
  app.whenReady().then(khoiDong);
}

function hienCuaSo() {
  if (!cuaSo) return;
  if (cuaSo.isMinimized()) cuaSo.restore();
  cuaSo.show();
  cuaSo.focus();
}

// ── Mật khẩu tài khoản printer: mã hóa bằng DPAPI (safeStorage) ──
function maHoa(chu) {
  return safeStorage.encryptString(chu).toString("base64");
}
function giaiMa(b64) {
  try {
    return safeStorage.decryptString(Buffer.from(b64, "base64"));
  } catch {
    return null;
  }
}

// ── Cầu in trong app (DESK-05) ──
const cauIn = new QuanLyCauIn({
  node: process.execPath,
  tepCauIn: TEP_CAU_IN,
  thuMucLog: path.join(app.getPath("userData"), "logs"),
  taoMoiTruong: () => {
    if (!cauHinh?.coMayIn) return null;
    const matKhau = giaiMa(cauHinh.printer.matKhauMaHoa);
    return moiTruongCauIn(cauHinh, { matKhau, phienBanApp: app.getVersion(), moiTruongGoc: process.env });
  },
  khiTrangThai: (s) => {
    trangThaiIn = s;
    capNhatKhay();
  },
  khiCoCauInKhac: () => {
    biChanBoiCauInKhac = true;
    capNhatKhay();
    hoiGoCauInCu(true);
  },
});

// ── Khởi động ──
async function khoiDong() {
  cauHinh = docCauHinh(TEP_CAU_HINH());
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });

  taoCuaSo();
  taoKhay();
  dungMenu();
  batTaiTepQuanTri();

  if (!cauHinh) {
    moTrangCucBo("kich-hoat.html");
  } else {
    moManHinh();
    batDauIn();
  }
  batTuCapNhat();
}

function taoCuaSo() {
  cuaSo = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: TEN_APP,
    icon: BIEU_TUONG,
    backgroundColor: "#fffaeb",
    // Màn bếp phát chuông khi có đơn mới — không chờ người bấm vào trang.
    webPreferences: cauHinhTrang({ autoplayPolicy: "no-user-gesture-required" }),
  });
  cuaSo.once("ready-to-show", () => {
    cuaSo.maximize();
    cuaSo.show();
  });

  // Bấm ✕ → xuống khay, cầu in vẫn chạy (DESK-03). Thoát thật chỉ từ menu (có hỏi) hoặc khi Windows tắt máy.
  cuaSo.on("close", (e) => {
    if (dangThoat) return;
    e.preventDefault();
    cuaSo.hide();
    if (!daBaoXuongKhay && khay) {
      daBaoXuongKhay = true;
      khay.displayBalloon?.({
        title: TEN_APP,
        content: "App vẫn chạy ở khay hệ thống (góc phải thanh tác vụ) để in phiếu bếp và hóa đơn.",
      });
    }
  });
  // Windows tắt máy / đăng xuất: không chặn.
  cuaSo.on("query-session-end", () => {
    dangThoat = true;
  });
  cuaSo.on("session-end", () => {
    dangThoat = true;
  });

  ganBaoVe(cuaSo, { moCuaSoCon: false });
  // Tải lại bằng F5 như trình duyệt (KiotViet: "Đồng bộ dữ liệu").
  cuaSo.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.key === "F5") {
      e.preventDefault();
      taiLai();
    }
  });
}

/** Cấu hình trang web chung cho mọi cửa sổ (DESK-04): sandbox, không Node, không webview. */
function cauHinhTrang(them = {}) {
  return {
    preload: path.join(THU_MUC_APP, "preload.cjs"),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webviewTag: false,
    spellcheck: false,
    devTools: !app.isPackaged,
    ...them,
  };
}

/**
 * Hàng rào chung cho một cửa sổ: chỉ điều hướng trong tên miền app, liên kết ngoài mở trình duyệt, chặn webview,
 * giới hạn quyền, mất mạng → màn "đang thử lại" ngay trong cửa sổ đó.
 * `moCuaSoCon`: trang cùng tên miền mở tab mới (admin: "In mã QR", "Xem thực đơn") → cửa sổ con CÙNG phiên, cùng hàng rào —
 * mở ra trình duyệt thì mất đăng nhập.
 */
function ganBaoVe(win, { moCuaSoCon, partition }) {
  const wc = win.webContents;
  const chan = (e, url) => {
    if (!duocDieuHuong(url)) {
      e.preventDefault();
      moNgoai(url);
    }
  };
  wc.on("will-navigate", chan);
  wc.on("will-redirect", chan);
  wc.setWindowOpenHandler(({ url }) => {
    if (moCuaSoCon && duocDieuHuong(url) && !url.startsWith("file:")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: { icon: BIEU_TUONG, autoHideMenuBar: true, webPreferences: cauHinhTrang({ partition }) },
      };
    }
    moNgoai(url);
    return { action: "deny" };
  });
  wc.on("did-create-window", (con) => ganBaoVe(con, { moCuaSoCon, partition }));
  wc.on("will-attach-webview", (e) => e.preventDefault());
  wc.session.setPermissionRequestHandler((_wc, quyen, xong) => {
    xong(["clipboard-sanitized-write", "notifications", "fullscreen"].includes(quyen));
  });
  // Mất mạng lúc mở trang (và service worker P17 không đỡ được) → màn của app, tự thử lại (DESK-04).
  wc.on("did-fail-load", (_e, maLoi, _moTa, url, khungChinh) => {
    if (!khungChinh || maLoi === -3 || url.startsWith("file:")) return;
    moTrangCucBo("mat-mang.html", { dich: url }, win);
  });
}

// ── Quản trị trong app (DESK-13, QD-033 D1) ──
// Cửa sổ riêng, PHIÊN RIÊNG: POS và admin cùng tên miền ⇒ chung cookie; chủ đăng nhập admin trong cửa sổ POS sẽ đá thu
// ngân đang bán ra ngoài. Phân vùng `persist:quan-tri` giữ đăng nhập quản trị giữa các lần mở, tách khỏi POS.
const PHIEN_QUAN_TRI = "persist:quan-tri";
let cuaSoQuanTri = null;

function moQuanTri() {
  if (!cauHinh) return;
  if (cuaSoQuanTri) {
    if (cuaSoQuanTri.isMinimized()) cuaSoQuanTri.restore();
    cuaSoQuanTri.show();
    cuaSoQuanTri.focus();
    return;
  }
  const tieuDe = `Quản trị — ${cauHinh.tenantName}`;
  cuaSoQuanTri = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: tieuDe,
    icon: BIEU_TUONG,
    autoHideMenuBar: true,
    backgroundColor: "#fffaeb",
    webPreferences: cauHinhTrang({ partition: PHIEN_QUAN_TRI }),
  });
  cuaSoQuanTri.setMenuBarVisibility(false);
  cuaSoQuanTri.once("ready-to-show", () => {
    cuaSoQuanTri?.maximize();
    cuaSoQuanTri?.show();
  });
  // Giữ tiêu đề "Quản trị — {quán}" để phân biệt với cửa sổ Thu ngân trên thanh tác vụ.
  cuaSoQuanTri.on("page-title-updated", (e) => e.preventDefault());
  cuaSoQuanTri.on("closed", () => {
    cuaSoQuanTri = null;
  });
  ganBaoVe(cuaSoQuanTri, { moCuaSoCon: true, partition: PHIEN_QUAN_TRI });
  cuaSoQuanTri.loadURL(duongDanQuanTri(cauHinh));
}

/** Vào qua trang đăng nhập quản trị: đã đăng nhập chủ/quản lý thì trang tự chuyển vào admin; `chi-quan-tri=1` để thu
 *  ngân đăng nhập nhầm ở đây nhận câu "không có quyền" thay vì mở POS thứ hai trong cửa sổ Quản trị. */
function duongDanQuanTri(c) {
  return `${new URL(c.apiBase ?? API_BASE).origin}/r/${c.slug}/admin/login?chi-quan-tri=1`;
}

/** Xuất Excel / tải tệp từ admin: hộp "Lưu tệp" của Windows, mặc định thư mục Tải xuống. */
function batTaiTepQuanTri() {
  session.fromPartition(PHIEN_QUAN_TRI).on("will-download", (_e, item) => {
    item.setSaveDialogOptions({ title: "Lưu tệp", defaultPath: path.join(app.getPath("downloads"), item.getFilename()) });
  });
}

/** Đăng xuất máy quầy: đóng cửa sổ Quản trị + xóa đăng nhập quản trị (máy về như mới cài). */
async function xoaPhienQuanTri() {
  if (cuaSoQuanTri) cuaSoQuanTri.destroy();
  cuaSoQuanTri = null;
  await session.fromPartition(PHIEN_QUAN_TRI).clearStorageData();
}

/** Chỉ tên miền app và trang cục bộ của app. */
function duocDieuHuong(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "file:") return path.resolve(fileURLToPath(u)).startsWith(path.resolve(THU_MUC_TRANG));
    return u.origin === new URL(cauHinh?.apiBase ?? API_BASE).origin;
  } catch {
    return false;
  }
}

function moNgoai(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || u.protocol === "http:") shell.openExternal(url);
  } catch {
    /* bỏ qua liên kết lạ */
  }
}

function moTrangCucBo(ten, thamSo = {}, win = cuaSo) {
  const url = pathToFileURL(path.join(THU_MUC_TRANG, ten));
  for (const [k, v] of Object.entries(thamSo)) url.searchParams.set(k, String(v));
  win.loadURL(url.toString());
}

function moManHinh() {
  cuaSo.loadURL(duongDanManHinh(cauHinh));
  cuaSo.setTitle(`${TEN_APP} — ${cauHinh.tenantName}`);
}

function taiLai() {
  const url = cuaSo.webContents.getURL();
  if (!url || url.startsWith("file:")) {
    if (cauHinh) moManHinh();
    return;
  }
  cuaSo.webContents.reload();
}

// ── Menu ☰ (DESK-02) ──
function dungMenu() {
  const coCauHinh = Boolean(cauHinh);
  const muc = [
    {
      label: "☰ Menu",
      submenu: [
        {
          label: "Thu ngân",
          type: "radio",
          checked: cauHinh?.manHinh !== "kds",
          enabled: coCauHinh,
          click: () => chonManHinh("pos"),
        },
        {
          label: "Màn bếp",
          type: "radio",
          checked: cauHinh?.manHinh === "kds",
          enabled: coCauHinh,
          click: () => chonManHinh("kds"),
        },
        { type: "separator" },
        { label: "Quản trị", enabled: coCauHinh, click: moQuanTri },
        { type: "separator" },
        { label: "Tải lại", accelerator: "F5", enabled: coCauHinh, click: taiLai },
        { label: "Cài đặt máy in", enabled: Boolean(cauHinh?.coMayIn), click: () => moTrangCucBo("cai-dat-may-in.html") },
        { type: "separator" },
        ...(cauHinh?.nhieuChiNhanh ? [{ label: "Đổi chi nhánh", click: () => dangXuatMayQuay("doi-chi-nhanh") }] : []),
        { label: "Đăng xuất máy quầy", enabled: coCauHinh, click: () => dangXuatMayQuay("dang-xuat") },
        { type: "separator" },
        ...mucCapNhat(),
        { label: "Giới thiệu", click: gioiThieu },
        { label: "Thoát", click: thoatCoHoi },
      ],
    },
  ];
  if (!app.isPackaged) {
    muc.push({ label: "Dev", submenu: [{ role: "toggleDevTools" }, { role: "forceReload" }] });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(muc));
}

function chonManHinh(manHinh) {
  if (!cauHinh) return;
  cauHinh = ghiCauHinh(TEP_CAU_HINH(), { ...cauHinh, manHinh });
  moManHinh();
  dungMenu();
}

async function dangXuatMayQuay(kieu) {
  const doi = kieu === "doi-chi-nhanh";
  const { response } = await dialog.showMessageBox(cuaSo, {
    type: "warning",
    buttons: [doi ? "Đổi chi nhánh" : "Đăng xuất", "Hủy"],
    defaultId: 1,
    cancelId: 1,
    title: TEN_APP,
    message: doi ? "Đổi sang chi nhánh khác?" : "Đăng xuất máy quầy?",
    detail:
      (cauHinh?.coMayIn ? "Máy này sẽ NGỪNG in phiếu bếp và hóa đơn cho tới khi đăng nhập lại.\n" : "") +
      "Cần email và mật khẩu chủ quán hoặc quản lý chi nhánh để đăng nhập lại.",
  });
  if (response !== 0) return;
  await cauIn.dungLai();
  xoaCauHinh(TEP_CAU_HINH());
  cauHinh = null;
  trangThaiIn = { chay: false };
  // Xóa phiên đăng nhập nhân viên trên trang (cookie) — máy về trạng thái như mới cài.
  await cuaSo.webContents.session.clearStorageData();
  await xoaPhienQuanTri();
  dungMenu();
  capNhatKhay();
  moTrangCucBo("kich-hoat.html");
}

async function gioiThieu() {
  const capNhat = banMoi.daTaiXong
    ? `Đã tải bản ${banMoi.phienBan} — bấm Cập nhật ngay, hoặc app tự cập nhật khi máy rảnh 5 phút / khi tắt app.`
    : banMoi.dangTai
      ? `Đang tải bản ${banMoi.phienBan}…`
      : app.isPackaged
        ? "Đã là bản mới nhất."
        : "Bản chạy thử (không tự cập nhật).";
  const { response } = await dialog.showMessageBox(cuaSo, {
    type: "info",
    buttons: banMoi.daTaiXong ? ["Cập nhật ngay", "Đóng"] : ["Đóng"],
    defaultId: 0,
    cancelId: banMoi.daTaiXong ? 1 : 0,
    title: TEN_APP,
    message: `${TEN_APP} ${app.getVersion()}`,
    detail: `${cauHinh ? `Quán: ${cauHinh.tenantName}\n` : ""}${capNhat}`,
  });
  if (banMoi.daTaiXong && response === 0) capNhatNgay();
}

// ── Cập nhật bằng tay (1.0.2): như mọi app máy tính — có bản mới thì hỏi, menu ☰ + khay có nút cập nhật ──
/** Mục menu ☰ về cập nhật: bản mới đã tải → "Cập nhật lên bản x"; đang tải → dòng mờ; luôn có "Kiểm tra cập nhật". */
function mucCapNhat() {
  if (banMoi.daTaiXong) return [{ label: `Cập nhật lên bản ${banMoi.phienBan}`, click: () => hoiCapNhat(true) }];
  return [
    ...(banMoi.dangTai ? [{ label: `Đang tải bản ${banMoi.phienBan}…`, enabled: false }] : []),
    { label: "Kiểm tra cập nhật", click: kiemTraCapNhat },
  ];
}

/** Đã hỏi bản nào rồi — mỗi bản chỉ tự bật hộp thoại một lần mỗi phiên (thu ngân bấm "Để sau" thì thôi làm phiền). */
let daHoiCapNhat = null;

async function hoiCapNhat(nguoiBam) {
  if (!banMoi.daTaiXong) return;
  if (!nguoiBam) {
    if (daHoiCapNhat === banMoi.phienBan) return;
    daHoiCapNhat = banMoi.phienBan;
    // Cửa sổ đang ẩn ở khay: không bật lên giữa ca — báo ở khay, người dùng tự bấm.
    if (!cuaSo?.isVisible()) {
      khay?.displayBalloon?.({ title: TEN_APP, content: `Có bản mới ${banMoi.phienBan} — chuột phải biểu tượng để cập nhật.` });
      return;
    }
  } else hienCuaSo();
  const { response } = await dialog.showMessageBox(cuaSo, {
    type: "info",
    buttons: ["Cập nhật ngay", "Để sau"],
    defaultId: 0,
    cancelId: 1,
    title: TEN_APP,
    message: `Có bản mới TechMenu Thu ngân ${banMoi.phienBan}`,
    detail:
      "App sẽ tự đóng, cài bản mới và mở lại sau khoảng 10–20 giây. Đơn và hóa đơn đang mở không mất (nằm trên máy chủ).\n" +
      "Để sau: app tự cập nhật khi máy để yên 5 phút hoặc khi tắt app.",
  });
  if (response === 0) capNhatNgay();
}

/** Cài ngay: cầu in dừng ở điểm an toàn trước (không bỏ dở phiếu đang in), rồi cài im lặng và mở lại app. */
async function capNhatNgay() {
  if (!banMoi.daTaiXong) return;
  dangThoat = true;
  await cauIn.dungLai();
  autoUpdater.quitAndInstall(true, true);
}

/** "1.0.10" mới hơn "1.0.9" — so từng số, không so chuỗi. */
function moiHon(a, b) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

async function kiemTraCapNhat() {
  if (!app.isPackaged) {
    await dialog.showMessageBox(cuaSo, { type: "info", title: TEN_APP, message: "Bản chạy thử không tự cập nhật." });
    return;
  }
  if (banMoi.daTaiXong) return hoiCapNhat(true);
  let moi = null;
  let coBanMoi = false;
  try {
    const kq = await autoUpdater.checkForUpdates();
    moi = kq?.updateInfo?.version ?? null;
    // Chỉ khi máy chủ có bản MỚI HƠN (máy chủ có thể đang để bản cũ hơn bản đã cài — không phải "bản mới").
    coBanMoi = kq?.isUpdateAvailable ?? (moi !== null && moiHon(moi, app.getVersion()));
  } catch {
    await dialog.showMessageBox(cuaSo, { type: "warning", title: TEN_APP, message: "Chưa kiểm được bản mới — kiểm tra mạng rồi thử lại." });
    return;
  }
  await dialog.showMessageBox(cuaSo, {
    type: "info",
    title: TEN_APP,
    message: coBanMoi ? `Đang tải bản ${moi}…` : `Đã là bản mới nhất (${app.getVersion()}).`,
    detail: coBanMoi ? "Tải xong app sẽ hỏi cập nhật (vài phút tùy mạng)." : undefined,
  });
}

async function thoatCoHoi() {
  const { response } = await dialog.showMessageBox(cuaSo, {
    type: "warning",
    buttons: ["Thoát", "Hủy"],
    defaultId: 1,
    cancelId: 1,
    title: TEN_APP,
    message: "Thoát TechMenu Thu ngân?",
    detail: cauHinh?.coMayIn ? "Thoát thì máy này ngừng in phiếu bếp và hóa đơn." : undefined,
  });
  if (response === 0) thoatHan();
}

async function thoatHan() {
  dangThoat = true;
  await cauIn.dungLai();
  app.quit();
}

app.on("before-quit", (e) => {
  // Thoát theo đường khác (Windows tắt máy, cài bản mới): vẫn cho cầu in dừng ở điểm an toàn trước.
  dangThoat = true;
  if (cauIn.dangChay) {
    e.preventDefault();
    cauIn.dungLai().then(() => app.quit());
  }
});
app.on("window-all-closed", () => {
  /* ở lại khay */
});

// ── Khay hệ thống (DESK-03) ──
function taoKhay() {
  const anh = nativeImage.createFromPath(BIEU_TUONG).resize({ width: 16, height: 16 });
  khay = new Tray(anh);
  khay.setToolTip(TEN_APP);
  khay.on("click", hienCuaSo);
  khay.on("double-click", hienCuaSo);
  capNhatKhay();
}

function moTaMayIn(ten, giaTri) {
  if (giaTri === true) return `${ten}: đang in được`;
  if (giaTri === false) return `${ten}: KHÔNG phản hồi`;
  return `${ten}: chưa rõ`;
}

function capNhatKhay() {
  if (!khay) return;
  let dong;
  if (!cauHinh) dong = ["Chưa đăng nhập"];
  else if (!cauHinh.coMayIn) dong = ["Máy này không in (chỉ xem)"];
  else if (!cauHinh.mayIn.bep && !cauHinh.mayIn.quay) dong = ["Chưa cài máy in"];
  else if (!trangThaiIn.chay) dong = [trangThaiIn.loi ?? "Cầu in chưa chạy"];
  else {
    dong = [trangThaiIn.nhipOk === false ? "Mất kết nối máy chủ — đang thử lại" : "Đang kết nối máy chủ"];
    if (cauHinh.mayIn.bep) dong.push(moTaMayIn("Máy in bếp", trangThaiIn.bep));
    if (cauHinh.mayIn.quay) dong.push(moTaMayIn("Máy in quầy", trangThaiIn.quay));
  }
  khay.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Mở TechMenu", click: hienCuaSo },
      { type: "separator" },
      ...dong.map((label) => ({ label, enabled: false })),
      ...(biChanBoiCauInKhac ? [{ label: "Gỡ cầu in cũ…", click: () => (hienCuaSo(), hoiGoCauInCu(true)) }] : []),
      ...(banMoi.daTaiXong ? [{ label: `Cập nhật lên bản ${banMoi.phienBan}`, click: () => hoiCapNhat(true) }] : []),
      { type: "separator" },
      { label: "Thoát", click: () => (hienCuaSo(), thoatCoHoi()) },
    ])
  );
}

// ── In ──
function batDauIn() {
  if (!cauHinh?.coMayIn) return;
  cauIn.batDau();
  if (app.isPackaged || process.env.TECHMENU_KIEM_CAU_IN_CU === "1") hoiGoCauInCu(false);
}

/**
 * Cầu in cũ (DESK-08): kích hoạt app đã xoay mật khẩu `printer` nên cầu in cũ mất quyền; vẫn gỡ tác vụ + tiến trình
 * để máy không chạy thừa và (khi còn giữ khóa cổng) không chặn cầu in của app.
 *
 * `boiCauInKhac` = cầu in của app vừa bị khóa chặn (mã thoát 3) → LUÔN hỏi, kể cả khi lúc mở app đã dò không thấy gì:
 * cầu in cũ chạy dưới tài khoản SYSTEM thì người dùng thường không đọc được dòng lệnh / tác vụ của nó (gặp ở qt-food
 * 29/09/2026 — app kẹt "đang có cầu in khác chạy" mà không có cách gỡ). Dò lúc mở app chỉ hỏi một lần mỗi phiên.
 */
async function hoiGoCauInCu(boiCauInKhac) {
  if (dangHoiCauInCu) {
    // Bước dò lúc mở app đang chạy (vài giây) đúng lúc cầu in bị chặn — xếp chờ, hỏi ngay khi bước dò xong.
    if (boiCauInKhac) choHoiViBiChan = true;
    return;
  }
  if (!boiCauInKhac && daHoiCauInCu) return;
  dangHoiCauInCu = true;
  try {
    await hoiVaGo(boiCauInKhac);
  } finally {
    dangHoiCauInCu = false;
  }
  if (choHoiViBiChan && biChanBoiCauInKhac) {
    choHoiViBiChan = false;
    await hoiGoCauInCu(true);
  }
}

async function hoiVaGo(boiCauInKhac) {
  if (!boiCauInKhac) {
    daHoiCauInCu = true;
    if (!(await phatHienCauInCu(THU_MUC_APP)).coCauInCu) return;
  }
  const { response } = await dialog.showMessageBox(cuaSo, {
    type: "warning",
    buttons: ["Gỡ cầu in cũ", "Để sau"],
    defaultId: 0,
    cancelId: 1,
    title: TEN_APP,
    message: "Máy này đang chạy cầu in cũ.",
    detail:
      "Để tránh in trùng phiếu, cần gỡ cầu in cũ (cài bằng CAI-DAT.bat trước đây). Windows sẽ hỏi quyền quản trị một lần — bấm Yes.",
  });
  if (response !== 0) return;
  const ok = await goCauInCu(path.join(THU_MUC_CAU_IN, "go-cai-dat.ps1"));
  if (ok) {
    biChanBoiCauInKhac = false;
    capNhatKhay();
    cauIn.khoiDongLai();
  } else {
    dialog.showMessageBox(cuaSo, {
      type: "error",
      title: TEN_APP,
      message: "Chưa gỡ được cầu in cũ.",
      detail: "Có thể đã bấm No ở hộp thoại xin quyền. Thử lại: chuột phải biểu tượng TechMenu ở khay → Gỡ cầu in cũ.",
    });
  }
}

// ── IPC: chỉ trang cục bộ của app được gọi lệnh có quyền ──
function tuTrangCucBo(e) {
  const url = e.senderFrame?.url ?? "";
  try {
    return url.startsWith("file:") && path.resolve(fileURLToPath(url)).startsWith(path.resolve(THU_MUC_TRANG));
  } catch {
    return false;
  }
}

/** `ham(...args, e)` — sự kiện IPC đứng cuối để lệnh nào cần biết cửa sổ gọi (thử lại khi mất mạng) thì dùng. */
function xuLy(kenh, ham) {
  ipcMain.handle(kenh, async (e, ...args) => {
    if (!tuTrangCucBo(e)) throw new Error("Không được phép.");
    return ham(...args, e);
  });
}

// Dữ liệu cho trang POS (preload): app phiên bản mấy, máy này có cầu in không. Không có hàm hệ thống nào.
ipcMain.on("thong-tin-app", (e) => {
  e.returnValue = { phienBan: app.getVersion(), coCauIn: Boolean(cauHinh?.coMayIn) };
});

xuLy("kich-hoat", async (vao) => {
  const body = {
    email: String(vao?.email ?? ""),
    password: String(vao?.password ?? ""),
    tenantId: vao?.tenantId ? String(vao.tenantId) : undefined,
    coMayIn: Boolean(vao?.coMayIn),
  };
  let res;
  try {
    res = await fetch(`${API_BASE}/api/desktop/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { loi: "Không kết nối được máy chủ — kiểm tra mạng rồi thử lại." };
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { loi: typeof json.error === "string" ? json.error : "Không kích hoạt được — thử lại." };
  if (Array.isArray(json.chonChiNhanh)) return { chonChiNhanh: json.chonChiNhanh };

  const moi = tuPhanHoiKichHoat(json, {
    apiBase: API_BASE,
    coMayIn: body.coMayIn,
    nhieuChiNhanh: Boolean(vao?.nhieuChiNhanh),
    maHoa,
  });
  if (!moi) return { loi: "Máy chủ trả dữ liệu lạ — báo TechMenu." };
  if (body.coMayIn && !moi.coMayIn) return { loi: "Máy chủ chưa cấp tài khoản máy in — thử lại." };

  // Chuyển từ cầu in cũ: điền sẵn máy in từ cấu hình cũ (DESK-08). Chỉ đọc IP / tên máy in, không đọc mật khẩu.
  if (moi.coMayIn) {
    const cu = (await phatHienCauInCu(THU_MUC_APP)).thuMuc.find((d) => fs.existsSync(path.join(d, ".env.local")));
    if (cu) {
      const mi = mayInTuEnvCu(fs.readFileSync(path.join(cu, ".env.local"), "utf8"));
      moi.mayIn = { bep: chuanHoaMayIn(mi.bep), quay: chuanHoaMayIn(mi.quay), kho: mi.kho };
    }
  }
  cauHinh = ghiCauHinh(TEP_CAU_HINH(), moi);
  dungMenu();
  capNhatKhay();
  if (cauHinh.coMayIn) {
    batDauIn();
    moTrangCucBo("cai-dat-may-in.html", { lanDau: 1 });
  } else {
    moManHinh();
  }
  return { ok: true };
});

/** Máy in cho ô "Cắm USB vào máy này" (P33): PowerShell lỗi → tên máy in Electron, không ghi trạng thái. */
async function dsMayInUsb() {
  const win = await docMayInWindows();
  const ds = win
    ? phanLoaiMayIn(win.may, win.congCo)
    : phanLoaiMayIn((await cuaSo.webContents.getPrintersAsync()).map((p) => ({ ten: p.name })), null);
  const daLuu = cauHinh?.mayIn?.quay;
  return giuMayDaLuu(ds, daLuu?.kieu === "usb" ? daLuu.ten : null);
}

/** Bếp/bar của quán từ web (P37). Mất mạng / lỗi → null: màn chỉ hiện Bếp chính, cấu hình máy riêng đã lưu giữ nguyên. */
async function danhSachNoi() {
  try {
    const p = cauHinh.printer;
    return await taiDanhSachNoi({ supabaseUrl: p.supabaseUrl, anonKey: p.anonKey, email: p.email, matKhau: giaiMa(p.matKhauMaHoa) });
  } catch {
    return null;
  }
}

xuLy("may-in:doc", async () => {
  if (!cauHinh?.coMayIn) return null;
  const [usb, noi] = await Promise.all([dsMayInUsb(), danhSachNoi()]);
  return {
    mayIn: cauHinh.mayIn,
    usb,
    noi,
    tenantName: cauHinh.tenantName,
    huongDanCongUsb: `${new URL(cauHinh.apiBase ?? API_BASE).origin}/huong-dan-cai-dat#loi-cong-usb`,
  };
});

xuLy("may-in:ds-usb", async () => (cauHinh?.coMayIn ? dsMayInUsb() : []));

xuLy("may-in:do-lan", () =>
  new Promise((resolve) => {
    const con = spawn(process.execPath, [path.join(THU_MUC_CAU_IN, "print-scan.mjs")], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      windowsHide: true,
    });
    let out = "";
    con.stdout.on("data", (d) => (out += d));
    const han = setTimeout(() => con.kill(), 60_000);
    con.on("exit", () => {
      clearTimeout(han);
      resolve([...out.matchAll(/^\s+(\d{1,3}(?:\.\d{1,3}){3})\s*$/gm)].map((m) => m[1]));
    });
  })
);

/** Cấu hình nháp từ màn Cài đặt máy in → cấu hình đầy đủ (chưa ghi). */
function voiMayInNhap(nhap) {
  return {
    ...cauHinh,
    mayIn: {
      bep: chuanHoaMayIn(nhap?.bep),
      quay: chuanHoaMayIn(nhap?.quay),
      kho: nhap?.kho === "58" ? "58" : "80",
      noi: chuanHoaMayNoi(nhap?.noi, chuanHoaMayIn),
      lienHoaDon: [2, 3].includes(Number(nhap?.lienHoaDon)) ? Number(nhap.lienHoaDon) : 1,
    },
  };
}

/**
 * `vai`: "quay" | "bep" | { noi: id bếp/bar ("" = Bếp chính), ten } (P37 — tờ in thử ghi tên bếp/bar để biết ra máy nào).
 */
xuLy("may-in:in-thu", async (nhap, vai) => {
  if (!cauHinh?.coMayIn) return { ok: false, thongDiep: "Máy này không in." };
  const thu = voiMayInNhap(nhap);
  let them = {};
  if (vai && typeof vai === "object") {
    // Bếp/bar có máy riêng: in thử thẳng tới máy đó như một "máy bếp" (không qua máy quầy).
    if (vai.noi) thu.mayIn = { ...thu.mayIn, bep: thu.mayIn.noi[vai.noi] ?? null, quay: null };
    them = { TEST_STATION_NAME: String(vai.ten ?? "").slice(0, 30) };
    vai = "bep";
  }
  if (vai === "quay" ? !thu.mayIn.quay : !thu.mayIn.bep && !thu.mayIn.quay) {
    return { ok: false, thongDiep: "Chưa nhập máy in hợp lệ." };
  }
  const env = { ...moiTruongCauIn(thu, { matKhau: "in-thu", phienBanApp: app.getVersion(), moiTruongGoc: process.env }), ...them };
  return inThu({ node: process.execPath, tepCauIn: TEP_CAU_IN, env, vai: vai === "quay" ? "quay" : "bep" });
});

xuLy("may-in:luu", async (nhap) => {
  if (!cauHinh?.coMayIn) return { ok: false };
  cauHinh = ghiCauHinh(TEP_CAU_HINH(), voiMayInNhap(nhap));
  capNhatKhay();
  await cauIn.khoiDongLai();
  return { ok: true };
});

xuLy("mo-man-hinh", async () => {
  if (cauHinh) moManHinh();
});

xuLy("thu-lai", async (dich, e) => {
  // Màn "mất mạng" có thể đang nằm trong cửa sổ Quản trị — thử lại đúng cửa sổ đó, không kéo POS sang trang admin.
  const win = BrowserWindow.fromWebContents(e.sender) ?? cuaSo;
  if (typeof dich === "string" && duocDieuHuong(dich) && !dich.startsWith("file:")) win.loadURL(dich);
  else if (win === cuaSoQuanTri && cauHinh) win.loadURL(duongDanQuanTri(cauHinh));
  else if (cauHinh) moManHinh();
});

// ── Tự cập nhật (DESK-10) ──
function batTuCapNhat() {
  if (!app.isPackaged) return;
  autoUpdater.setFeedURL({ provider: "generic", url: `${API_BASE}/api/desktop/update/` });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", (i) => {
    banMoi = { ...banMoi, dangTai: true, phienBan: i.version };
    dungMenu();
  });
  autoUpdater.on("update-downloaded", (i) => {
    banMoi = { daTaiXong: true, dangTai: false, phienBan: i.version };
    dungMenu();
    capNhatKhay();
    hoiCapNhat(false);
  });
  autoUpdater.on("error", () => {
    banMoi = { ...banMoi, dangTai: false };
    dungMenu();
  });
  const kiem = () => autoUpdater.checkForUpdates().catch(() => {});
  kiem();
  setInterval(kiem, KIEM_MOI_MS);
  // Mỗi phút xem máy đã rảnh chưa — cài khi không ai thao tác ≥ 5 phút; cầu in dừng ở điểm an toàn trước.
  setInterval(async () => {
    if (!duocCaiBanMoi({ daTaiXong: banMoi.daTaiXong, giayKhongThaoTac: powerMonitor.getSystemIdleTime(), dangTatApp: false })) return;
    dangThoat = true;
    await cauIn.dungLai();
    autoUpdater.quitAndInstall(true, true);
  }, 60_000);
}
