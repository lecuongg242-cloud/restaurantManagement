import * as Sentry from "@sentry/nextjs";

/** Nạp Sentry theo runtime (OPS-10). Cấu hình: `sentry.server.config.ts`, `sentry.edge.config.ts`. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

/** Lỗi ném ra từ Server Component, route handler, server action, middleware. */
export const onRequestError = Sentry.captureRequestError;
