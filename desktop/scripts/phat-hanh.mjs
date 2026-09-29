// desktop/scripts/phat-hanh.mjs — phát hành bản mới "TechMenu Thu ngân" (P21 21-03, DESK-09/10).
//
//   cd desktop
//   npm version patch --no-git-tag-version     (tăng phiên bản: 1.0.0 → 1.0.1)
//   npm run release                            (build → quét bí mật → đưa lên GitHub Releases)
//
// Nơi đặt: GitHub Releases của repo công khai CHỈ chứa tệp cài (`DESKTOP_RELEASE_REPO`, vd `techmenu/thu-ngan-releases`).
// App web chuyển tiếp tới đó qua `DESKTOP_RELEASE_BASE=https://github.com/<repo>/releases/latest/download` (Vercel env).
// Cần `gh` đã đăng nhập (gh auth login). Không ký số (QD-026 D3) — Windows sẽ cảnh báo SmartScreen ở lần cài đầu.
//
// Chạy trên máy dev có .env.local của repo: dùng để QUÉT xem tệp cài có lọt khóa bí mật nào không (đọc giá trị, không in ra).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DESKTOP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_GOC = path.join(DESKTOP, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, "package.json"), "utf8"));
const repo = process.env.DESKTOP_RELEASE_REPO;
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error("Đặt DESKTOP_RELEASE_REPO=<chủ>/<repo> (repo công khai chỉ chứa tệp cài) rồi chạy lại.");
  process.exit(1);
}

const chay = (lenh, thamSo, cwd = DESKTOP) => execFileSync(lenh, thamSo, { cwd, stdio: "inherit", shell: process.platform === "win32" });

// 1) Build. ELECTRON_RUN_AS_NODE (VS Code đặt) làm electron-builder chạy Electron như Node — bỏ đi.
delete process.env.ELECTRON_RUN_AS_NODE;
fs.rmSync(path.join(DESKTOP, "dist"), { recursive: true, force: true });
chay("npx", ["electron-builder", "--win", "--publish", "never"]);

const dist = path.join(DESKTOP, "dist");
const exe = `TechMenu-ThuNgan-Setup-${pkg.version}.exe`;
const tep = [exe, `${exe}.blockmap`, "latest.yml"].map((t) => path.join(dist, t));
for (const t of tep) if (!fs.existsSync(t)) throw new Error(`Thiếu ${t} sau khi build.`);

// 2) Quét bí mật: giá trị thật từ .env.local + mẫu khóa. Có một phát hiện là DỪNG, không đưa lên.
const env = {};
const tepEnv = path.join(REPO_GOC, ".env.local");
if (fs.existsSync(tepEnv)) {
  for (const l of fs.readFileSync(tepEnv, "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#")) env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
}
const biMat = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_JWT_SECRET", "POSTGRES_PASSWORD", "STAFF_PIN_PEPPER"]
  .map((k) => [k, env[k]])
  .filter(([, v]) => v && v.length > 8);
const mau = [/service_role/i, /SUPABASE_SERVICE_ROLE_KEY\s*=/, /PRINT_BRIDGE_PASSWORD\s*=\s*\S/];
const phatHien = [];
function quet(thuMuc) {
  for (const e of fs.readdirSync(thuMuc, { withFileTypes: true })) {
    const f = path.join(thuMuc, e.name);
    if (e.isDirectory()) quet(f);
    else {
      const buf = fs.readFileSync(f);
      const s = buf.toString("latin1");
      for (const [k, v] of biMat) if (s.includes(v)) phatHien.push(`${f}: giá trị ${k}`);
      if (/\.(asar|mjs|ps1|yml|json)$/.test(f)) for (const r of mau) if (r.test(buf.toString("utf8"))) phatHien.push(`${f}: mẫu ${r}`);
    }
  }
}
quet(path.join(dist, "win-unpacked", "resources"));
const sExe = fs.readFileSync(tep[0]).toString("latin1");
for (const [k, v] of biMat) if (sExe.includes(v)) phatHien.push(`${exe}: giá trị ${k}`);
if (phatHien.length) {
  console.error(`DỪNG — tệp cài chứa bí mật:\n${phatHien.join("\n")}`);
  process.exit(1);
}
console.log(`Quét bí mật: 0 phát hiện (${biMat.length} giá trị + ${mau.length} mẫu). Tệp cài ${(fs.statSync(tep[0]).size / 1048576).toFixed(1)} MB.`);

// 3) Đưa lên GitHub Releases (bản mới nhất = "latest" ⇒ app tự cập nhật trong ≤ 1 giờ).
chay("gh", [
  "release",
  "create",
  `v${pkg.version}`,
  ...tep,
  "--repo",
  repo,
  "--title",
  `TechMenu Thu ngân ${pkg.version}`,
  "--notes",
  `TechMenu Thu ngân ${pkg.version} cho Windows 10/11.`,
  "--latest",
]);
console.log(`Đã phát hành ${pkg.version}. Máy quầy tự cập nhật khi rảnh (≤ 1 giờ).`);
