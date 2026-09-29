"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KitchenWidth } from "@/lib/print/adapter";
import type { ReceiptView } from "@/lib/billing/receipt-view";
import { formatVnd } from "@/lib/orders/cart";
import { logReceiptPrint } from "@/app/r/[slug]/print/receipt/actions";
import type { TransferQr } from "@/lib/billing/transfer-qr";
import { duongSvgQr, LE_QR, maTranQr } from "@/lib/payments/qr-matrix";
import { CO_HOA_DON } from "@/lib/print/co-giay";

/**
 * Hóa đơn khách in (client) — JetBrains Mono, đen trắng, khổ nhiệt 58/80mm (PRINT-03). Khi mở:
 * ghi print_jobs 1 lần rồi window.print(). Nút ẩn khi in (.no-print).
 */
// Cùng bảng với ảnh hóa đơn cầu in (lib/print/anh-phieu) — hai đường in ra y hệt nhau.
const SIZE = CO_HOA_DON;

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
  // Khổ giấy là trạng thái HIỂN THỊ, không phải lệnh in. Trước đây nó là link `?w=` — bấm vào là
  // điều hướng, component remount, useEffect chạy lại và in thêm một tờ. Đổi khổ giấy không bao
  // giờ có nghĩa là "in cho tôi thêm bản nữa".
  const [kho, setKho] = useState(width);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    logReceiptPrint(slug, billId).catch(() => {});
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [slug, billId]);

  const s = SIZE[kho === "58" ? "58" : "80"];
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
            <button
              key={k}
              type="button"
              data-kho={k}
              onClick={() => setKho(k)} className={`rc-btn rc-size ${k === (width === "58" ? "58" : "80") ? "rc-active" : ""}`}>
              {SIZE[k].label}
            </button>
          ))}
        </span>
      </div>

      <div className="rc-receipt">
        <div className="rc-center">
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
                  <span className="rc-qty">{it.qty}</span>
                  <span className="rc-item-name">{it.name}</span>
                  <span className="rc-amt">{formatVnd(it.amount)}</span>
                </div>
                {it.modifiers.length > 0 && <div className="rc-item-sub">{it.modifiers.join(", ")}</div>}
                {it.note && <div className="rc-item-sub rc-note">{it.note}</div>}
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

        {receipt.transferQr && <QrChuyenKhoan qr={receipt.transferQr} rong={kho === "58" ? 160 : 192} />}

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
        .rc-receipt { width: ${s.w}px; margin: 0 auto; padding: 6px 8px 12px; font-family: var(--font-mono), ui-monospace, monospace; font-size: ${s.base}px; line-height: ${s.lh}; color: #000; }
        .rc-center { text-align: center; }
        .rc-tenant { font-weight: 700; font-size: ${s.tenant}px; }
        .rc-title { font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
        .rc-line { border-top: 1px dashed #000; margin: ${Math.round(s.base / 2)}px 0; }
        .rc-row { display: flex; justify-content: space-between; gap: 8px; }
        .rc-items { margin: 2px 0; }
        .rc-item { margin-bottom: ${Math.round(s.base / 2)}px; }
        .rc-item-head { display: flex; gap: 6px; font-weight: 700; font-size: ${s.name}px; }
        /* Cột SL cố định 2ch: mọi dòng thẳng cột, tên món tự dãn, tiền bám mép phải. */
        .rc-qty { flex: 0 0 2ch; text-align: right; }
        .rc-item-name { flex: 1 1 auto; word-break: break-word; }
        .rc-amt { flex: 0 0 auto; white-space: nowrap; margin-left: auto; }
        /* Dòng phụ thụt vào ngang cột tên (bề rộng cột SL + khoảng cách). */
        .rc-item-sub { color: #222; padding-left: calc(2ch + 6px); }
        .rc-note { font-weight: 700; }
        .rc-child { text-align: center; font-weight: 700; margin: 6px 0; }
        .rc-total-row { display: flex; justify-content: space-between; font-weight: 800; font-size: ${s.total}px; margin-top: 4px; }
        .rc-foot { margin-top: 4px; }
        /* QR phải ra ĐEN tuyệt đối: trình duyệt mặc định được phép làm nhạt màu khi in. */
        .rc-qr { margin-top: ${Math.round(s.base / 2)}px; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .rc-qr svg { display: block; margin: 0 auto; shape-rendering: crispEdges; }
        .rc-qr-note { font-size: ${s.base - 1}px; word-break: break-word; }

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

/** QR chuyển khoản dưới dòng TỔNG (PAY-03) — cùng ma trận với ảnh PNG của cầu in (lib/print/anh-phieu). */
function QrChuyenKhoan({ qr, rong }: { qr: TransferQr; rong: number }) {
  const { n, d } = useMemo(() => {
    const m = maTranQr(qr.payload);
    return { n: m.n + 2 * LE_QR, d: duongSvgQr(m) };
  }, [qr.payload]);
  return (
    <div className="rc-qr" data-transfer-qr>
      <div className="rc-line" />
      <div className="rc-qr-note">Quét để chuyển khoản</div>
      <svg width={rong} height={rong} viewBox={`0 0 ${n} ${n}`} role="img" aria-label="Mã QR chuyển khoản">
        <rect width={n} height={n} fill="#fff" />
        <path d={d} fill="#000" />
      </svg>
      <div className="rc-qr-note">
        {qr.bankShortName} · {qr.accountNo}
      </div>
      <div className="rc-qr-note">{qr.accountName}</div>
      <div className="rc-qr-note">Nội dung: {qr.content}</div>
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
