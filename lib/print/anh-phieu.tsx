import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { formatVnd } from "@/lib/orders/cart";
import type { ReceiptView } from "@/lib/billing/receipt-view";
import type { CustomerTicketView } from "@/lib/print/adapter";
import type { TransferQr } from "@/lib/billing/transfer-qr";
import { duongSvgQr, LE_QR, maTranQr } from "@/lib/payments/qr-matrix";

/**
 * Dựng hóa đơn / phiếu khách thành ẢNH PNG đen trắng để cầu in gửi ra máy in nhiệt (PRINT-14, QD-020 D4).
 *
 * Máy in nhiệt phổ thông không có bảng mã tiếng Việt ⇒ in chữ thì mất dấu (như phiếu bếp). In ẢNH thì có
 * dấu trên mọi máy. Nội dung là BẢN CHỤP lưu trong `print_jobs.payload.anh` lúc bấm in — đúng hóa đơn tại
 * thời điểm đó, và cầu in không cần quyền đọc hóa đơn. Nhãn giữ y như bản in trình duyệt (`ReceiptDoc`,
 * `CustomerTicketDoc`). Bố cục chỉ dùng flexbox (giới hạn của `next/og`).
 */
export type PhieuAnh =
  | { loai: "receipt"; hoaDon: ReceiptView; gio: string }
  | { loai: "customer_ticket"; phieu: CustomerTicketView; gio: string };

export type Kho = "80" | "58";

/** Số chấm ngang vùng in: 80 mm = 576, 58 mm = 384 (máy nhiệt 203 dpi). */
export const RONG: Record<Kho, number> = { "80": 576, "58": 384 };

/** Lề trái/phải của ảnh (chấm) — `padding` của khung ngoài. */
const LE_NGANG = 12;

/**
 * Số chấm cho MỘT ô QR (PAY-03). Số nguyên để mỗi ô ra đúng một khối chấm đặc — ô lẻ chấm bị làm mờ
 * rồi cầu in cắt ngưỡng thành ô to ô nhỏ, app ngân hàng đọc trượt. Máy nhiệt rẻ in nhòe ô nhỏ ⇒ nhắm
 * 6 chấm (80 mm) / 5 chấm (58 mm), không dưới 4 / 3; mã quá to so với khổ thì hạ xuống cho vừa.
 */
const CHAM_MOI_O: Record<Kho, { muc: number; toiThieu: number }> = {
  "80": { muc: 6, toiThieu: 4 },
  "58": { muc: 5, toiThieu: 3 },
};

/** Kích thước ảnh QR (kể cả lề trắng 4 ô mỗi phía) và số chấm mỗi ô, cho khổ giấy `kho`. */
export function kichThuocQr(payload: string, kho: Kho): { m: ReturnType<typeof maTranQr>; cham: number; px: number } {
  const m = maTranQr(payload);
  const soO = m.n + 2 * LE_QR;
  const vua = Math.floor((RONG[kho] - 2 * LE_NGANG) / soO);
  const cham = Math.max(CHAM_MOI_O[kho].toiThieu, Math.min(CHAM_MOI_O[kho].muc, vua));
  return { m, cham, px: soO * cham };
}

const COT = { "80": { chu: 24, lon: 34, nho: 20 }, "58": { chu: 18, lon: 26, nho: 16 } } as const;

/**
 * Cỡ chữ PHIẾU KHÁCH (chấm) = cỡ của bản in trình duyệt `CustomerTicketDoc` × 203/96 (1 px CSS khi in = 1/96 inch,
 * máy nhiệt 203 dpi). Phiếu khách chữ to hơn hóa đơn để khách đọc số đơn; in qua cầu in mà dùng cỡ hóa đơn thì ra
 * nhỏ hơn hẳn bản trình duyệt quán đã quen (qt-food 30/09/2026).
 */
