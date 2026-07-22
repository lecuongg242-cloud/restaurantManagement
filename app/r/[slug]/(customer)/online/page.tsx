import { getCustomerMenu } from "@/lib/orders/customer-menu";
import { MenuBrowser } from "@/components/customer/MenuBrowser";

export const dynamic = "force-dynamic";

/**
 * Đặt món online (ONLINE-01) — mang về / giao. Khách ẩn danh (D15), KHÔNG cần QR bàn.
 * Tái dùng MenuBrowser (chế độ online): chọn kênh + địa chỉ (khi giao) ở giỏ, gửi qua
 * /api/online-order → theo dõi /order/[id]. Menu đọc public theo slug (service role).
 */
export default async function OnlineOrderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const menu = await getCustomerMenu(slug);

  if (!menu) {
    return (
      <main className="mx-auto max-w-md p-lg">
        <p className="mt-hero text-center text-steel">Không tìm thấy nhà hàng.</p>
      </main>
    );
  }

  if (menu.categories.length === 0) {
    return (
      <main className="mx-auto max-w-md p-lg">
        <h1 className="font-display text-2xl text-ink">{menu.tenant.name}</h1>
        <p className="mt-xl text-center text-steel">Nhà hàng đang cập nhật thực đơn.</p>
      </main>
    );
  }

  return <MenuBrowser slug={slug} menu={menu} qrToken={null} canOrder={false} tableName={null} online />;
}
