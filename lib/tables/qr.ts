import QRCode from "qrcode";

/**
 * Tiện ích QR bàn. Mã hoá URL TUYỆT ĐỐI tới menu khách theo qr_token.
 * host + proto lấy từ header request lúc render (chạy đúng local/dev/prod) —
 * không phụ thuộc env domain. 00-TongQuan P2 (Mặc định kỹ thuật · QR).
 */

/** Dựng URL tuyệt đối: {proto}://{host}/r/{slug}/menu?t={token}. */
export function menuUrlForToken(
  host: string,
  slug: string,
  token: string,
  proto = "https"
): string {
  const scheme = host.startsWith("localhost") || host.startsWith("127.") ? "http" : proto;
  return `${scheme}://${host}/r/${slug}/menu?t=${token}`;
}

/** Chuỗi SVG QR (in nét, không rasterize). */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, width: 256 });
}

/** Data URL PNG QR (để tải file). */
export function qrPngDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 512 });
}
