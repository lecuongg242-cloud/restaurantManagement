/**
 * Thông tin liên hệ khách (client-only). Khách ẩn danh (D15) không có phiên → lưu
 * sessionStorage theo (slug + bàn) và dùng CHUNG cho trang chào bàn + giỏ hàng, tránh
 * nhập lại và tránh hai chỗ ghi lệch định dạng.
 *
 * Bắt buộc có TÊN trước khi gọi món tại bàn (quyết định 26/07) để nhân viên phục vụ đúng
 * người. SĐT là TÙY CHỌN — chỉ kiểm định dạng khi khách có nhập.
 */

export type GuestContact = { name: string; phone: string };

export const EMPTY_CONTACT: GuestContact = { name: "", phone: "" };

/** Phạm vi lưu: qr_token khi ăn tại bàn, "online" khi đặt mang về/giao. */
export function contactKey(slug: string, scope: string | null): string {
  return `contact:${slug}:${scope ?? "online"}`;
}

export function readContact(slug: string, scope: string | null): GuestContact {
  if (typeof window === "undefined") return EMPTY_CONTACT;
  try {
    const raw = sessionStorage.getItem(contactKey(slug, scope));
    if (!raw) return EMPTY_CONTACT;
    const c = JSON.parse(raw);
    return {
      name: typeof c?.name === "string" ? c.name : "",
      phone: typeof c?.phone === "string" ? c.phone : "",
    };
  } catch {
    return EMPTY_CONTACT;
  }
}

export function writeContact(slug: string, scope: string | null, c: GuestContact): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(contactKey(slug, scope), JSON.stringify(c));
  } catch {
    /* quota */
  }
}

export const NAME_MAX = 40;
export const PHONE_MAX = 15;

/** Bỏ khoảng trắng/dấu phân cách, đổi +84/84 về 0 (khách hay dán từ danh bạ). */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (digits.startsWith("84") && digits.length >= 10) return "0" + digits.slice(2);
  return digits;
}

/** SĐT Việt Nam: bắt đầu 0, tổng 10–11 số (di động 10, một số cố định 11). */
export function isValidPhone(raw: string): boolean {
  return /^0\d{9,10}$/.test(normalizePhone(raw));
}

/**
 * Dạng SĐT lưu vào DB — gọi ở SERVER cho mọi đường ghi (QR, online, POS mang về, đặt bàn) để một
 * khách chỉ có một dạng số (CUST-01). SĐT Việt Nam hợp lệ → dạng 0…; chuỗi khác giữ nguyên (đã cắt)
 * để không mất thông tin khách gõ; rỗng → null.
 */
export function phoneForStorage(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  return (isValidPhone(trimmed) ? normalizePhone(trimmed) : trimmed).slice(0, 20);
}

export function isValidName(raw: string): boolean {
  return raw.trim().length >= 2;
}

/** SĐT hợp lệ HOẶC để trống (không bắt buộc). */
export function isPhoneAcceptable(raw: string): boolean {
  return raw.trim() === "" || isValidPhone(raw);
}

/** Đủ điều kiện gọi món tại bàn: chỉ cần tên; SĐT nếu có thì phải đúng định dạng. */
export function isContactComplete(c: GuestContact): boolean {
  return isValidName(c.name) && isPhoneAcceptable(c.phone);
}
