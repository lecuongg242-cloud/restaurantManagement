/**
 * Thiết bị này có nối máy in không (PRINT-16). Quyết định đường in hóa đơn: máy có máy in in trình duyệt
 * như cũ; máy không có (điện thoại, tablet) gửi qua cầu in ra máy in quầy.
 *
 * Mặc định theo khổ màn hình: ≥ 1024 px (laptop, máy POS quầy) coi là có. Máy nào khác thực tế thì tự khai
 * (`localStorage` "pos-thiet-bi-co-may-in" = "1" | "0"). Không đọc được lưu trữ → quay về mặc định.
 */
export const KHOA_THIET_BI_CO_MAY_IN = "pos-thiet-bi-co-may-in";

export function thietBiCoMayIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = localStorage.getItem(KHOA_THIET_BI_CO_MAY_IN);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* trình duyệt chặn lưu trữ → mặc định */
  }
  return window.innerWidth >= 1024;
}
