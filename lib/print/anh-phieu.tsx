import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { formatVnd } from "@/lib/orders/cart";
import type { ReceiptView } from "@/lib/billing/receipt-view";
import type { CustomerTicketView } from "@/lib/print/adapter";

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

const COT = { "80": { chu: 24, lon: 34, nho: 20 }, "58": { chu: 18, lon: 26, nho: 16 } } as const;
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
  } else {
    const t = p.phieu;
    n += 2 + soDongChu(t.contactName);
    for (const l of t.items) n += soDongChu(`${l.qty} ${l.name}`) + soDongChu(l.modifiers.join(", ")) + soDongChu(l.note);
    n += 5;
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

function Mon({ qty, ten, tien, phu, ghiChu, nho }: { qty: number; ten: string; tien: string; phu: string[]; ghiChu: string | null; nho: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", marginBottom: 6 }}>
      <div style={{ display: "flex", width: "100%" }}>
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

function PhieuKhach({ t, gio, kho }: { t: CustomerTicketView; gio: string; kho: Kho }) {
  const c = COT[kho];
  return (
    <Cot>
      <Giua co={c.lon} dam>{t.tenantName}</Giua>
      <Giua dam>PHIẾU KHÁCH</Giua>
      {t.kitchenNo != null && (
        <Giua co={Math.round(c.lon * 1.4)} dam>{`ĐƠN #${t.kitchenNo}`}</Giua>
      )}
      <div style={DUONG_KE} />
      <Hang trai={t.place} phai={`#${t.ticketNo}`} dam />
      {t.contactName && <Hang trai={t.contactName} />}
      <Hang trai={gio} />
      <div style={DUONG_KE} />
      {t.items.map((l, i) => (
        <Mon key={i} qty={l.qty} ten={l.name} tien={formatVnd(l.unitPrice * l.qty)} phu={l.modifiers} ghiChu={l.note} nho={c.nho} />
      ))}
      <div style={DUONG_KE} />
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: c.lon, fontWeight: 700 }}>
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
          fontSize: COT[kho].chu,
          lineHeight: 1.35,
          padding: "8px 12px",
        }}
      >
        {p.loai === "receipt" ? <HoaDon h={p.hoaDon} gio={p.gio} kho={kho} /> : <PhieuKhach t={p.phieu} gio={p.gio} kho={kho} />}
      </div>
    ),
    { width: rong, height: uocLuongChieuCao(p, kho), fonts: napFont(), headers: { "Cache-Control": "no-store" } }
  );
}
