import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Thông tin đăng nhập nhân viên (QD-009). Mật khẩu Supabase được SUY DẪN từ PIN bằng pepper
 * server-side, nên nhân viên chỉ gõ 4 số còn Supabase/mạng không bao giờ thấy 4 số trần.
 * Kèm cơ chế khóa tạm theo email để chống dò PIN (không gian 10⁴) qua endpoint đăng nhập.
 */

const PEPPER = process.env.STAFF_PIN_PEPPER;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Suy dẫn mật khẩu Supabase từ PIN. XÁC ĐỊNH (deterministic) để lúc CẤP tài khoản và lúc ĐĂNG NHẬP
 * ra cùng giá trị; gộp email vào HMAC nên mỗi người 1 mật khẩu khác nhau dù trùng PIN. Kết quả ≥6
 * ký tự (Supabase yêu cầu). Chỉ chạy server; pepper không bao giờ ra client.
 */
export function derivePinPassword(email: string, pin: string): string {
  if (!PEPPER) throw new Error("Thiếu STAFF_PIN_PEPPER (chỉ server).");
  const mac = crypto.createHmac("sha256", PEPPER).update(`${normEmail(email)}:${pin}`).digest("hex");
  return `pin_${mac}`;
}

/** Bí mật gõ ở form login là PIN 4 số (⇒ suy dẫn) hay mật khẩu thường (owner/manager). */
export function isFourDigitPin(secret: string): boolean {
  return /^\d{4}$/.test(secret);
}

/** true nếu email đang bị khóa tạm. Lỗi hạ tầng → không chặn (có kiểm soát). */
export async function isLoginLocked(email: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("staff_login_throttle")
      .select("locked_until")
      .eq("email", normEmail(email))
      .maybeSingle();
    if (!data?.locked_until) return false;
    return new Date(data.locked_until).getTime() > Date.now();
  } catch {
    return false;
  }
}

/** Ghi nhận 1 lần đăng nhập SAI; khóa tạm khi vượt ngưỡng. */
export async function recordLoginFailure(email: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const key = normEmail(email);
    const { data } = await admin
      .from("staff_login_throttle")
      .select("fails")
      .eq("email", key)
      .maybeSingle();
    const fails = (data?.fails ?? 0) + 1;
    const locked_until =
      fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    await admin
      .from("staff_login_throttle")
      .upsert({ email: key, fails, locked_until, updated_at: new Date().toISOString() });
  } catch {
    // Không chặn đăng nhập vì lỗi ghi throttle.
  }
}

/** Xóa bộ đếm khi đăng nhập THÀNH CÔNG. */
export async function clearLoginFailures(email: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("staff_login_throttle").delete().eq("email", normEmail(email));
  } catch {
    // bỏ qua
  }
}
