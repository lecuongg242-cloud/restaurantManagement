import crypto from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Giới hạn tần suất cho đường ẩn danh (TENANT-07, QD-019 D4).
 *
 * Mọi quán chung một database — một quán bị dội request là mọi quán cùng chậm. Bộ đếm nằm trong
 * Postgres (`rate_limit_hit`, migration 0050): không thêm dịch vụ, +1 lượt DB ~5ms cùng vùng.
 *
 * Khóa: token bàn khi có (cả quán dùng chung một wifi ⇒ chặn theo IP là chặn nhầm khách thật), IP
 * khi không có token. Khóa lưu dạng HMAC — IP là dữ liệu cá nhân, và băm trần IPv4 dò ngược được bằng
 * từ điển 2^32.
 *
 * Ngưỡng đặt từ số đo production 26/09/2026 (11-03-SUMMARY): mỗi bàn tối đa 1 đơn QR/phút và 1 lượt
 * gọi nhân viên/phút. Ngưỡng dưới đây gấp ≥5 lần đỉnh thật.
 */
export type RateRule = { name: string; windowS: number; max: number };

export const RULES = {
  /** POST api/order — khóa: token bàn. */
  order: { name: "order", windowS: 60, max: 10 },
  /** POST api/call — khóa: token bàn. */
  call: { name: "call", windowS: 60, max: 5 },
  /** GET api/order/[id] — khóa: IP + mã đơn. Khách poll 15s/đơn khi realtime chết (4/phút). */
  orderStatus: { name: "order-status", windowS: 60, max: 30 },
  /** POST api/online-order — khóa: IP + quán. */
  onlineOrder: { name: "online-order", windowS: 60, max: 10 },
  /** submitReservation — khóa: IP + quán. */
  reservation: { name: "reservation", windowS: 60, max: 5 },
  /** submitLead (trang giới thiệu) — khóa: IP. */
  lead: { name: "lead", windowS: 600, max: 5 },
  /** POST api/bridge/activate (PRINT-11) — khóa: IP. Người lắp gõ sai vài lần là cùng. */
  bridgeActivate: { name: "bridge-activate", windowS: 600, max: 10 },
  /** Chủ quán tự tạo mã kích hoạt ở Admin → Máy in (PRINT-17) — khóa: quán. Lắp một máy cần 1–2 mã. */
  bridgeCode: { name: "bridge-code", windowS: 600, max: 5 },
  /** POST api/desktop/activate (DESK-01) — khóa: IP, và riêng theo email (chặn dò mật khẩu một chủ quán). */
  desktopActivate: { name: "desktop-activate", windowS: 600, max: 10 },
} as const satisfies Record<string, RateRule>;

export function hashKey(rule: RateRule, parts: string[], secret: string): string {
  const h = crypto.createHmac("sha256", secret).update(parts.join("|")).digest("hex").slice(0, 32);
  return `${rule.name}:${h}`;
}

/** Số giây tới hết cửa sổ cố định hiện tại (cùng cách chia cửa sổ với RPC). Tối thiểu 1. */
export function retryAfterS(windowS: number, nowMs: number): number {
  const conLai = windowS - (Math.floor(nowMs / 1000) % windowS);
  return Math.max(1, conLai);
}

/** IP khách do Vercel đặt. Không có thì dùng một khóa chung — vẫn giới hạn, không làm hỏng request. */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || "khong-ro";
}

export function tooManyMessage(retryAfter: number): string {
  return `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${retryAfter} giây.`;
}

type Rpc = (
  fn: string,
  args: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

type Deps = { rpc: Rpc; now: () => number; secret: string };

async function defaultDeps(): Promise<Deps> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  return {
    rpc: (fn, args) => admin.rpc(fn, args),
    now: () => Date.now(),
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
}

export type RateResult = { ok: boolean; retryAfterS: number };

/**
 * Ghi một lượt và cho biết còn trong ngưỡng không. Bộ đếm LỖI → CHO QUA (và ghi log): bộ đếm hỏng
 * không được làm quán không bán được — đó là sự cố lớn hơn cái nó phòng.
 */
export async function checkRateLimit(rule: RateRule, parts: string[], deps?: Deps): Promise<RateResult> {
  try {
    const d = deps ?? (await defaultDeps());
    const { data, error } = await d.rpc("rate_limit_hit", {
      p_key: hashKey(rule, parts, d.secret),
      p_window_s: rule.windowS,
      p_max: rule.max,
    });
    if (error) throw new Error(error.message);
    if (data === false) return { ok: false, retryAfterS: retryAfterS(rule.windowS, d.now()) };
    return { ok: true, retryAfterS: 0 };
  } catch (err) {
    console.error(
      JSON.stringify({ evt: "rate-limit-loi", rule: rule.name, msg: err instanceof Error ? err.message : String(err) })
    );
    return { ok: true, retryAfterS: 0 };
  }
}

/** Phản hồi 429 chuẩn cho route handler. */
export function tooManyResponse(r: RateResult): NextResponse {
  return NextResponse.json(
    { error: tooManyMessage(r.retryAfterS) },
    { status: 429, headers: { "Retry-After": String(r.retryAfterS) } }
  );
}
