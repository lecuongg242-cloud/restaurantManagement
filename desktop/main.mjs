// desktop/main.mjs — "TechMenu Thu ngân": ứng dụng Windows cho máy quầy (P21, QD-026).
//
// Vỏ Electron mở CHÍNH trang POS / Màn bếp trên web (không viết lại giao diện), cộng cầu in chạy bên trong app
// (scripts/print-bridge.mjs) — thay cho lối tắt Chrome in thẳng + tác vụ nền `CauInBep`. Như KiotViet Thu ngân:
// cài xong mở màn Đăng nhập, sau đó là Thu ngân / Màn bếp, menu ☰.
//
// An toàn (DESK-04): trang web chạy trong sandbox, không chạm được Node/tệp máy; chỉ điều hướng trong tên miền app;
// kênh IPC có quyền (kích hoạt, cài máy in) chỉ nhận lệnh từ trang cục bộ của app.
import { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell, safeStorage, nativeImage, powerMonitor } from "electron";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import electronUpdater from "electron-updater";
import { docCauHinh, ghiCauHinh, xoaCauHinh, tuPhanHoiKichHoat, duongDanManHinh, chuanHoaMayIn } from "./lib/cau-hinh.mjs";
import { moiTruongCauIn } from "./lib/moi-truong.mjs";
import { QuanLyCauIn, inThu } from "./lib/cau-in.mjs";
import { phatHienCauInCu, goCauInCu, mayInTuEnvCu } from "./lib/cau-in-cu.mjs";
import { duocCaiBanMoi, KIEM_MOI_MS } from "./lib/cap-nhat.mjs";
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
  khiCoCauInKhac: () => hoiGoCauInCu(true),
});

// ── Khởi động ──
async function khoiDong() {
  cauHinh = docCauHinh(TEP_CAU_HINH());
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });

  taoCuaSo();
  taoKhay();
  dungMenu();

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
    webPreferences: {
      preload: path.join(THU_MUC_APP, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged,
      // Màn bếp phát chuông khi có đơn mới — không chờ người bấm vào trang.
      autoplayPolicy: "no-user-gesture-required",
    },
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

  const wc = cuaSo.webContents;
  wc.on("will-navigate", (e, url) => {
    if (!duocDieuHuong(url)) {
      e.preventDefault();
      moNgoai(url);
    }
  });
  wc.on("will-redirect", (e, url) => {
    if (!duocDieuHuong(url)) {
      e.preventDefault();
      moNgoai(url);
    }
  });
  wc.setWindowOpenHandler(({ url }) => {
    moNgoai(url);
    return { action: "deny" };
  });
  wc.on("will-attach-webview", (e) => e.preventDefault());
  wc.session.setPermissionRequestHandler((_wc, quyen, xong) => {
    xong(["clipboard-sanitized-write", "notifications", "fullscreen"].includes(quyen));
  });
  // Mất mạng lúc mở trang (và service worker P17 không đỡ được) → màn của app, tự thử lại (DESK-04).
  wc.on("did-fail-load", (_e, maLoi, _moTa, url, khungChinh) => {
    if (!khungChinh || maLoi === -3 || url.startsWith("file:")) return;
    moTrangCucBo("mat-mang.html", { dich: url });
  });
  // Tải lại bằng F5 như trình duyệt (KiotViet: "Đồng bộ dữ liệu").
  wc.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.key === "F5") {
      e.preventDefault();
      taiLai();
    }
  });
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

