import { redirect } from "next/navigation";

/**
 * Đường cũ (tab "Nhập hôm nay") → "+ Nhập hàng" (P25, INV-12: một chỗ nhập hàng). Tồn kho + chế biến ở tab "Tồn kho".
 * Giữ để link / tab mở sẵn không gãy.
 */
export default async function OldTodayRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/r/${slug}/admin/nhap-hang/moi`);
}
