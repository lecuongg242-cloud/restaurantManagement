import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Cho phép test dùng alias "@/..." như app (vd unit test lib/billing).
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Test RLS gọi mạng thật tới Supabase → nới timeout.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
