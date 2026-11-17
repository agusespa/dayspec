import { defineConfig, devices } from "@playwright/test";

const PORT = 8182;

export default defineConfig({
  testDir: "e2e",
  // One server for every test; each test gets its own browser storage.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["iPhone 13"],
    // iPhone preset defaults to WebKit; run it in Chromium (what CI installs).
    browserName: "chromium",
    // The routine is in local time; pin it so the clock-based tests are stable anywhere.
    timezoneId: "Europe/Stockholm",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "./scripts/e2e-server.sh",
    url: `http://localhost:${PORT}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
