"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { Banknote, BellRing, Check, Hand, Loader2, Printer, X } from "lucide-react";
import { gioVn, thoiGianNgoi } from "@/lib/time/vn";
import { formatVnd } from "@/lib/orders/cart";
import type { PayQueueRow } from "@/lib/orders/payment-queue";
import { cn } from "@/lib/utils";

type DonCanIn = { id: string; tableName: string; kitchenNo: number | null; itemCount: number; created_at: string };
type BanGoi = { id: string; tableName: string; note: string | null };

/**
 * Điện thoại (< 640px): ba băng "Chờ duyệt / Cần in phiếu / Bàn đang gọi" gộp thành MỘT hàng nút gọn. Ba
 * băng chip cuộn ngang như máy quầy ăn hơn 200px chiều cao, lộ thanh cuộn, nút bị cắt ở mép. Bấm nút mở
 * danh sách từ đáy màn — cùng hành động như chip trên băng (in phiếu bếp / đánh dấu đã xử lý).
 *
 * P27 (ORDER-23): `inline` — cùng hai nút "Cần in N" / "Bàn gọi N" đặt trên THANH TRÊN CÙNG của máy quầy / tablet (≥ 640px),
 * thay ba băng chiếm 300–430px (1366) hay gần hết màn (1024). Nút "Chờ duyệt" đã có sẵn trên thanh đó nên không lặp.
 * Máy tính: danh sách THẢ XUỐNG ngay dưới nút (chủ dự án 03/10/2026: ngăn kéo từ đáy màn bắt nhìn và kéo chuột xuống dưới);
 * điện thoại giữ ngăn kéo từ đáy (gần ngón cái).
 */
