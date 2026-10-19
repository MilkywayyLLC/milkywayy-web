import { expect, test } from "@playwright/test";
import { OWNER } from "./helpers/admin";
import { env, hasAdminAccounts } from "./helpers/env";
import {
  addBooking,
  cleanup,
  clientAccount,
  hasPortalAdmin,
  newRun,
  portalClient,
} from "./helpers/portal";

/**
 * Bookings attached by email while signed out carry a badge in the admin (owner, 3 Oct 2026), so
 * they get confirmed before anyone trusts them. Bookings the client claimed by signing in don't.
 */
test.skip(
  !hasAdminAccounts || !hasPortalAdmin || !env.LEAD_SECRET,
  "needs the e2e admin accounts, PORTAL_ADMIN_SECRET and LEAD_SECRET",
);
test.use({ storageState: OWNER });

const RUN = newRun();
test.afterAll(async () => {
  await cleanup(RUN);
});

test("attached by email: badge on the board and the project; claimed bookings have none", async ({
  page,
}) => {
  const c = await clientAccount(RUN, "flag", `E2E Flag ${RUN.slice(-5).toUpperCase()}`);
  const byEmail = await addBooking(c.email); // as a signed-out booking with their email
  const { data: attached } = await portalClient().rpc("attach_booking_by_email", {
    p_secret: env.LEAD_SECRET,
    p_ref: byEmail,
  });
  expect(attached).toBe(true);
  const claimed = await addBooking(c.email); // as if they signed in and claimed it
  await c.db.rpc("claim_my_bookings", { p_account: c.account });

  await page.goto(`/admin/projects?q=${byEmail}`);
  const ticket = page.getByTestId("board").getByRole("link", { name: new RegExp(byEmail) });
  await expect(ticket).toContainText("Attached by email, not signed in");
  await ticket.click();
  await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]{36}$/);
  await expect(
    page.locator(".ad-head").getByText("Attached by email, not signed in"),
  ).toBeVisible();

  await page.goto(`/admin/projects?q=${claimed}`);
  const other = page.getByTestId("board").getByRole("link", { name: new RegExp(claimed) });
  await expect(other).toBeVisible();
  await expect(other).not.toContainText("Attached by email");

  // A wrong key can't attach anything.
  const { error } = await portalClient().rpc("attach_booking_by_email", {
    p_secret: "wrong",
    p_ref: claimed,
  });
  expect(error?.message).toMatch(/not allowed/);
});
