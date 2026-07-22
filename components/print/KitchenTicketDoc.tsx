"use client";

import { useEffect, useRef } from "react";
import type { KitchenTicketView, KitchenWidth } from "@/lib/print/adapter";
import { logKitchenTicketPrint } from "@/app/r/[slug]/print/kitchen/actions";

/**
 * Phiếu bếp in (client) — JetBrains Mono, đen trắng. 3 khổ: 58/80mm (máy in nhiệt) + A5 (máy in
 * thường, chữ to đọc xa). Khi mở: ghi print_jobs 1 lần rồi window.print(). Nút ẩn khi in (.no-print).
 */
const SIZE: Record<
  KitchenWidth,
  { w: number; base: number; name: number; no: number; tenant: number; lh: number; page: string; margin: string; label: string }
> = {
  "58": { w: 240, base: 14, name: 16, no: 26, tenant: 16, lh: 1.4, page: "58mm auto", margin: "3mm", label: "58mm" },
  "80": { w: 320, base: 15, name: 19, no: 29, tenant: 19, lh: 1.4, page: "80mm auto", margin: "3mm", label: "80mm" },
  "a5": { w: 560, base: 20, name: 28, no: 40, tenant: 26, lh: 1.5, page: "A5", margin: "8mm", label: "A5 (to)" },
};

export function KitchenTicketDoc({
  slug,
  ticket,
  width,
  time,
}: {
  slug: string;
  ticket: KitchenTicketView;
  width: KitchenWidth;
  time: string;
}) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    logKitchenTicketPrint(slug, ticket.orderId).catch(() => {});
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [slug, ticket.orderId]);

  const s = SIZE[width];

  return (
    <div className="kt-wrap">
      <div className="no-print kt-toolbar">
        <button type="button" onClick={() => window.print()} className="kt-btn kt-btn-primary">
          In lại
        </button>
        <button type="button" onClick={() => window.close()} className="kt-btn">
          Đóng
        </button>
        <span className="kt-sizes">
          Khổ:
          {(Object.keys(SIZE) as KitchenWidth[]).map((k) => (
            <a key={k} href={`?w=${k}`} className={`kt-btn kt-size ${k === width ? "kt-active" : ""}`}>
              {SIZE[k].label}
            </a>
          ))}
        </span>
      </div>

      <div className="kt-ticket">
        <div className="kt-center">
          {ticket.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ticket.logoUrl} alt="" className="kt-logo" />
          )}
          <div className="kt-tenant">{ticket.tenantName}</div>
          <div className="kt-title">PHIẾU BẾP{ticket.isReprint ? " (IN LẠI)" : ""}</div>
          {ticket.kitchenNo != null && <div className="kt-no">ĐƠN #{ticket.kitchenNo}</div>}
        </div>

        <div className="kt-line" />
        <div className="kt-row">
          <span>
            Bàn: <b>{ticket.tableName}</b>
          </span>
          <span>#{ticket.ticketNo}</span>
        </div>
        <div className="kt-row">
          <span>{time}</span>
          <span>{ticket.items.reduce((acc, i) => acc + i.qty, 0)} phần</span>
        </div>
        <div className="kt-line" />

        <div className="kt-items">
          {ticket.items.map((it, idx) => (
            <div key={idx} className="kt-item">
              <div className="kt-item-name">
                {it.qty}x {it.name}
              </div>
              {it.modifiers.map((m, i) => (
                <div key={i} className="kt-mod">
                  + {m}
                </div>
              ))}
              {it.note && <div className="kt-note">&gt;&gt; {it.note}</div>}
            </div>
          ))}
        </div>

        <div className="kt-line" />
        <div className="kt-center kt-foot">— hết phiếu —</div>
      </div>

      <style>{`
        .kt-wrap { background: #fff; color: #000; }
        .kt-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px; }
        .kt-sizes { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #555; }
        .kt-btn {
          display: inline-flex; align-items: center; height: 40px; padding: 0 16px;
          border: 1px solid #333; border-radius: 6px; font-size: 14px; color: #000;
          background: #fff; cursor: pointer; text-decoration: none;
        }
        .kt-size { height: 34px; padding: 0 12px; }
        .kt-active { background: #000; color: #fff; }
        .kt-btn-primary { background: #fa520f; border-color: #fa520f; color: #fff; }
        .kt-ticket {
          width: ${s.w}px; margin: 0 auto; padding: 6px 8px 12px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: ${s.base}px; line-height: ${s.lh}; color: #000;
        }
        .kt-center { text-align: center; }
        .kt-logo { display: block; width: ${Math.round(s.base * 3)}px; height: ${Math.round(s.base * 3)}px; margin: 0 auto 4px; object-fit: contain; filter: grayscale(1); }
        .kt-tenant { font-weight: 700; font-size: ${s.tenant}px; }
        .kt-title { font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
        .kt-no { font-weight: 800; font-size: ${s.no}px; margin-top: 4px; }
        .kt-line { border-top: 1px dashed #000; margin: ${Math.round(s.base / 2)}px 0; }
        .kt-row { display: flex; justify-content: space-between; gap: 8px; }
        .kt-items { margin: 2px 0; }
        .kt-item { margin-bottom: ${Math.round(s.base / 2)}px; }
        .kt-item-name { font-weight: 700; font-size: ${s.name}px; word-break: break-word; }
        .kt-mod { padding-left: ${Math.round(s.base)}px; }
        .kt-note { font-weight: 700; word-break: break-word; }
        .kt-foot { margin-top: 4px; }

        @media print {
          .no-print { display: none !important; }
          @page { size: ${s.page}; margin: ${s.margin}; }
          html, body { background: #fff !important; }
          .kt-ticket { width: auto; margin: 0 auto; padding: 0; }
        }
      `}</style>
    </div>
  );
}
