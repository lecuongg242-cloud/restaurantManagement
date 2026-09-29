/**
 * Lớp in trừu tượng (D1, §7). POS/KDS CHỈ gọi PrintAdapter — đổi cầu in sau không sửa nghiệp vụ.
 * V1: BrowserPrintAdapter (mở route in, route tự window.print + ghi log). V1.x: BridgePrintAdapter
 * (ghi print_jobs pending cho cầu in ESC/POS cục bộ poll) — bật theo TỪNG quán bằng
 * `tenants.settings.print_mode` (PRINT-10). Component lấy adapter qua `usePrintAdapter()`.
 */
import { queueKitchenTicketPrint, queueReceiptPrint, queueCustomerTicketPrint } from "@/app/r/[slug]/print/actions";
import { thietBiCoMayIn, trongAppCoCauIn } from "@/lib/print/device";
import { baoIn } from "@/lib/print/thong-bao-in";
import type { PrintMode } from "@/lib/tenant/settings";

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

const KHONG_CO_MAY_IN =
  "Thiết bị này không nối máy in. Quán đang in từ máy quầy — in ở máy quầy, hoặc bật cầu in trong Cài đặt.";
const CAU_IN_DANG_MAT_KET_NOI =
  "Đã xếp phiếu bếp, nhưng máy in quầy đang mất kết nối — phiếu sẽ in khi có mạng lại (trong 30 phút). Gấp thì đọc món cho bếp.";
const CAU_IN_KHONG_NHAN = "Cầu in ở quầy không chạy (laptop quầy tắt?) — in từ máy quầy.";
const APP_CHUA_CAI_QUAY = "Chưa cài máy in quầy — mở ☰ Menu → Cài đặt máy in.";
const APP_KHONG_XEP_DUOC = "Chưa gửi được phiếu bếp — kiểm tra mạng rồi bấm in lại.";

/**
 * In qua trình duyệt: route in nạp vào iframe ẩn (route lo window.print + ghi print_jobs). Thiết bị không
 * nối máy in (điện thoại, tablet) thì hộp thoại in là vô ích — báo rõ thay vì mở nó (PRINT-16).
 */
class BrowserPrintAdapter implements PrintAdapter {
  printKitchenTicket({ slug, orderId, width = "80" }: PrintKitchenArgs): void {
    if (!thietBiCoMayIn()) return baoIn("loi", KHONG_CO_MAY_IN);
    printViaHiddenFrame(`/r/${slug}/print/kitchen/${orderId}?w=${width}`);
  }
  printCustomerTicket({ slug, orderId, width = "80" }: PrintCustomerArgs): void {
    if (!thietBiCoMayIn()) return baoIn("loi", KHONG_CO_MAY_IN);
    printViaHiddenFrame(`/r/${slug}/print/customer/${orderId}?w=${width}`);
  }
  printReceipt({ slug, billId, width = "80" }: PrintReceiptArgs): void {
    if (!thietBiCoMayIn()) return baoIn("loi", KHONG_CO_MAY_IN);
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
    // App "TechMenu Thu ngân" (DESK-07): cầu in nằm ngay trong app — luôn xếp phiếu (cầu in đang khởi động lại thì in
    // bù), không lui về hộp thoại in của trình duyệt.
    if (trongAppCoCauIn()) {
      queueKitchenTicketPrint(args.slug, args.orderId, true)
        .then((res) => {
          if (!res?.ok) baoIn("loi", APP_KHONG_XEP_DUOC);
          else if (res.cho) baoIn("loi", CAU_IN_DANG_MAT_KET_NOI);
        })
        .catch(() => baoIn("loi", APP_KHONG_XEP_DUOC));
      return;
    }
    // Đường lui khi cầu in không nhận: in trình duyệt NHƯ TRƯỚC P12, không xét thiết bị — laptop quầy phóng
    // to chữ 125–150% có thể rộng < 1024 px; báo lỗi ở đó là bếp mất phiếu. Điện thoại thì thấy hộp thoại in
    // vô ích, nhưng mất phiếu bếp đắt hơn nhiều.
    const fallback = () =>
      printViaHiddenFrame(`/r/${args.slug}/print/kitchen/${args.orderId}?w=${args.width ?? "80"}`);
    // P17 17-02: thiết bị không có máy in (điện thoại 5G lúc wifi quán mất) → server vẫn xếp phiếu khi cầu in mất
    // kết nối; cầu in lên mạng dự phòng thì in bù. Máy có máy in giữ đường lui in trình duyệt như cũ.
    queueKitchenTicketPrint(args.slug, args.orderId, !thietBiCoMayIn())
      .then((res) => {
        if (!res?.ok) fallback();
        else if (res.cho) baoIn("loi", CAU_IN_DANG_MAT_KET_NOI);
      })
      .catch(fallback);
  }

