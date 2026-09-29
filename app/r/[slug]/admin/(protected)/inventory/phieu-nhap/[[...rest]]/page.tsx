import { redirect } from "next/navigation";

/** Đường cũ (tab "Phiếu nhập" trong Nguyên liệu) → mục "Nhập hàng" (G1, 30/09/2026). Giữ để link / tab mở sẵn không gãy. */
export default async function OldReceiptRoute({ params }: { params: Promise<{ slug: string; rest?: string[] }> }) {
  const { slug, rest } = await params;
  redirect(`/r/${slug}/admin/nhap-hang${rest?.length ? `/${rest.join("/")}` : ""}`);
}
