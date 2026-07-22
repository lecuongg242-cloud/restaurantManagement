import { OrderStatusStepper } from "@/components/customer/OrderStatusStepper";

export const dynamic = "force-dynamic";

/**
 * A5 — Theo dõi món (§4.1). Server chỉ render khung + id; trạng thái + realtime do
 * OrderStatusStepper (client) lo (GET ban đầu → Broadcast → fallback polling). qrToken
 * (nếu có) để nút "Gọi thêm món" quay lại menu cùng bàn.
 */
export default async function OrderTrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug, id } = await params;
  const { t } = await searchParams;

  return <OrderStatusStepper slug={slug} orderId={id} qrToken={t ?? null} />;
}
