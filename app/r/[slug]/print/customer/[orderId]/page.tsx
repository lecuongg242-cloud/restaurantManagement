import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { buildCustomerTicket } from "@/lib/print/customer-ticket";
import type { KitchenWidth } from "@/lib/print/adapter";
import { CustomerTicketDoc } from "@/components/print/CustomerTicketDoc";

export const dynamic = "force-dynamic";

/**
 * Route in phiếu KHÁCH (phiếu khách giữ). Không theme app — CSS @media print khổ 58/80mm/A5,
 * JetBrains Mono, đen trắng. Guard membership POS/KDS. ?w=58|80|a5 (mặc định 80).
 * Số đơn (ĐƠN #N) khớp phiếu bếp để bếp mang món ra đúng khách.
 */
export default async function CustomerPrintPage({
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

  const ticket = await buildCustomerTicket(orderId, session.tenant.id);
  if (!ticket) {
    return <div className="p-lg font-mono text-sm">Không tìm thấy đơn để in phiếu khách.</div>;
  }

  const time = ticket.createdAt
    ? new Date(ticket.createdAt).toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : "";

  return <CustomerTicketDoc ticket={ticket} width={width} time={time} />;
}
