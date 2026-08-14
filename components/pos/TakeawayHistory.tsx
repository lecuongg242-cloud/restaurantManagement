"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, ChevronDown, Loader2, Printer } from "lucide-react";
import type {
  OnlineOrderView,
  TakeawayBillInfo,
  TakeawayHistorySummary,
} from "@/lib/orders/online";
import { groupTakeawayOrders } from "@/lib/orders/takeaway-group";
import { formatVnd } from "@/lib/orders/cart";
import { getPrintAdapter } from "@/lib/print/adapter";
import { listTakeawayHistoryAction } from "@/app/r/[slug]/pos/actions";
import { cn } from "@/lib/utils";

const VN_OFFSET = 7 * 3600 * 1000;
const DAY = 86400000;
const METHOD_LABEL: Record<string, string> = { cash: "Tiền mặt", transfer: "Chuyển khoản" };
/** Gõ tới đâu gọi server tới đó là mỗi phím một truy vấn — chờ người dùng ngừng gõ. */
const SEARCH_DEBOUNCE_MS = 350;

/** Ngày VN (YYYY-MM-DD) của "hôm nay lệch `offset` ngày". Máy POS có thể để lệch múi giờ. */
function vnDay(offset = 0): string {
  return new Date(Date.now() + VN_OFFSET + offset * DAY).toISOString().slice(0, 10);
}

