import { defineConfig } from "@playwright/test";

// Cấu hình E2E P3 — chạy trên dev server đang chạy (không tự khởi động).
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3005",
    headless: true,
    screenshot: "off",
    trace: "off",
    actionTimeout: 15_000,
  },
});
