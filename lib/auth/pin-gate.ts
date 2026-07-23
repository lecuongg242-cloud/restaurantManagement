import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPin, isValidPin } from "@/lib/auth/pin";
import type { Role } from "@/lib/auth/session";

/**
 * PIN gate theo vai trò (D7, D9) — xác thực Ở SERVER cho thao tác nhạy cảm (hủy món 03-04;
 * đóng bill/giảm giá). So bcrypt pin_hash của membership; kiểm role ∈ allowedRoles.
 * Thông điệp lỗi CHUNG cho mọi trường hợp sai (PIN sai / sai quyền / không tồn tại) — không lộ
 * điều kiện nào sai. Đọc pin_hash qua service-role (cột pin_hash đã bị thu hồi quyền đọc khỏi
 * authenticated từ QD-009); tự scope theo tenantId + membershipId nên không rò rỉ chéo tenant.
 */
const GENERIC_ERROR = "PIN hoặc quyền không hợp lệ.";

export type PinGateResult = { ok: true; staffId: string } | { ok: false; error: string };

export async function verifyPinForRoles({
  tenantId,
  membershipId,
  pin,
  allowedRoles,
}: {
  tenantId: string;
  membershipId: string;
  pin: string;
  allowedRoles: Role[];
}): Promise<PinGateResult> {
  if (!membershipId || !isValidPin(pin)) return { ok: false, error: GENERIC_ERROR };

  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("memberships")
    .select("id, role, pin_hash, active")
    .eq("id", membershipId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!staff || !staff.active || !staff.pin_hash) return { ok: false, error: GENERIC_ERROR };
  if (!allowedRoles.includes(staff.role as Role)) return { ok: false, error: GENERIC_ERROR };

  const ok = await verifyPin(pin, staff.pin_hash);
  if (!ok) return { ok: false, error: GENERIC_ERROR };

  return { ok: true, staffId: staff.id as string };
}
