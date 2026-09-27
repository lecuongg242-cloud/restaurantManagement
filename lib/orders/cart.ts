/**
 * Tiện ích giỏ hàng CLIENT-SAFE (không server-only) — định dạng tiền + tính giá dòng.
 * Giá integer VND. Dùng ở MenuBrowser/ModifierSheet/CartSheet.
 */
import type { CustomerMenuItem } from "./customer-menu";
import type { CartLine } from "./types";

export const formatVnd = (n: number) => n.toLocaleString("vi-VN") + "₫";

/** Số chữ số tối đa cho một ô nhập tiền (999 tỷ) — chặn dán nhầm chuỗi dài. */
const MAX_MONEY_DIGITS = 12;

/** Lọc chuỗi người dùng gõ về chữ số: bỏ chấm/ký tự lạ, bỏ số 0 thừa đầu, cắt độ dài. */
export function moneyDigits(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, MAX_MONEY_DIGITS);
}

/** "45000" → "45.000" để hiện trong ô nhập tiền. Rỗng giữ rỗng (placeholder còn hiện). */
export function groupMoney(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Đơn giá 1 phần = base_price + Σ price_delta của option đã chọn. */
export function unitPrice(item: CustomerMenuItem, optionIds: string[]): number {
  const selected = new Set(optionIds);
  let sum = item.base_price;
  for (const g of item.groups) {
    for (const o of g.options) {
      if (selected.has(o.id)) sum += o.price_delta;
    }
  }
  return sum;
}

/**
 * Giỏ sau khi một lượt gửi THÀNH CÔNG: bỏ đúng những dòng đã gửi (theo `lineId`), GIỮ dòng được thêm vào
 * trong lúc chờ mạng. Trước đây `setCart([])` xóa luôn cả những dòng đó — món mất lặng lẽ, không vào bếp
 * (tìm ra ở 12-05: điện thoại mạng chậm, phục vụ bấm gửi rồi thêm món ngay).
 */
export function conLaiSauKhiGui(gioHienTai: CartLine[], daGui: CartLine[]): CartLine[] {
  const daGuiIds = new Set(daGui.map((l) => l.lineId));
  return gioHienTai.filter((l) => !daGuiIds.has(l.lineId));
}
