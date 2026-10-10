"use client";

import { useEffect, useRef, useState } from "react";
import type { CustomerTicketView, KitchenWidth } from "@/lib/print/adapter";
import { formatVnd } from "@/lib/orders/cart";
import { logCustomerTicketPrint } from "@/app/r/[slug]/print/actions";
import { CO_PHIEU_KHACH } from "@/lib/print/co-giay";

/**
 * Phiếu KHÁCH in (client) — JetBrains Mono, đen trắng. Số đơn (ĐƠN #N) IN TO, KHỚP với phiếu
 * bếp để bếp mang món ra gọi đúng khách. Kèm giá + tổng. 3 khổ: 58/80mm + A5. Nút ẩn khi in.
 * Khi mở: ghi print_jobs 1 lần (POS đếm số lần in) rồi window.print().
 */
// Cùng bảng với ảnh phiếu cầu in (lib/print/anh-phieu) — hai đường in ra y hệt nhau.
const SIZE: Record<KitchenWidth, (typeof CO_PHIEU_KHACH)[KitchenWidth]> = CO_PHIEU_KHACH;

export function CustomerTicketDoc({
  slug,
  ticket,
  width,
  time,
}: {
  slug: string;
  ticket: CustomerTicketView;
  width: KitchenWidth;
  time: string;
}) {
  // Khổ giấy là trạng thái HIỂN THỊ, không phải lệnh in. Trước đây nó là link `?w=` — bấm vào là
  // điều hướng, component remount, useEffect chạy lại và in thêm một tờ. Đổi khổ giấy không bao
  // giờ có nghĩa là "in cho tôi thêm bản nữa".
  const [kho, setKho] = useState(width);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    logCustomerTicketPrint(slug, ticket.orderId).catch(() => {});
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [slug, ticket.orderId]);

  const s = SIZE[kho];

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
            <button
              key={k}
              type="button"
              data-kho={k}
              onClick={() => setKho(k)} className={`ct-btn ct-size ${k === kho ? "ct-active" : ""}`}>
              {SIZE[k].label}
            </button>
          ))}
        </span>
      </div>

      <div className="ct-ticket">
        <div className="ct-center">
          <div className="ct-tenant">{ticket.tenantName}</div>
          <div className="ct-title">PHIẾU KHÁCH</div>
          {/* Số đơn + chỗ IN TO cùng dòng, khớp phiếu bếp: "ĐƠN #40 BÀN B2" / "ĐƠN #40 MANG VỀ" (chủ dự án 10/10/2026). */}
          <div className="ct-no">
            {ticket.kitchenNo != null && <span className="ct-chunk">ĐƠN #{ticket.kitchenNo}</span>}{" "}
            <span className="ct-chunk">{ticket.place.toUpperCase()}</span>
          </div>
        </div>

        <div className="ct-line" />
        {ticket.contactName && <div>{ticket.contactName}</div>}
        <div>Ngày: {time}</div>
        <div className="ct-line" />

        {/* Bảng món: tiêu đề cột + kẻ chấm giữa từng món (chủ dự án 10/10/2026, như hóa đơn KiotViet/Sapo). */}
        <div className="ct-item-row ct-head">
          <span className="ct-item-name">Món</span>
          <span className="ct-item-qty">SL</span>
          <span className="ct-item-amt">Thành tiền</span>
        </div>
        <div className="ct-line" />

        <div className="ct-items">
          {ticket.items.map((it, idx) => (
            <div key={idx} className="ct-item">
              {/* Tên món trước, cột SL "x2" thẳng hàng, tiền bên phải (chủ dự án 10/10/2026, như hóa đơn KiotViet/Sapo). */}
              <div className="ct-item-row">
                <span className="ct-item-name">{it.name}</span>
                <span className="ct-item-qty">x{it.qty}</span>
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
        .ct-tenant { font-weight: 700; font-size: ${s.tenant}px; }
        .ct-title { font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
        .ct-no { font-weight: 800; font-size: ${s.no}px; margin-top: 4px; }
        .ct-chunk { display: inline-block; }
        .ct-line { border-top: 1px dashed #000; margin: ${Math.round(s.base / 2)}px 0; }
        .ct-row { display: flex; justify-content: space-between; gap: 8px; }
        .ct-items { margin: 2px 0; }
        .ct-item { margin-bottom: ${Math.round(s.base / 2)}px; }
        .ct-item + .ct-item { border-top: 1px dotted #000; padding-top: ${Math.round(s.base / 2)}px; }
        .ct-head > span { font-weight: 400; font-size: ${s.base}px; }
        .ct-item-row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
        .ct-item-name { flex: 1; font-weight: 700; font-size: ${s.name}px; word-break: break-word; }
        .ct-item-qty { font-weight: 700; font-size: ${s.name}px; white-space: nowrap; min-width: 3ch; text-align: right; }
        .ct-item-amt { font-weight: 700; white-space: nowrap; min-width: 10ch; text-align: right; }
        .ct-mod { padding-left: ${Math.round(s.base)}px; }
        .ct-note { font-weight: 700; word-break: break-word; }
        .ct-total { font-weight: 800; font-size: ${s.name}px; }
        .ct-foot { margin-top: 4px; }

        @media print {
          .no-print { display: none !important; }
          @page { size: ${s.page}; margin: ${s.margin}; }
          html, body { background: #fff !important; }
          /* Giấy to hơn khổ đã chọn (A4, PDF) thì phiếu vẫn đúng bề ngang khổ, không giãn hết trang. */
          .ct-ticket { width: auto; max-width: ${s.w}px; margin: 0 auto; padding: 0; }
        }
      `}</style>
    </div>
  );
}
