import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { buildReceiptView } from "@/lib/billing/receipt-view";
import type { KitchenWidth } from "@/lib/print/adapter";
import { ReceiptDoc } from "@/components/print/ReceiptDoc";

export const dynamic = "force-dynamic";

/**
 * Route in hóa đơn khách (04-04, PRINT-03). Không theme app — CSS @media print khổ 58/80mm,
 * JetBrains Mono, đen trắng. Guard membership POS. ?w=58|80 (mặc định 80). ReceiptDoc (client) tự
 * window.print + ghi print_jobs khi mở.
 */
export default async function ReceiptPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; billId: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const { slug, billId } = await params;
  const { w } = await searchParams;
  const width: KitchenWidth = w === "58" ? "58" : "80";

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/pos/login`);
  if (!canAccess(session.role, "pos")) redirect(`/r/${slug}`);

  const receipt = await buildReceiptView(billId, session.tenant.id);
  if (!receipt) {
    return <div className="p-lg font-mono text-sm">Không tìm thấy hóa đơn để in.</div>;
  }

  const time = receipt.dateTime
    ? new Date(receipt.dateTime).toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : new Date().toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

  return <ReceiptDoc slug={slug} billId={billId} receipt={receipt} width={width} time={time} />;
}
