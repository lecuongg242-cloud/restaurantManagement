import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Test RLS gọi mạng thật tới Supabase → nới timeout.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
