import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { formatVnd } from "@/lib/orders/cart";
import type { ReceiptView } from "@/lib/billing/receipt-view";
import type { CustomerTicketView } from "@/lib/print/adapter";
import type { TransferQr } from "@/lib/billing/transfer-qr";
import { duongSvgQr, LE_QR, maTranQr } from "@/lib/payments/qr-matrix";
import { CHAM_MOI_PX, CO_HOA_DON, CO_PHIEU_KHACH } from "@/lib/print/co-giay";

/**
 * Dựng hóa đơn / phiếu khách thành ẢNH PNG đen trắng để cầu in gửi ra máy in nhiệt (PRINT-14, QD-020 D4).
 *
 * Máy in nhiệt phổ thông không có bảng mã tiếng Việt ⇒ in chữ thì mất dấu (như phiếu bếp). In ẢNH thì có
 * dấu trên mọi máy. Nội dung là BẢN CHỤP lưu trong `print_jobs.payload.anh` lúc bấm in — đúng hóa đơn tại
 * thời điểm đó, và cầu in không cần quyền đọc hóa đơn.
 *
 * Ảnh là BẢN SAO Y HỆT bản in trình duyệt (`ReceiptDoc`, `CustomerTicketDoc`): cùng font JetBrains Mono, cùng
 * bảng cỡ chữ (`lib/print/co-giay`), cùng bố cục, cùng chữ — mỗi px CSS thành `CHAM_MOI_PX` chấm. Chủ dự án
 * 30/09/2026: phiếu qua cầu in "không lịch sự bằng phiếu cũ… dùng y hệt đi". Sửa mẫu bên kia thì sửa cả ở đây.
 * Không in logo (chủ dự án 30/09/2026 — cả hai đường in).
 * Bố cục chỉ dùng flexbox (giới hạn của `next/og`).
 */
export type PhieuAnh =
  | { loai: "receipt"; hoaDon: ReceiptView; gio: string }
  | { loai: "customer_ticket"; phieu: CustomerTicketView; gio: string };

export type Kho = "80" | "58";

/** Số chấm ngang vùng in: 80 mm = 576, 58 mm = 384 (máy nhiệt 203 dpi). */
export const RONG: Record<Kho, number> = { "80": 576, "58": 384 };

/** px CSS → chấm. */
const d = (px: number) => Math.round(px * CHAM_MOI_PX);

/**
 * Lề trái/phải của ảnh (chấm). 80 mm: đo trên tờ phiếu khách in từ trình duyệt (qt-food, 30/09/2026) — vùng chữ
 * ~65 mm, dòng "Vui lòng giữ phiếu — gọi theo…" xuống hàng sau chữ "gọi" (≤ 28 ký tự 30 chấm = 504–521 chấm).
 * 58 mm: vùng in phần cứng đã hẹp (48 mm) nên lề nhỏ.
 */
const LE_NGANG: Record<Kho, number> = { "80": 28, "58": 12 };
/** Lề trên = lề `@page` 3 mm. Lề dưới cầu in tự cắt phần trắng. */
const LE_TREN = 24;

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
  const vua = Math.floor((RONG[kho] - 2 * LE_NGANG[kho]) / soO);
  const cham = Math.max(CHAM_MOI_O[kho].toiThieu, Math.min(CHAM_MOI_O[kho].muc, vua));
  return { m, cham, px: soO * cham };
}

const METHOD_LABEL: Record<string, string> = { cash: "Tiền mặt", transfer: "Chuyển khoản" };

let font: { name: string; data: Buffer; weight: 400 | 700 | 800 }[] | null = null;
function napFont() {
  if (font) return font;
  const thuMuc = path.join(process.cwd(), "assets", "fonts");
  font = [
    { name: "JBM", data: fs.readFileSync(path.join(thuMuc, "JetBrainsMono-Regular.ttf")), weight: 400 },
    { name: "JBM", data: fs.readFileSync(path.join(thuMuc, "JetBrainsMono-Bold.ttf")), weight: 700 },
    { name: "JBM", data: fs.readFileSync(path.join(thuMuc, "JetBrainsMono-ExtraBold.ttf")), weight: 800 },
  ];
  return font;
}