function moTrangCucBo(ten, thamSo = {}) {
  const url = pathToFileURL(path.join(THU_MUC_TRANG, ten));
  for (const [k, v] of Object.entries(thamSo)) url.searchParams.set(k, String(v));
  cuaSo.loadURL(url.toString());
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
        { label: "Tải lại", accelerator: "F5", enabled: coCauHinh, click: taiLai },
        { label: "Cài đặt máy in", enabled: Boolean(cauHinh?.coMayIn), click: () => moTrangCucBo("cai-dat-may-in.html") },
        { type: "separator" },
        ...(cauHinh?.nhieuChiNhanh ? [{ label: "Đổi chi nhánh", click: () => dangXuatMayQuay("doi-chi-nhanh") }] : []),
        { label: "Đăng xuất máy quầy", enabled: coCauHinh, click: () => dangXuatMayQuay("dang-xuat") },
        { type: "separator" },
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
      "Cần email và mật khẩu chủ quán để đăng nhập lại.",
  });
  if (response !== 0) return;
  await cauIn.dungLai();
  xoaCauHinh(TEP_CAU_HINH());
  cauHinh = null;
  trangThaiIn = { chay: false };
  // Xóa phiên đăng nhập nhân viên trên trang (cookie) — máy về trạng thái như mới cài.
  await cuaSo.webContents.session.clearStorageData();
  dungMenu();
  capNhatKhay();
  moTrangCucBo("kich-hoat.html");
}

async function gioiThieu() {
  const capNhat = banMoi.daTaiXong
    ? `Đã tải bản ${banMoi.phienBan} — tự cài khi máy rảnh hoặc lần mở app sau.`
    : banMoi.dangTai
      ? `Đang tải bản ${banMoi.phienBan}…`
      : app.isPackaged
        ? "Đã là bản mới nhất."
        : "Bản chạy thử (không tự cập nhật).";
  await dialog.showMessageBox(cuaSo, {
    type: "info",
    title: TEN_APP,
    message: `${TEN_APP} ${app.getVersion()}`,
    detail: `${cauHinh ? `Quán: ${cauHinh.tenantName}\n` : ""}${capNhat}`,
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
 */
async function hoiGoCauInCu(boiCauInKhac) {
  if (daHoiCauInCu) return;
  daHoiCauInCu = true;
  const kq = await phatHienCauInCu(THU_MUC_APP);
  if (!kq.coCauInCu && !boiCauInKhac) return;
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
  if (ok) cauIn.khoiDongLai();
  else {
    dialog.showMessageBox(cuaSo, {
      type: "error",
      title: TEN_APP,
      message: "Chưa gỡ được cầu in cũ.",
      detail: "Có thể đã bấm No ở hộp thoại xin quyền. Mở lại app để thử lại, hoặc chạy GO-CAI-DAT.bat trong thư mục cầu in cũ.",
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

function xuLy(kenh, ham) {
  ipcMain.handle(kenh, async (e, ...args) => {
    if (!tuTrangCucBo(e)) throw new Error("Không được phép.");
    return ham(...args);
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

xuLy("may-in:doc", async () => {
  if (!cauHinh?.coMayIn) return null;
  const usb = (await cuaSo.webContents.getPrintersAsync()).map((p) => p.name);
  return { mayIn: cauHinh.mayIn, usb, tenantName: cauHinh.tenantName };
});

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
    mayIn: { bep: chuanHoaMayIn(nhap?.bep), quay: chuanHoaMayIn(nhap?.quay), kho: nhap?.kho === "58" ? "58" : "80" },
  };
}

xuLy("may-in:in-thu", async (nhap, vai) => {
  if (!cauHinh?.coMayIn) return { ok: false, thongDiep: "Máy này không in." };
  const thu = voiMayInNhap(nhap);
  if (vai === "quay" ? !thu.mayIn.quay : !thu.mayIn.bep) return { ok: false, thongDiep: "Chưa nhập máy in hợp lệ." };
  const env = moiTruongCauIn(thu, { matKhau: "in-thu", phienBanApp: app.getVersion(), moiTruongGoc: process.env });
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

xuLy("thu-lai", async (dich) => {
  if (typeof dich === "string" && duocDieuHuong(dich)) cuaSo.loadURL(dich);
  else if (cauHinh) moManHinh();
});

// ── Tự cập nhật (DESK-10) ──
function batTuCapNhat() {
  if (!app.isPackaged) return;
  autoUpdater.setFeedURL({ provider: "generic", url: `${API_BASE}/api/desktop/update/` });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", (i) => (banMoi = { ...banMoi, dangTai: true, phienBan: i.version }));
  autoUpdater.on("update-downloaded", (i) => (banMoi = { daTaiXong: true, dangTai: false, phienBan: i.version }));
  autoUpdater.on("error", () => (banMoi = { ...banMoi, dangTai: false }));
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
