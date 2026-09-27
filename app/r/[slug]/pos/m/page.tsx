import { redirect } from "next/navigation";

/**
 * `/pos/m` đã về hưu (ORDER-20, QD-020 D2): POS đầy đủ chạy được trên điện thoại (thanh tab Bàn · Thực đơn ·
 * Đơn), nên màn gọi món riêng cho điện thoại không còn cần. Giữ đường dẫn để lối tắt / dấu trang đã lưu
 * trên điện thoại phục vụ vẫn mở đúng chỗ.
 */
export default async function PosMobileRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/r/${slug}/pos`);
}
