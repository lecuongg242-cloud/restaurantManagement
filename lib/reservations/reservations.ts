/**
 * Lõi đặt bàn (RESV-01/02). Hai đường:
 *  - createReservation: KHÁCH ẩn danh (D15) → SERVICE ROLE, scope theo slug, validate ở server.
 *  - listReservationsByDay / decideReservation: phiên ADMIN (RLS cách ly tenant).
 * Mốc ngày theo VIỆT NAM (UTC+7) — khớp cách gom của báo cáo (reports.ts).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Reservation, ReservationCounts, ReservationView } from "./types";

const VN_OFFSET = 7 * 3600 * 1000;
const DAY = 86400000;

export type CreateReservationInput = {
  slug: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  reservedAt: string; // ISO (từ input datetime-local, giờ địa phương khách → server nhận ISO)
  note?: string;
  areaId?: string | null;
};

export type CreateReservationResult = { reservationId: string } | { error: string };

/** [startUtc, endUtc) của một NGÀY VN 'YYYY-MM-DD'. */
export function vnDayRangeUtc(dayVN: string): { fromUtc: string; toUtc: string } {
  const startVn = Date.parse(`${dayVN}T00:00:00Z`); // coi day là mốc VN 00:00
  const fromUtc = new Date(startVn - VN_OFFSET).toISOString();
  const toUtc = new Date(startVn - VN_OFFSET + DAY).toISOString();
  return { fromUtc, toUtc };
}

/** Ngày VN hôm nay dạng 'YYYY-MM-DD' (dùng làm mặc định trang admin). Server component OK. */
export function todayVN(): string {
  return new Date(Date.now() + VN_OFFSET).toISOString().slice(0, 10);
}

type NormalizedReservation = {
  name: string;
  phone: string;
  partySize: number;
  reservedAtIso: string;
  note: string | null;
};

/** Validate + chuẩn hóa field chung (tên/SĐT/số người/thời điểm tương lai). Dùng cho cả 2 đường. */
function normalizeReservation(input: {
  customerName?: string;
  customerPhone?: string;
  partySize: number;
  reservedAt: string;
  note?: string;
}): { value: NormalizedReservation } | { error: string } {
  const name = input.customerName?.trim();
  if (!name) return { error: "Vui lòng nhập tên người đặt." };
  const phone = input.customerPhone?.trim();
  if (!phone) return { error: "Vui lòng nhập số điện thoại để liên hệ." };

  const partySize = Number(input.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50)
    return { error: "Số người không hợp lệ (1–50)." };

  const reservedMs = Date.parse(input.reservedAt);
  if (!Number.isFinite(reservedMs)) return { error: "Ngày giờ đặt bàn không hợp lệ." };
  if (reservedMs <= Date.now()) return { error: "Vui lòng chọn thời điểm trong tương lai." };

  return {
    value: {
      name: name.slice(0, 80),
      phone: phone.slice(0, 20),
      partySize,
      reservedAtIso: new Date(reservedMs).toISOString(),
      note: input.note?.trim() ? input.note.trim().slice(0, 500) : null,
    },
  };
}

/**
 * Khách gửi đặt bàn → status 'pending'. Service role, scope theo slug (không tin client).
 * Nếu chọn khu vực thì khu vực phải thuộc tenant (chống chéo tenant).
 */
