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
    include: ["tests/**/*.test.ts"],
    // Test RLS gọi mạng thật tới Supabase → nới timeout.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
