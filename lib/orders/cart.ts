/**
 * Tiện ích giỏ hàng CLIENT-SAFE (không server-only) — định dạng tiền + tính giá dòng.
 * Giá integer VND. Dùng ở MenuBrowser/ModifierSheet/CartSheet.
 */
import type { CustomerMenuItem } from "./customer-menu";

export const formatVnd = (n: number) => n.toLocaleString("vi-VN") + "₫";

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
