// android/scripts/thu-cap-nhat.mjs — kiểm nghiệm thu 24-02 (tự cập nhật) trên máy ảo / máy thật đang cắm adb.
//
//   node android/scripts/thu-cap-nhat.mjs [thư-mục-ảnh]
//
// Build hai bản DEBUG (1.0.0 mã 1, 1.0.1 mã 2) trỏ nguồn cập nhật về máy chủ giả trên máy dev (`adb reverse`, cổng 8099),
// cài 1.0.0 (giữ dữ liệu — máy phải đã kích hoạt), rồi: hộp "Có bản mới 1.0.1" hiện khi máy để yên → "Cập nhật" → xin
// quyền cài → màn cài của Android → lên 1.0.1, vẫn giữ kích hoạt. Sau đó thử tệp hỏng (sha256 sai) ⇒ không hỏi, không giữ tệp.
// Điều khiển hộp thoại gốc của Android bằng `uiautomator dump` (tìm nút theo chữ).
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ANDROID = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADB = process.env.ADB || `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
const GOI = "vn.techmenu.thungan";
const CONG = 8099;
const ANH = process.argv[2] || null;
const TAM = fs.mkdtempSync(path.join(os.tmpdir(), "tm-cap-nhat-"));

const adb = (...a) => execFileSync(ADB, a).toString().trim();
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
const chup = (ten) => ANH && fs.writeFileSync(`${ANH}/${ten}.png`, execFileSync(ADB, ["exec-out", "screencap", "-p"]));
const kq = [];
const dat = (ten, dung, chiTiet = "") => (kq.push(dung), console.log(`${dung ? "ĐẠT " : "HỎNG"}  ${ten}${chiTiet ? " — " + chiTiet : ""}`));

function build(phienBan, ma) {
  const gradlew = path.join(ANDROID, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  const env = {
    ...process.env,
    TECHMENU_VERSION_NAME: phienBan,
    TECHMENU_VERSION_CODE: String(ma),
    TECHMENU_UPDATE_BASE: `http://localhost:${CONG}`,
    TECHMENU_YEN_GIAY: "10",
  };
  const r = spawnSync(gradlew, ["assembleDebug", "-q"], { cwd: ANDROID, env, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error("build hỏng");
  const dich = path.join(TAM, `TechMenu-ThuNgan-${phienBan}.apk`);
  fs.copyFileSync(path.join(ANDROID, "app/build/outputs/apk/debug/app-debug.apk"), dich);
  return dich;
}

/** Nút trên màn Android có chữ khớp `re` → tâm nút (uiautomator). */
function timNut(re) {
  let xml = "";
  // uiautomator đôi khi trả "null root node" khi màn đang chuyển — thử lại vài lần.
  for (let i = 0; i < 3 && !xml.includes("<node"); i++) {
    try {
      adb("shell", "uiautomator", "dump", "/sdcard/ui.xml");
      xml = adb("shell", "cat", "/sdcard/ui.xml");
    } catch {}
  }
  for (const m of xml.matchAll(/<node [^>]*?text="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)) {
    if (re.test(m[1])) return [(+m[2] + +m[4]) >> 1, (+m[3] + +m[5]) >> 1];
  }
  return null;
}
async function choNut(re, giay) {
  for (let i = 0; i < giay; i += 2) {
    const n = timNut(re);
    if (n) return n;
    await ngu(2000);
  }
  return null;
}
const phienBanDangCai = () => adb("shell", "dumpsys", "package", GOI).match(/versionName=(\S+)/)?.[1];

console.log("→ Build 1.0.0 và 1.0.1 (bản thử, nguồn cập nhật = máy dev)…");
const v1 = build("1.0.0", 1);
const v2 = build("1.0.1", 2);
const du2 = fs.readFileSync(v2);
let manifest = {
  phienBan: "1.0.1",
  maPhienBan: 2,
  tenTep: path.basename(v2),
  kichThuoc: du2.length,
  sha256: crypto.createHash("sha256").update(du2).digest("hex"),
};
const mayChu = http
  .createServer((req, res) => {
    if (req.url.startsWith("/api/android/latest")) {
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ ...manifest, duongDan: `/api/android/update/${manifest.tenTep}` }));
    }
    if (req.url === `/api/android/update/${path.basename(v2)}`) return res.end(du2);
    res.statusCode = 404;
    res.end();
  })
  .listen(CONG);