  /**
   * Hóa đơn / phiếu khách (PRINT-16). Máy CÓ máy in (máy quầy) in trình duyệt NHƯ CŨ — chưa đổi đường in
   * của máy quầy khi chưa thử in ảnh trên máy thật của quán. Thiết bị không có máy in → ra máy in quầy
   * qua cầu in.
   */
  printCustomerTicket(args: PrintCustomerArgs): void {
    const app = trongAppCoCauIn();
    if (!app && thietBiCoMayIn()) return this.browser.printCustomerTicket(args);
    xepRaQuay(() => queueCustomerTicketPrint(args.slug, args.orderId), "phiếu khách", () =>
      app
        ? baoIn("loi", APP_CHUA_CAI_QUAY)
        : printViaHiddenFrame(`/r/${args.slug}/print/customer/${args.orderId}?w=${args.width ?? "80"}`)
    );
  }
  printReceipt(args: PrintReceiptArgs): void {
    // Máy quầy chạy app: hóa đơn cũng qua cầu in (ảnh có dấu, PRINT-14) như điện thoại — không hộp thoại in (DESK-07).
    const app = trongAppCoCauIn();
    if (!app && thietBiCoMayIn()) return this.browser.printReceipt(args);
    xepRaQuay(() => queueReceiptPrint(args.slug, args.billId), "hóa đơn", () =>
      app
        ? baoIn("loi", APP_CHUA_CAI_QUAY)
        : printViaHiddenFrame(`/r/${args.slug}/print/receipt/${args.billId}?w=${args.width ?? "80"}`)
    );
  }
}

/**
 * `inNhuCu`: cầu in CHƯA KHAI máy in quầy (bản cũ, vd qt-food trước khi cài lại) → in trình duyệt như trước
 * P12. Không có nhánh này thì laptop quầy rộng < 1024 px (Windows phóng to chữ) sẽ báo lỗi thay vì in.
 */
function xepRaQuay(
  xep: () => Promise<{ ok: true } | { ok: false; lyDo: "cau-in" | "chua-khai" | "loi" }>,
  ten: string,
  inNhuCu: () => void
): void {
  xep()
    .then((r) => {
      if (r.ok) baoIn("ok", `Đã gửi ${ten} ra máy in quầy.`);
      else if (r.lyDo === "chua-khai") inNhuCu();
      else baoIn("loi", r.lyDo === "cau-in" ? CAU_IN_KHONG_NHAN : `Không gửi được ${ten} — thử lại.`);
    })
    .catch(() => baoIn("loi", `Mất kết nối — chưa gửi được ${ten}, thử lại.`));
}

const instances: Partial<Record<PrintMode, PrintAdapter>> = {};

/**
 * Adapter theo chế độ in của quán: `bridge` → cầu in ESC/POS; `browser` → trình duyệt. Mỗi chế độ giữ
 * một adapter (không trạng thái riêng theo quán, nên dùng chung được). Nơi gọi (POS/KDS) không đổi.
 */
export function getPrintAdapter(mode: PrintMode): PrintAdapter {
  const co = instances[mode];
  if (co) return co;
  const moi = mode === "bridge" ? new BridgePrintAdapter() : new BrowserPrintAdapter();
  instances[mode] = moi;
  return moi;
}