export async function createReservation(
  input: CreateReservationInput
): Promise<CreateReservationResult> {
  const norm = normalizeReservation(input);
  if ("error" in norm) return { error: norm.error };
  const v = norm.value;

  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", input.slug)
    .maybeSingle();
  if (!tenant) return { error: "Không tìm thấy nhà hàng." };
  const tenantId = tenant.id as string;

  let areaId: string | null = null;
  if (input.areaId) {
    const { data: area } = await admin
      .from("areas")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", input.areaId)
      .maybeSingle();
    if (!area) return { error: "Khu vực không hợp lệ." };
    areaId = area.id as string;
  }

  const { data: created, error } = await admin
    .from("reservations")
    .insert({
      tenant_id: tenantId,
      customer_name: v.name,
      customer_phone: v.phone,
      party_size: v.partySize,
      reserved_at: v.reservedAtIso,
      note: v.note,
      area_id: areaId,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[createReservation] insert failed:", error?.message ?? error);
    return { error: "Không gửi được yêu cầu đặt bàn. Vui lòng thử lại." };
  }

  return { reservationId: created.id as string };
}

export type CreateStaffReservationInput = {
  customerName?: string;
  customerPhone?: string;
  partySize: number;
  reservedAt: string;
  note?: string;
  areaId?: string | null;
  tableId?: string | null;
};

/**
 * NHÂN VIÊN (POS) đặt bàn hộ khách qua điện thoại → tạo thẳng 'confirmed' (staff nhận điện = đã xác
 * nhận, giống POS thêm món bỏ qua duyệt). Chạy phiên nhân viên RLS (createClient) — cách ly tenant.
 * decidedBy = membership thao tác (ghi ai xác nhận).
 */
export async function createStaffReservation(
  tenantId: string,
  input: CreateStaffReservationInput,
  decidedBy: string
): Promise<CreateReservationResult> {
  const norm = normalizeReservation(input);
  if ("error" in norm) return { error: norm.error };
  const v = norm.value;

  const supabase = await createClient();

  let areaId: string | null = null;
  if (input.areaId) {
    const { data: area } = await supabase
      .from("areas")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", input.areaId)
      .maybeSingle();
    if (!area) return { error: "Khu vực không hợp lệ." };
    areaId = area.id as string;
  }

  // Gán bàn (tùy chọn) — chỉ là thông tin, KHÔNG giữ/đổi trạng thái bàn. Bàn phải thuộc tenant.
  let tableId: string | null = null;
  if (input.tableId) {
    const { data: table } = await supabase
      .from("tables")
      .select("id, area_id")
      .eq("tenant_id", tenantId)
      .eq("id", input.tableId)
      .maybeSingle();
    if (!table) return { error: "Bàn không hợp lệ." };
    tableId = table.id as string;
    if (!areaId && table.area_id) areaId = table.area_id as string; // suy khu vực từ bàn
  }

  const now = new Date().toISOString();
  const { data: created, error } = await supabase
    .from("reservations")
    .insert({
      tenant_id: tenantId,
      customer_name: v.name,
      customer_phone: v.phone,
      party_size: v.partySize,
      reserved_at: v.reservedAtIso,
      note: v.note,
      area_id: areaId,
      table_id: tableId,
      status: "confirmed",
      decided_by: decidedBy,
      decided_at: now,
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[createStaffReservation] insert failed:", error?.message ?? error);
    return { error: "Không tạo được đặt bàn. Vui lòng thử lại." };
  }

  return { reservationId: created.id as string };
}

/**
 * Danh sách đặt bàn của một NGÀY VN (mặc định hôm nay ở caller), sắp theo giờ tăng dần,
 * kèm tên khu vực + đếm theo trạng thái. Phiên admin RLS (chỉ tenant mình).
 */
export async function listReservationsByDay(
  tenantId: string,
  dayVN: string
): Promise<{ items: ReservationView[]; counts: ReservationCounts }> {
  const { fromUtc, toUtc } = vnDayRangeUtc(dayVN);
  const supabase = await createClient();

  const { data } = await supabase
    .from("reservations")
    .select("*, areas(name), tables(name)")
    .eq("tenant_id", tenantId)
    .gte("reserved_at", fromUtc)
    .lt("reserved_at", toUtc)
    .order("reserved_at", { ascending: true });

  const counts: ReservationCounts = { pending: 0, confirmed: 0, rejected: 0, cancelled: 0 };
  const items: ReservationView[] = (data ?? []).map((r) => {
    const area = r.areas as { name?: string } | null;
    const table = r.tables as { name?: string } | null;
    counts[r.status as keyof ReservationCounts] += 1;
    return {
      ...(r as Reservation),
      area_name: area?.name ?? null,
      table_name: table?.name ?? null,
    };
  });

  return { items, counts };
}

/** Gán / đổi / bỏ bàn của một đặt bàn (thông tin, không giữ bàn). Phiên admin/POS RLS. */
export async function assignReservationTable(
  tenantId: string,
  reservationId: string,
  tableId: string | null
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();

  if (tableId) {
    const { data: table } = await supabase
      .from("tables")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", tableId)
      .maybeSingle();
    if (!table) return { error: "Bàn không hợp lệ." };
  }

  const { data, error } = await supabase
    .from("reservations")
    .update({ table_id: tableId, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", reservationId)
    .select("id")
    .maybeSingle();
  if (error) return { error: "Không gán được bàn. Vui lòng thử lại." };
  if (!data) return { error: "Đặt bàn không tồn tại." };
  return { ok: true };
}

export type DecideReservationInput = {
  tenantId: string;
  reservationId: string;
  decision: "confirmed" | "rejected";
  decidedBy: string;
  rejectReason?: string;
};

/** Xác nhận / từ chối một đơn đang 'pending'. Từ chối bắt buộc lý do. Phiên admin RLS. */
export async function decideReservation(
  input: DecideReservationInput
): Promise<{ ok: true } | { error: string }> {
  if (input.decision === "rejected" && !input.rejectReason?.trim())
    return { error: "Vui lòng nhập lý do từ chối." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .update({
      status: input.decision,
      decided_by: input.decidedBy,
      decided_at: new Date().toISOString(),
      reject_reason: input.decision === "rejected" ? input.rejectReason!.trim().slice(0, 300) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", input.tenantId)
    .eq("id", input.reservationId)
    .eq("status", "pending") // chỉ đổi được từ pending (chống double-decide)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Không cập nhật được. Vui lòng thử lại." };
  if (!data) return { error: "Đơn đã được xử lý hoặc không tồn tại." };
  return { ok: true };
}
