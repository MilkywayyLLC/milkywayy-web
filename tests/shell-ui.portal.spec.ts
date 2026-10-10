import { expect, test, type Page } from "@playwright/test";
import {
  addBooking,
  cleanup,
  createUser,
  hasPortal,
  newRun,
  signedIn,
  signInUI,
} from "./helpers/portal";

/** The real portal shell (step 4), wired to the database, on desktop and phone. */
test.skip(!hasPortal, "Portal Supabase env not set");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
const e: Record<string, string> = {};
let acme = "";

test.beforeAll(async () => {
  for (const n of ["owner", "member", "solo"]) e[n] = await createUser(RUN, n);
  await addBooking(e.owner);
  const O = await signedIn(e.owner);
  acme = (
    await O.rpc("create_my_account", {
      p_type: "company",
      p_name: "Shell Homes",
      p_full_name: "Olivia Owner",
      p_industry: "real-estate-brokerage",
      p_services: ["shoots", "post"],
    })
  ).data;
  await O.rpc("claim_my_bookings", { p_account: acme });
  await O.from("account_invites").insert({ account_id: acme, email: e.member, name: "Max Member" });
  const M = await signedIn(e.member);
  await M.rpc("accept_my_invites");
  await M.rpc("create_my_account", {
    p_type: "individual",
    p_name: "Max Solo",
    p_services: ["avatars"],
  });
});
test.afterAll(async () => {
  await cleanup(RUN);
});

const rail = (page: Page) => page.getByRole("navigation", { name: "Portal sections" });

test("tabs: every service and Listings for everyone; Billing and Team for the owner", async ({
  page,
}) => {
  await signInUI(page, e.owner);
  await expect(page).toHaveURL(/\/portal$/);
  await expect(rail(page).getByRole("link")).toHaveText([
    "Home",
    "Shoots",
    "Editing",
    "Avatars",
    "Listings",
    "Inquiries",
    "Billing",
    "Team",
    "Contacts",
    "Settings",
  ]);
  await expect(page.locator(".pt-plan")).toHaveText("Pay as you go");
  await expect(page.getByRole("button", { name: /Olivia Owner: profile menu/ })).toHaveText("OO");
  await rail(page).getByRole("link", { name: "Shoots" }).click();
  await expect(page.getByTestId("shoots")).toContainText("Marina Gate 1");
  await expect(page.getByTestId("shoots")).toContainText("AED 1,050");
});

test("Team: invite by email, share it, cancel; change a role; set what members see", async ({
  page,
}) => {
  await signInUI(page, e.owner);
  await page.goto("/portal/team");
  await expect(page.getByTestId("members")).toContainText("Olivia Owner (you)");
  await expect(page.getByTestId("members")).toContainText("Max Member");

  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: /Invite someone/ });
  // Nothing sent until the required fields are filled in (owner, 10 Oct 2026).
  await sheet.getByRole("button", { name: "Send invite" }).click();
  await expect(sheet.getByText("Please fix the highlighted fields")).toBeVisible();
  await sheet.getByLabel("Full name").fill("Ivy Invitee");
  await sheet.getByLabel("Email", { exact: true }).fill(`${RUN}-ivy@example.com`);
  await sheet.getByRole("radio", { name: /Finance/ }).check({ force: true });
  await sheet.getByRole("button", { name: "Send invite" }).click();
  const sent = page.getByRole("dialog", { name: "Invite sent" });
  await expect(sent).toContainText("Ivy Invitee is invited");
  // No phone given: no WhatsApp option.
  await expect(sent.getByRole("link", { name: "Send on WhatsApp" })).toHaveCount(0);
  await sent.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("invites")).toContainText("Ivy Invitee");
  await expect(page.getByTestId("invites")).toContainText("Finance");
  await expect(page.getByTestId("invites")).toContainText("expires");
  // A fresh load with an invite pending renders on the server too.
  const fresh = await page.reload();
  expect(fresh?.status()).toBe(200);
  await expect(page.getByTestId("invites").getByRole("button", { name: "Resend" })).toBeVisible();
  await page.getByTestId("invites").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("invites")).toHaveCount(0);

  // Per-member access: Admin, then back to Production.
  await page.getByRole("button", { name: "Access for Max Member" }).click();
  let acc = page.getByRole("dialog", { name: /Access: Max Member/ });
  await acc.getByRole("radio", { name: /^Admin/ }).check({ force: true });
  await acc.getByRole("button", { name: "Save access" }).click();
  await expect(page.getByRole("status")).toContainText("Access updated.");
  await page.reload();
  await expect(page.getByTestId("members")).toContainText("Admin");
  await page.getByRole("button", { name: "Access for Max Member" }).click();
  acc = page.getByRole("dialog", { name: /Access: Max Member/ });
  await acc.getByRole("radio", { name: /^Production/ }).check({ force: true });
  await acc.getByRole("button", { name: "Save access" }).click();
  await expect(page.getByRole("status")).toContainText("Access updated.");
});

test("a member sees fewer tabs, no prices, and switches accounts", async ({ page }) => {
  await signInUI(page, e.member);
  // Their own account comes first (Owner), so switch to the company.
  await page.getByRole("button", { name: /Switch account/ }).click();
  await page.getByRole("menuitemradio", { name: /Shell Homes/ }).click();
  await expect(page.getByRole("button", { name: /Account: Shell Homes/ })).toBeVisible();
  await expect(rail(page).getByRole("link")).toHaveText([
    "Home",
    "Shoots",
    "Editing",
    "Avatars",
    "Listings",
    "Inquiries",
    "Contacts",
    "Settings",
  ]);
  await page.goto("/portal/shoots");
  await expect(page.getByTestId("shoots")).toContainText("Marina Gate 1"); // visibility: all
  await expect(page.getByTestId("shoots")).not.toContainText("AED");
  await page.goto("/portal/team");
  await expect(page.getByText("Your access doesn’t include managing the team")).toBeVisible();
  // A forged account cookie is ignored: you only ever see accounts you belong to.
  await page.context().addCookies([
    {
      name: "mw-portal-account",
      value: "00000000-0000-0000-0000-000000000000",
      url: new URL(page.url()).origin,
    },
  ]);
  await page.goto("/portal");
  await expect(page.getByRole("button", { name: /Account: Max Solo/ })).toBeVisible();
});

