import { expect, test } from "@playwright/test";
import {
  cleanup,
  clientAccount,
  hasPortal,
  newRun,
  setProfilePhone,
  signInUI,
} from "./helpers/portal";

/**
 * A signed-in client books a shoot on the website (owner QA, 3 Oct 2026): their details are
 * prefilled, and the booking lands in their portal straight away. Only when bookings and the
 * portal share a database (LEADS_DB=portal on the server, as on portal previews).
 */
test.skip(
  !hasPortal || process.env.LEADS_DB !== "portal",
  "needs LEADS_DB=portal (npm run test:portal)",
);

const RUN = newRun();
test.afterAll(async () => {
  await cleanup(RUN);
});

test("signed in: details prefilled, booking attached to the account", async ({ page }) => {
  const c = await clientAccount(RUN, "booker", "Booker Realty");
  await setProfilePhone(c.email, "+971500000009");
  await page.addInitScript(() => {
    window.open = (() => ({ close() {}, location: { href: "" } })) as unknown as typeof window.open;
  });
  await page.route("https://wa.me/**", (r) => r.fulfill({ body: "stub" }));

  await signInUI(page, c.email);
  await page.goto("/property-shoots");
  const b = page.locator("#booking");
  await expect(b.getByText(`Signed in as ${c.email}`)).toBeVisible();
  await expect(b.getByText("goes straight into your portal (Booker Realty)")).toBeVisible();
  await expect(b.getByLabel("Name")).toHaveValue("BOOKER Tester");
  await expect(b.getByLabel("Email (optional)")).toHaveValue(c.email);
  await expect(b.getByLabel("WhatsApp number")).toHaveValue("500000009");

  await b.getByLabel("Community / area").fill("Dubai Hills");
  await b.getByLabel("Building / tower").fill(`${RUN} Residences`);
  await page.waitForTimeout(2600); // the form's minimum fill time (spam check)
  await b.locator(".bk > .b-sum").getByRole("button", { name: "Send request on WhatsApp" }).click();
  const done = b.locator(".bk > .b-sum").getByRole("status");
  await expect(done).toContainText("in your client portal too");
  const ref = (await done.textContent())!.match(/MW-\d+/)![0];

  await page.goto("/portal/shoots");
  await expect(page.getByTestId("shoots")).toContainText(ref);
  await expect(page.getByTestId("shoots")).toContainText(`${RUN} Residences`);
});
