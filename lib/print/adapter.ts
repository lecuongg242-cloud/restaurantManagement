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

/**
 * Phiếu KHÁCH — phiếu khách giữ (không phải hóa đơn đã thu). KHỚP số đơn (kitchenNo) với
 * phiếu bếp để bếp mang món ra gọi đúng số → đúng khách. Kèm giá + tổng để khách đối chiếu.
 */
export type CustomerTicketView = {
  orderId: string;
  kitchenNo: number | null;
  tenantName: string;
  logoUrl: string | null;
  place: string; // "Bàn X" (tại chỗ) hoặc "Mang về"
  contactName: string | null;
  createdAt: string | null;
  ticketNo: string;
  items: { name: string; qty: number; modifiers: string[]; note: string | null; unitPrice: number }[];
  total: number;
};

/** Khổ phiếu bếp: 58/80mm (máy in nhiệt) hoặc A5 (máy in thường, chữ to đọc xa). */
export type KitchenWidth = "58" | "80" | "a5";
export type PrintKitchenArgs = { slug: string; orderId: string; width?: KitchenWidth };

/** Hóa đơn khách (04-04, PRINT-03) — khổ nhiệt 58/80mm. */
export type PrintReceiptArgs = { slug: string; billId: string; width?: KitchenWidth };

/** Phiếu khách giữ — khớp số đơn với phiếu bếp; khổ 58/80mm hoặc A5. */
export type PrintCustomerArgs = { slug: string; orderId: string; width?: KitchenWidth };

export interface PrintAdapter {
  printKitchenTicket(args: PrintKitchenArgs): void;
  printCustomerTicket(args: PrintCustomerArgs): void;
  printReceipt(args: PrintReceiptArgs): void; // P4
}

const PRINT_FRAME_ID = "__pos_print_frame__";

/**
 * In NGAY TẠI TRANG POS qua iframe ẩn (không mở tab). Route in nạp vào iframe rồi TỰ gọi
 * window.print() → hộp thoại in của iframe. Bật Chrome `--kiosk-printing` thì in im lặng ra
 * máy in mặc định, không hộp thoại (hợp quán 1 máy in nhiệt). Iframe tự dọn sau khi in.
 */
function printViaHiddenFrame(url: string): void {
  if (typeof window === "undefined") return;
  document.getElementById(PRINT_FRAME_ID)?.remove();

  const iframe = document.createElement("iframe");
  iframe.id = PRINT_FRAME_ID;
  iframe.setAttribute("aria-hidden", "true");
  // 0×0 ngoài luồng: không chiếm chỗ nhưng vẫn render để in được (khác display:none).
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  const remove = () => setTimeout(() => iframe.remove(), 1000);
  iframe.onload = () => {
    // Route tự window.print(); dọn iframe khi in xong (hoặc hủy hộp thoại).
    try {
      iframe.contentWindow?.addEventListener("afterprint", remove, { once: true });
    } catch {
      /* same-origin nên hiếm khi lỗi; có fallback bên dưới */
    }
  };
  iframe.src = url;
  document.body.appendChild(iframe);
  // Fallback: gỡ iframe nếu vì lý do gì afterprint không bắn.
  setTimeout(() => {
    if (document.getElementById(PRINT_FRAME_ID) === iframe) iframe.remove();
  }, 120000);
}

/** V1 — in qua trình duyệt: route in nạp vào iframe ẩn (route lo window.print + ghi print_jobs). */
class BrowserPrintAdapter implements PrintAdapter {
  printKitchenTicket({ slug, orderId, width = "80" }: PrintKitchenArgs): void {
    printViaHiddenFrame(`/r/${slug}/print/kitchen/${orderId}?w=${width}`);
  }
  printCustomerTicket({ slug, orderId, width = "80" }: PrintCustomerArgs): void {
    printViaHiddenFrame(`/r/${slug}/print/customer/${orderId}?w=${width}`);
  }
  printReceipt({ slug, billId, width = "80" }: PrintReceiptArgs): void {
    printViaHiddenFrame(`/r/${slug}/print/receipt/${billId}?w=${width}`);
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
