"use client";

import { useEffect, useRef } from "react";
import type { CustomerTicketView, KitchenWidth } from "@/lib/print/adapter";
import { formatVnd } from "@/lib/orders/cart";

/**
 * Phiếu KHÁCH in (client) — JetBrains Mono, đen trắng. Số đơn (ĐƠN #N) IN TO, KHỚP với phiếu
 * bếp để bếp mang món ra gọi đúng khách. Kèm giá + tổng. 3 khổ: 58/80mm + A5. Nút ẩn khi in.
 * Không ghi print_jobs (phiếu khách giữ, không cần theo dõi in-lại).
 */
const SIZE: Record<
  KitchenWidth,
  { w: number; base: number; name: number; no: number; tenant: number; lh: number; page: string; margin: string; label: string }
> = {
  "58": { w: 240, base: 14, name: 15, no: 26, tenant: 16, lh: 1.4, page: "58mm auto", margin: "3mm", label: "58mm" },
  "80": { w: 320, base: 15, name: 17, no: 29, tenant: 19, lh: 1.4, page: "80mm auto", margin: "3mm", label: "80mm" },
  "a5": { w: 560, base: 20, name: 24, no: 40, tenant: 26, lh: 1.5, page: "A5", margin: "8mm", label: "A5 (to)" },
};

export function CustomerTicketDoc({
  ticket,
  width,
  time,
}: {
  ticket: CustomerTicketView;
  width: KitchenWidth;
  time: string;
}) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  const s = SIZE[width];
  const qtyTotal = ticket.items.reduce((acc, i) => acc + i.qty, 0);

  return (
    <div className="ct-wrap">
      <div className="no-print ct-toolbar">
        <button type="button" onClick={() => window.print()} className="ct-btn ct-btn-primary">
          In lại
        </button>
        <button type="button" onClick={() => window.close()} className="ct-btn">
          Đóng
        </button>
        <span className="ct-sizes">
          Khổ:
          {(Object.keys(SIZE) as KitchenWidth[]).map((k) => (
            <a key={k} href={`?w=${k}`} className={`ct-btn ct-size ${k === width ? "ct-active" : ""}`}>
              {SIZE[k].label}
            </a>
          ))}
        </span>
      </div>

      <div className="ct-ticket">
        <div className="ct-center">
          {ticket.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ticket.logoUrl} alt="" className="ct-logo" />
          )}
          <div className="ct-tenant">{ticket.tenantName}</div>
          <div className="ct-title">PHIẾU KHÁCH</div>
          {ticket.kitchenNo != null && <div className="ct-no">ĐƠN #{ticket.kitchenNo}</div>}
        </div>

        <div className="ct-line" />
        <div className="ct-row">
          <span>
            <b>{ticket.place}</b>
          </span>
          <span>#{ticket.ticketNo}</span>
        </div>
        {ticket.contactName && (
          <div className="ct-row">
            <span>{ticket.contactName}</span>
          </div>
        )}
        <div className="ct-row">
          <span>{time}</span>
          <span>{qtyTotal} phần</span>
        </div>
        <div className="ct-line" />

        <div className="ct-items">
          {ticket.items.map((it, idx) => (
            <div key={idx} className="ct-item">
              <div className="ct-item-row">
                <span className="ct-item-name">
                  {it.qty}x {it.name}
                </span>
                <span className="ct-item-amt">{formatVnd(it.unitPrice * it.qty)}</span>
              </div>
              {it.modifiers.map((m, i) => (
                <div key={i} className="ct-mod">
                  + {m}
                </div>
              ))}
              {it.note && <div className="ct-note">&gt;&gt; {it.note}</div>}
            </div>
          ))}
        </div>

        <div className="ct-line" />
        <div className="ct-row ct-total">
          <span>TỔNG</span>
          <span>{formatVnd(ticket.total)}</span>
        </div>
        <div className="ct-line" />
        <div className="ct-center ct-foot">
          Vui lòng giữ phiếu
          {ticket.kitchenNo != null ? ` — gọi theo số đơn #${ticket.kitchenNo}` : ""}
        </div>
      </div>

      <style>{`
        .ct-wrap { background: #fff; color: #000; }
        .ct-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px; }
        .ct-sizes { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #555; }
        .ct-btn {
          display: inline-flex; align-items: center; height: 40px; padding: 0 16px;
          border: 1px solid #333; border-radius: 6px; font-size: 14px; color: #000;
          background: #fff; cursor: pointer; text-decoration: none;
        }
        .ct-size { height: 34px; padding: 0 12px; }
        .ct-active { background: #000; color: #fff; }
        .ct-btn-primary { background: #fa520f; border-color: #fa520f; color: #fff; }
        .ct-ticket {
          width: ${s.w}px; margin: 0 auto; padding: 6px 8px 12px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: ${s.base}px; line-height: ${s.lh}; color: #000;
        }
        .ct-center { text-align: center; }
        .ct-logo { display: block; width: ${Math.round(s.base * 3)}px; height: ${Math.round(s.base * 3)}px; margin: 0 auto 4px; object-fit: contain; filter: grayscale(1); }
        .ct-tenant { font-weight: 700; font-size: ${s.tenant}px; }
        .ct-title { font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
        .ct-no { font-weight: 800; font-size: ${s.no}px; margin-top: 4px; }
        .ct-line { border-top: 1px dashed #000; margin: ${Math.round(s.base / 2)}px 0; }
        .ct-row { display: flex; justify-content: space-between; gap: 8px; }
        .ct-items { margin: 2px 0; }
        .ct-item { margin-bottom: ${Math.round(s.base / 2)}px; }
        .ct-item-row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
        .ct-item-name { font-weight: 700; font-size: ${s.name}px; word-break: break-word; }
        .ct-item-amt { font-weight: 700; white-space: nowrap; }
        .ct-mod { padding-left: ${Math.round(s.base)}px; }
        .ct-note { font-weight: 700; word-break: break-word; }
        .ct-total { font-weight: 800; font-size: ${s.name}px; }
        .ct-foot { margin-top: 4px; }

        @media print {
          .no-print { display: none !important; }
          @page { size: ${s.page}; margin: ${s.margin}; }
          html, body { background: #fff !important; }
          .ct-ticket { width: auto; margin: 0 auto; padding: 0; }
        }
      `}</style>
    </div>
  );
}
