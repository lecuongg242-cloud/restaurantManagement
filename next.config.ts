import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

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
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