test("Contacts: add, default moves, edit, remove", async ({ page }) => {
  await signInUI(page, e.owner);
  await page.goto("/portal/contacts");
  const add = async (name: string, phone: string) => {
    await page.getByRole("button", { name: "Add contact" }).click();
    const s = page.getByRole("dialog", { name: "Add contact" });
    await s.getByLabel("Name").fill(name);
    await s.getByRole("textbox", { name: "WhatsApp (optional)" }).fill(phone);
    await s.getByLabel("RERA / BRN number (optional)").fill("BRN 1234");
    await s.getByRole("checkbox", { name: "Default contact" }).check();
    await s.getByRole("button", { name: "Save contact" }).click();
    await expect(s).toHaveCount(0);
  };
  await add("Karim Agent", "052 660 1184");
  await expect(page.getByTestId("contacts")).toContainText("+971526601184");
  await add("Leila Agent", "056 902 7745");
  await expect(page.getByTestId("pills").locator('[aria-pressed="true"]')).toHaveText(
    /Leila Agent/,
  );
  await page
    .getByTestId("contacts")
    .locator(".pt-row", { hasText: "Karim Agent" })
    .getByRole("button", { name: "Edit" })
    .click();
  const edit = page.getByRole("dialog", { name: "Edit contact" });
  await expect(edit.getByRole("textbox", { name: "WhatsApp (optional)" })).toHaveValue("526601184");
  await edit.getByLabel("Role (optional)").fill("Sales agent");
  await edit.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByTestId("contacts")).toContainText("Sales agent");
  await page
    .getByTestId("contacts")
    .locator(".pt-row", { hasText: "Karim Agent" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(page.getByTestId("contacts")).not.toContainText("Karim Agent");
});

test("Settings: name, notifications and company details save; bad TRN is refused", async ({
  page,
}) => {
  await signInUI(page, e.owner);
  await page.goto("/portal/settings");
  await page.getByLabel("Your name").fill("Olivia Ortega");
  // An optional WhatsApp number (owner QA, 3 Oct 2026): checked, saved as +971…
  await page.getByLabel("WhatsApp number (optional)").fill("12");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Check the WhatsApp number");
  await page.getByLabel("WhatsApp number (optional)").fill("50 000 0008");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /profile menu/ })).toHaveText("OO");
  await page.reload();
  await expect(page.getByLabel("WhatsApp number (optional)")).toHaveValue("500000008");

  const delivered = page.getByRole("checkbox", { name: "Files ready to download" });
  await expect(delivered).toBeChecked();
  await delivered.uncheck();
  await page.getByRole("button", { name: "Save email settings" }).click();
  await expect(page.getByText("Email settings saved.")).toBeVisible();

  // Extra recipients per category (Owner/Admin): bad addresses are refused.
  await page.getByLabel("Billing: also send to").fill("accounts@shellhomes, finance@");
  await page.getByRole("button", { name: "Save recipients" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("isn’t a full email address");
  await page
    .getByLabel("Billing: also send to")
    .fill("accounts@shellhomes.example, Finance@shellhomes.example");
  await page.getByRole("button", { name: "Save recipients" }).click();
  await expect(page.getByText("Extra recipients saved.")).toBeVisible();

  // The optional password.
  await page.getByLabel("Password (optional)").fill("short");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(/at least 8 characters/i);
  // Supabase checks it against the current one (later tests sign in with it, so it stays).
  await page.getByLabel("Password (optional)").fill("Portal-e2e-pass-2026");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("That’s your current password");

  await page.getByLabel("TRN (optional)").fill("12345");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator("section[aria-labelledby=co] p[role=alert]")).toContainText(
    "15 digits",
  );
  await page.getByLabel("TRN (optional)").fill("100 4821 3399 0003");
  await page.getByLabel("Billing address (optional)").fill("Office 1204, Bay Square 7, Dubai");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Company details saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Files ready to download" })).not.toBeChecked();
  await expect(page.getByLabel("Billing: also send to")).toHaveValue(
    "accounts@shellhomes.example, finance@shellhomes.example",
  );
  await expect(page.getByLabel("TRN (optional)")).toHaveValue("100482133990003");
  await expect(page.getByText("Billing currency: AED")).toBeVisible();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("bottom bar with 4 tabs, the rest under More, nothing sideways @mobile", async ({
    page,
  }) => {
    await signInUI(page, e.owner);
    const bar = page.getByRole("navigation", { name: "Portal tabs" });
    await expect(bar.getByRole("link")).toHaveText(["Home", "Shoots", "Editing", "Avatars"]);
    await bar.getByRole("button", { name: "More" }).click();
    const more = page.getByRole("dialog", { name: "More" });
    await expect(more.getByRole("link")).toHaveText([
      "Listings",
      "Inquiries",
      "Billing",
      "Team",
      "Contacts",
      "Settings",
    ]);
    await more.getByRole("link", { name: "Team" }).click();
    await expect(page).toHaveURL(/\/portal\/team$/);
    for (const path of [
      "/portal",
      "/portal/team",
      "/portal/contacts",
      "/portal/settings",
      "/portal/shoots",
    ]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
