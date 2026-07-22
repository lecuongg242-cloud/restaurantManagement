"use client";

import { useEffect, useRef } from "react";
import type { KitchenTicketView } from "@/lib/print/adapter";
import { logKitchenTicketPrint } from "@/app/r/[slug]/print/kitchen/actions";

/**
 * Phiếu bếp in (client) — JetBrains Mono, đen trắng, khổ 58/80mm. Khi mở: ghi print_jobs 1 lần
 * rồi window.print(). Nút "In lại"/"Đóng" ẩn khi in (.no-print). Bố cục không tràn khổ nhiệt.
 */
export function KitchenTicketDoc({
  slug,
  ticket,
  width,
  time,
}: {
  slug: string;
  ticket: KitchenTicketView;
  width: 58 | 80;
  time: string;
}) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    // Ghi log (best-effort) rồi mở hộp thoại in sau khi render xong.
    logKitchenTicketPrint(slug, ticket.orderId).catch(() => {});
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [slug, ticket.orderId]);

  const widthPx = width === 58 ? 220 : 300; // xấp xỉ vùng in 58/80mm cho preview màn hình
  const fontPx = width === 58 ? 12 : 13;

  return (
    <div className="kt-wrap">
      <div className="no-print kt-toolbar">
        <button type="button" onClick={() => window.print()} className="kt-btn">
          In lại
        </button>
        <button type="button" onClick={() => window.close()} className="kt-btn">
          Đóng
        </button>
        <a href={`?w=${width === 58 ? 80 : 58}`} className="kt-btn">
          Đổi khổ → {width === 58 ? "80mm" : "58mm"}
        </a>
      </div>

      <div className="kt-ticket">
        {/* Đầu phiếu */}
        <div className="kt-center">
          {ticket.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ticket.logoUrl} alt="" className="kt-logo" />
          )}
          <div className="kt-tenant">{ticket.tenantName}</div>
          <div className="kt-title">PHIẾU BẾP{ticket.isReprint ? " (IN LẠI)" : ""}</div>
        </div>

        <div className="kt-line" />
        <div className="kt-row">
          <span>Bàn: <b>{ticket.tableName}</b></span>
          <span>#{ticket.ticketNo}</span>
        </div>
        <div className="kt-row">
          <span>{time}</span>
          <span>{ticket.items.reduce((s, i) => s + i.qty, 0)} phần</span>
        </div>
        <div className="kt-line" />

        {/* Thân phiếu */}
        <div className="kt-items">
          {ticket.items.map((it, idx) => (
            <div key={idx} className="kt-item">
              <div className="kt-item-name">
                {it.qty}x {it.name}
              </div>
              {it.modifiers.map((m, i) => (
                <div key={i} className="kt-mod">+ {m}</div>
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
        .kt-toolbar { display: flex; gap: 8px; padding: 12px; }
        .kt-btn {
          display: inline-flex; align-items: center; height: 40px; padding: 0 16px;
          border: 1px solid #333; border-radius: 6px; font-size: 14px; color: #000;
          background: #fff; cursor: pointer; text-decoration: none;
        }
        .kt-ticket {
          width: ${widthPx}px; margin: 0 auto; padding: 6px 8px 12px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: ${fontPx}px; line-height: 1.35; color: #000;
        }
        .kt-center { text-align: center; }
        .kt-logo { display: block; width: 40px; height: 40px; margin: 0 auto 4px; object-fit: contain; filter: grayscale(1); }
        .kt-tenant { font-weight: 700; font-size: ${fontPx + 2}px; }
        .kt-title { font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
        .kt-line { border-top: 1px dashed #000; margin: 6px 0; }
        .kt-row { display: flex; justify-content: space-between; gap: 8px; }
        .kt-items { margin: 2px 0; }
        .kt-item { margin-bottom: 6px; }
        .kt-item-name { font-weight: 700; word-break: break-word; }
        .kt-mod { padding-left: 14px; }
        .kt-note { font-weight: 700; word-break: break-word; }
        .kt-foot { margin-top: 4px; }

        @media print {
          .no-print { display: none !important; }
          @page { size: ${width}mm auto; margin: 3mm; }
          html, body { background: #fff !important; }
          .kt-ticket { width: auto; margin: 0; padding: 0; }
        }
      `}</style>
    </div>
  );
}
