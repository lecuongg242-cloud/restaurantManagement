// desktop/lib/cau-hinh.mjs — cấu hình máy quầy "TechMenu Thu ngân" (DESK-01/02/06).
//
// Một tệp JSON trong thư mục dữ liệu của app (`userData/cau-hinh.json`). KHÔNG bao giờ chứa mật khẩu chủ quán:
// mật khẩu đó chỉ đi một lần tới /api/desktop/activate rồi bỏ. Mật khẩu tài khoản `printer` lưu dạng đã mã hóa
// (`safeStorage` = DPAPI của Windows — chỉ đúng người dùng Windows đó trên đúng máy đó giải được); tệp này
// không biết gì về cách mã hóa, main.mjs lo.
//
// Không import electron: test được bằng vitest.
import fs from "node:fs";
import path from "node:path";

/** Tăng khi đổi cấu trúc tệp. Tệp khác phiên bản → coi như chưa kích hoạt (hỏi đăng nhập lại), không đoán. */
export const PHIEN_BAN_CAU_HINH = 1;

/**
 * @typedef {{ kieu: "lan", host: string, port: number } | { kieu: "usb", ten: string }} MayIn
 * @typedef {{
 *   phienBan: number,
 *   apiBase: string,
 *   slug: string,
 *   tenantName: string,
 *   manHinh: "pos" | "kds",
 *   nhieuChiNhanh: boolean,
 *   coMayIn: boolean,
 *   printer: { email: string, matKhauMaHoa: string, supabaseUrl: string, anonKey: string } | null,
 *   mayIn: { bep: MayIn | null, quay: MayIn | null, kho: "80" | "58" },
 * }} CauHinh
 */

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Máy in hợp lệ hoặc null. IP/cổng/tên được kiểm chặt — giá trị này đi thẳng vào biến môi trường của cầu in.
 * @returns {MayIn | null}
 */
export function chuanHoaMayIn(m) {
  if (!m || typeof m !== "object") return null;
  if (m.kieu === "lan") {
    const host = String(m.host ?? "").trim();
    const port = Number(m.port ?? 9100);
    if (!/^[0-9a-zA-Z.-]{1,100}$/.test(host)) return null;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { kieu: "lan", host, port };
  }
  if (m.kieu === "usb") {
    const ten = String(m.ten ?? "").trim();
    if (!ten || ten.length > 140 || /[\r\n"]/.test(ten)) return null;
    return { kieu: "usb", ten };
  }
  return null;
}

/**
 * Đọc đối tượng thô thành cấu hình hợp lệ, hoặc null (thiếu trường cốt lõi / sai phiên bản).
 * @returns {CauHinh | null}
 */
export function chuanHoa(j) {
  if (!j || typeof j !== "object" || j.phienBan !== PHIEN_BAN_CAU_HINH) return null;
  let apiBase;
  try {
    apiBase = new URL(String(j.apiBase)).origin;
  } catch {
    return null;
  }
  if (typeof j.slug !== "string" || !SLUG.test(j.slug)) return null;
  const p = j.printer;
  const printer =
    j.coMayIn && p && typeof p.email === "string" && typeof p.matKhauMaHoa === "string" && p.matKhauMaHoa
      ? { email: p.email, matKhauMaHoa: p.matKhauMaHoa, supabaseUrl: String(p.supabaseUrl ?? ""), anonKey: String(p.anonKey ?? "") }
      : null;
  const mi = j.mayIn ?? {};
  return {
    phienBan: PHIEN_BAN_CAU_HINH,
    apiBase,
    slug: j.slug,
    tenantName: typeof j.tenantName === "string" ? j.tenantName.slice(0, 200) : j.slug,
    manHinh: j.manHinh === "kds" ? "kds" : "pos",
    nhieuChiNhanh: Boolean(j.nhieuChiNhanh),
    coMayIn: Boolean(printer),
    printer,
    mayIn: { bep: chuanHoaMayIn(mi.bep), quay: chuanHoaMayIn(mi.quay), kho: mi.kho === "58" ? "58" : "80" },
  };
}

/** @returns {CauHinh | null} */
export function docCauHinh(tep) {
  try {
    return chuanHoa(JSON.parse(fs.readFileSync(tep, "utf8")));
  } catch {
    return null;
  }
}

/** Ghi qua tệp tạm rồi đổi tên — mất điện giữa lúc ghi không để lại tệp cụt (máy quầy hay bị rút điện). */
export function ghiCauHinh(tep, cauHinh) {
  const sach = chuanHoa(cauHinh);
  if (!sach) throw new Error("Cấu hình không hợp lệ — không ghi.");
  fs.mkdirSync(path.dirname(tep), { recursive: true });
  const tam = `${tep}.tam`;
  fs.writeFileSync(tam, JSON.stringify(sach, null, 2), "utf8");
  fs.renameSync(tam, tep);
  return sach;
}

export function xoaCauHinh(tep) {
  fs.rmSync(tep, { force: true });
}

/**
 * Cấu hình mới từ phản hồi /api/desktop/activate. `maHoa` biến mật khẩu `printer` thành chuỗi đã mã hóa (base64).
 * Mật khẩu trần chỉ sống trong hàm này.
 */
export function tuPhanHoiKichHoat(phanHoi, { apiBase, coMayIn, nhieuChiNhanh, maHoa }) {
  const coTaiKhoan = coMayIn && typeof phanHoi.email === "string" && typeof phanHoi.password === "string";
  return chuanHoa({
    phienBan: PHIEN_BAN_CAU_HINH,
    apiBase,
    slug: phanHoi.slug,
    tenantName: phanHoi.tenantName,
    manHinh: coMayIn ? "pos" : "kds",
    nhieuChiNhanh,
    coMayIn: coTaiKhoan,
    printer: coTaiKhoan
      ? { email: phanHoi.email, matKhauMaHoa: maHoa(phanHoi.password), supabaseUrl: phanHoi.supabaseUrl, anonKey: phanHoi.anonKey }
      : null,
    mayIn: { bep: null, quay: null, kho: "80" },
  });
}

/** Đường dẫn trang theo màn đang chọn. */
export function duongDanManHinh(cauHinh, manHinh = cauHinh.manHinh) {
  return `${cauHinh.apiBase}/r/${cauHinh.slug}/${manHinh === "kds" ? "kds" : "pos"}`;
}
