import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { withSentryConfig } from "@sentry/nextjs/config";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

/**
 * Chỉ MỘT `next dev` cho mỗi thư mục dự án. Hai dev server (vd `pnpm dev` cổng 3000 + `next dev -p 3005`)
 * cùng ghi `.next` thì đè bản build của nhau: trình duyệt nhận code client mới nhưng dữ liệu từ bản server
 * cũ → lỗi kiểu "s.memberTableIds is not iterable". Khóa nằm ở đây (không ở script `dev`) để chặn cả
 * `npx next dev` gọi thẳng.
 */
// Phải nằm trong `.next/cache`: mỗi lần khởi động, `next dev` XÓA mọi thứ trong `.next` trừ `cache/`
// (hot-reloader-webpack: `recursiveDelete(distDir, /^cache/)`) — để ở `.next/` thì khóa mất ngay sau khi ghi.
const DEV_LOCK = path.join(__dirname, ".next", "cache", "dev-server.lock");

function argPort(): number {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    const m = /^(?:-p|--port)(?:=(\d+))?$/.exec(argv[i]);
    if (m) return Number(m[1] ?? argv[i + 1]);
  }
  return Number(process.env.PORT) || 3000;
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "localhost" });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(500, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

async function guardSingleDevServer(): Promise<void> {
  // Tiến trình con (start-server) do chính `next dev` đang giữ khóa sinh ra — không xét lại.
  if (process.env.NEXT_PRIVATE_WORKER) return;
  try {
    const held = JSON.parse(fs.readFileSync(DEV_LOCK, "utf8")) as { pid: number; port: number };
    // Xét CỔNG còn trả lời, không xét PID: PID ghi ở đây là tiến trình cha `next dev`, còn cổng do tiến trình con
    // (start-server) giữ. Trên Windows kill cha thì con vẫn sống, vẫn phục vụ và ghi `.next`. Khóa sót sau khi tắt hẳn
    // (cổng không trả lời) thì không chặn.
    if (held.pid !== process.pid && (await portOpen(held.port))) {
      console.error(
        `\n✖ Đã có next dev đang chạy cho dự án này (PID ${held.pid}) tại http://localhost:${held.port}\n` +
          `  Dùng server đó (vd E2E_BASE_URL=http://localhost:${held.port}), hoặc dừng nó trước khi chạy cái mới.\n` +
          `  Hai dev server dùng chung .next sẽ đè bản build của nhau.\n`
      );
      process.exit(1);
    }
  } catch {
    /* chưa có khóa / khóa hỏng → giành khóa */
  }
  fs.mkdirSync(path.dirname(DEV_LOCK), { recursive: true });
  fs.writeFileSync(DEV_LOCK, JSON.stringify({ pid: process.pid, port: argPort() }));
  process.once("exit", () => {
    try {
      if ((JSON.parse(fs.readFileSync(DEV_LOCK, "utf8")) as { pid: number }).pid === process.pid) fs.unlinkSync(DEV_LOCK);
    } catch {}
  });
}

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : "*.supabase.co";
  } catch {
    return "*.supabase.co";
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Phiên bản kho của service worker POS (P17 17-01): mỗi bản deploy một kho mới, kho cũ bị xóa.
  env: { NEXT_PUBLIC_BUILD_ID: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 12) },
  experimental: {
    /**
     * Server Action mặc định chỉ nhận body 1MB → form "Nhận diện nhà hàng" gửi logo + ảnh bìa
     * (mỗi ảnh tới 10MB theo validate ở ImageUpload) bị Next CHẶN TRƯỚC khi action chạy: trả 500,
     * không flash, người dùng tưởng bấm hụt. Đặt 25MB để bao 2 ảnh 10MB + overhead multipart,
     * vẫn còn ngưỡng 10MB/ảnh chặn ở cả client lẫn server (lib/storage/images.ts).
     */
    serverActions: { bodySizeLimit: "25mb" },
  },
  // Repo con nằm trong E:\externalProjects (có lockfile cha) — chốt root ở đây
  // để tắt cảnh báo "inferred workspace root".
  outputFileTracingRoot: __dirname,
  // Cầu in tự cập nhật (PRINT-12): route đọc `scripts/print-bridge.mjs` bằng fs — Next không tự dò
  // được, thiếu dòng này thì hàm trên Vercel không có tệp để công bố.
  outputFileTracingIncludes: {
    "/api/bridge/latest": ["./scripts/print-bridge.mjs"],
    "/api/bridge/latest/file": ["./scripts/print-bridge.mjs"],
    // Ảnh hóa đơn có dấu (PRINT-14) đọc font bằng fs.
    "/api/print/jobs/[id]/image": ["./assets/fonts/*.ttf"],
    // Favicon chữ cái đầu tên quán (chữ có dấu, vd "Đ").
    "/r/[slug]/favicon.png": ["./assets/fonts/BeVietnamPro-Bold.ttf"],
  },
  // next/image được phép tải ảnh menu/logo từ Supabase Storage (bucket public).
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

/**
 * Sentry (OPS-10). Chưa có `SENTRY_AUTH_TOKEN` thì không upload source map — lỗi vẫn được ghi, chỉ là
 * stack phía trình duyệt chưa giải mã. Token (bí mật) chỉ đặt ở Vercel env, không bao giờ ở repo.
 */
export default async function config(phase: string) {
  if (phase === PHASE_DEVELOPMENT_SERVER) await guardSingleDevServer();
  return withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    telemetry: false,
    sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  });
}