/** "hh:mm dd/mm" giờ VN — số bếp reset mỗi ngày nên NGÀY phải hiện cùng giờ. */
function vnStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + VN_OFFSET).toISOString();
  return `${d.slice(11, 16)} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/** "dd/mm/yyyy" từ YYYY-MM-DD. */
const ddmmyyyy = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

/** Nhãn gọn của khoảng đang lọc: một ngày thì hiện một ngày, đừng lặp hai đầu giống hệt nhau. */
const rangeLabel = (from: string, to: string) =>
  from === to ? ddmmyyyy(from) : `${ddmmyyyy(from)} – ${ddmmyyyy(to)}`;

/** Chip lọc — dùng chung cho preset và nút "Tùy chọn" để hai thứ trông đúng một họ. */
const chip = (active: boolean) =>
  active
    ? "inline-flex h-8 items-center rounded-full bg-primary px-md text-xs font-semibold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    : "inline-flex h-8 items-center rounded-full border border-hairline-strong bg-canvas px-md text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

type Preset = { key: string; label: string; from: () => string; to: () => string };

const PRESETS: Preset[] = [
  { key: "today", label: "Hôm nay", from: () => vnDay(0), to: () => vnDay(0) },
  { key: "yesterday", label: "Hôm qua", from: () => vnDay(-1), to: () => vnDay(-1) },
  { key: "7d", label: "7 ngày", from: () => vnDay(-6), to: () => vnDay(0) },
  { key: "30d", label: "30 ngày", from: () => vnDay(-29), to: () => vnDay(0) },
];

/** Danh sách món của một đơn trong lịch sử — món đã hủy gạch ngang, không biến mất. */
function HistoryLines({ order }: { order: OnlineOrderView }) {
  return (
    <ul className="mt-sm flex flex-col divide-y divide-hairline-soft">
      {order.items.map((it) => {
        const cancelled = it.status === "cancelled";
        return (
          <li key={it.id} className="flex items-start justify-between gap-md py-xs">
            <div className="min-w-0">
              <p className={cancelled ? "text-sm text-stone line-through" : "text-sm text-ink"}>
                {it.qty}× {it.name}
              </p>
              {it.modifiers.length > 0 && (
                <p className="text-xs text-steel">{it.modifiers.join(" · ")}</p>
              )}
              {it.note && <p className="text-xs italic text-stone">“{it.note}”</p>}
            </div>
            <span
              className={
                cancelled
                  ? "shrink-0 text-sm tabular-nums text-stone line-through"
                  : "shrink-0 text-sm tabular-nums text-steel"
              }
            >
              {formatVnd(it.unitPrice * it.qty)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Lịch sử đơn không gắn bàn (POS · tab "Đã xong"). Thu tiền xong là đơn rời hàng đợi — đây là
 * đường xem lại: chọn KHOẢNG NGÀY (số bếp reset theo ngày nên không lọc ngày thì "Đơn #5" là đơn
 * nào cũng không biết), rồi tìm nhanh theo số đơn / tên / SĐT.
 *
 * Tiền hiện theo BILL đã chốt (đã trừ giảm giá, cộng phụ thu) chứ không cộng lại từ món — đây mới
 * là số tiền khách thật sự trả. In lại hóa đơn ngay tại chỗ cho khách hỏi lại.
 *
 * QUY MÔ (quán vài trăm đơn/ngày):
 *  - Tải theo TRANG 20 nhóm + "Tải thêm" thay cho trần cứng 400 đơn. Trần cũ vừa cắt mất đơn vừa
 *    đẩy việc sang người dùng ("hãy thu hẹp khoảng ngày").
 *  - Thẻ đơn THU GỌN mặc định: một đơn 7 món trước đây cao ~11 dòng, giờ 4 dòng. Đây là thứ quyết
 *    định chiều cao cột, không phải số đơn.
 *  - Tìm kiếm và hai con số tổng chạy Ở SERVER trên cả khoảng ngày (xem listTakeawayHistory).
 */
export function TakeawayHistory({
  slug,
  counter = false,
  query,
}: {
  slug: string;
  counter?: boolean;
  /** Chữ đang gõ ở ô tìm DUY NHẤT trên thanh POS — panel này không có ô tìm riêng. */
  query: string;
}) {
  const [preset, setPreset] = useState<string>("today");
  const [from, setFrom] = useState(() => vnDay(0));
  const [to, setTo] = useState(() => vnDay(0));
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OnlineOrderView[]>([]);
  const [bills, setBills] = useState<TakeawayBillInfo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [summary, setSummary] = useState<TakeawayHistorySummary | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [matched, setMatched] = useState<Set<string>>(new Set());

  // Ô tìm nằm ở thanh POS (component cha) nên chữ tới đây theo từng phím → tự hoãn ở đây.
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Kết quả về CHẬM hơn lần gõ sau sẽ ghi đè lên kết quả mới — đánh số lượt để bỏ lượt cũ.
  const runId = useRef(0);

  const loadFirst = useCallback(async () => {
    const run = ++runId.current;
    setLoading(true);
    setError(null);
    const res = await listTakeawayHistoryAction(slug, from, to, { query: debouncedQuery });
    if (run !== runId.current) return;
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      setOrders([]);
      setBills([]);
      setCursor(null);
      setSummary(null);
      setMatched(new Set());
      return;
    }
    setOrders(res.history.orders);
    setBills(res.history.bills);
    setCursor(res.history.nextCursor);
    setSummary(res.history.summary);
    setMatched(new Set(res.history.matchedIds));
    setExpanded(new Set());
  }, [slug, from, to, debouncedQuery]);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    const run = runId.current;
    setLoadingMore(true);
    const res = await listTakeawayHistoryAction(slug, from, to, {
      cursor,
      query: debouncedQuery,
    });
    if (run !== runId.current) return; // bộ lọc đã đổi giữa chừng → bỏ trang này
    setLoadingMore(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Gộp theo id: keyset không chồng trang, nhưng bấm đúp / effect chạy hai lần thì vẫn an toàn.
    setOrders((prev) => {
      const byId = new Map(prev.map((o) => [o.id, o]));
      for (const o of res.history.orders) byId.set(o.id, o);
      return [...byId.values()];
    });
    setBills((prev) => {
      const byId = new Map(prev.map((b) => [b.billId, b]));
      for (const b of res.history.bills) byId.set(b.billId, b);
      return [...byId.values()];
    });
    setMatched((prev) => new Set([...prev, ...res.history.matchedIds]));
    setCursor(res.history.nextCursor);
  };

  const applyPreset = (p: Preset) => {
    setPreset(p.key);
    setFrom(p.from());
    setTo(p.to());
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const billByOrderId = useMemo(() => new Map(bills.map((b) => [b.orderId, b])), [bills]);
  const groups = useMemo(() => groupTakeawayOrders(orders, { newestFirst: true }), [orders]);

  const emptyLabel = counter
    ? "Không có đơn nào đã xong trong khoảng này."
    : "Không có đơn mang về nào đã xong trong khoảng này.";

  return (
    <div className="flex flex-col">
      {/* ---- Bộ lọc thời gian ---- (không sticky: thanh tab của panel đã chiếm mép trên)
          Hai ô chọn ngày NẤP sau chip "Tùy chọn": 99% thao tác là bấm một preset, mà bày sẵn cả
          preset lẫn hai ô ngày thì cụm lọc cao gần bằng một thẻ đơn — đẩy đơn xuống khỏi tầm mắt
          và bắt nhân viên đọc hai lần cùng một khoảng ngày. */}
      <div className="flex flex-col gap-sm pb-md">
        <div className="flex flex-wrap items-center gap-xs">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p)}
              className={chip(preset === p.key)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPreset("custom")}
            aria-expanded={preset === "custom"}
            className={chip(preset === "custom")}
          >
            <CalendarRange className="mr-xxs h-3.5 w-3.5" aria-hidden />
            Tùy chọn
          </button>
        </div>

        {preset === "custom" && (
          <div className="flex items-center gap-xs">
            <input
              type="date"
              value={from}
              max={to}
              aria-label="Từ ngày"
              onChange={(e) => setFrom(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-full border border-hairline-strong bg-canvas px-md text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <span className="shrink-0 text-sm text-steel" aria-hidden>
              –
            </span>
            <input
              type="date"
              value={to}
              min={from}
              aria-label="Đến ngày"
              onChange={(e) => setTo(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-full border border-hairline-strong bg-canvas px-md text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}

        {/* Một dòng tổng kết: KHOẢNG đang lọc (thay cho 2 ô ngày đã ẩn) · số đơn · tiền đã thu.
            Hai con số này của CẢ khoảng, đếm ở server — không phải cộng từ mấy trang đã tải. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-sm gap-y-xxs border-t border-hairline-soft pt-sm">
          <span className="text-xs text-steel">{rangeLabel(from, to)}</span>
          {!loading && !error && summary && (
            <span className="text-sm text-steel">
              <span className="font-medium text-ink">{summary.orderCount} đơn</span>
              {" · đã thu "}
              <span className="font-semibold tabular-nums text-ink">{formatVnd(summary.paidTotal)}</span>
              {summary.paidBills !== summary.orderCount && (
                <span className="text-xs">{` (${summary.paidBills} HĐ)`}</span>
              )}
            </span>
          )}
        </div>
        {/* Hai con số khác gốc: tiền theo ngày THU (khớp trang Báo cáo), đơn theo ngày TẠO. Chỉ nói
            khi chúng thực sự lệch — quán chốt tiền gọn trong ngày thì dòng này không hiện. */}
        {!loading && !error && summary && summary.paidBills !== summary.orderCount && (
          <p className="text-xs text-steel">
            Tiền tính theo ngày thu (khớp trang Báo cáo), số đơn tính theo ngày tạo đơn — chênh nhau
            là do đơn của ngày trước được chốt bù trong kỳ này.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-cream-soft px-md py-sm text-sm text-status-late">
          {error}
        </p>
      )}

      {loading ? (
        <p className="flex items-center justify-center gap-sm py-xl text-sm text-steel">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
        </p>
      ) : groups.length === 0 && !error ? (
        <p className="py-xl text-center text-sm text-steel">
          {debouncedQuery ? "Không thấy đơn khớp trong khoảng này." : emptyLabel}
        </p>
      ) : (
        <div className="flex flex-col gap-md">
          {groups.map((g) => {
            const bill = billByOrderId.get(g.root.id) ?? null;
            const cancelled = g.root.status === "cancelled";
            const label = g.root.kitchenNo != null ? `#${g.root.kitchenNo}` : "";
            const open = expanded.has(g.root.id);
            const lineCount =
              g.root.items.length + g.children.reduce((s, c) => s + c.items.length, 0);
            // Nhóm lọt vào kết quả vì một LƯỢT GỌI THÊM khớp, không phải đơn gốc: thẻ mang số
            // gốc (#87) trong khi người dùng gõ số lượt (#90) — không chú thích thì đọc ra
            // đúng như kết quả sai.
            const matchedChildren =
              matched.size > 0 && !matched.has(g.root.id)
                ? g.children.filter((c) => matched.has(c.id))
                : [];

            return (
              <div key={g.root.id} className="rounded-lg border border-hairline-soft p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="text-sm font-medium text-ink">
                    Đơn {label}
                    <span className="ml-xs text-xs font-normal text-steel">
                      {vnStamp(g.root.createdAt)}
                    </span>
                  </p>
                  <span
                    className={
                      cancelled
                        ? "inline-flex h-6 items-center rounded-full bg-cream-soft px-sm text-xs font-medium text-status-late"
                        : "inline-flex h-6 items-center rounded-full bg-cream-deeper px-sm text-xs font-medium text-ink"
                    }
                  >
                    {cancelled ? "Đã hủy" : "Đã thu tiền"}
                  </span>

                  {/* Số của các LƯỢT GỌI THÊM nằm ngay tiêu đề, không nấp trong phần món đã thu
                      gọn: nhóm mang số của đơn GỐC, nên tìm "#90" mà thấy thẻ "Đơn #87" thì đọc ra
                      y như kết quả sai. Tô đậm khi chính lượt đó là cái khớp từ khóa. */}
                  {g.children.length > 0 && (
                    <span
                      className={cn(
                        "inline-flex h-6 items-center rounded-full px-sm text-xs font-medium",
                        matchedChildren.length > 0
                          ? "bg-primary text-primary-fg"
                          : "bg-cream text-ink"
                      )}
                    >
                      + gọi thêm{" "}
                      {g.children
                        .map((c) => (c.kitchenNo != null ? `#${c.kitchenNo}` : "—"))
                        .join(", ")}
                    </span>
                  )}
                </div>

                {(g.root.contact?.name || g.root.contact?.phone) && (
                  <p className="mt-xxs flex flex-wrap items-baseline gap-x-xs text-xs">
                    {g.root.contact?.name && (
                      <span className="font-medium text-primary">{g.root.contact.name}</span>
                    )}
                    {g.root.contact?.phone && (
                      <span className="tabular-nums text-steel">{g.root.contact.phone}</span>
                    )}
                  </p>
                )}

                {/* Món NẤP sau nút: xem lại đơn cũ là việc thỉnh thoảng, còn chiều cao cột thì phải
                    trả giá mọi lúc — một đơn 7 món xổ sẵn cao gấp ~3 lần thẻ thu gọn. */}
                {open && (
                  <>
                    {/* Chỉ dán nhãn khi nhóm CÓ lượt gọi thêm: đơn lẻ mà cũng ghi "Đơn gốc" là
                        thừa chữ, còn nhóm mà để khối đầu không tên thì không biết món nào của lượt
                        nào. Các lượt thụt vào + kẻ dọc để đọc ra ngay là chúng thuộc đơn trên. */}
                    {g.children.length > 0 && (
                      <p className="mt-sm text-xs font-medium text-steel">
                        Đơn gốc {label}
                        <span className="ml-xs font-normal">{vnStamp(g.root.createdAt)}</span>
                      </p>
                    )}
                    <HistoryLines order={g.root} />
                    {g.children.map((c) => (
                      <div
                        key={c.id}
                        className="mt-sm border-l-2 border-primary/30 pl-md"
                      >
                        <p className="text-xs font-medium text-primary">
                          Gọi thêm {c.kitchenNo != null ? `#${c.kitchenNo}` : ""}
                          <span className="ml-xs font-normal text-steel">
                            {vnStamp(c.createdAt)}
                          </span>
                        </p>
                        <HistoryLines order={c} />
                      </div>
                    ))}
                  </>
                )}

                <div className="mt-sm flex flex-wrap items-center justify-between gap-sm border-t border-hairline-soft pt-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold tabular-nums text-ink">
                      {formatVnd(bill && bill.status === "paid" ? bill.total : g.total)}
                    </span>
                    <span className="text-xs font-normal text-steel">
                      {bill && bill.status === "paid"
                        ? [
                            bill.billNo != null ? `Hóa đơn #${bill.billNo}` : "Đã thanh toán",
                            bill.methods.map((m) => METHOD_LABEL[m] ?? m).join(", "),
                            bill.paidAt ? vnStamp(bill.paidAt) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : cancelled
                          ? "Không thu tiền"
                          : "Chưa có hóa đơn"}
                    </span>
                  </span>
                  <div className="flex items-center gap-xs">
                    <button
                      type="button"
                      onClick={() => toggle(g.root.id)}
                      aria-expanded={open}
                      className="inline-flex h-9 items-center gap-xxs rounded-md px-sm text-xs font-medium text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      {lineCount} món
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                    </button>
                    {bill && bill.status === "paid" && (
                      <button
                        type="button"
                        onClick={() => getPrintAdapter().printReceipt({ slug, billId: bill.billId })}
                        className="inline-flex h-9 items-center gap-xs rounded-md border border-hairline-strong bg-canvas px-md text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      >
                        <Printer className="h-4 w-4" aria-hidden />
                        In lại hóa đơn
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {cursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="flex h-11 w-full items-center justify-center gap-sm rounded-md border border-hairline-strong bg-canvas text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
                </>
              ) : (
                `Tải thêm${
                  summary ? ` (đang hiện ${groups.length}/${summary.orderCount})` : ""
                }`
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
