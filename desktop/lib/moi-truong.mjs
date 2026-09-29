// desktop/lib/moi-truong.mjs — dựng biến môi trường cho cầu in chạy trong app (DESK-05).
//
// Cầu in là CHÍNH `scripts/print-bridge.mjs` (một nguồn code in cho cầu in cũ lẫn app); nó đọc cấu hình từ biến môi
// trường như khi chạy bằng tác vụ Windows. Ở đây chỉ chuyển cấu hình app → đúng các biến đó. Không import electron.

/** Máy in quầy theo cú pháp COUNTER_PRINTER của cầu in: `usb:<tên>` hoặc `lan:<ip>:<cổng>`. */
export function chuoiMayQuay(may) {
  if (!may) return "";
  return may.kieu === "usb" ? `usb:${may.ten}` : `lan:${may.host}:${may.port}`;
}

/**
 * @param {import("./cau-hinh.mjs").CauHinh} cauHinh
 * @param {{ matKhau: string, phienBanApp: string, moiTruongGoc?: Record<string, string | undefined> }} them
 * @returns {Record<string, string> | null} null khi máy không in (không chạy cầu in)
 */
export function moiTruongCauIn(cauHinh, { matKhau, phienBanApp, moiTruongGoc = {} }) {
  if (!cauHinh.coMayIn || !cauHinh.printer || !matKhau) return null;
  const { bep, quay, kho } = cauHinh.mayIn;
  // Chỉ giữ vài biến hệ thống cầu in cần (PowerShell cho máy in USB cần SystemRoot/PATH). KHÔNG chuyển nguyên
  // môi trường của app: máy dev có thể mang NEXT_PUBLIC_* / khóa khác vào cầu in.
  const goc = {};
  for (const k of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE", "WINDIR", "windir", "ComSpec"]) {
    if (moiTruongGoc[k]) goc[k] = moiTruongGoc[k];
  }
  return {
    ...goc,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: cauHinh.printer.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: cauHinh.printer.anonKey,
    PRINT_BRIDGE_EMAIL: cauHinh.printer.email,
    PRINT_BRIDGE_PASSWORD: matKhau,
    // Chưa cài máy in bếp: địa chỉ không ai nghe — cầu in vẫn chạy (in máy quầy, báo sống), phiếu bếp báo lỗi rõ.
    PRINTER_HOST: bep?.kieu === "lan" ? bep.host : "127.0.0.1",
    PRINTER_PORT: String(bep?.kieu === "lan" ? bep.port : 9),
    PRINTER_CHARS: kho === "58" ? "32" : "48",
    COUNTER_PRINTER: chuoiMayQuay(quay),
    COUNTER_WIDTH: kho,
    POS_URL: `${cauHinh.apiBase}/r/${cauHinh.slug}/pos`,
    BRIDGE_AGENT: `app/${phienBanApp}`,
    BRIDGE_TU_CAP_NHAT: "0",
  };
}

/**
 * Chờ bao lâu rồi chạy lại cầu in sau khi nó chết. Chết liên tiếp thì giãn dần — máy in/mạng hỏng mà chạy lại liên
 * tục chỉ làm đầy log. `soLanChet` được xóa về 0 khi cầu in chạy khỏe ≥ 5 phút (main.mjs).
 */
export function doiTruocKhiChayLai(soLanChet) {
  const lich = [1000, 5000, 30_000, 60_000];
  return lich[Math.min(Math.max(0, soLanChet), lich.length - 1)];
}
