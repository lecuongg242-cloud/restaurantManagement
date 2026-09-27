import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { provisionPrintBridgeAccount, type PrintBridgeCredentials } from "@/lib/print/bridge-account";

/**
 * Mã kích hoạt cầu in (PRINT-11, QD-019 D6).
 *
 * Trước đây mỗi quán một gói cài riêng, **mật khẩu tài khoản cầu in nằm sẵn trong file zip** — đi qua
 * Zalo/USB tới tay người lắp. Nay gói cài giống nhau cho mọi quán; người lắp gõ một mã 8 ký tự lúc cài,
 * server đổi mã đó thành tài khoản `printer` của đúng quán (xoay mật khẩu — máy cũ mất quyền ngay).
 *
 * Mã: dùng một lần, hết hạn sau 30 phút, chỉ lưu bản băm. 32^8 ≈ 10^12 tổ hợp, cộng giới hạn tần suất
 * ở route (TENANT-07) ⇒ không dò được.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
export const CODE_TTL_MS = 30 * 60_000;

/** Không phân biệt "sai" với "hết hạn" với "đã dùng" — phân biệt là cho kẻ dò biết mã nào có thật. */
const LOI = "Mã không hợp lệ hoặc đã hết hạn.";

export function generateCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s;
}

/** Người lắp gõ tay: nhận chữ thường, gạch nối, dấu cách. Không hợp lệ → null. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, "");
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(`cau-in:${code}`).digest("hex");
}

/** Tạo mã cho một quán. `admin` là client service-role; quyền (super-admin) kiểm ở lớp action. */
export async function createActivationCode(
  admin: SupabaseClient,
  args: { tenantId: string; createdBy: string | null },
  now = Date.now()
): Promise<{ code: string; expiresAt: string }> {
  const code = generateCode();
  const expiresAt = new Date(now + CODE_TTL_MS).toISOString();
  const { error } = await admin.from("bridge_activation_codes").insert({
    tenant_id: args.tenantId,
    code_hash: hashCode(code),
    created_by: args.createdBy,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`Không tạo được mã kích hoạt: ${error.message}`);
  return { code, expiresAt };
}

export type RedeemResult = ({ slug: string } & PrintBridgeCredentials) | { error: string };

/**
 * Đổi mã → tài khoản cầu in. Đánh dấu "đã dùng" bằng MỘT lệnh update có điều kiện: hai máy gõ cùng
 * một mã cùng lúc thì chỉ một máy thắng.
 */
export async function redeemActivationCode(admin: SupabaseClient, raw: unknown): Promise<RedeemResult> {
  const code = normalizeCode(raw);
  if (!code) return { error: LOI };

  const nowIso = new Date().toISOString();
  const { data: used, error } = await admin
    .from("bridge_activation_codes")
    .update({ used_at: nowIso })
    .eq("code_hash", hashCode(code))
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .select("tenant_id");
  if (error || !used || used.length !== 1) return { error: LOI };

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, slug, name, status")
    .eq("id", used[0].tenant_id)
    .maybeSingle();
  // Quán tạm ngưng (TENANT-06) không được nhận thêm cầu in.
  if (!tenant || tenant.status !== "active") return { error: LOI };

  const creds = await provisionPrintBridgeAccount(admin, {
    tenantId: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
  });
  // Kích hoạt cầu in = quán dùng cầu in (PRINT-10). Người lắp tại quán thường không có tài khoản owner
  // để tự đổi "Cách in phiếu"; quên đổi thì POS không bao giờ gửi phiếu qua cầu in vừa cài.
  await setPrintMode(admin, tenant.id, "bridge");
  return { slug: tenant.slug, ...creds };
}

/** Ghi `settings.print_mode`, giữ nguyên các khóa settings khác. */
async function setPrintMode(admin: SupabaseClient, tenantId: string, mode: "browser" | "bridge"): Promise<void> {
  const { data } = await admin.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
  const settings = { ...((data?.settings as Record<string, unknown> | null) ?? {}), print_mode: mode };
  const { error } = await admin.from("tenants").update({ settings }).eq("id", tenantId);
  if (error) throw new Error(`Không đổi được chế độ in: ${error.message}`);
}

/**
 * Thu hồi cầu in của một quán: vô hiệu membership `printer`. RLS (`auth_tenant_ids`) và nhịp tim đều
 * đòi membership active ⇒ cầu in mất quyền ngay ở truy vấn kế tiếp, không chờ token hết hạn.
 */
export async function revokePrintBridge(admin: SupabaseClient, tenantId: string): Promise<number> {
  const { data, error } = await admin
    .from("memberships")
    .update({ active: false })
    .eq("tenant_id", tenantId)
    .eq("role", "printer")
    .select("id");
  if (error) throw new Error(`Không thu hồi được cầu in: ${error.message}`);
  // Không còn cầu in → về in trình duyệt, để POS không xếp phiếu vào hàng đợi không ai lấy.
  await setPrintMode(admin, tenantId, "browser");
  return data?.length ?? 0;
}
