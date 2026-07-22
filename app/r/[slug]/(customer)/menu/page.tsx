import { getCustomerMenu, resolveTable } from "@/lib/orders/customer-menu";
import { MenuBrowser } from "@/components/customer/MenuBrowser";

export const dynamic = "force-dynamic";

/**
 * A1 — Menu theo bàn (§4.1). Đọc qr_token từ ?t=; getCustomerMenu (public, service role)
 * + resolveTable. Token hợp lệ → gọi món được; thiếu/sai token → chế độ chỉ-xem + banner.
 * Khách ẩn danh (D15): không cookie phiên; mọi truy vấn scope theo slug ở server.
 */
export default async function CustomerMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;
  const qrToken = t ?? null;

  const [menu, resolved] = await Promise.all([
    getCustomerMenu(slug),
    qrToken ? resolveTable(slug, qrToken) : Promise.resolve(null),
  ]);

  if (!menu) {
    return (
      <main className="mx-auto max-w-md p-lg">
        <p className="mt-hero text-center text-steel">Không tìm thấy nhà hàng.</p>
      </main>
    );
  }

  const canOrder = !!resolved;

  if (menu.categories.length === 0) {
    return (
      <main className="mx-auto max-w-md p-lg">
        <h1 className="font-display text-2xl text-ink">{menu.tenant.name}</h1>
        <p className="mt-xl text-center text-steel">Nhà hàng đang cập nhật thực đơn.</p>
      </main>
    );
  }

  return (
    <>
      {!canOrder && (
        <div className="mx-auto max-w-md px-lg pt-sm">
          <p className="rounded-md border border-beige-deep bg-cream px-md py-sm text-center text-sm text-ink">
            Quét mã QR tại bàn để gọi món.
          </p>
        </div>
      )}
      <MenuBrowser
        slug={slug}
        menu={menu}
        qrToken={canOrder ? qrToken : null}
        canOrder={canOrder}
        tableName={resolved?.table.name ?? null}
      />
    </>
  );
}
