"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { buildKitchenTicket } from "@/lib/print/kitchen-ticket";
import { buildCustomerTicket } from "@/lib/print/customer-ticket";
import type { OrderPrintState, TicketPrintState } from "@/lib/print/adapter";
import { daInGanDay } from "@/lib/print/dedupe";

type TicketType = "kitchen_ticket" | "customer_ticket";

/** Ghi 1 dòng print_jobs sau khi guard membership POS/KDS. */
async function insertPrintJob(
  slug: string,
  orderId: string,
  type: TicketType,
  status: "printed" | "pending"
): Promise<{ ok: boolean }> {
  const session = await getSessionMembership(slug);
  if (!session) return { ok: false };
  if (!canAccess(session.role, "pos") && !canAccess(session.role, "kds")) return { ok: false };

  const ticket =
    type === "kitchen_ticket"
      ? await buildKitchenTicket(orderId, session.tenant.id)
      : await buildCustomerTicket(orderId, session.tenant.id);
  if (!ticket) return { ok: false };

  const supabase = await createClient();

  // Lượt in y hệt vừa được ghi trong 3 giây ⇒ đây là remount/bấm đúp, không phải ý định in lại.
  // Trả ok để giao diện không báo lỗi — người dùng chỉ định in MỘT lần, và họ đã được in.
  if (await daInGanDay(supabase, session.tenant.id, type, "orderId", orderId)) {
    return { ok: true };
  }

  const { error } = await supabase.from("print_jobs").insert({
    tenant_id: session.tenant.id,
    type,
    // Chỉ phiếu bếp mới đi ra máy in bếp; phiếu khách in ở quầy nên không gắn trạm.
    target_station: type === "kitchen_ticket" ? "kitchen" : null,
    payload: ticket,
    status,
    printed_at: status === "printed" ? new Date().toISOString() : null,
  });
  return { ok: !error };
}

/**
 * Ghi log 1 lần in phiếu bếp vào print_jobs (type=kitchen_ticket, status=printed).
 * Gọi từ route in khi trang mở (client → action). Guard membership POS/KDS.
 */
export async function logKitchenTicketPrint(
  slug: string,
  orderId: string
): Promise<{ ok: boolean }> {
  return insertPrintJob(slug, orderId, "kitchen_ticket", "printed");
}

/** Ghi log 1 lần in phiếu KHÁCH. Luôn in qua trình duyệt nên không có trạng thái chờ. */
export async function logCustomerTicketPrint(
  slug: string,
  orderId: string
): Promise<{ ok: boolean }> {
  return insertPrintJob(slug, orderId, "customer_ticket", "printed");
}

/**
 * Xếp hàng đợi cho cầu in ESC/POS (BridgePrintAdapter, V1.x): status=pending, cầu in cục bộ
 * (scripts/print-bridge.mjs) poll và in ra máy in bếp LAN rồi đổi thành printed/failed.
 */
export async function queueKitchenTicketPrint(
  slug: string,
  orderId: string
): Promise<{ ok: boolean }> {
  return insertPrintJob(slug, orderId, "kitchen_ticket", "pending");
}

const EMPTY: TicketPrintState = { status: "none", at: null, count: 0 };

type JobRow = { type: string; status: string; created_at: string; printed_at: string | null };

/** Gộp các dòng print_jobs của MỘT loại phiếu thành trạng thái hiển thị. */
function toState(rows: JobRow[]): TicketPrintState {
  if (rows.length === 0) return EMPTY;
  // Truy vấn đã sắp mới → cũ: dòng đầu là lần gần nhất (kể cả khi đang chờ/thất bại).
  const latest = rows[0];
  const printed = rows.filter((r) => r.status === "printed");
  return {
    status: latest.status as TicketPrintState["status"],
    // Mốc giờ lấy của lần IN THÀNH CÔNG gần nhất — lần đang chờ/hỏng chưa ra tờ phiếu nào.
    at: printed[0] ? printed[0].printed_at ?? printed[0].created_at : latest.created_at,
    count: printed.length,
  };
}

/**
 * Trạng thái in CẢ HAI loại phiếu của một đơn — POS hiện thường trực cạnh nút in: đã in chưa, in
 * mấy lần, lúc mấy giờ. Máy in bếp ở xa không nhìn thấy giấy ra, còn phiếu khách thì lúc đông dễ
 * đưa nhầm hoặc đưa hai lần, nên cả hai đều phải đếm được.
 */
export async function getOrderPrintStatus(
  slug: string,
  orderId: string
): Promise<OrderPrintState> {
  const none: OrderPrintState = { kitchen: EMPTY, customer: EMPTY };
  const session = await getSessionMembership(slug);
  if (!session) return none;
  if (!canAccess(session.role, "pos") && !canAccess(session.role, "kds")) return none;

  const supabase = await createClient();
  const { data } = await supabase
    .from("print_jobs")
    .select("type, status, created_at, printed_at")
    .eq("tenant_id", session.tenant.id)
    .in("type", ["kitchen_ticket", "customer_ticket"])
    .contains("payload", { orderId })
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as JobRow[];
  return {
    kitchen: toState(rows.filter((r) => r.type === "kitchen_ticket")),
    customer: toState(rows.filter((r) => r.type === "customer_ticket")),
  };
}
