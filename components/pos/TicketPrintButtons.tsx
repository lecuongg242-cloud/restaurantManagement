"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, Receipt, Loader2, Check, AlertTriangle } from "lucide-react";
import { getPrintAdapter } from "@/lib/print/adapter";
import type { OrderPrintState, TicketPrintState } from "@/lib/print/adapter";
import { getOrderPrintStatus } from "@/app/r/[slug]/print/actions";
import { gioVn } from "@/lib/time/vn";

/**
 * Cặp nút in "Phiếu bếp" + "Phiếu khách" dùng chung cho OrderPanel (bàn) và TakeawayPanel (quầy),
 * kèm CHIP TRẠNG THÁI cho TỪNG loại phiếu, hiện thường trực (không dùng toast — toast bay mất,
 * nhân viên bỏ sót; máy in bếp lại ở xa nên không nhìn thấy giấy ra).
 *
 * Chip đếm SỐ LẦN in: cả hai loại phiếu đều in lại được nhiều lần (kẹt giấy, khách xin thêm tờ,
 * bếp làm mất) nên "đã in" thôi là chưa đủ — phải biết đã ra mấy tờ để khỏi in thừa/thiếu.
 *
 * KHÔNG hỏi lại sau khi in phiếu khách: chính mấy cái chip này là lời nhắc và chúng nằm đó mãi
 * cho tới khi in, còn hộp thoại thì chặn tay giữa lúc đông khách rồi biến mất một lần là hết
 * nhắc. Bố cục: khối dọc — hàng nút ở trên, chip XUỐNG DÒNG dưới nút. Để chip cùng hàng với nút
 * sẽ ăn hết bề ngang và bóp nát cột thông tin đơn (số đơn/giờ/tên khách) bên trái.
 */
const BTN =
  "inline-flex h-8 w-full items-center justify-center gap-xxs whitespace-nowrap rounded-md border border-hairline-strong px-sm text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

/** Cầu in ESC/POS: phiếu bếp in tự động ở bếp → chữ trên chip nói theo "gửi bếp", không phải "in". */
const BRIDGE = process.env.NEXT_PUBLIC_PRINT_MODE === "bridge";

const POLL_MS = 2500;
const MAX_POLLS = 40; // ~100s rồi thôi, tránh gọi mãi khi cầu in tắt

const EMPTY: TicketPrintState = { status: "none", at: null, count: 0 };

function hhmm(iso: string | null): string {
  if (!iso) return "";
  return gioVn(iso);
}