adb("reverse", `tcp:${CONG}`, `tcp:${CONG}`);

try {
  adb("install", "-r", v1);
  adb("shell", "appops", "set", GOI, "REQUEST_INSTALL_PACKAGES", "default"); // thử cả bước xin quyền lần đầu
  adb("shell", "am", "force-stop", GOI);
  adb("shell", "am", "start", "-n", `${GOI}/.MainActivity`);
  dat("Đang chạy 1.0.0", phienBanDangCai() === "1.0.0");

  const hop = await choNut(/^Có bản mới 1\.0\.1$/, 120);
  dat("Máy để yên ⇒ hộp 'Có bản mới 1.0.1'", !!hop);
  chup("and-cap-nhat-hoi");
  const nutCapNhat = await choNut(/^Cập nhật$/i, 10);
  if (nutCapNhat) adb("shell", "input", "tap", ...nutCapNhat.map(String));
  // Lần đầu: Android mở màn "Cài ứng dụng không rõ nguồn gốc" — bật quyền (thay người dùng gạt công tắc), quay lại app.
  const manQuyen = await choNut(/Allow from this source|Cho phép từ nguồn này/i, 20);
  chup("and-cap-nhat-xin-quyen");
  dat("Lần đầu: mở màn cấp quyền cài", !!manQuyen);
  adb("shell", "appops", "set", GOI, "REQUEST_INSTALL_PACKAGES", "allow");
  adb("shell", "input", "keyevent", "4");
  // Màn cài của Android (máy ảo tiếng Anh: "Update"; máy tiếng Việt: "Cập nhật").
  const nutCai = await choNut(/^(Update|Install|Cập nhật|Cài đặt)$/i, 30);
  chup("and-cap-nhat-man-cai");
  dat("Màn cài của Android hiện ra", !!nutCai);
  if (nutCai) adb("shell", "input", "tap", ...nutCai.map(String));
  let len = false;
  for (let i = 0; i < 30 && !len; i++) {
    await ngu(2000);
    len = phienBanDangCai() === "1.0.1";
  }
  dat("Đã lên 1.0.1", len, phienBanDangCai());

  adb("shell", "am", "start", "-n", `${GOI}/.MainActivity`);
  await ngu(6000);
  const cauHinh = adb("shell", "run-as", GOI, "cat", "shared_prefs/cau-hinh.xml");
  dat("Giữ kích hoạt sau cập nhật", /pho-viet/.test(cauHinh));
  chup("and-cap-nhat-xong");

  // Tệp hỏng: quảng cáo bản 1.0.2 với sha256 sai ⇒ tải về, kiểm hỏng, xóa — không hỏi, không giữ tệp.
  manifest = { ...manifest, phienBan: "1.0.2", maPhienBan: 3, tenTep: path.basename(v2), sha256: "0".repeat(64) };
  adb("shell", "am", "force-stop", GOI);
  adb("shell", "am", "start", "-n", `${GOI}/.MainActivity`);
  const hopHong = await choNut(/^Có bản mới/, 60);
  dat("Tệp hỏng ⇒ không hỏi cập nhật", !hopHong);
  const tep = adb("shell", "run-as", GOI, "ls", "files/cap-nhat").trim();
  dat("Tệp hỏng ⇒ không giữ tệp tải về", tep === "", tep || "(trống)");
} finally {
  mayChu.close();
  try {
    adb("reverse", "--remove", `tcp:${CONG}`);
  } catch {}
}
console.log(kq.every(Boolean) ? "\nTất cả ĐẠT" : `\n${kq.filter((x) => !x).length} mục HỎNG`);
process.exit(kq.every(Boolean) ? 0 : 1);
