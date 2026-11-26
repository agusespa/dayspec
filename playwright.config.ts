import { defineConfig, devices } from "@playwright/test";

const BASE_PORT = 8182;
// Each worker gets its own server (see e2e/test.ts), so files run in parallel without sharing a routine.
const WORKERS = Number(process.env.E2E_WORKERS ?? (process.env.CI ? 2 : 4));

export default defineConfig({
  testDir: "e2e",
  workers: WORKERS,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    ...devices["iPhone 13"],
    // The routine is in local time; pin it so the clock-based tests are stable anywhere.
    timezoneId: "Europe/Stockholm",
    // Specs hold API answers with page.route, which WebKit skips for pages a service worker
    // controls; launch.spec.ts allows the worker to test the cached app.
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "./scripts/e2e-server.sh",
    // The last server to come up stands in for all of them.
    url: `http://localhost:${BASE_PORT + WORKERS - 1}/`,
    env: { BASE_PORT: String(BASE_PORT), WORKERS: String(WORKERS) },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