export function TicketPrintButtons({ slug, orderId }: { slug: string; orderId: string }) {
  const [print, setPrint] = useState<OrderPrintState>({ kitchen: EMPTY, customer: EMPTY });
  const polls = useRef(0);

  const refresh = useCallback(async () => {
    const next = await getOrderPrintStatus(slug, orderId).catch(() => null);
    if (next) setPrint(next);
  }, [slug, orderId]);

  // Trạng thái đọc từ print_jobs → F5 hay đổi ca vẫn thấy đúng đơn nào đã in, in mấy lần.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Chờ cầu in xử lý: hỏi lại cho tới khi ra printed/failed.
  useEffect(() => {
    if (print.kitchen.status !== "pending") return;
    const id = setInterval(() => {
      if (polls.current >= MAX_POLLS) {
        clearInterval(id);
        return;
      }
      polls.current += 1;
      refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [print.kitchen.status, refresh]);

  /**
   * Khóa nút trong lúc đang gửi. Trước đây nút không bị vô hiệu hóa, nên bấm đúp là hai lượt in —
   * và ở đường cầu in thì đó là HAI TỜ GIẤY thật ra ở bếp. Dữ liệu qt-food (24/09/2026) có 20 cặp
   * phiếu bếp cách nhau dưới 2 giây, khoảng cách nhỏ nhất 0,63 giây.
   *
   * Khóa 2 giây rồi tự mở: đủ để nuốt cú bấm đúp, và không giữ nút chết nếu mạng chậm — nhân viên
   * cần in lại thật thì vẫn bấm được ngay sau đó.
   */
  const [dangGui, setDangGui] = useState<null | "kitchen" | "customer">(null);
  const khoaNut = (loai: "kitchen" | "customer") => {
    setDangGui(loai);
    setTimeout(() => setDangGui(null), 2000);
  };

  const printKitchen = () => {
    if (dangGui) return;
    khoaNut("kitchen");
    polls.current = 0;
    // Phản hồi ngay (giữ nguyên số lần đã in); poll sẽ xác nhận bằng dữ liệu thật.
    setPrint((p) => ({ ...p, kitchen: { ...p.kitchen, status: "pending" } }));
    getPrintAdapter().printKitchenTicket({ slug, orderId });
    setTimeout(refresh, 1200); // in trình duyệt ghi 'printed' gần như tức thì
  };
  const printCustomer = () => {
    if (dangGui) return;
    khoaNut("customer");
    getPrintAdapter().printCustomerTicket({ slug, orderId });
    setTimeout(refresh, 1200); // route in ghi log khi mở → đọc lại để cập nhật số lần
  };

  return (
    // Mỗi loại phiếu là MỘT CỘT: nút trên, chip trạng thái ngay dưới, cùng bề rộng. Xếp thành hai
    // hàng rời (2 nút / 2 chip) thì phải đọc chữ mới biết chip nào nói về nút nào, và hai hàng
    // rộng hẹp khác nhau nhìn lệch. grid-cols-2 ép hai cột bằng nhau cho cân.
    // Khối tự co theo nội dung (inline-grid) — lề trái/phải để chỗ gọi quyết định.
    <div className="inline-grid grid-cols-2 gap-x-xs gap-y-xxs">
      <button type="button" onClick={printKitchen} disabled={dangGui !== null} className={BTN}>
        <Printer className="h-3.5 w-3.5" aria-hidden /> Phiếu bếp
      </button>
      <button type="button" onClick={printCustomer} disabled={dangGui !== null} className={BTN}>
        <Receipt className="h-3.5 w-3.5" aria-hidden /> Phiếu khách
      </button>
      <PrintChip state={print.kitchen} onRetry={printKitchen} bridgeKitchen={BRIDGE} />
      <PrintChip state={print.customer} onRetry={printCustomer} />
    </div>
  );
}

/**
 * Chip cùng bo góc (rounded-md) và cùng bề rộng với nút ngay trên nó, chỉ thấp hơn một nấc (h-7 so
 * với h-8) để đọc ra là "phần chú thích của nút này", không phải một nút thứ hai.
 */
const CHIP =
  "inline-flex h-7 w-full items-center justify-center gap-xxs whitespace-nowrap rounded-md px-sm text-xs font-semibold";

/** "×2" chỉ hiện khi in từ 2 lần trở lên — in đúng một lần là chuyện bình thường, không cần đếm. */
const times = (n: number) => (n > 1 ? ` ×${n}` : "");

/**
 * Chip trạng thái một loại phiếu. KHÔNG lặp lại chữ "Bếp"/"Khách" — nút ngay trên đã nói rồi, lặp
 * lại chỉ làm chip dài ra và lệch với nút.
 *
 * Thất bại là trường hợp nguy hiểm nhất (lễ tân tưởng bếp có phiếu) nên tô đỏ đặc và BẤM ĐƯỢC để
 * in lại ngay — không bắt tìm lại nút.
 */
function PrintChip({
  state,
  onRetry,
  bridgeKitchen = false,
}: {
  state: TicketPrintState;
  onRetry: () => void;
  /** Phiếu bếp qua cầu in ESC/POS: chữ nói theo "gửi bếp", không phải "in". */
  bridgeKitchen?: boolean;
}) {
  if (state.status === "failed") {
    return (
      <button
        type="button"
        onClick={onRetry}
        aria-live="assertive" // không dùng role=alert: sẽ nuốt mất vai trò button của phần tử
        className={`${CHIP} bg-status-late text-status-late-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-late focus-visible:ring-offset-2`}
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Lỗi — in lại
      </button>
    );
  }

  const chip =
    state.status === "pending" ? (
      <>
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        {bridgeKitchen ? "Đang gửi bếp…" : "Đang in…"}
      </>
    ) : state.status === "printed" ? (
      <>
        <Check className="h-3.5 w-3.5" aria-hidden />
        Đã in{times(state.count)} · {hhmm(state.at)}
      </>
    ) : (
      <>
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Chưa in
      </>
    );

  // "chưa in" = viền đỏ: món chưa xuống bếp / khách chưa có phiếu là lỗi vận hành phải thấy ngay,
  // nhưng để nhạt hơn nền đỏ đặc của "in lỗi" — hai việc khác nhau (chưa bấm in ≠ máy in báo hỏng).
  const tone =
    state.status === "pending"
      ? "bg-status-new text-status-new-fg"
      : state.status === "printed"
        ? "bg-status-ready-bg text-status-ready"
        : "border border-status-late/50 bg-cream-soft text-status-late";

  return (
    <span className={`${CHIP} ${tone}`} aria-live="polite">
      {chip}
    </span>
  );
}
