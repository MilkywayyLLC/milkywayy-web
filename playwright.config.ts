import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
/** Set BASE_URL to test a deployed site (e.g. staging) instead of a local build. */
const BASE_URL = process.env.BASE_URL;

/**
 * Tests run against a production build on port 3200 using the locally installed Google Chrome
 * (no browser download). `logic` tests import lib code directly and need no page.
 */
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "logic", testMatch: /.*\.logic\.spec\.ts/, use: { channel: "chrome" } },
    {
      name: "desktop",
      testMatch: /.*\.e2e\.spec\.ts/,
      grepInvert: /@mobile-only/,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "mobile",
      testMatch: /.*\.e2e\.spec\.ts/,
      grep: /@mobile/,
      use: { ...devices["Pixel 7"], channel: "chrome" },
    },
    // Safari on iPhone (WebKit). Run on its own: npm run test:ios (needs `npx playwright install webkit`).
    {
      name: "ios-safari",
      testMatch: /.*\.e2e\.spec\.ts/,
      grep: /@mobile/,
      use: { ...devices["iPhone 14"] },
    },
    // Client portal (Phase 9): its own Supabase project while it's built; skips without its env.
    {
      name: "portal",
      testMatch: /.*\.portal\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    // Admin → Client accounts (portal, step 6): signs in like the admin tests.
    {
      name: "portal-admin",
      testMatch: /.*\.portaladmin\.spec\.ts/,
      dependencies: ["admin-setup"],
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    // Admin: runs after the public tests (it publishes and deletes test content on the shared
    // database), signs in once, then edits as the e2e Owner / Editor / non-admin accounts.
    {
      name: "admin-setup",
      testMatch: /admin\.setup\.ts/,
      dependencies: ["desktop", "mobile"],
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "admin",
      testMatch: /.*\.admin\.spec\.ts/,
      grepInvert: /@phone/,
      dependencies: ["admin-setup"],
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "admin-phone",
      testMatch: /.*\.admin\.spec\.ts/,
      grep: /@phone/,
      dependencies: ["admin"],
      use: { ...devices["Pixel 7"], channel: "chrome" },
    },
  ],
  // Logic-only runs (npm run test:logic) don't need the site.
  webServer:
    process.env.PW_NO_SERVER || BASE_URL
      ? undefined
      : {
          command: `npm run build && npx next start -p ${PORT}`,
          url: `http://localhost:${PORT}`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
});
