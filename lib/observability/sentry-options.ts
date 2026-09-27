import { scrubEvent, type ScrubbableEvent } from "@/lib/observability/scrub";

/**
 * Tùy chọn `Sentry.init` dùng chung cho server và edge (OPS-10, QD-019 D2). Không có bản client —
 * lý do ở `app/global-error.tsx` (SDK client +67 kB cho mọi trang).
 *
 * - Không có DSN (local, CI, preview chưa cấu hình) → tắt hẳn, không gửi gì ra ngoài.
 * - `sendDefaultPii: false` + `scrubEvent` ở MỌI sự kiện: không token bàn, không body, không cookie.
 * - Chỉ cần lỗi: không trace hiệu năng, không replay — gói miễn phí có hạn mức, và mỗi thứ thêm vào
 *   là thêm một đường dữ liệu khách có thể lọt ra.
 */
export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend<T>(event: T): T {
      return scrubEvent(event as T & ScrubbableEvent);
    },
  };
}
