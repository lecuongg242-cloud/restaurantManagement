// android/scripts/phat-hanh.mjs — phát hành app Android "TechMenu Thu ngân" (P24 24-02, ANDR-01/04, QD-030 D2).
//
//   TECHMENU_KEYSTORE=… TECHMENU_KEYSTORE_PASS=… node android/scripts/phat-hanh.mjs 1.0.1
//
// 1. Build bản phát hành KÝ KHÓA THẬT (khóa + mật khẩu qua biến môi trường — không bao giờ nằm trong repo).
// 2. Ra `android/dist/TechMenu-ThuNgan-{phiên bản}.apk` + `android/dist/android-latest.json` ({ phienBan, maPhienBan,
//    tenTep, kichThuoc, sha256 }) — đúng dạng `lib/android/phat-hanh.ts` đọc.
// 3. Có `gh` (GitHub CLI, đã đăng nhập) ⇒ đưa hai tệp lên bản phát hành nhãn cố định `android` (thay tệp cũ). Không có
//    ⇒ in hướng dẫn tải lên tay. Nhãn `android` riêng, KHÔNG dùng "latest": "latest" là bản Windows mới nhất.
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ANDROID = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ANDROID, "dist");
const phienBan = process.argv[2];

function dung(chu) {
  console.error(`✗ ${chu}`);
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(phienBan ?? "")) dung("Cách dùng: node android/scripts/phat-hanh.mjs <x.y.z>");
const [a, b, c] = phienBan.split(".").map(Number);
if (b > 99 || c > 99) dung("Số phụ và số vá phải ≤ 99.");
// Mã phiên bản tăng theo phiên bản (Android chỉ cho cập nhật lên mã LỚN HƠN): 1.0.1 → 10001.
const maPhienBan = a * 10000 + b * 100 + c;

const khoa = process.env.TECHMENU_KEYSTORE;
if (!khoa || !fs.existsSync(khoa)) dung("Thiếu TECHMENU_KEYSTORE (đường dẫn tệp khóa ký, nằm NGOÀI repo).");
if (!process.env.TECHMENU_KEYSTORE_PASS) dung("Thiếu TECHMENU_KEYSTORE_PASS.");
if (path.resolve(khoa).startsWith(path.resolve(ANDROID, ".."))) dung("Tệp khóa ký nằm trong repo — chuyển ra ngoài.");

const gradlew = path.join(ANDROID, process.platform === "win32" ? "gradlew.bat" : "gradlew");
const env = { ...process.env, TECHMENU_VERSION_CODE: String(maPhienBan), TECHMENU_VERSION_NAME: phienBan };
// Bản phát hành luôn trỏ máy chủ thật: bỏ mọi biến của bản thử.
delete env.TECHMENU_UPDATE_BASE;
delete env.TECHMENU_YEN_GIAY;
delete env.TECHMENU_API_BASE;
console.log(`→ Build ${phienBan} (mã ${maPhienBan})…`);
const kq = spawnSync(gradlew, ["clean", "assembleRelease", "--no-daemon", "-q"], { cwd: ANDROID, env, stdio: "inherit", shell: process.platform === "win32" });
if (kq.status !== 0) dung("Build hỏng.");

const ra = path.join(ANDROID, "app", "build", "outputs", "apk", "release", "app-release.apk");
if (!fs.existsSync(ra)) dung("Không thấy app-release.apk — bản chưa ký? Kiểm TECHMENU_KEYSTORE.");

fs.mkdirSync(DIST, { recursive: true });
for (const f of fs.readdirSync(DIST)) fs.rmSync(path.join(DIST, f));
const tenTep = `TechMenu-ThuNgan-${phienBan}.apk`;
const dich = path.join(DIST, tenTep);
fs.copyFileSync(ra, dich);
const du = fs.readFileSync(dich);
const manifest = {
  phienBan,
  maPhienBan,
  tenTep,
  kichThuoc: du.length,
  sha256: crypto.createHash("sha256").update(du).digest("hex"),
};
fs.writeFileSync(path.join(DIST, "android-latest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`✓ ${tenTep} (${(du.length / 1048576).toFixed(1)} MB), sha256 ${manifest.sha256.slice(0, 12)}…`);

let coGh = false;
try {
  execFileSync("gh", ["--version"], { stdio: "ignore" });
  coGh = true;
} catch {}
if (!coGh) {
  console.log(
    "\nKhông có GitHub CLI (gh). Tải lên tay: GitHub → Releases → bản nhãn `android` (tạo nếu chưa có) → xóa hai tệp cũ →\n" +
      `kéo thả ${dich} và ${path.join(DIST, "android-latest.json")}.`
  );
  process.exit(0);
}
const coBan = spawnSync("gh", ["release", "view", "android"], { cwd: ANDROID, stdio: "ignore" }).status === 0;
if (!coBan) {
  execFileSync("gh", ["release", "create", "android", "--title", "TechMenu Thu ngân cho Android", "--notes", "Tệp cài app Android (tự cập nhật). Không xóa bản phát hành này.", "--latest=false"], { cwd: ANDROID, stdio: "inherit" });
}
execFileSync("gh", ["release", "upload", "android", dich, path.join(DIST, "android-latest.json"), "--clobber"], { cwd: ANDROID, stdio: "inherit" });
console.log("✓ Đã đưa lên bản phát hành `android`. Kiểm: <app>/api/android/latest?thongTin=1");