export const CO_PHIEU_KHACH = {
  "80": { chu: 32, ten: 36, quan: 40, so: 61 },
  "58": { chu: 30, ten: 32, quan: 34, so: 55 },
} as const;
const METHOD_LABEL: Record<string, string> = { cash: "Tiền mặt", transfer: "Chuyển khoản" };

let font: { name: string; data: Buffer; weight: 400 | 700 }[] | null = null;
function napFont() {
  if (font) return font;
  const thuMuc = path.join(process.cwd(), "assets", "fonts");
  font = [
    { name: "BVP", data: fs.readFileSync(path.join(thuMuc, "BeVietnamPro-Regular.ttf")), weight: 400 },
    { name: "BVP", data: fs.readFileSync(path.join(thuMuc, "BeVietnamPro-Bold.ttf")), weight: 700 },
  ];
  return font;
}

/**
 * Chiều cao ảnh (`next/og` bắt buộc biết trước). Ước dư theo số dòng + số dòng tên món bị xuống hàng —
 * cầu in cắt phần trắng thừa ở đáy trước khi in, nên dư vài dòng không tốn giấy.
 */
export function uocLuongChieuCao(p: PhieuAnh, kho: Kho): number {
  const c = COT[kho];
  const dong = c.chu * 1.5;
  const kyTuMoiDong = Math.floor(RONG[kho] / (c.chu * 0.55));
  const soDongChu = (s: string | null | undefined) => (s ? Math.max(1, Math.ceil(s.length / kyTuMoiDong)) : 0);

  let n = 8; // tên quán, tiêu đề, 2 đường kẻ, bàn/số, giờ, lề
  if (p.loai === "receipt") {
    const h = p.hoaDon;
    n += soDongChu(h.contactLine) + (h.isChild ? soDongChu(h.childNote ?? "x") : 0);
    for (const l of h.lines) n += soDongChu(`${l.qty} ${l.name}`) + soDongChu(l.modifiers.join(", ")) + soDongChu(l.note);
    n += 6 + (h.payment ? 3 : 0) + soDongChu(h.footer) + 2;
    if (h.transferQr) {
      // 4 dòng chữ quanh mã + đường kẻ; ảnh QR tính riêng bằng chấm.
      n += 5 + soDongChu(`${h.transferQr.bankShortName} · ${h.transferQr.accountNo}`) + soDongChu(h.transferQr.accountName);
      return Math.ceil(n * dong + c.lon * 3 + kichThuocQr(h.transferQr.payload, kho).px);
    }
  } else {
    // Phiếu khách chữ to hơn: ước theo cỡ TÊN MÓN (lớn nhất trong thân) — dư thì cầu in cắt.
    const k = CO_PHIEU_KHACH[kho];
    const dongK = k.ten * 1.5;
    const kyTu = Math.floor(RONG[kho] / (k.ten * 0.55));
    const soDong = (s: string | null | undefined, rong = kyTu) => (s ? Math.max(1, Math.ceil(s.length / rong)) : 0);
    // Tên món chỉ còn phần giữa cột SL (44 chấm) và cột tiền (~9 ký tự đậm) — xuống hàng nhiều hơn dòng thường.
    const kyTuTen = Math.max(4, Math.floor((RONG[kho] - 2 * LE_NGANG - 44 - k.ten * 0.62 * 9) / (k.ten * 0.62)));
    const t = p.phieu;
    let m = 8 + 2 + soDong(t.contactName) + 5;
    for (const l of t.items) m += soDong(l.name, kyTuTen) + soDong(l.modifiers.join(", ")) + soDong(l.note);
    return Math.ceil(m * dongK + (k.quan + k.so) * 1.5);
  }
  return Math.ceil(n * dong + c.lon * 3);
}

const DUONG_KE = { borderTop: "2px dashed #000", margin: "10px 0", width: "100%" } as const;