export function PhoneAlertBar({
  pendingCount,
  onOpenPending,
  unprinted,
  printingId,
  onPrint,
  calls,
  resolvingId,
  onResolve,
  callError,
  always = false,
  trailing,
  inline = false,
  payQueue = [],
  onOpenPay,
}: {
  pendingCount: number;
  onOpenPending: () => void;
  unprinted: DonCanIn[];
  printingId: string | null;
  onPrint: (orderId: string) => void;
  calls: BanGoi[];
  resolvingId: string | null;
  onResolve: (callId: string) => void;
  callError: string | null;
  /** Chế độ quầy: hàng này THAY hàng công cụ trên điện thoại, nên hiện cả khi không có gì cần xử lý. */
  always?: boolean;
  /** Nút công cụ dời từ hàng trên xuống (chip máy in, Đơn online) — nằm cuối hàng. */
  trailing?: ReactNode;
  /** Đặt trong thanh công cụ máy quầy (≥ 640px): chỉ các nút Cần in / Bàn gọi / Thanh toán, không có hàng riêng. */
  inline?: boolean;
  /** Hàng chờ thanh toán (ORDER-26), chờ lâu nhất trước. */
  payQueue?: PayQueueRow[];
  /** Bấm một bàn trong hàng chờ → POS chọn bàn đó và mở hóa đơn. */
  onOpenPay?: (tableId: string) => void;
}) {
  const [mo, setMo] = useState<"in" | "goi" | "tt" | null>(null);
  const boc = useRef<HTMLDivElement>(null);
  const moDs =
    (mo === "in" && unprinted.length > 0) || (mo === "goi" && calls.length > 0) || (mo === "tt" && payQueue.length > 0);
  // Thả xuống (máy tính): bấm ra ngoài / Escape thì đóng.
  useEffect(() => {
    if (!inline || !moDs) return;
    const ngoai = (e: MouseEvent) => {
      if (boc.current && !boc.current.contains(e.target as Node)) setMo(null);
    };
    // Escape chỉ đóng danh sách: chặn lan lên window, nơi OrderPanel nghe Escape để bỏ chọn bàn (React có thể vẽ lại — gỡ
    // danh sách khỏi DOM — ngay giữa hai lượt nghe, nên không dựa vào việc OrderPanel còn thấy danh sách được).
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setMo(null);
    };
    document.addEventListener("mousedown", ngoai);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", ngoai);
      document.removeEventListener("keydown", esc);
    };
  }, [inline, moDs]);
  const coViec = (!inline && pendingCount > 0) || unprinted.length > 0 || calls.length > 0 || payQueue.length > 0;
  if (!coViec && !always) return null;
  const tieuDe =
    mo === "in"
      ? `Đơn cần in phiếu (${unprinted.length})`
      : mo === "tt"
        ? `Chờ thanh toán (${payQueue.length})`
        : `Bàn đang gọi (${calls.length})`;

  // Nhãn ngắn ("Duyệt", "Gọi") + không xuống dòng: ba nút + nút công cụ trên 440px mỗi nút chỉ ~110px, nhãn
  // dài bị bẻ đôi. Dưới 400px chỉ icon + số; tên đầy đủ nằm ở aria-label.
  const nut =
    "inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-xs whitespace-nowrap rounded-md border px-sm text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  // Thanh trên cùng máy quầy: chữ chỉ hiện từ 1280px — tablet 1024 chỉ icon + số, không đẩy nút "Chờ duyệt" ra ngoài mép.
  const chu = inline ? "hidden xl:inline" : "max-[400px]:hidden";

  const danhSach = (
      <ul className={cn("flex flex-col gap-xs overflow-y-auto", inline ? "p-sm" : "p-md")}>
        {mo === "in" &&
          unprinted.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onPrint(u.id)}
                disabled={printingId === u.id}
                className="flex min-h-[52px] w-full items-center gap-sm rounded-md border border-status-late/40 bg-canvas px-md text-left text-sm text-ink hover:bg-status-late/5 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {printingId === u.id ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-status-late" aria-hidden />
                ) : (
                  <Printer className="h-4 w-4 shrink-0 text-status-late" aria-hidden />
                )}
                <span className="font-semibold">Bàn {u.tableName}</span>
                {u.kitchenNo != null && <span className="text-steel">#{u.kitchenNo}</span>}
                <span className="text-slate">{u.itemCount} món</span>
                <span className="ml-auto tabular-nums text-steel">{gioVn(u.created_at)}</span>
              </button>
            </li>
          ))}
        {mo === "goi" &&
          calls.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onResolve(c.id)}
                disabled={resolvingId === c.id}
                className="flex min-h-[52px] w-full items-center gap-sm rounded-md border border-primary/30 bg-canvas px-md text-left text-sm text-ink hover:bg-primary/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="font-semibold">Bàn {c.tableName}</span>
                {c.note && <span className="min-w-0 truncate text-slate">{c.note}</span>}
                <span className="ml-auto inline-flex shrink-0 items-center gap-xxs text-xs font-medium text-primary">
                  <Check className="h-4 w-4" aria-hidden /> Đã xử lý
                </span>
              </button>
            </li>
          ))}
        {mo === "tt" &&
        payQueue.map((r) => (
          <li key={r.tableId}>
            <button
              type="button"
              onClick={() => {
                setMo(null);
                onOpenPay?.(r.tableId);
              }}
              className="flex min-h-[52px] w-full items-center gap-sm rounded-md border border-status-ready/40 bg-canvas px-md text-left text-sm text-ink hover:bg-status-ready-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Banknote className="h-4 w-4 shrink-0 text-status-ready" aria-hidden />
              <span className="font-semibold">Bàn {r.tableName}</span>
              {/* Đã Tính tiền rồi khách gọi thêm: tiền hóa đơn chưa gồm món mới (chưa VAT/phí) — mở hóa đơn sẽ tự thêm vào và tính lại. */}
              <span className="tabular-nums text-ink">{formatVnd(r.total)}</span>
              {r.newItems > 0 && (
                <span title="Chưa có trên hóa đơn — mở hóa đơn sẽ tự thêm vào" className="shrink-0 rounded-full border border-status-late/40 px-xs text-xs font-semibold text-status-late">
                  +{r.newItems} món gọi thêm
                </span>
              )}
              {r.method && <span className="truncate text-slate">{r.method}</span>}
              <span className="ml-auto shrink-0 tabular-nums text-steel" suppressHydrationWarning>
                chờ {thoiGianNgoi(r.since, Date.now())}
              </span>
            </button>
          </li>
        ))}
      {mo === "goi" && callError && (
          <li role="alert" className="text-sm text-status-late">
            {callError}
          </li>
        )}
      </ul>
  );

  return (
    <div
      ref={boc}
      className={cn(
        "relative flex items-center gap-xs",
        inline ? "shrink-0 max-sm:hidden [&>button]:h-11 [&>button]:flex-none [&>button]:px-sm lg:[&>button]:px-md" : "border-b border-hairline-soft bg-canvas px-md py-xs sm:hidden"
      )}
    >
      {!inline && pendingCount > 0 && (
        <button
          type="button"
          onClick={onOpenPending}
          aria-label={`Chờ duyệt ${pendingCount}`}
          className={cn(nut, "border-primary bg-cream-deeper")}
        >
          <BellRing className="h-4 w-4 shrink-0 animate-pulse text-primary" aria-hidden />
          <span className={chu}>Duyệt</span> {pendingCount}
        </button>
      )}
      {unprinted.length > 0 && (
        <button
          type="button"
          onClick={() => setMo(mo === "in" ? null : "in")}
          aria-label={`Cần in ${unprinted.length}`}
          aria-expanded={mo === "in"}
          className={cn(nut, "border-status-late bg-cream-soft")}
        >
          <Printer className="h-4 w-4 shrink-0 text-status-late" aria-hidden />
          <span className={chu}>{inline ? "Cần in phiếu" : "Cần in"}</span> {unprinted.length}
        </button>
      )}
      {calls.length > 0 && (
        <button
          type="button"
          onClick={() => setMo(mo === "goi" ? null : "goi")}
          aria-label={`Bàn gọi ${calls.length}`}
          aria-expanded={mo === "goi"}
          className={cn(nut, "border-primary/40 bg-cream")}
        >
          <Hand className="h-4 w-4 shrink-0 animate-pulse text-primary" aria-hidden />
          <span className={chu}>{inline ? "Bàn gọi" : "Gọi"}</span> {calls.length}
        </button>
      )}
      {payQueue.length > 0 && (
        <button
          type="button"
          onClick={() => setMo(mo === "tt" ? null : "tt")}
          aria-label={`Thanh toán ${payQueue.length}`}
          aria-expanded={mo === "tt"}
          className={cn(nut, "border-status-ready bg-status-ready-bg")}
        >
          <Banknote className="h-4 w-4 shrink-0 text-status-ready" aria-hidden />
          <span className={chu}>{inline ? "Thanh toán" : "Thu"}</span> {payQueue.length}
        </button>
      )}
      {trailing && <div className="ml-auto flex shrink-0 items-center gap-xs">{trailing}</div>}

      {inline ? (
        moDs && (
          // data-pos-popover: OrderPanel thấy đang mở danh sách thì Escape không bỏ chọn bàn.
          <div
            role="dialog"
            aria-label={tieuDe}
            data-pos-popover
            className="absolute right-0 top-[calc(100%+8px)] z-50 flex max-h-[70vh] w-[26rem] flex-col rounded-lg border border-hairline-soft bg-canvas shadow-modal"
          >
            <div className="flex items-center justify-between border-b border-hairline-soft px-md py-xs">
              <p className="font-semibold text-base text-ink">{tieuDe}</p>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setMo(null)}
                className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {danhSach}
          </div>
        )
      ) : (
        // Danh sách hết (in xong / xử lý xong hết) → tự đóng, không để lại ngăn kéo rỗng.
        <Drawer.Root
          open={moDs}
          onOpenChange={(v) => !v && setMo(null)}
          repositionInputs={false}
        >
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
            <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-xl bg-canvas pb-[env(safe-area-inset-bottom)] shadow-modal outline-none">
              <div className="flex items-center justify-between border-b border-hairline-soft px-md py-sm">
                <Drawer.Title className="font-semibold text-lg text-ink">
                  {tieuDe}
                </Drawer.Title>
                <Drawer.Description className="sr-only">
                  {mo === "in" ? "Chạm một đơn để in phiếu bếp" : mo === "tt" ? "Chạm một bàn để mở hóa đơn" : "Chạm một bàn để đánh dấu đã xử lý"}
                </Drawer.Description>
                <Drawer.Close asChild>
                  <button
                    type="button"
                    aria-label="Đóng"
                    className="grid h-11 w-11 place-items-center rounded-md text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </Drawer.Close>
              </div>
              {danhSach}
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </div>
  );
}
