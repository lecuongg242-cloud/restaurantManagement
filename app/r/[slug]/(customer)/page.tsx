import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTable } from "@/lib/orders/customer-menu";
import { CustomerLanding } from "@/components/customer/CustomerLanding";
import { urlAnh } from "@/lib/storage/public-url";

export const dynamic = "force-dynamic";

/**
 * A0 — Trang chào khi khách quét QR bàn (đích của mã QR: /r/{slug}?t={token}). Nhận diện nhà
 * hàng + bàn, gọi nhân viên / gọi thanh toán, rồi mới vào thực đơn.
 *
 * Khách ẩn danh (D15) → RLS chặn đọc bảng tenants qua phiên user, nên đọc CHỈ trường nhận diện
 * công khai (name, logo_url) bằng admin client, scope theo slug. Theme sản phẩm cố định
 * (QD-006 F2 — không override màu theo tenant). Token sai/thiếu → chế độ chỉ-xem.
 */
export default async function CustomerHome({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;
  const qrToken = t ?? null;

  const admin = createAdminClient();
  const [{ data: tenant }, resolved] = await Promise.all([
    admin.from("tenants").select("name, logo_url, cover_url").eq("slug", slug).maybeSingle(),
    qrToken ? resolveTable(slug, qrToken) : Promise.resolve(null),
  ]);

  return (
    <CustomerLanding
      slug={slug}
      tenantName={tenant?.name ?? slug}
      logoUrl={urlAnh(tenant?.logo_url)}
      coverUrl={urlAnh(tenant?.cover_url)}
      tableName={resolved?.table.name ?? null}
      qrToken={resolved ? qrToken : null}
    />
  );
}
