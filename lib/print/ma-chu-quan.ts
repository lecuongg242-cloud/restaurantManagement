import type { SessionMembership } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createActivationCode } from "@/lib/print/activation";
import { checkRateLimit, RULES } from "@/lib/security/rate-limit";

/** Lỗi là MÃ cố định (không phải câu chữ) — route đưa nó lên URL trang, trang tự tra câu hiển thị. */
export type LoiMaChuQuan = "khong-phai-chu" | "tam-ngung" | "gioi-han" | "khac";
export type MaChuQuan = { code: string; expiresAt: string } | { error: LoiMaChuQuan };

export const CAU_LOI: Record<LoiMaChuQuan | "chua-co-bo-cai", string> = {
  "khong-phai-chu": "Chỉ chủ quán tạo được mã kích hoạt.",
  "tam-ngung": "Nhà hàng đang tạm ngưng — không tải được bộ cài có mã.",
  "gioi-han": "Tải bộ cài quá nhiều lần — thử lại sau 10 phút.",
  khac: "Không tạo được mã kích hoạt — thử lại.",
  "chua-co-bo-cai": "Chưa có bộ cài để tải — liên hệ quản trị hệ thống.",
};

/**
 * Mã kích hoạt cầu in do CHÍNH chủ quán tạo (PRINT-17) — gắn vào tên file bộ cài lúc tải, nên cài không phải
 * gõ mã. CHỈ owner: cài bằng mã mới xoay mật khẩu tài khoản cầu in, cầu in đang chạy ở máy khác ngừng in ngay
 * (QD-019 D6b). Quản lý ca bấm nhầm là bếp mất phiếu giữa ca.
 */
export async function taoMaChoChuQuan(session: SessionMembership): Promise<MaChuQuan> {
  if (session.role !== "owner") return { error: "khong-phai-chu" };

  const admin = createAdminClient();
  const { data: quan } = await admin.from("tenants").select("status").eq("id", session.tenant.id).maybeSingle();
  // Quán tạm ngưng (TENANT-06) không được nhận thêm cầu in — cùng quy tắc với lúc đổi mã.
  if (quan?.status !== "active") return { error: "tam-ngung" };

  const rl = await checkRateLimit(RULES.bridgeCode, [session.tenant.id]);
  if (!rl.ok) return { error: "gioi-han" };

  try {
    return await createActivationCode(admin, { tenantId: session.tenant.id, createdBy: session.userId });
  } catch (err) {
    console.error(JSON.stringify({ evt: "tao-ma-cau-in-loi", msg: err instanceof Error ? err.message : String(err) }));
    return { error: "khac" };
  }
}
