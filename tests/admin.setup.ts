import { expect, test as setup } from "@playwright/test";
import { EDITOR, enterCode, OWNER, signInWithPassword, STRANGER } from "./helpers/admin";
import { hasAdminAccounts } from "./helpers/env";
import { savedSecret, saveSecret } from "./helpers/totp";

/**
 * Signs in the three e2e accounts once and saves their sessions for the admin tests.
 * The first run also sets up the e2e Owner's authenticator (the secret is kept in
 * tests/.auth/, gitignored). To start over, delete the factor in Supabase:
 *   delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'e2e-owner@example.com');
 */
setup.skip(!hasAdminAccounts, "E2E_* accounts missing from .env.local");

setup("owner: password, then two-factor", async ({ page }) => {
  setup.setTimeout(120_000);
  await signInWithPassword(page, "OWNER");
  await page.waitForURL(/two-factor/);
  let secret = savedSecret();
  if (await page.getByRole("heading", { name: "Set up two-factor" }).isVisible()) {
    await page.getByText("Can’t scan? Enter this key instead").click();
    secret = (await page.getByTestId("totp-secret").textContent())!.trim();
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
    saveSecret(secret);
  }
  expect(secret, "tests/.auth/owner-totp.txt (see the comment above to reset)").not.toBe("");
  await enterCode(page, secret);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.context().storageState({ path: OWNER });
});

setup("editor: password only", async ({ page }) => {
  await signInWithPassword(page, "EDITOR");
  await page.waitForURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.context().storageState({ path: EDITOR });
});

setup("stranger: signed in but not an admin", async ({ page }) => {
  await signInWithPassword(page, "STRANGER");
  await page.waitForURL(/no-access/);
  await page.context().storageState({ path: STRANGER });
});
