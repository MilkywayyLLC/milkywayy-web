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

test("tabs follow the account's services and the person's role", async ({ page }) => {
  await signInUI(page, e.owner);
  await expect(page).toHaveURL(/\/portal$/);
  await expect(rail(page).getByRole("link")).toHaveText([
    "Home",
    "Shoots",
    "Editing",
    "Listings",
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
  await sheet.getByLabel("Name").fill("Ivy Invitee");
  await sheet.getByRole("button", { name: "Email" }).click();
  await sheet.getByLabel("Their email").fill(`${RUN}-ivy@example.com`);
  await sheet.getByRole("button", { name: "Invite", exact: true }).click();
  const share = page.getByRole("dialog", { name: "Send the invite" });
  await expect(share).toContainText("Ivy Invitee is invited");
  await expect(share).toContainText("you’ve been added to Shell Homes");
  await expect(share.getByRole("link", { name: "Send by email" })).toHaveAttribute(
    "href",
    new RegExp(`^mailto:${RUN}-ivy@example.com`),
  );
  await share.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("invites")).toContainText("Ivy Invitee");
  // A fresh load with an invite pending renders on the server too.
  const fresh = await page.reload();
  expect(fresh?.status()).toBe(200);
  await expect(
    page.getByTestId("invites").getByRole("link", { name: "Send by email" }),
  ).toHaveAttribute("href", /portal%2Flogin/);
  await page.getByTestId("invites").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("invites")).toHaveCount(0);

  await page.getByRole("combobox", { name: "Role for Max Member" }).selectOption("admin");
  await expect(page.getByRole("status")).toContainText("Role updated.");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Role for Max Member" })).toHaveValue("admin");
  await page.getByRole("combobox", { name: "Role for Max Member" }).selectOption("member");

  await page.getByRole("radio", { name: /All company projects/ }).check({ force: true });
  await expect(page.getByRole("status")).toContainText("Saved.");
  await page.reload();
  await expect(page.getByRole("radio", { name: /All company projects/ })).toBeChecked();
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
    "Listings",
    "Contacts",
    "Settings",
  ]);
  await page.goto("/portal/shoots");
  await expect(page.getByTestId("shoots")).toContainText("Marina Gate 1"); // visibility: all
  await expect(page.getByTestId("shoots")).not.toContainText("AED");
  await page.goto("/portal/billing");
  await expect(page.getByText("Billing is for the account’s owner and admins")).toBeVisible();
  await page.goto("/portal/team");
  await expect(
    page.getByText("The team is managed by the account’s owner and admins"),
  ).toBeVisible();
  // A forged account cookie is ignored: you only ever see accounts you belong to.
  await page
    .context()
    .addCookies([
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
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /profile menu/ })).toHaveText("OO");

  const delivered = page.getByRole("checkbox", { name: "Files ready to download by WhatsApp" });
  await expect(delivered).toBeChecked();
  await delivered.uncheck();
  await page.getByRole("button", { name: "Save notifications" }).click();
  await expect(page.getByText("Notification settings saved.")).toBeVisible();

  await page.getByLabel("TRN (optional)").fill("12345");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("15 digits");
  await page.getByLabel("TRN (optional)").fill("100 4821 3399 0003");
  await page.getByLabel("Billing address (optional)").fill("Office 1204, Bay Square 7, Dubai");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Company details saved.")).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Files ready to download by WhatsApp" }),
  ).not.toBeChecked();
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
    await expect(bar.getByRole("link")).toHaveText(["Home", "Shoots", "Editing", "Listings"]);
    await bar.getByRole("button", { name: "More" }).click();
    const more = page.getByRole("dialog", { name: "More" });
    await expect(more.getByRole("link")).toHaveText(["Billing", "Team", "Contacts", "Settings"]);
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
