import { expect, test } from "@playwright/test";
import { addBooking, cleanup, createUser, hasPortal, newRun, PASSWORD } from "./helpers/portal";

/** Portal sign-in, onboarding and claiming, through the real pages (email + password). */
test.skip(
  !hasPortal,
  "Portal Supabase env (NEXT_PUBLIC_PORTAL_SUPABASE_*, E2E_PORTAL_SECRET) not set",
);

const RUN = newRun();
test.afterAll(async () => {
  await cleanup(RUN);
});

/** WhatsApp is the default tab when phone sign-in is on; these tests use email. */
async function pickEmail(page: import("@playwright/test").Page) {
  const tab = page.getByRole("button", { name: "Email", exact: true });
  if (await tab.isVisible()) await tab.click();
}

async function signIn(page: import("@playwright/test").Page, email: string, password = PASSWORD) {
  await pickEmail(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("the portal needs signing in, and comes back to where you were going", async ({ page }) => {
  await page.goto("/portal/welcome");
  await expect(page).toHaveURL(/\/portal\/login\?next=%2Fportal%2Fwelcome$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  // Pages are never indexed.
  const res = await page.request.get("/portal/login");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
});

test("wrong password and unconfirmed email get clear messages", async ({ page }) => {
  const known = await createUser(RUN, "known");
  const unconfirmed = await createUser(RUN, "unconfirmed", false);
  await page.goto("/portal/login");
  await signIn(page, known, "not-the-password");
  await expect(page.locator("p[role=alert]")).toHaveText("Wrong email or password.");
  await signIn(page, unconfirmed);
  await expect(page.locator("p[role=alert]")).toContainText("Confirm your email first");
  await expect(
    page.getByRole("button", { name: "Send the confirmation link again" }),
  ).toBeVisible();
});

test("first sign-in: onboarding creates the account and attaches earlier bookings", async ({
  page,
}) => {
  const email = await createUser(RUN, "first");
  const ref = await addBooking(email);
  await page.goto("/portal/login");
  await signIn(page, email);
  await expect(page).toHaveURL(/\/portal\/welcome$/);
  await expect(page.getByRole("status")).toContainText("We found 1 earlier booking");

  // Option cards hide the real input; check it the way a tap on the card does.
  await page.getByRole("radio", { name: /^Company/ }).check({ force: true });
  await page.getByRole("button", { name: "Go to my portal" }).click();
  await expect(page.getByText("Add your name.")).toBeVisible(); // server-side validation
  await page.getByLabel("Your name").fill("Farah First");
  await page.getByLabel("Company name").fill("First Homes");
  await page.getByLabel("What the company does").selectOption("holiday-homes");
  await page.getByRole("checkbox", { name: /^Property shoots/ }).check({ force: true });
  await page.getByRole("button", { name: "Go to my portal" }).click();

  await expect(page).toHaveURL(/\/portal\?claimed=1$/);
  await expect(page.getByRole("status")).toContainText("We found 1 earlier booking");
  await expect(page.getByRole("heading", { name: "First Homes" })).toBeVisible();
  await expect(page.getByTestId("bookings")).toContainText(ref);
  await expect(page.getByTestId("bookings")).toContainText("Marina Gate 1");

  // Welcome is only for the first time.
  await page.goto("/portal/welcome");
  await expect(page).toHaveURL(/\/portal$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/portal\/login\?signed-out=1$/);
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/portal\/login/);

  // Returning: straight to the portal.
  await signIn(page, email);
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByTestId("bookings")).toContainText(ref);
});

test("?next= only ever leads inside the portal", async ({ page }) => {
  const email = await createUser(RUN, "next");
  await page.goto("/portal/login?next=//evil.example/portal");
  await signIn(page, email);
  await expect(page).toHaveURL(/\/portal\/welcome$/);
});

test("create account: checks the form, then hands over to Supabase", async ({ page }) => {
  await page.goto("/portal/login?mode=signup");
  await page.getByLabel("Email").fill("someone@company");
  await page.getByLabel("Password").fill("longenough1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("That email looks incomplete");
  await page.getByLabel("Email").fill(`${RUN}-signup@example.com`);
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("at least 8 characters");
  // example.com can't receive mail, so Supabase refuses it (or, on repeat runs, rate-limits
  // sign-ups): either way the message says so plainly.
  await page.getByLabel("Password").fill("longenough1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(/can’t receive mail|Too many attempts/);
});

test("forgot password never reveals whether an account exists", async ({ page }) => {
  await page.goto("/portal/login");
  await pickEmail(page);
  await page.getByLabel("Email").fill(`${RUN}-nobody@example.com`);
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("status")).toContainText("If e2e-portal-");
});

test("an expired email link explains itself", async ({ page }) => {
  await page.goto("/portal/auth/callback?error=access_denied&error_code=otp_expired");
  await expect(page).toHaveURL(/\/portal\/login\?link=expired$/);
  await expect(page.getByRole("status")).toContainText("expired or was already used");
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("login fits the screen @mobile", async ({ page }) => {
    await page.goto("/portal/login");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await page
      .getByRole("button", { name: /Send code on WhatsApp|Sign in/ })
      .first()
      .boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
