import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

/**
 * Tests run against a production build on port 3200 using the locally installed Google Chrome
 * (no browser download). `logic` tests import lib code directly and need no page.
 */
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome", trace: "retain-on-failure" },
  projects: [
    { name: "logic", testMatch: /.*\.logic\.spec\.ts/ },
    {
      name: "desktop",
      testMatch: /.*\.e2e\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "mobile",
      testMatch: /.*\.e2e\.spec\.ts/,
      grep: /@mobile/,
      use: { ...devices["Pixel 7"], channel: "chrome" },
    },
  ],
  // Logic-only runs (npm run test:logic) don't need the site.
  webServer: process.env.PW_NO_SERVER
    ? undefined
    : {
        command: `npm run build && npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
