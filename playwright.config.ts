import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 15_000,
  expect: {
    timeout: 3_000,
  },
  fullyParallel: true,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  webServer:
    process.env.PLAYWRIGHT_NO_WEBSERVER === "1"
      ? undefined
      : {
          command: "bun run dev",
          url: "http://127.0.0.1:5173",
          reuseExistingServer: true,
          timeout: 10_000,
        },
});
