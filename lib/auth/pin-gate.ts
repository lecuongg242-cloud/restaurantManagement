import "server-only";
import { createClient } from "@/lib/supabase/server";
import { verifyPin, isValidPin } from "@/lib/auth/pin";
import type { Role } from "@/lib/auth/session";

/**
 * PIN gate theo vai trò (D7, D9) — xác thực Ở SERVER cho thao tác nhạy cảm (hủy món 03-04;
 * P4 tái dùng cho đóng bill/giảm giá). So bcrypt pin_hash của membership; kiểm role ∈ allowedRoles.
 * Thông điệp lỗi CHUNG cho mọi trường hợp sai (PIN sai / sai quyền / không tồn tại) — không lộ
 * điều kiện nào sai. Đọc membership dưới phiên RLS (chỉ trong tenant hiện hành).
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

  const supabase = await createClient();
  const { data: staff } = await supabase
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