// ── Ước lượng chiều cao ─────────────────────────────────────────────────────────
// `next/og` bắt buộc biết trước chiều cao. JetBrains Mono là font đều khổ (mỗi ký tự 0,6 em) nên đếm được số
// dòng; ước DƯ (xuống hàng theo từ phí chỗ) — cầu in cắt phần trắng thừa ở đáy nên dư không tốn giấy.

/** Số dòng của `s` ở cỡ `co` chấm trong bề rộng `rong` chấm. */
function soDong(s: string | null | undefined, co: number, rong: number): number {
  if (!s) return 0;
  const kyTu = Math.max(4, Math.floor(rong / (co * 0.6)));
  return Math.max(1, Math.ceil(s.length / (kyTu * 0.8)));
}

export function uocLuongChieuCao(p: PhieuAnh, kho: Kho): number {
  const W = RONG[kho] - 2 * LE_NGANG[kho];
  let h = LE_TREN * 2;
  if (p.loai === "customer_ticket") {
    const s = CO_PHIEU_KHACH[kho];
    const [base, name, dong] = [d(s.base), d(s.name), (co: number) => co * s.lh];
    const ke = 2 + 2 * d(Math.round(s.base / 2));
    const t = p.phieu;
    h += soDong(t.tenantName, d(s.tenant), W) * dong(d(s.tenant)) + dong(base) + d(2);
    h += soDong(`ĐƠN #${t.kitchenNo ?? ""} ${t.place}`, d(s.no), W) * dong(d(s.no)) + d(4);
    h += ke + soDong(t.contactName, base, W) * dong(base) + dong(base) + ke;
    h += dong(base) + ke + d(4);
    for (const [i, l] of t.items.entries()) {
      if (i > 0) h += d(1) + d(Math.round(s.base / 2));
      const rongTen = W - Math.max(10, formatVnd(l.unitPrice * l.qty).length) * base * 0.6 - Math.max(3, `x${l.qty}`.length) * name * 0.6 - 2 * d(8);
      h += soDong(l.name, name, rongTen) * dong(name);
      for (const m of l.modifiers) h += soDong(`+ ${m}`, base, W - base) * dong(base);
      h += soDong(l.note ? `>> ${l.note}` : null, base, W) * dong(base) + d(Math.round(s.base / 2));
    }
    h += ke + dong(name) + ke + d(4) + soDong("Vui lòng giữ phiếu — gọi theo số đơn #0000", base, W) * dong(base);
  } else {
    const s = CO_HOA_DON[kho];
    const [base, name, dong] = [d(s.base), d(s.name), (co: number) => co * s.lh];
    const ke = 2 + 2 * d(Math.round(s.base / 2));
    const hd = p.hoaDon;
    const rongTen = W - 2 * name * 0.6 - d(6) * 2 - 12 * name * 0.6; // cột SL 2ch + cột tiền ~12 ký tự
    h += soDong(hd.tenantName, d(s.tenant), W) * dong(d(s.tenant)) + dong(base) + d(2);
    h += ke + soDong(`${hd.tableLabel} #${hd.billNo ?? ""}`, base, W) * dong(base) + dong(base);
    h += soDong(hd.contactLine, base, W) * dong(base) + ke + d(4);
    if (hd.isChild) h += soDong(hd.childNote ?? "Phần chia đều", base, W) * dong(base) + d(12);
    else
      for (const l of hd.lines) {
        h += soDong(l.name, name, rongTen) * dong(name) + d(Math.round(s.base / 2));
        h += soDong(l.modifiers.join(", "), base, W - 2 * name) * dong(base) + soDong(l.note, base, W - 2 * name) * dong(base);
      }
    h += ke + 4 * dong(base) + d(4) + dong(d(s.total));
    if (hd.transferQr) {
      const q = hd.transferQr;
      h += d(Math.round(s.base / 2)) + ke + kichThuocQr(q.payload, kho).px;
      const nho = d(s.base - 1);
      h += (1 + soDong(`${q.bankShortName} · ${q.accountNo}`, nho, W) + soDong(q.accountName, nho, W) + soDong(`Nội dung: ${q.content}`, nho, W)) * dong(nho);
    }
    if (hd.payment) h += ke + 2 * dong(base);
    if (hd.footer) h += ke + d(4) + soDong(hd.footer, base, W) * dong(base);
    h += d(4) + dong(base);
  }
  return Math.ceil(h * 1.1) + 20;
}

