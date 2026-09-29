// desktop/lib/cau-in-cu.mjs — phát hiện + đọc cấu hình cầu in CŨ (tác vụ Windows `CauInBep`, P11/P12) để gỡ khi
// chuyển sang app (DESK-08). Phần đọc/giải nghĩa là hàm thuần (test được); phần gọi lệnh Windows ở cuối.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

export const TEN_TAC_VU = "CauInBep";

/** Dòng lệnh tiến trình có phải cầu in cũ không (node … print-bridge.mjs, KHÔNG phải cầu in của chính app). */
export function laTienTrinhCauInCu(dongLenh, thuMucApp) {
  if (!dongLenh || !/print-bridge\.mjs/i.test(dongLenh)) return false;
  if (thuMucApp && dongLenh.toLowerCase().includes(thuMucApp.toLowerCase())) return false;
  return true;
}

/** Đọc `.env.local` của cầu in cũ → máy in để điền sẵn màn Cài đặt máy in. Không đọc/giữ mật khẩu. */
export function mayInTuEnvCu(noiDung) {
  const env = {};
  for (const raw of String(noiDung).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    let v = line.slice(eq + 1).trim();
    if (v.length > 1 && /^(".*"|'.*')$/s.test(v)) v = v.slice(1, -1);
    env[line.slice(0, eq).trim()] = v;
  }
  const bep = env.PRINTER_HOST ? { kieu: "lan", host: env.PRINTER_HOST, port: Number(env.PRINTER_PORT || 9100) } : null;
  let quay = null;
  const c = env.COUNTER_PRINTER ?? "";
  if (c.startsWith("usb:") && c.slice(4).trim()) quay = { kieu: "usb", ten: c.slice(4).trim() };
  else if (c.startsWith("lan:")) {
    const [host, port] = c.slice(4).split(":");
    if (host) quay = { kieu: "lan", host, port: Number(port || 9100) };
  }
  const kho = env.COUNTER_WIDTH === "58" || env.PRINTER_CHARS === "32" ? "58" : "80";
  return { bep, quay, kho };
}

/** Thư mục cầu in cũ thường gặp: `C:\cau-in`, `C:\cau-in-<slug>` (bộ cài P11 cài vào ổ hệ thống). */
export function timThuMucCu(oHeThong = process.env.SystemDrive || "C:") {
  const goc = `${oHeThong}\\`;
  try {
    return fs
      .readdirSync(goc, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^cau-in(-|$)/i.test(d.name))
      .map((d) => path.join(goc, d.name))
      .filter((d) => fs.existsSync(path.join(d, "print-bridge.mjs")) || fs.existsSync(path.join(d, ".env.local")));
  } catch {
    return [];
  }
}

function chay(lenh, thamSo) {
  return new Promise((resolve) => {
    execFile(lenh, thamSo, { windowsHide: true, timeout: 20_000 }, (err, out) => resolve({ ok: !err, out: String(out ?? "") }));
  });
}

/** Có tác vụ `CauInBep` / tiến trình cầu in cũ không. */
export async function phatHienCauInCu(thuMucApp) {
  const tacVu = (await chay("schtasks", ["/Query", "/TN", TEN_TAC_VU])).ok;
  const { out } = await chay("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { $_.CommandLine }",
  ]);
  const tienTrinh = out.split(/\r?\n/).some((d) => laTienTrinhCauInCu(d, thuMucApp));
  const thuMuc = timThuMucCu();
  return { coCauInCu: tacVu || tienTrinh, tacVu, tienTrinh, thuMuc };
}

/**
 * Gỡ cầu in cũ bằng `go-cai-dat.ps1` sẵn có (xóa tác vụ + dừng tiến trình), chạy với quyền admin — tác vụ cũ tạo
 * bằng quyền admin nên phải xin một lần (hộp UAC). Trả true khi người dùng đồng ý và lệnh chạy xong.
 */
export async function goCauInCu(tepGoCaiDat) {
  const lenh =
    `$p = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList ` +
    `'-NoProfile','-ExecutionPolicy','Bypass','-File','"${tepGoCaiDat.replace(/'/g, "''")}"','-KhongHoi'; exit $p.ExitCode`;
  return (await chay("powershell", ["-NoProfile", "-NonInteractive", "-Command", lenh])).ok;
}
