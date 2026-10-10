"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { buildKitchenTicket, buildKitchenTickets } from "@/lib/print/kitchen-ticket";
import { DEFAULT_TARGET } from "@/lib/print/stations";
import { buildCustomerTicket } from "@/lib/print/customer-ticket";
import type { OrderPrintState } from "@/lib/print/adapter";
import { daInGanDay } from "@/lib/print/dedupe";
import { cauInConSongCua, thayTheLuotDangCho, trangThaiQuay } from "@/lib/print/cau-in-db";
import { buildReceiptView } from "@/lib/billing/receipt-view";
import { gioNgayNamVn, ngayGioNamVn } from "@/lib/time/vn";
import type { PhieuAnh } from "@/lib/print/anh-phieu";
import { toState, CHUA_IN, type JobRow } from "@/lib/print/trang-thai";
import { cauInConSong, loiDonDap, trangThaiMayIn, CUA_SO_LOI_MS, type NhipTim } from "@/lib/print/cau-in";
import { phieuCho, type DongPhieuCho, type PhieuCho } from "@/lib/print/phieu-cho";

type TicketType = "kitchen_ticket" | "customer_ticket";

/** Ghi 1 dòng print_jobs sau khi guard membership POS/KDS. */
async function insertPrintJob(
  slug: string,
  orderId: string,
  type: TicketType,
  status: "printed" | "pending",
  choKhiMatKetNoi = false
): Promise<{ ok: boolean; cho?: boolean }> {
  const session = await getSessionMembership(slug);
  if (!session) return { ok: false };
  if (!canAccess(session.role, "pos") && !canAccess(session.role, "kds")) return { ok: false };

  // Phiếu bếp gửi cầu in: tách theo bếp/bar (P37). In trình duyệt (`printed`) vẫn một tờ gộp trên máy in của thiết bị.
  const rows: { target_station: string | null; payload: unknown }[] | null =
    type === "kitchen_ticket"
      ? status === "pending"
        ? (await buildKitchenTickets(orderId, session.tenant.id))?.map((t) => ({ target_station: t.target, payload: t.view })) ?? null
        : await one(buildKitchenTicket(orderId, session.tenant.id), DEFAULT_TARGET)
      : await one(buildCustomerTicket(orderId, session.tenant.id), null);
  if (!rows) return { ok: false };

  const supabase = await createClient();

  // Lượt in y hệt vừa được ghi trong 3 giây ⇒ đây là remount/bấm đúp, không phải ý định in lại.
  // Trả ok để giao diện không báo lỗi — người dùng chỉ định in MỘT lần, và họ đã được in.
  if (await daInGanDay(supabase, session.tenant.id, type, "orderId", orderId)) {
    return { ok: true };
  }

  // PRINT-08: cầu in chết thì KHÔNG xếp vào hàng đợi — trả ok:false để đường lui sẵn có của POS
  // (BridgePrintAdapter) in bằng trình duyệt. Trước 09-03, xếp hàng vẫn "thành công" khi cầu in đã
  // chết, phiếu nằm `pending` mãi và bếp không nhận được gì (24/09/2026).
  //
  // P17 17-02: thiết bị KHÔNG có máy in (điện thoại 5G lúc wifi quán mất) thì in trình duyệt là vô ích — vẫn xếp
  // hàng: cầu in lên mạng dự phòng trong 30 phút sẽ in bù, và băng "phiếu đang chờ" cho cả quán thấy phiếu này.
  let cho = false;
  if (status === "pending" && !(await cauInConSongCua(supabase, session.tenant.id))) {
    if (!choKhiMatKetNoi) return { ok: false };
    cho = true;
  }

  // PRINT-06: đây là lượt in MỚI của phiếu bếp (không phải cú bấm đúp — đã lọc ở trên) → lượt cũ
  // còn chờ không được in nữa, kẻo cầu in sống lại thì bếp nhận thêm tờ cũ.
  if (type === "kitchen_ticket") {
    await thayTheLuotDangCho(supabase, session.tenant.id, orderId);
  }

  // Một lệnh insert ⇒ các phiếu của cùng lượt in có cùng created_at (toState gộp chúng thành một lượt).
  const printedAt = status === "printed" ? new Date().toISOString() : null;
  const { error } = await supabase.from("print_jobs").insert(
    rows.map((r) => ({
      tenant_id: session.tenant.id,
      type,
      // Phiếu bếp đi ra máy in của bếp/bar; phiếu khách in ở quầy nên không gắn trạm.
      target_station: r.target_station,
      payload: r.payload,
      status,
      printed_at: printedAt,
    }))
  );
  return error ? { ok: false } : { ok: true, cho };
}

async function one<T>(p: Promise<T | null>, target: string | null) {
  const v = await p;
  return v ? [{ target_station: target, payload: v as unknown }] : null;
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
  orderId: string,
  choKhiMatKetNoi = false
): Promise<{ ok: boolean; cho?: boolean }> {
  return insertPrintJob(slug, orderId, "kitchen_ticket", "pending", choKhiMatKetNoi);
}

