/**
 * Lớp in trừu tượng (D1, §7). POS/KDS CHỈ gọi PrintAdapter — đổi cầu in sau không sửa nghiệp vụ.
 * V1: BrowserPrintAdapter (mở route in, route tự window.print + ghi log). V1.x: BridgePrintAdapter
 * (ghi print_jobs pending cho cầu in ESC/POS cục bộ poll) — bật bằng NEXT_PUBLIC_PRINT_MODE=bridge.
 */
import { queueKitchenTicketPrint } from "@/app/r/[slug]/print/actions";

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

/**
 * Trạng thái in MỘT loại phiếu của MỘT đơn — lấy từ print_jobs, để POS hiện thường trực (nhân
 * viên không phải nhớ đã in chưa; toast bay mất là bỏ sót).
 * none = chưa in lần nào · pending = đã gửi, chờ cầu in · printed/failed = kết quả thật từ máy in.
 * stuck = chờ quá hạn (PRINT-06) — cầu in không nhận, chip phải đỏ và bấm được để in lại.
 */
export type TicketPrintState = {
  status: "none" | "pending" | "stuck" | "printed" | "failed";
  /** printed_at của lần GẦN NHẤT nếu đã in, ngược lại created_at. */
  at: string | null;
  /** SỐ LẦN đã in thành công. Phiếu in lại nhiều lần là chuyện thường, nhân viên cần đối chiếu. */
  count: number;
};

/** Trạng thái cả hai loại phiếu của một đơn — một lượt gọi cho cả cụm nút in. */
export type OrderPrintState = { kitchen: TicketPrintState; customer: TicketPrintState };

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

/**
 * V1.x — PHIẾU BẾP đi qua cầu in ESC/POS: ghi print_jobs status=pending, cầu in cục bộ tại quán
 * (scripts/print-bridge.mjs) poll rồi in thẳng ra máy in bếp LAN — không hộp thoại, không cần
 * máy tính ở bếp. Hóa đơn/phiếu khách VẪN in trình duyệt (máy in ở quầy, ngay trước mặt thu ngân).
 * Hàng đợi lỗi (mất mạng/chưa đăng nhập) → in trình duyệt để không mất phiếu.
 */
class BridgePrintAdapter implements PrintAdapter {
  private browser = new BrowserPrintAdapter();

  printKitchenTicket(args: PrintKitchenArgs): void {
    const fallback = () => this.browser.printKitchenTicket(args);
    queueKitchenTicketPrint(args.slug, args.orderId)
      .then((res) => {
        if (!res?.ok) fallback();
      })
      .catch(fallback);
  }
  printCustomerTicket(args: PrintCustomerArgs): void {
    this.browser.printCustomerTicket(args);
  }
  printReceipt(args: PrintReceiptArgs): void {
    this.browser.printReceipt(args);
  }
}

let instance: PrintAdapter | null = null;

/**
 * Adapter theo cấu hình: NEXT_PUBLIC_PRINT_MODE=bridge → cầu in ESC/POS; mặc định = trình duyệt.
 * Nơi gọi (POS/KDS) không đổi.
 */
export function getPrintAdapter(): PrintAdapter {
  if (!instance) {
    instance =
      process.env.NEXT_PUBLIC_PRINT_MODE === "bridge"
        ? new BridgePrintAdapter()
        : new BrowserPrintAdapter();
  }
  return instance;
}