// ── Khối dựng (mỗi khối = một lớp CSS của bản trình duyệt) ────────────────────────────

/** `.ct-line` / `.rc-line`: gạch đứt, cách trên dưới base/2 px. */
function Ke({ base }: { base: number }) {
  const m = d(Math.round(base / 2));
  return <div style={{ display: "flex", width: "100%", borderTop: `${d(1)}px dashed #000`, margin: `${m}px 0` }} />;
}

/** Satori không xếp con của Fragment theo cột như trình duyệt — mọi nhóm phải là một div flex cột thật. */
function Cot({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: "flex", flexDirection: "column", width: "100%", ...style }}>{children}</div>;
}

/** `.ct-center` / `.rc-center`: một dòng chữ canh giữa (xuống hàng thì các dòng cũng canh giữa). */
function Giua({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  // Không để khóa style mang giá trị undefined — Satori ném lỗi thay vì bỏ qua.
  return <div style={{ display: "flex", justifyContent: "center", textAlign: "center", width: "100%", ...style }}>{children}</div>;
}

/** `.ct-row` / `.rc-row`: trái — phải, cách nhau 8px. */
function Hang({ trai, phai, style }: { trai: React.ReactNode; phai?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: d(8), ...style }}>
      <span>{trai}</span>
      {phai !== undefined && <span>{phai}</span>}
    </div>
  );
}

