import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Cho phép test dùng alias "@/..." như app (vd unit test lib/billing).
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only` chỉ tồn tại trong pipeline build của Next; test cần một stub rỗng để
      // import được các module server (xem tests/stubs/server-only.ts).
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // OPS-08: chạy như máy chủ production (Vercel = UTC). Máy dev ở UTC+7 thì code dựa vào múi giờ
    // máy chạy vẫn cho kết quả đúng, và lỗi chỉ lộ ra trên hóa đơn của khách (24/09/2026).
    // tests/env/mui-gio.test.ts khẳng định cấu hình này có hiệu lực.
    env: { TZ: "UTC" },
    include: ["tests/**/*.test.ts"],
    // Test RLS gọi mạng thật tới Supabase → nới timeout.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
