import { expect, test } from "@playwright/test";
import {
  addBooking,
  cleanup,
  createUser,
  hasPortal,
  newRun,
  portalClient,
  setEmailCode,
} from "./helpers/portal";

/**
 * Sign-in by a 6-digit email code (owner, 3 Oct 2026). Tests never read email: a dev-only helper
 * sets a known code on the test user. The full browser flow also sends a real code, to Resend's
 * test inbox (delivered+…@resend.dev, accepted but never delivered), so it runs only once Resend is
 * the portal project's mailer; before that Supabase refuses to send and the test skips.
 */
test.skip(!hasPortal, "Portal Supabase env not set");

const RUN = newRun();
test.afterAll(async () => {
  await cleanup(RUN);
});

test("a correct code signs in, verifies the email and finds earlier bookings; codes work once", async () => {
  const email = await createUser(RUN, "code", false); // never confirmed, e.g. an old sign-up
  await addBooking(email);
  await setEmailCode(email, "246810");
  const db = portalClient();
  expect((await db.auth.verifyOtp({ email, token: "111111", type: "email" })).error?.code).toBe(
    "otp_expired",
  );
  const ok = await db.auth.verifyOtp({ email, token: "246810", type: "email" });
  expect(ok.error).toBeNull();
  expect(ok.data.user?.email_confirmed_at).toBeTruthy();
  expect((await db.rpc("claim_my_bookings")).data).toMatchObject({ pending: 1 });
  expect(
    (await portalClient().auth.verifyOtp({ email, token: "246810", type: "email" })).error?.code,
  ).toBe("otp_expired");
});

test("browser: email me a code → enter it → in (needs Resend as the mailer)", async ({ page }) => {
  const email = `delivered+${RUN}-ui@resend.dev`;
  await page.goto("/portal/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  const sent = page.getByText("We sent a sign-in code to");
  const refused = page.locator("p[role=alert]");
  await expect(sent.or(refused)).toBeVisible();
  test.skip(
    await refused.isVisible(),
    `Supabase didn't send (${await refused.textContent()}): set Resend as the mailer`,
  );

  await expect(page.getByLabel("Code")).toBeFocused();
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toContainText("isn’t right or has expired");
  await setEmailCode(email, "135790");
  await page.getByLabel("Code").fill("135790");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/portal\/welcome$/);
});