/** Y hệt `CustomerTicketDoc`. */
function PhieuKhach({ t, gio, kho }: { t: CustomerTicketView; gio: string; kho: Kho }) {
  const s = CO_PHIEU_KHACH[kho];
  return (
    <Cot>
      <Cot>
        <Giua style={{ fontWeight: 700, fontSize: d(s.tenant) }}>{t.tenantName}</Giua>
        <Giua style={{ fontWeight: 700, letterSpacing: d(1), marginTop: d(2) }}>PHIẾU KHÁCH</Giua>
        {/* `.ct-no` + hai `.ct-chunk` inline-block: Satori không có inline-block ⇒ flex xuống dòng, khe = một dấu cách (0,6 em). */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", width: "100%", columnGap: Math.round(d(s.no) * 0.6), fontWeight: 800, fontSize: d(s.no), marginTop: d(4) }}>
          {t.kitchenNo != null && <span>{`ĐƠN #${t.kitchenNo}`}</span>}
          <span>{t.place.toUpperCase()}</span>
        </div>
      </Cot>

      <Ke base={s.base} />
      {t.contactName && <Hang trai={t.contactName} />}
      <Hang trai={`Ngày: ${gio}`} />
      <Ke base={s.base} />

      {/* `.ct-head`: tiêu đề cột, cùng bề rộng cột với dòng món. */}
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: d(8) }}>
        <span style={{ flexGrow: 1 }}>Món</span>
        <span style={{ display: "flex", justifyContent: "flex-end", minWidth: Math.round(d(s.name) * 0.6 * 3) }}>SL</span>
        <span style={{ display: "flex", justifyContent: "flex-end", minWidth: Math.round(d(s.base) * 0.6 * 10) }}>Thành tiền</span>
      </div>
      <Ke base={s.base} />

      <Cot style={{ margin: `${d(2)}px 0` }}>
        {t.items.map((it, i) => (
          <Cot key={i} style={{ marginBottom: d(Math.round(s.base / 2)) }}>
            {/* `.ct-item + .ct-item`: kẻ chấm giữa hai món. Satori không vẽ viền dotted ⇒ dải gạch lặp. */}
            {i > 0 && (
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: d(1),
                  marginBottom: d(Math.round(s.base / 2)),
                  backgroundImage: `repeating-linear-gradient(to right, #000 0px, #000 ${d(1)}px, transparent ${d(1)}px, transparent ${d(3)}px)`,
                }}
              />
            )}
            {/* `align-items: baseline` của trình duyệt = ngang DÒNG ĐẦU tên món; Satori canh theo dòng cuối ⇒ canh trên
                rồi bù chênh đường chân chữ: (lh/2 + 0,36) em với JetBrains Mono (ascent 1,02 − nửa hộp chữ 0,66). */}
            {/* Tên món trước, cột SL "x2" (min 3ch, canh phải), tiền (min 10ch, canh phải) — như `.ct-item-*`. */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%", gap: d(8) }}>
              <span style={{ fontWeight: 700, fontSize: d(s.name), flexGrow: 1, flexShrink: 1, wordBreak: "break-word" }}>{it.name}</span>
              <span style={{ display: "flex", justifyContent: "flex-end", fontWeight: 700, fontSize: d(s.name), flexShrink: 0, whiteSpace: "nowrap", minWidth: Math.round(d(s.name) * 0.6 * 3) }}>
                {`x${it.qty}`}
              </span>
              <span style={{ display: "flex", justifyContent: "flex-end", fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap", minWidth: Math.round(d(s.base) * 0.6 * 10), marginTop: Math.round((d(s.name) - d(s.base)) * (s.lh / 2 + 0.36)) }}>
                {formatVnd(it.unitPrice * it.qty)}
              </span>
            </div>
            {it.modifiers.map((m, j) => (
              <div key={j} style={{ display: "flex", paddingLeft: d(s.base) }}>{`+ ${m}`}</div>
            ))}
            {it.note && <div style={{ display: "flex", fontWeight: 700, wordBreak: "break-word" }}>{`>> ${it.note}`}</div>}
          </Cot>
        ))}
      </Cot>

      <Ke base={s.base} />
      <Hang trai="TỔNG" phai={formatVnd(t.total)} style={{ fontWeight: 800, fontSize: d(s.name) }} />
      <Ke base={s.base} />
      <Giua style={{ marginTop: d(4) }}>{`Vui lòng giữ phiếu${t.kitchenNo != null ? ` — gọi theo số đơn #${t.kitchenNo}` : ""}`}</Giua>
    </Cot>
  );
}

/** Y hệt `ReceiptDoc`. */
function HoaDon({ h, gio, kho }: { h: ReceiptView; gio: string; kho: Kho }) {
  const s = CO_HOA_DON[kho];
  const tienThoi = h.payment && h.payment.method === "cash" ? Math.max(0, h.payment.amount - h.total) : 0;
  const cotSl = d(s.name * 0.6 * 2); // `.rc-qty { flex: 0 0 2ch }` — 1ch của JetBrains Mono = 0,6 em
  return (
    <Cot>
      <Cot>
        <Giua style={{ fontWeight: 700, fontSize: d(s.tenant) }}>{h.tenantName}</Giua>
        <Giua style={{ fontWeight: 700, letterSpacing: d(1), marginTop: d(2) }}>{h.payment ? "HÓA ĐƠN" : "PHIẾU TẠM TÍNH"}</Giua>
      </Cot>

      <Ke base={s.base} />
      <Hang trai={h.tableLabel} phai={h.billNo != null ? `#${h.billNo}` : ""} />
      <Hang trai={gio} />
      {h.contactLine && <Hang trai={h.contactLine} />}
      <Ke base={s.base} />

      {h.isChild ? (
        <Giua style={{ fontWeight: 700, margin: `${d(6)}px 0` }}>{h.childNote ?? "Phần chia đều"}</Giua>
      ) : (
        <Cot style={{ margin: `${d(2)}px 0` }}>
          {h.lines.map((it, i) => (
            <Cot key={i} style={{ marginBottom: d(Math.round(s.base / 2)) }}>
              <div style={{ display: "flex", gap: d(6), fontWeight: 700, fontSize: d(s.name), width: "100%" }}>
                <span style={{ display: "flex", justifyContent: "flex-end", width: cotSl, flexShrink: 0 }}>{String(it.qty)}</span>
                <span style={{ flexGrow: 1, flexShrink: 1, wordBreak: "break-word" }}>{it.name}</span>
                <span style={{ flexShrink: 0, whiteSpace: "nowrap", marginLeft: "auto" }}>{formatVnd(it.amount)}</span>
              </div>
              {it.modifiers.length > 0 && <div style={{ display: "flex", color: "#222", paddingLeft: cotSl + d(6) }}>{it.modifiers.join(", ")}</div>}
              {it.note && <div style={{ display: "flex", color: "#222", paddingLeft: cotSl + d(6), fontWeight: 700 }}>{it.note}</div>}
            </Cot>
          ))}
        </Cot>
      )}

      <Ke base={s.base} />
      {!h.isChild && (
        <Cot>
          <Hang trai="Tạm tính" phai={formatVnd(h.subtotal)} />
          {h.discountAmount > 0 && <Hang trai="Giảm giá" phai={`- ${formatVnd(h.discountAmount)}`} />}
          {h.serviceChargePct > 0 && <Hang trai={`Phí phục vụ ${h.serviceChargePct}%`} phai={formatVnd(h.serviceChargeAmount)} />}
          {h.vatPct > 0 && <Hang trai={`VAT ${h.vatPct}%`} phai={formatVnd(h.vatAmount)} />}
        </Cot>
      )}
      <Hang trai="TỔNG" phai={formatVnd(h.total)} style={{ fontWeight: 800, fontSize: d(s.total), marginTop: d(4), gap: 0 }} />

      {h.transferQr && <QrChuyenKhoan qr={h.transferQr} kho={kho} base={s.base} />}

      {h.payment && (
        <Cot>
          <Ke base={s.base} />
          <Hang trai={METHOD_LABEL[h.payment.method] ?? h.payment.method} phai={formatVnd(h.payment.amount)} />
          {tienThoi > 0 && <Hang trai="Tiền trả lại" phai={formatVnd(tienThoi)} />}
        </Cot>
      )}

      {h.footer && (
        <Cot>
          <Ke base={s.base} />
          <Giua style={{ marginTop: d(4) }}>{h.footer}</Giua>
        </Cot>
      )}
      <Giua style={{ marginTop: d(4) }}>Cảm ơn quý khách!</Giua>
    </Cot>
  );
}

/** QR chuyển khoản dưới dòng TỔNG — cùng ma trận và chữ với bản in trình duyệt; cỡ ô theo `kichThuocQr` (PAY-03). */
function QrChuyenKhoan({ qr, kho, base }: { qr: TransferQr; kho: Kho; base: number }) {
  const { m, px } = kichThuocQr(qr.payload, kho);
  const soO = m.n + 2 * LE_QR;
  // SVG với viewBox = số ô, vẽ ra `px` = số ô × `cham` chấm ⇒ biên mỗi ô rơi đúng biên chấm.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${soO} ${soO}" shape-rendering="crispEdges">` +
    `<rect width="${soO}" height="${soO}" fill="#fff"/><path d="${duongSvgQr(m)}" fill="#000"/></svg>`;
  const nho = { fontSize: d(base - 1), wordBreak: "break-word" } as const;
  return (
    <Cot style={{ marginTop: d(Math.round(base / 2)) }}>
      <Ke base={base} />
      <Giua style={nho}>Quét để chuyển khoản</Giua>
      <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={px} height={px} />
      </div>
      <Giua style={nho}>{`${qr.bankShortName} · ${qr.accountNo}`}</Giua>
      <Giua style={nho}>{qr.accountName}</Giua>
      <Giua style={nho}>{`Nội dung: ${qr.content}`}</Giua>
    </Cot>
  );
}

/** PNG của phiếu (nền trắng tuyệt đối, chữ đen — máy nhiệt không in được xám). */
export function dungAnhPhieu(p: PhieuAnh, kho: Kho): ImageResponse {
  const rong = RONG[kho];
  const laHoaDon = p.loai === "receipt";
  const s = laHoaDon ? CO_HOA_DON[kho] : CO_PHIEU_KHACH[kho];
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
          fontFamily: "JBM",
          fontSize: d(s.base),
          lineHeight: s.lh,
          padding: `${LE_TREN}px ${LE_NGANG[kho]}px`,
        }}
      >
        {laHoaDon ? <HoaDon h={p.hoaDon} gio={p.gio} kho={kho} /> : <PhieuKhach t={p.phieu} gio={p.gio} kho={kho} />}
      </div>
    ),
    { width: rong, height: uocLuongChieuCao(p, kho), fonts: napFont(), headers: { "Cache-Control": "no-store" } }
  );
}
