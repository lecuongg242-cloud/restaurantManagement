"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { buildKitchenTicket } from "@/lib/print/kitchen-ticket";
import { buildCustomerTicket } from "@/lib/print/customer-ticket";
import type { OrderPrintState } from "@/lib/print/adapter";
import { daInGanDay } from "@/lib/print/dedupe";
import { cauInConSongCua, thayTheLuotDangCho } from "@/lib/print/cau-in-db";
import { toState, CHUA_IN, type JobRow } from "@/lib/print/trang-thai";
import { cauInConSong, loiDonDap, CUA_SO_LOI_MS } from "@/lib/print/cau-in";

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

  // PRINT-08: cầu in chết thì KHÔNG xếp vào hàng đợi — trả ok:false để đường lui sẵn có của POS
  // (BridgePrintAdapter) in bằng trình duyệt. Trước 09-03, xếp hàng vẫn "thành công" khi cầu in đã
  // chết, phiếu nằm `pending` mãi và bếp không nhận được gì (24/09/2026).
  if (status === "pending" && !(await cauInConSongCua(supabase, session.tenant.id))) {
    return { ok: false };
  }

  // PRINT-06: đây là lượt in MỚI của phiếu bếp (không phải cú bấm đúp — đã lọc ở trên) → lượt cũ
  // còn chờ không được in nữa, kẻo cầu in sống lại thì bếp nhận thêm tờ cũ.
  if (type === "kitchen_ticket") {
    await thayTheLuotDangCho(supabase, session.tenant.id, orderId);
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


/**
 * Trạng thái in CẢ HAI loại phiếu của một đơn — POS hiện thường trực cạnh nút in: đã in chưa, in
 * mấy lần, lúc mấy giờ. Máy in bếp ở xa không nhìn thấy giấy ra, còn phiếu khách thì lúc đông dễ
 * đưa nhầm hoặc đưa hai lần, nên cả hai đều phải đếm được.
 */
export async function getOrderPrintStatus(
  slug: string,
  orderId: string
): Promise<OrderPrintState> {
  const none: OrderPrintState = { kitchen: CHUA_IN, customer: CHUA_IN };
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
    kitchen: toState(rows.filter((r) => r.type === "kitchen_ticket"), Date.now()),
    customer: toState(rows.filter((r) => r.type === "customer_ticket"), Date.now()),
  };
}

export type CauInStatus = {
  /** Cầu in còn báo sống trong 90 giây qua (PRINT-08). */
  conSong: boolean;
  /** Lần báo sống gần nhất; null = quán chưa từng có cầu in nào kết nối. */
  seenAt: string | null;
  /** Số phiếu bếp hỏng trong 5 phút, SAU mốc "đã xử lý" (PRINT-07). */
  soLoi: number;
  canhBao: boolean;
  /** Mốc của lỗi mới nhất — POS lưu làm mốc "đã xử lý" khi nhân viên bấm tắt. */
  loiMoiNhat: string | null;
};

/**
 * Sức khỏe cầu in cho băng cảnh báo trên POS (PRINT-07/08).
 *
 * Mọi phép so giờ làm Ở ĐÂY bằng đồng hồ máy chủ: máy POS ở quán lệch đồng hồ được y như laptop
 * cầu in. Mốc "đã xử lý" cũng không phải giờ máy POS mà là `created_at` (do database ghi) của lỗi
 * mới nhất nhân viên đã thấy — nên không có đồng hồ nào ở quán tham gia vào phép so.
 */
export async function getCauInStatus(
  slug: string,
  daXuLyLuc: string | null
): Promise<CauInStatus | null> {
  const session = await getSessionMembership(slug);
  if (!session) return null;
  if (!canAccess(session.role, "pos") && !canAccess(session.role, "kds")) return null;

  const supabase = await createClient();
  const now = Date.now();
  const [{ data: nhip }, { data: loi }] = await Promise.all([
    supabase.from("printer_heartbeats").select("seen_at").eq("tenant_id", session.tenant.id).maybeSingle(),
    supabase
      .from("print_jobs")
      .select("created_at")
      .eq("tenant_id", session.tenant.id)
      .eq("type", "kitchen_ticket")
      .eq("status", "failed")
      .gte("created_at", new Date(now - CUA_SO_LOI_MS).toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const seenAt = (nhip?.seen_at as string | undefined) ?? null;
  const moc = (loi ?? []).map((r) => r.created_at as string);
  const { canhBao, soLoi } = loiDonDap(moc, now, daXuLyLuc);
  return { conSong: cauInConSong(seenAt, now), seenAt, soLoi, canhBao, loiMoiNhat: moc[0] ?? null };
}
