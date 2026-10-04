/**
 * Đường dẫn biểu tượng của quán (tab trình duyệt, biểu tượng cài lên màn hình chính) KÈM MÃ PHIÊN BẢN `?v=` suy từ logo +
 * tên. Chrome giữ biểu tượng tab theo ĐƯỜNG DẪN trong kho riêng (không hết hạn theo Cache-Control): đường dẫn cố định thì
 * quán đổi logo xong tab vẫn hiện biểu tượng cũ hàng giờ (gặp 04/10/2026 ở Nhà hàng Hùng Hiếu). Đổi logo / tên ⇒ đổi `v`
 * ⇒ trình duyệt tải biểu tượng mới ngay. Route `/r/[slug]/favicon.png` bỏ qua `v`.
 */
export function duongDanBieuTuong(slug: string, quan: { ten: string; logoUrl: string | null }, s?: number): string {
  const q = new URLSearchParams();
  if (s) q.set("s", String(s));
  q.set("v", bam(`${quan.logoUrl ?? ""}|${quan.ten}`));
  return `/r/${slug}/favicon.png?${q}`;
}

/** Băm ngắn (djb2, base36) — chỉ để phân biệt phiên bản, không phải bảo mật. */
function bam(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
