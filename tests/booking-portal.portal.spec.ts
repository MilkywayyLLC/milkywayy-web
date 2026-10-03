import { expect, test, type Page } from "@playwright/test";
import { markTestLeads } from "./helpers/leads";
import {
  adminRpc,
  cleanup,
  clientAccount,
  createUser,
  hasPortal,
  newRun,
  setProfilePhone,
  signedIn,
  signInUI,
} from "./helpers/portal";

/**
 * Shoot bookings and the portal (owner, 3 Oct 2026). The portal is email-only, so a booking joins
 * the portal account of its email: signed in or not, straight away when that account exists, and
 * the first time they sign in when it doesn't. Signed-in clients are prefilled, and their WhatsApp
 * number is saved the first time they give it. Only when bookings and the portal share a database
 * (LEADS_DB=portal on the server, as on portal previews).
 */
test.skip(
  !hasPortal || process.env.LEADS_DB !== "portal",
  "needs LEADS_DB=portal (npm run test:portal)",
);
test.describe.configure({ mode: "serial" });

const RUN = newRun();
test.afterAll(async () => {
  await cleanup(RUN);
});

/** Fill the property and (optionally) the details, send, return the ref and the status text. */
async function book(page: Page, details: { name?: string; email?: string; phone?: string } = {}) {
  await markTestLeads(page); // flagged as a test: no emails, no rate limit
  await page.addInitScript(() => {
    window.open = (() => ({ close() {}, location: { href: "" } })) as unknown as typeof window.open;
  });
  await page.goto("/property-shoots");
  const b = page.locator("#booking");
  await b.getByLabel("Community / area").fill("Dubai Hills");
  await b.getByLabel("Building / tower").fill(`${RUN} Residences`);
  if (details.name !== undefined) await b.getByLabel("Name").fill(details.name);
  if (details.email !== undefined) await b.getByLabel("Email", { exact: true }).fill(details.email);
  if (details.phone !== undefined) await b.getByLabel("WhatsApp number").fill(details.phone);
  await page.waitForTimeout(2600); // the form's minimum fill time (spam check)
  await b.locator(".bk > .b-sum").getByRole("button", { name: "Send request on WhatsApp" }).click();
  const done = b.locator(".bk > .b-sum").getByRole("status");
  await expect(done).toContainText("Request ready.");
  const text = (await done.textContent()) ?? "";
  return { ref: text.match(/MW-\d+/)![0], text };
}

test("signed in without a number: prefilled, attached, and the number is saved once", async ({
  page,
}) => {
  const c = await clientAccount(RUN, "booker", "Booker Realty");
  await signInUI(page, c.email);
  await page.goto("/property-shoots");
  const b = page.locator("#booking");
  await expect(b.getByText(`Signed in as ${c.email}`)).toBeVisible();
  await expect(b.getByText("goes straight into your portal (Booker Realty)")).toBeVisible();
  await expect(b.getByLabel("Name")).toHaveValue("BOOKER Tester");
  await expect(b.getByLabel("Email", { exact: true })).toHaveValue(c.email);
  await expect(b.getByLabel("WhatsApp number")).toHaveValue("");
  await expect(b.getByText("We’ll save it to your profile.")).toBeVisible();

  const { ref, text } = await book(page, { phone: "50 000 0009" });
  expect(text).toContain("in your client portal too");
  await page.goto("/portal/shoots");
  await expect(page.getByTestId("shoots")).toContainText(ref);
  // Signed in: the normal wording.
  await expect(page.getByTestId("shoots")).toContainText("We confirm the date and slot by email");
  await expect(page.getByTestId("shoots")).not.toContainText("we’ll confirm on WhatsApp");
  const { data } = await c.db.from("profiles").select("phone_e164").single();
  expect(data?.phone_e164).toBe("+971500000009");

  // Next time the number is prefilled.
  await page.goto("/property-shoots");
  await expect(page.locator("#booking").getByLabel("WhatsApp number")).toHaveValue("500000009");
});

test("signed in with a number: everything prefilled", async ({ page }) => {
  const c = await clientAccount(RUN, "known", "Known Realty");
  await setProfilePhone(c.email, "+971500000008");
  await signInUI(page, c.email);
  await page.goto("/property-shoots");
  const b = page.locator("#booking");
  await expect(b.getByLabel("WhatsApp number")).toHaveValue("500000008");
  await expect(b.getByText("We’ll save it to your profile.")).toHaveCount(0);
});

test("signed out, with the email of a portal account: attached, without saying so", async ({
  page,
}) => {
  const c = await clientAccount(RUN, "visitor", "Visitor Homes");
  const { ref, text } = await book(page, {
    name: "Visitor",
    email: c.email.toUpperCase(),
    phone: "50 000 0007",
  });
  // A visitor never learns whether an email has an account.
  expect(text).not.toContain("client portal");
  await expect
    .poll(async () => (await c.db.from("projects").select("ref").eq("ref", ref)).data?.length)
    .toBe(1);

  // In their portal it says we'll confirm it, until the status changes (owner, 3 Oct 2026).
  await signInUI(page, c.email);
  await page.goto("/portal/shoots");
  const card = page.getByTestId("shoots").getByRole("link", { name: new RegExp(ref) });
  await expect(card).toContainText("Requested — we’ll confirm on WhatsApp");
  await expect(card).not.toContainText("We confirm the date and slot by email");
  const { data: p } = await c.db.from("projects").select("id").eq("ref", ref).single();
  await adminRpc("portal_admin_set_status", {
    p_id: p!.id,
    p_status: "confirmed",
    p_date: "2026-11-09",
    p_slot: "Morning",
  });
  await page.reload();
  await expect(card).toContainText("Confirmed");
  await expect(card).not.toContainText("we’ll confirm on WhatsApp");
});

test("signed out, with a new email: it attaches when they first sign in with it", async ({
  page,
}) => {
  const email = `${RUN}-newcomer@example.com`;
  const { ref } = await book(page, { name: "Newcomer", email, phone: "50 000 0006" });
  await createUser(RUN, "newcomer"); // signs up later with that email
  const db = await signedIn(email);
  const { data: account } = await db.rpc("create_my_account", {
    p_type: "individual",
    p_name: "Newcomer",
  });
  const { data: claim } = await db.rpc("claim_my_bookings", { p_account: account });
  expect(claim.claimed).toContain(ref);
});
