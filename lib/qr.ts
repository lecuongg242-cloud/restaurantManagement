import { headers } from "next/headers";
import QRCode from "qrcode";

/** Origin hiện tại từ request headers — không hardcode domain (quy định P1/P2). */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** QR bàn (TABLE-01): encode URL /r/[slug]/t/[qr_token], sinh cục bộ bằng thư viện. */
export function tableQrDataUrl(
  origin: string,
  slug: string,
  qrToken: string
): Promise<string> {
  return QRCode.toDataURL(`${origin}/r/${slug}/t/${qrToken}`, {
    width: 512,
    margin: 2,
  });
}
