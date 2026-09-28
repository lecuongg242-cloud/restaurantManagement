import QRCode from "qrcode";

/**
 * Ma trận ô QR của một chuỗi — dùng chung cho hóa đơn in trình duyệt (SVG) và ảnh PNG cầu in, để hai
 * đường in ra CÙNG một mã. Tự vẽ từ ma trận thay vì để thư viện xuất ảnh: ta cần chốt mỗi ô là số nguyên
 * chấm trên giấy nhiệt (ô lẻ chấm bị máy in làm nhòe, app ngân hàng không đọc được).
 */
export type QrMaTran = { n: number; den: (x: number, y: number) => boolean };

/** Lề trắng bắt buộc quanh mã QR theo chuẩn: 4 ô mỗi phía. */
export const LE_QR = 4;

export function maTranQr(text: string): QrMaTran {
  const m = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
  return { n: m.size, den: (x, y) => Boolean(m.get(y, x)) };
}

/** Đường SVG (đơn vị = 1 ô, đã cộng lề) — vẽ trong viewBox `0 0 (n+8) (n+8)`. */
export function duongSvgQr(q: QrMaTran): string {
  let d = "";
  for (let y = 0; y < q.n; y++) {
    for (let x = 0; x < q.n; x++) {
      if (q.den(x, y)) d += `M${x + LE_QR} ${y + LE_QR}h1v1h-1z`;
    }
  }
  return d;
}
