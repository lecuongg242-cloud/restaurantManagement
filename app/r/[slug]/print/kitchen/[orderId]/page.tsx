import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { buildKitchenTicket } from "@/lib/print/kitchen-ticket";
import type { KitchenWidth } from "@/lib/print/adapter";
import { KitchenTicketDoc } from "@/components/print/KitchenTicketDoc";

export const dynamic = "force-dynamic";

/**
 * Route in phiếu bếp (03-05, PRINT-02). Không theme app — CSS @media print khổ 58/80mm,
 * JetBrains Mono, đen trắng. Guard membership POS/KDS. ?w=58|80 (mặc định 80).
 * KitchenTicketDoc (client) tự window.print + ghi print_jobs khi mở.
 */
export default async function KitchenPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; orderId: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const { slug, orderId } = await params;
  const { w } = await searchParams;
  const width: KitchenWidth = w === "58" ? "58" : w === "a5" ? "a5" : "80";

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/pos/login`);
  if (!canAccess(session.role, "pos") && !canAccess(session.role, "kds")) {
    redirect(`/r/${slug}`);
  }

  const ticket = await buildKitchenTicket(orderId, session.tenant.id);
  if (!ticket) {
    return (
      <div className="p-lg font-mono text-sm">Không tìm thấy đơn để in phiếu bếp.</div>
    );
  }

  const time = ticket.confirmedAt
    ? new Date(ticket.confirmedAt).toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : "";

  return <KitchenTicketDoc slug={slug} ticket={ticket} width={width} time={time} />;
}