/** Satori không xếp con của Fragment theo cột như trình duyệt — mọi nhóm phải là một div flex cột thật. */
function Cot({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>{children}</div>;
}

function Giua({ children, co, dam }: { children: React.ReactNode; co?: number; dam?: boolean }) {
  return (
    // Không để khóa style mang giá trị undefined — Satori ném lỗi thay vì bỏ qua.
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        textAlign: "center",
        width: "100%",
        fontWeight: dam ? 700 : 400,
        ...(co ? { fontSize: co } : {}),
      }}
    >
      {children}
    </div>
  );
}

function Hang({ trai, phai, dam }: { trai: string; phai?: string; dam?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontWeight: dam ? 700 : 400 }}>
      <span>{trai}</span>
      {phai !== undefined && <span>{phai}</span>}
    </div>
  );
}

function Mon({
  qty,
  ten,
  tien,
  phu,
  ghiChu,
  nho,
  coTen,
}: {
  qty: number;
  ten: string;
  tien: string;
  phu: string[];
  ghiChu: string | null;
  nho: number;
  /** Dòng tên món to + đậm (phiếu khách, như `.ct-item-name`); bỏ trống = cỡ thường (hóa đơn). */
  coTen?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", marginBottom: 6 }}>
      <div style={{ display: "flex", width: "100%", ...(coTen ? { fontSize: coTen, fontWeight: 700 } : {}) }}>
        <span style={{ width: 44, flexShrink: 0 }}>{qty}×</span>
        <span style={{ flexGrow: 1, flexShrink: 1 }}>{ten}</span>
        <span style={{ flexShrink: 0, paddingLeft: 8 }}>{tien}</span>
      </div>
      {phu.length > 0 && <span style={{ paddingLeft: 44, fontSize: nho }}>{phu.join(", ")}</span>}
      {ghiChu && <span style={{ paddingLeft: 44, fontSize: nho, fontWeight: 700 }}>{ghiChu}</span>}
    </div>
  );
}

function HoaDon({ h, gio, kho }: { h: ReceiptView; gio: string; kho: Kho }) {
  const c = COT[kho];
  const tienThoi = h.payment && h.payment.method === "cash" ? Math.max(0, h.payment.amount - h.total) : 0;
  return (
    <Cot>
      <Giua co={c.lon} dam>{h.tenantName}</Giua>
      <Giua dam>{h.payment ? "HÓA ĐƠN" : "PHIẾU TẠM TÍNH"}</Giua>
      <div style={DUONG_KE} />
      <Hang trai={h.tableLabel} phai={h.billNo != null ? `#${h.billNo}` : ""} />
      <Hang trai={gio} />
      {h.contactLine && <Hang trai={h.contactLine} />}
      <div style={DUONG_KE} />
      {h.isChild ? (
        <div style={{ display: "flex" }}>{h.childNote ?? "Phần chia đều"}</div>
      ) : (
        h.lines.map((l, i) => (
          <Mon key={i} qty={l.qty} ten={l.name} tien={formatVnd(l.amount)} phu={l.modifiers} ghiChu={l.note} nho={c.nho} />
        ))
      )}
      <div style={DUONG_KE} />
      <Hang trai="Tạm tính" phai={formatVnd(h.subtotal)} />
      {h.discountAmount > 0 && <Hang trai="Giảm giá" phai={`- ${formatVnd(h.discountAmount)}`} />}
      {h.serviceChargePct > 0 && <Hang trai={`Phí phục vụ ${h.serviceChargePct}%`} phai={formatVnd(h.serviceChargeAmount)} />}
      {h.vatPct > 0 && <Hang trai={`VAT ${h.vatPct}%`} phai={formatVnd(h.vatAmount)} />}
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: c.lon, fontWeight: 700, marginTop: 6 }}>
        <span>TỔNG</span>
        <span>{formatVnd(h.total)}</span>
      </div>
      {h.transferQr && <QrChuyenKhoan qr={h.transferQr} kho={kho} />}
      {h.payment && (
        <Cot>
          <div style={DUONG_KE} />
          <Hang trai={METHOD_LABEL[h.payment.method] ?? h.payment.method} phai={formatVnd(h.payment.amount)} />
          {tienThoi > 0 && <Hang trai="Tiền trả lại" phai={formatVnd(tienThoi)} />}
        </Cot>
      )}
      {h.footer && (
        <Cot>
          <div style={DUONG_KE} />
          <Giua>{h.footer}</Giua>
        </Cot>
      )}
    </Cot>
  );
}

