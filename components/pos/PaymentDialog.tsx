"use client";

import { useState } from "react";
import { X, Loader2, Printer, Banknote, Landmark, Check } from "lucide-react";
import type { BillView, PaymentMethod } from "@/lib/billing/types";
import { formatVnd } from "@/lib/orders/cart";
import { MoneyInput } from "@/components/ui/money-input";

/**
 * Thông báo khi lời gọi thu tiền KHÔNG tới được server (mất mạng, server ngủ). Phải nói rõ là
 * CHƯA ghi nhận: nhân viên đang cầm tiền của khách, tưởng xong là đơn treo tới hôm sau.
 * Dùng chung ở mọi nơi gọi thu tiền để câu chữ không mỗi chỗ một kiểu.
 */
export const PAY_OFFLINE_MSG =
  "Mất kết nối — CHƯA ghi nhận khoản thu này. Kiểm tra mạng rồi bấm Thử lại.";

const VN_OFFSET_MS = 7 * 3600 * 1000;
/** Mốc ISO → ngày VN `YYYY-MM-DD`. So ngày phải theo giờ VN, không theo UTC. */
const vnDayOf = (iso: string) =>
  new Date(new Date(iso).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
/** `2026-08-13T23:09Z` → `13/08`. */
const vnDayLabel = (iso: string) => {
  const d = vnDayOf(iso);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
};
/** `…T23:09Z` → `06:09` (giờ VN). */
const vnTimeLabel = (iso: string) =>
  new Date(new Date(iso).getTime() + VN_OFFSET_MS).toISOString().slice(11, 16);

/**
 * PaymentDialog (04-04, BILL-04) — thu tiền + đóng bill. Tiền mặt: nhập khách đưa + nút mệnh giá
 * nhanh → tiền thối. Chuyển khoản: xác nhận đã nhận đủ (QD D-P4-1, không QR). Sau đóng → in hóa
 * đơn + Xong. Center modal, bám QD-006.
 *
 * `onPrint` in CÙNG một route hóa đơn ở cả hai thời điểm — trước khi thu ra PHIẾU TẠM TÍNH cho
 * khách soát, sau khi thu ra HÓA ĐƠN có dòng tiền khách đưa/trả lại.
 */
export function PaymentDialog({
  bill,
  busy,
  onPay,
  onPrint,
  onClose,
  orderCreatedAt = null,
  canBackdate = false,
}: {
  bill: BillView;
  busy: boolean;
  onPay: (
    method: PaymentMethod,
    amountReceived: number,
    receivedAt?: string
  ) => Promise<{ ok: boolean; change?: number; error?: string }>;
  onPrint: () => void;
  onClose: () => void;
  /** Lúc tạo đơn — có thì hộp thoại mới hỏi được "tiền về hôm nào". Bill tại bàn để null. */
  orderCreatedAt?: string | null;
  /** Chủ/quản lý mới được ghi lùi (khớp rào ở server). */
  canBackdate?: boolean;
}) {
  const total = bill.totals.total;
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState<number>(total);
  /**
   * Đơn của ngày trước ⇒ hỏi tiền về hôm nào. Mặc định vẫn là "bây giờ": phải là lựa chọn có ý
   * thức, không phải cái bẫy bấm nhầm. Mốc lùi lấy đúng GIỜ TẠO ĐƠN — quán bán mang về thì khách
   * trả ngay lúc lấy đồ, nên đó là con số thật nhất ta có, và biểu đồ giờ cao điểm cũng không lệch.
   */
  const [backdate, setBackdate] = useState(false);

  const isStaleOrder = orderCreatedAt != null && vnDayOf(orderCreatedAt) < vnDayOf(new Date().toISOString());
  const staleDayLabel = orderCreatedAt ? vnDayLabel(orderCreatedAt) : "";
  const staleTimeLabel = orderCreatedAt ? vnTimeLabel(orderCreatedAt) : "";
  const [done, setDone] = useState<{ change: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = Math.max(0, received - total);
  const quicks = Array.from(new Set([total, Math.ceil(total / 50000) * 50000, 100000, 200000, 500000])).sort((a, b) => a - b);

  const confirm = async () => {
    setError(null);
    // Lưới an toàn cuối: dù nơi gọi có quên bắt lỗi mạng thì hộp thoại vẫn phải đứng yên với
    // thông báo rõ ràng, KHÔNG được tự đóng — nhân viên đang cầm tiền của khách.
    let res: { ok: boolean; change?: number; error?: string };
    try {
      res = await onPay(
        method,
        method === "cash" ? received : total,
        backdate && orderCreatedAt ? orderCreatedAt : undefined
      );
    } catch {
      setError(PAY_OFFLINE_MSG);
      return;
    }
    if (!res.ok) {
      setError(res.error ?? "Thu tiền thất bại.");
      return;
    }
    setDone({ change: res.change ?? 0 });
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/50 p-md" role="dialog" aria-modal="true" aria-label="Thu tiền">
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-canvas shadow-modal">
        <div className="flex items-center justify-between border-b border-hairline-soft px-lg py-md">
          <h3 className="font-display text-lg text-ink">
            {done ? "Đã thanh toán" : "Thu tiền"}
            {bill.billNo != null ? ` · #${bill.billNo}` : ""}
          </h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
          <div className="mb-md flex items-center justify-between">
            <span className="text-sm text-steel">Tổng phải thu</span>
            <span className="font-display text-2xl font-semibold tabular-nums text-primary">{formatVnd(total)}</span>
          </div>

          {done ? (
            <div className="rounded-md bg-surface p-lg text-center">
              <Check className="mx-auto h-8 w-8 text-status-ready" />
              <p className="mt-sm text-sm text-ink">Đã ghi nhận thanh toán.</p>
              {done.change > 0 && (
                <p className="mt-xs text-lg font-semibold tabular-nums text-ink">
                  Tiền trả lại: {formatVnd(done.change)}
                </p>
              )}
            </div>
          ) : (
            <>
              {error && (
                <p role="alert" className="mb-md rounded-md bg-cream-soft px-md py-sm text-sm text-status-late">
                  {error}
                </p>
              )}

              {/* Đơn tồn từ ngày trước: hỏi thẳng tiền về hôm nào. Ghi "bây giờ" cho khoản tiền
                  đã nhận hôm trước là sai cả doanh thu lẫn két, nên đừng đoán hộ người dùng. */}
              {isStaleOrder && (
                <div className="mb-md rounded-md border border-hairline-strong bg-surface px-md py-sm">
                  <p className="text-sm font-medium text-ink">Đơn này từ {staleDayLabel}. Tiền về lúc nào?</p>
                  <div className="mt-sm flex flex-col gap-xs">
                    <DateChoice
                      active={!backdate}
                      onClick={() => setBackdate(false)}
                      label="Bây giờ"
                      hint="Khách vừa trả tiền"
                    />
                    <DateChoice
                      active={backdate}
                      onClick={() => setBackdate(true)}
                      disabled={!canBackdate}
                      label={`${staleDayLabel}, lúc ${staleTimeLabel}`}
                      hint={
                        canBackdate
                          ? "Đã nhận tiền hôm đó, chỉ quên bấm"
                          : "Chỉ chủ quán hoặc quản lý chọn được"
                      }
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-sm">
                <MethodBtn active={method === "cash"} onClick={() => setMethod("cash")} icon={<Banknote className="h-4 w-4" />} label="Tiền mặt" />
                <MethodBtn active={method === "transfer"} onClick={() => setMethod("transfer")} icon={<Landmark className="h-4 w-4" />} label="Chuyển khoản" />
              </div>

              {method === "cash" ? (
                <div className="mt-md">
                  <label className="text-sm font-medium text-ink" htmlFor="pay-received">
                    Khách đưa
                  </label>
                  <MoneyInput
                    id="pay-received"
                    value={received}
                    onChange={setReceived}
                    className="mt-xs"
                  />
                  <div className="mt-sm flex flex-wrap gap-xs">
                    {quicks.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setReceived(q)}
                        className="rounded-md border border-hairline px-sm py-xs text-xs tabular-nums text-ink hover:bg-surface"
                      >
                        {formatVnd(q)}
                      </button>
                    ))}
                  </div>
                  <div className="mt-md flex items-center justify-between rounded-md bg-surface px-md py-sm">
                    <span className="text-sm text-steel">Tiền trả lại</span>
                    <span className="text-lg font-semibold tabular-nums text-ink">{formatVnd(change)}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-md rounded-md bg-surface px-md py-md text-sm text-steel">
                  Xác nhận đã nhận đủ {formatVnd(total)} qua chuyển khoản.
                </p>
              )}
            </>
          )}
        </div>

        <div className="border-t border-hairline-soft px-lg py-md">
          {done ? (
            <div className="flex gap-sm">
              <button
                type="button"
                onClick={onPrint}
                className="inline-flex h-12 flex-1 items-center justify-center gap-sm rounded-md border border-hairline-strong text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Printer className="h-4 w-4" /> In hóa đơn
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Xong
              </button>
            </div>
          ) : (
            // Tạm tính đưa khách xem TRƯỚC khi thu — bill chưa thanh toán nên route in ra
            // "PHIẾU TẠM TÍNH" (ReceiptDoc tự đổi tiêu đề khi bill chưa có payment).
            <div className="flex gap-sm">
              <button
                type="button"
                onClick={onPrint}
                className="inline-flex h-12 flex-1 items-center justify-center gap-xxs rounded-md border border-hairline-strong text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Printer className="h-4 w-4" /> In tạm tính
              </button>
              <button
                type="button"
                disabled={busy || (method === "cash" && received < total)}
                onClick={confirm}
                className="flex h-12 flex-[2] items-center justify-center rounded-md bg-primary text-base font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:bg-hairline disabled:text-muted"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : error ? (
                  "Thử lại"
                ) : (
                  "Xác nhận thu · đóng bill"
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Một lựa chọn "tiền về lúc nào" — cùng ngôn ngữ hình khối với MethodBtn nhưng xếp dọc, có chú thích. */
function DateChoice({
  active,
  onClick,
  label,
  hint,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={
        "flex min-h-12 flex-col items-start justify-center rounded-md border px-md py-sm text-left " +
        (active
          ? "border-primary bg-cream text-ink"
          : "border-hairline text-steel hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent")
      }
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-steel">{hint}</span>
    </button>
  );
}

function MethodBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex h-12 flex-1 items-center justify-center gap-sm rounded-md border text-sm font-medium " +
        (active ? "border-primary bg-cream text-ink" : "border-hairline text-steel hover:bg-surface")
      }
    >
      {icon} {label}
    </button>
  );
}
