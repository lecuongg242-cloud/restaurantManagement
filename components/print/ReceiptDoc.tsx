"use client";

import { useEffect, useRef } from "react";
import type { KitchenWidth } from "@/lib/print/adapter";
import type { ReceiptView } from "@/lib/billing/receipt-view";
import { formatVnd } from "@/lib/orders/cart";
import { logReceiptPrint } from "@/app/r/[slug]/print/receipt/actions";

/**
 * Hóa đơn khách in (client) — JetBrains Mono, đen trắng, khổ nhiệt 58/80mm (PRINT-03). Khi mở:
 * ghi print_jobs 1 lần rồi window.print(). Nút ẩn khi in (.no-print).
 */
const SIZE: Record<"58" | "80", { w: number; base: number; name: number; total: number; tenant: number; page: string; margin: string; label: string }> = {
  "58": { w: 240, base: 12, name: 13, total: 18, tenant: 15, page: "58mm auto", margin: "3mm", label: "58mm" },
  "80": { w: 320, base: 13, name: 14, total: 20, tenant: 17, page: "80mm auto", margin: "3mm", label: "80mm" },
};

const METHOD_LABEL: Record<string, string> = { cash: "Tiền mặt", transfer: "Chuyển khoản" };

export function ReceiptDoc({
  slug,
  billId,
  receipt,
  width,
  time,
}: {
  slug: string;
  billId: string;
  receipt: ReceiptView;
  width: KitchenWidth;
  time: string;
}) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    logReceiptPrint(slug, billId).catch(() => {});
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [slug, billId]);

  const s = SIZE[width === "58" ? "58" : "80"];
  const change =
    receipt.payment && receipt.payment.method === "cash"
      ? Math.max(0, receipt.payment.amount - receipt.total)
      : 0;

  return (
    <div className="rc-wrap">
      <div className="no-print rc-toolbar">
        <button type="button" onClick={() => window.print()} className="rc-btn rc-btn-primary">
          In lại
        </button>
        <button type="button" onClick={() => window.close()} className="rc-btn">
          Đóng
        </button>
        <span className="rc-sizes">
          Khổ:
          {(["58", "80"] as const).map((k) => (
            <a key={k} href={`?w=${k}`} className={`rc-btn rc-size ${k === (width === "58" ? "58" : "80") ? "rc-active" : ""}`}>
              {SIZE[k].label}
            </a>
          ))}
        </span>
      </div>

      <div className="rc-receipt">
        <div className="rc-center">
          {receipt.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={receipt.logoUrl} alt="" className="rc-logo" />
          )}
          <div className="rc-tenant">{receipt.tenantName}</div>
          <div className="rc-title">{receipt.payment ? "HÓA ĐƠN" : "PHIẾU TẠM TÍNH"}</div>
        </div>

        <div className="rc-line" />
        <div className="rc-row">
          <span>{receipt.tableLabel}</span>
          <span>{receipt.billNo != null ? `#${receipt.billNo}` : ""}</span>
        </div>
        <div className="rc-row">
          <span>{time}</span>
        </div>
        {receipt.contactLine && (
          <div className="rc-row">
            <span>{receipt.contactLine}</span>
          </div>
        )}
        <div className="rc-line" />

        {receipt.isChild ? (
          <div className="rc-child">
            <p>{receipt.childNote ?? "Phần chia đều"}</p>
          </div>
        ) : (
          <div className="rc-items">
            {receipt.lines.map((it, idx) => (
              <div key={idx} className="rc-item">
                <div className="rc-item-head">
                  <span className="rc-item-name">{it.name}</span>
                  <span className="rc-amt">{formatVnd(it.amount)}</span>
                </div>
                <div className="rc-item-sub">
                  {it.qty} × {formatVnd(it.unitPrice)}
                  {it.modifiers.length > 0 ? ` · ${it.modifiers.join(", ")}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rc-line" />
        {!receipt.isChild && (
          <>
            <Row label="Tạm tính" value={formatVnd(receipt.subtotal)} />
            {receipt.discountAmount > 0 && <Row label="Giảm giá" value={`- ${formatVnd(receipt.discountAmount)}`} />}
            {receipt.serviceChargePct > 0 && (
              <Row label={`Phí phục vụ ${receipt.serviceChargePct}%`} value={formatVnd(receipt.serviceChargeAmount)} />
            )}
            {receipt.vatPct > 0 && <Row label={`VAT ${receipt.vatPct}%`} value={formatVnd(receipt.vatAmount)} />}
          </>
        )}
        <div className="rc-total-row">
          <span>TỔNG</span>
          <span>{formatVnd(receipt.total)}</span>
        </div>

        {receipt.payment && (
          <>
            <div className="rc-line" />
            <Row label={METHOD_LABEL[receipt.payment.method] ?? receipt.payment.method} value={formatVnd(receipt.payment.amount)} />
            {change > 0 && <Row label="Tiền trả lại" value={formatVnd(change)} />}
          </>
        )}

        {receipt.footer && (
          <>
            <div className="rc-line" />
            <div className="rc-center rc-foot">{receipt.footer}</div>
          </>
        )}
        <div className="rc-center rc-foot">Cảm ơn quý khách!</div>
      </div>

      <style>{`
        .rc-wrap { background: #fff; color: #000; }
        .rc-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px; }
        .rc-sizes { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #555; }
        .rc-btn { display: inline-flex; align-items: center; height: 40px; padding: 0 16px; border: 1px solid #333; border-radius: 6px; font-size: 14px; color: #000; background: #fff; cursor: pointer; text-decoration: none; }
        .rc-size { height: 34px; padding: 0 12px; }
        .rc-active { background: #000; color: #fff; }
        .rc-btn-primary { background: #fa520f; border-color: #fa520f; color: #fff; }
        .rc-receipt { width: ${s.w}px; margin: 0 auto; padding: 6px 8px 12px; font-family: var(--font-mono), ui-monospace, monospace; font-size: ${s.base}px; line-height: 1.45; color: #000; }
        .rc-center { text-align: center; }
        .rc-logo { display: block; width: ${Math.round(s.base * 3)}px; height: ${Math.round(s.base * 3)}px; margin: 0 auto 4px; object-fit: contain; filter: grayscale(1); }
        .rc-tenant { font-weight: 700; font-size: ${s.tenant}px; }
        .rc-title { font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
        .rc-line { border-top: 1px dashed #000; margin: ${Math.round(s.base / 2)}px 0; }
        .rc-row { display: flex; justify-content: space-between; gap: 8px; }
        .rc-items { margin: 2px 0; }
        .rc-item { margin-bottom: ${Math.round(s.base / 2)}px; }
        .rc-item-head { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; font-size: ${s.name}px; }
        .rc-item-name { word-break: break-word; }
        .rc-amt { white-space: nowrap; }
        .rc-item-sub { color: #222; padding-left: 2px; }
        .rc-child { text-align: center; font-weight: 700; margin: 6px 0; }
        .rc-total-row { display: flex; justify-content: space-between; font-weight: 800; font-size: ${s.total}px; margin-top: 4px; }
        .rc-foot { margin-top: 4px; }

        @media print {
          .no-print { display: none !important; }
          @page { size: ${s.page}; margin: ${s.margin}; }
          html, body { background: #fff !important; }
          .rc-receipt { width: auto; margin: 0 auto; padding: 0; }
        }
      `}</style>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rc-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