/**
 * Kết quả xếp phiếu ra máy in QUẦY. `cau-in` = đã khai máy in quầy nhưng cầu in chết; `chua-khai` = cầu in
 * chưa khai máy in quầy → thiết bị in trình duyệt như trước P12.
 */
export type KetQuaXepQuay = { ok: true } | { ok: false; lyDo: "cau-in" | "chua-khai" | "loi" };

/**
 * Xếp HÓA ĐƠN / PHIẾU KHÁCH ra máy in quầy qua cầu in (PRINT-16) — cho thiết bị KHÔNG có máy in (điện
 * thoại, tablet). Lưu kèm bản chụp nội dung (`payload.anh`): cầu in lấy ảnh có dấu dựng từ đúng bản chụp
 * này (`/api/print/jobs/[id]/image`), không cần quyền đọc hóa đơn.
 *
 * Chỉ xếp khi cầu in SỐNG và ĐÃ KHAI máy in quầy — nếu không, phiếu nằm `pending` mà không ai in.
 */
async function xepPhieuQuay(
  slug: string,
  loai: "receipt" | "customer_ticket",
  id: string
): Promise<KetQuaXepQuay> {
  const session = await getSessionMembership(slug);
  if (!session || !canAccess(session.role, "pos")) return { ok: false, lyDo: "loi" };
  const supabase = await createClient();
  const quay = await trangThaiQuay(supabase, session.tenant.id);
  if (quay === "chua-khai") return { ok: false, lyDo: "chua-khai" };
  if (quay === "chet") return { ok: false, lyDo: "cau-in" };

  let payload: Record<string, unknown>;
  if (loai === "receipt") {
    const hoaDon = await buildReceiptView(id, session.tenant.id);
    if (!hoaDon) return { ok: false, lyDo: "loi" };
    // Bấm đúp / remount trong 3 giây: người dùng chỉ định in MỘT lần.
    if (await daInGanDay(supabase, session.tenant.id, "receipt", "billId", id)) return { ok: true };
    const anh: PhieuAnh = { loai: "receipt", hoaDon, gio: gioNgayNamVn(hoaDon.dateTime ?? new Date().toISOString()) };
    payload = { billId: id, billNo: hoaDon.billNo, total: hoaDon.total, anh };
  } else {
    const phieu = await buildCustomerTicket(id, session.tenant.id);
    if (!phieu) return { ok: false, lyDo: "loi" };
    if (await daInGanDay(supabase, session.tenant.id, "customer_ticket", "orderId", id)) return { ok: true };
    const anh: PhieuAnh = { loai: "customer_ticket", phieu, gio: ngayGioNamVn(phieu.createdAt) };
    payload = { ...phieu, anh };
  }

  const { error } = await supabase.from("print_jobs").insert({
    tenant_id: session.tenant.id,
    type: loai,
    target_station: "counter",
    payload,
    status: "pending",
  });
  return error ? { ok: false, lyDo: "loi" } : { ok: true };
}

export async function queueReceiptPrint(slug: string, billId: string): Promise<KetQuaXepQuay> {
  return xepPhieuQuay(slug, "receipt", billId);
}

export async function queueCustomerTicketPrint(slug: string, orderId: string): Promise<KetQuaXepQuay> {
  return xepPhieuQuay(slug, "customer_ticket", orderId);
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
  /** Trạng thái đầy đủ cho chip thiết bị in trên thanh công cụ POS (PRINT-09). */
  thietBi: ReturnType<typeof trangThaiMayIn>;
  printerHost: string | null;
  printerCheckedAt: string | null;
  /** Phiếu đang chờ cầu in (3 giờ qua) — chỉ đọc khi cầu in mất kết nối (P17 17-02). */
  phieuCho: PhieuCho[];
};

/** Cửa sổ liệt kê phiếu chờ: đủ để thấy cả phiếu "Không in bù" của ca đang bán, không kéo lịch sử cũ. */
const CUA_SO_PHIEU_CHO_MS = 3 * 3600_000;

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
    supabase
      .from("printer_heartbeats")
      .select("seen_at, printer_ok, printer_host, printer_checked_at")
      .eq("tenant_id", session.tenant.id)
      .maybeSingle(),
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
  const n = (nhip as (NhipTim & { printer_host: string | null }) | null) ?? null;
  const conSong = cauInConSong(seenAt, now);
  let cho: PhieuCho[] = [];
  if (!conSong && seenAt) {
    const { data } = await supabase
      .from("print_jobs")
      .select("id, type, created_at, payload")
      .eq("tenant_id", session.tenant.id)
      .eq("status", "pending")
      .gte("created_at", new Date(now - CUA_SO_PHIEU_CHO_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(50);
    cho = phieuCho((data ?? []) as DongPhieuCho[], now);
  }
  return {
    conSong,
    phieuCho: cho,
    seenAt,
    soLoi,
    canhBao,
    loiMoiNhat: moc[0] ?? null,
    thietBi: trangThaiMayIn(n, now),
    printerHost: n?.printer_host ?? null,
    printerCheckedAt: n?.printer_checked_at ?? null,
  };
}
