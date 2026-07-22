/**
 * Lớp in trừu tượng (D1, §7). POS/KDS CHỈ gọi PrintAdapter — đổi cầu in sau không sửa nghiệp vụ.
 * V1: BrowserPrintAdapter (mở route in, route tự window.print + ghi log). V1.x: BridgePrintAdapter
 * (ghi print_jobs pending để cầu in ESC/POS poll) — CHỪA CHỖ, chưa implement.
 */

export type KitchenTicketView = {
  orderId: string;
  kitchenNo: number | null;
  tenantName: string;
  logoUrl: string | null;
  tableName: string;
  confirmedAt: string | null;
  ticketNo: string;
  isReprint: boolean;
  items: { name: string; qty: number; modifiers: string[]; note: string | null }[];
};

/** Hóa đơn (P4 điền chi tiết). Khai báo trước để interface ổn định. */
export type BillView = { orderId: string };

/** Khổ phiếu bếp: 58/80mm (máy in nhiệt) hoặc A5 (máy in thường, chữ to đọc xa). */
export type KitchenWidth = "58" | "80" | "a5";
export type PrintKitchenArgs = { slug: string; orderId: string; width?: KitchenWidth };

export interface PrintAdapter {
  printKitchenTicket(args: PrintKitchenArgs): void;
  printReceipt(bill: BillView): void; // P4
}

/** V1 — in qua trình duyệt: mở route in (route lo window.print + ghi print_jobs). */
class BrowserPrintAdapter implements PrintAdapter {
  printKitchenTicket({ slug, orderId, width = "80" }: PrintKitchenArgs): void {
    if (typeof window === "undefined") return;
    window.open(`/r/${slug}/print/kitchen/${orderId}?w=${width}`, "_blank", "noopener");
  }
  printReceipt(): void {
    throw new Error("printReceipt: sẽ implement ở P4 (hóa đơn).");
  }
}

// V1.x — BridgePrintAdapter: ghi print_jobs status=pending để cầu in ESC/POS poll. CHƯA implement.
// class BridgePrintAdapter implements PrintAdapter { ... }

let instance: PrintAdapter | null = null;

/** Adapter mặc định V1. Đổi sang Bridge ở V1.x không cần sửa nơi gọi. */
export function getPrintAdapter(): PrintAdapter {
  if (!instance) instance = new BrowserPrintAdapter();
  return instance;
}
