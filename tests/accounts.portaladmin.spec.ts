import { expect, test } from "@playwright/test";
import { EDITOR, OWNER } from "./helpers/admin";
import { hasAdminAccounts } from "./helpers/env";
import { adminRpc, cleanup, hasPortalAdmin, newRun } from "./helpers/portal";

/** Admin → Client accounts (step 6), as the e2e Owner (password + code) and the Editor. */
test.skip(
  !hasAdminAccounts || !hasPortalAdmin,
  "needs the e2e admin accounts and PORTAL_ADMIN_SECRET",
);
test.describe.configure({ mode: "serial" });

const RUN = newRun();
const NAME = `E2E Clients ${RUN.slice(-6).toUpperCase()}`;
test.afterAll(async () => {
  await cleanup(RUN);
});

test.describe("Owner", () => {
  test.use({ storageState: OWNER });

  test("create a client with an Owner invite, then find it", async ({ page }) => {
    await page.goto("/admin/accounts");
    await expect(page.getByRole("heading", { name: "Client accounts" })).toBeVisible();
    await page.getByRole("link", { name: "New client" }).click();
    await page.getByLabel("Company name").fill(NAME);
    await page.getByLabel("What they do").selectOption("holiday-homes");
    await page.getByLabel("Billing currency").selectOption("USD");
    await page.getByRole("checkbox", { name: "Post-production" }).check();
    await page.getByLabel("Contact name").fill("Hana Holiday");
    await page.getByLabel("Email").fill(`${RUN}-hana@example.com`);
    await page.getByRole("button", { name: "Create client" }).click();

    await expect(page).toHaveURL(/\/admin\/accounts\/[0-9a-f-]{36}\?created=1$/);
    await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
    await expect(page.getByText("Client created.")).toBeVisible();
    await expect(page.getByTestId("invites")).toContainText("Hana Holiday");
    await expect(page.getByTestId("invites")).toContainText("Owner");
    await expect(page.getByTestId("history")).toContainText(
      "Created: Created with an Owner invite for Hana Holiday",
    );

    await page.goto(`/admin/accounts?q=${encodeURIComponent(NAME.toLowerCase())}`);
    await expect(page.getByTestId("accounts")).toContainText(NAME);
    await page.goto(`/admin/accounts?q=${encodeURIComponent(NAME)}&service=avatars`);
    await expect(page.getByTestId("accounts")).not.toContainText(NAME);
  });

  test("notes, currency, an extra invite to share, and view as client (logged)", async ({
    page,
  }) => {
    await page.goto(`/admin/accounts?q=${encodeURIComponent(NAME)}`);
    await page
      .getByTestId("accounts")
      .getByRole("link", { name: new RegExp(NAME) })
      .click();

    await page.getByLabel("Notes (only admins see these)").fill("Prefers WhatsApp after 6pm.");
    await page.getByRole("button", { name: "Save notes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Notes saved." })).toBeVisible();
    await page.getByLabel("Billing currency").selectOption("AED");
    await expect(page.getByRole("status").filter({ hasText: "Currency saved." })).toBeVisible();

    await page.getByLabel("Name", { exact: true }).fill("Omar Ops");
    await page.getByLabel("WhatsApp number").fill("050 000 0099");
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(page.getByText("Invited. Send them this")).toBeVisible();
    await expect(page.getByRole("link", { name: "Send on WhatsApp" })).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/971500000099\?text=/,
    );

    await page.getByRole("link", { name: "View as client" }).click();
    await expect(page.getByText(`Viewing as ${NAME}`)).toBeVisible();
    await expect(page.getByTestId("view-as")).not.toContainText("Prefers WhatsApp");
    await page.getByRole("link", { name: "Back to the client" }).click();
    await expect(page.getByTestId("history")).toContainText("Viewed as client");
    await expect(page.getByTestId("history")).toContainText("Notes updated");
    await expect(page.getByTestId("history")).toContainText("Currency set to AED");
    await expect(page.getByTestId("history")).toContainText("e2e-owner@example.com");
    await page.reload();
    await expect(page.getByLabel("Notes (only admins see these)")).toHaveValue(
      "Prefers WhatsApp after 6pm.",
    );
  });

  test("fits a phone: no page scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin/accounts?q=${encodeURIComponent(NAME)}`);
    const wide = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(await wide()).toBeLessThanOrEqual(0);
    await page
      .getByTestId("accounts")
      .getByRole("link", { name: new RegExp(NAME) })
      .click();
    await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
    expect(await wide()).toBeLessThanOrEqual(0);
    await page.getByRole("link", { name: "View as client" }).click();
    expect(await wide()).toBeLessThanOrEqual(0);
  });

  test("a made-up id is a 404, not an error", async ({ page }) => {
    const res = await page.goto("/admin/accounts/00000000-0000-0000-0000-000000000000");
    expect(res?.status()).toBe(404);
  });
});

test.describe("Editor", () => {
  test.use({ storageState: EDITOR });
  test("can't open Client accounts", async ({ page }) => {
    await page.goto("/admin/accounts");
    await expect(page).toHaveURL(/\/admin\?owner-only=1$/);
    await expect(page.getByRole("link", { name: "Client accounts" })).toHaveCount(0);
  });
});

test("the cleanup hook can find admin-made test clients", async () => {
  const list = (await adminRpc("portal_admin_clients", { p_q: NAME })).data as unknown[];
  expect(list.length).toBeGreaterThan(0);
});
