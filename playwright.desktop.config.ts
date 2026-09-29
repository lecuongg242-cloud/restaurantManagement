import { defineConfig } from "@playwright/test";

// E2E app máy quầy "TechMenu Thu ngân" (P21): điều khiển chính app Electron trong desktop/, máy chủ + Supabase giả
// (tests/desktop/gia-lap.ts) — không cần dev server, không cần DB. Chạy: npx playwright test -c playwright.desktop.config.ts
export default defineConfig({
  testDir: "./tests/desktop-e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
});