/** QR chuyển khoản dưới dòng TỔNG — cùng ma trận với bản in trình duyệt (`ReceiptDoc`). */
function QrChuyenKhoan({ qr, kho }: { qr: TransferQr; kho: Kho }) {
  const { m, cham, px } = kichThuocQr(qr.payload, kho);
  const soO = m.n + 2 * LE_QR;
  // SVG với viewBox = số ô, vẽ ra `px` = số ô × `cham` chấm ⇒ biên mỗi ô rơi đúng biên chấm.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${soO} ${soO}" shape-rendering="crispEdges">` +
    `<rect width="${soO}" height="${soO}" fill="#fff"/><path d="${duongSvgQr(m)}" fill="#000"/></svg>`;
  return (
    <Cot>
      <div style={DUONG_KE} />
      <Giua>Quét để chuyển khoản</Giua>
      <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={px} height={px} />
      </div>
      <Giua>{`${qr.bankShortName} · ${qr.accountNo}`}</Giua>
      <Giua>{qr.accountName}</Giua>
      <Giua>{`Nội dung: ${qr.content}`}</Giua>
    </Cot>
  );
}

function PhieuKhach({ t, gio, kho }: { t: CustomerTicketView; gio: string; kho: Kho }) {
  const k = CO_PHIEU_KHACH[kho];
  return (
    <Cot>
      <Giua co={k.quan} dam>{t.tenantName}</Giua>
      <Giua dam>PHIẾU KHÁCH</Giua>
      {t.kitchenNo != null && (
        <Giua co={k.so} dam>{`ĐƠN #${t.kitchenNo}`}</Giua>
      )}
      <div style={DUONG_KE} />
      <Hang trai={t.place} phai={`#${t.ticketNo}`} dam />
      {t.contactName && <Hang trai={t.contactName} />}
      <Hang trai={gio} />
      <div style={DUONG_KE} />
      {t.items.map((l, i) => (
        <Mon key={i} qty={l.qty} ten={l.name} tien={formatVnd(l.unitPrice * l.qty)} phu={l.modifiers} ghiChu={l.note} nho={k.chu} coTen={k.ten} />
      ))}
      <div style={DUONG_KE} />
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: k.ten, fontWeight: 700 }}>
        <span>TỔNG</span>
        <span>{formatVnd(t.total)}</span>
      </div>
      <div style={DUONG_KE} />
      <Giua>{`Vui lòng giữ phiếu${t.kitchenNo != null ? ` — gọi theo số đơn #${t.kitchenNo}` : ""}`}</Giua>
    </Cot>
  );
}

/** PNG của phiếu (nền trắng tuyệt đối, chữ đen — máy nhiệt không in được xám). */
export function dungAnhPhieu(p: PhieuAnh, kho: Kho): ImageResponse {
  const rong = RONG[kho];
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#fff",
          color: "#000",
          fontFamily: "BVP",
          fontSize: p.loai === "receipt" ? COT[kho].chu : CO_PHIEU_KHACH[kho].chu,
          lineHeight: 1.35,
          padding: `8px ${LE_NGANG}px`,
        }}
      >
        {p.loai === "receipt" ? <HoaDon h={p.hoaDon} gio={p.gio} kho={kho} /> : <PhieuKhach t={p.phieu} gio={p.gio} kho={kho} />}
      </div>
    ),
    { width: rong, height: uocLuongChieuCao(p, kho), fonts: napFont(), headers: { "Cache-Control": "no-store" } }
  );
}
