/**
 * Kiểm sống/chết cho `/api/health` (OPS-10). Tách khỏi route để test được không cần server.
 *
 * `probe` là một lượt đọc thật vào DB. Nó ném → chết; nó treo quá `timeoutMs` → cũng chết. Không
 * được treo theo DB: bộ theo dõi bên ngoài cần một câu trả lời rõ ràng, không phải timeout của chính nó.
 */
export type HealthResult = { ok: boolean };

export async function checkHealth(probe: () => Promise<void>, timeoutMs: number): Promise<HealthResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hetGio = new Promise<"het-gio">((resolve) => {
    timer = setTimeout(() => resolve("het-gio"), timeoutMs);
  });
  try {
    const kq = await Promise.race([probe().then(() => "xong" as const), hetGio]);
    return { ok: kq === "xong" };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Thân phản hồi. CHỈ `ok` — endpoint công khai, ai cũng gọi được, nên không lộ thông điệp lỗi, host
 * database hay phiên bản. Lý do chết xem ở log/Sentry, không phải ở đây.
 */
export function healthBody(r: HealthResult): HealthResult {
  return { ok: r.ok };
}
