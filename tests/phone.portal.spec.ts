import { expect, test } from "@playwright/test";
import {
  addPhoneBooking,
  cleanup,
  cleanupPhone,
  createUser,
  hasPortal,
  newRun,
  phoneSignInOn,
  portalClient,
  signedIn,
  TEST_CODE,
  TEST_PHONE,
} from "./helpers/portal";

/**
 * WhatsApp sign-in (step 3) with Supabase's test number, which accepts 123456 and never reaches
 * Twilio. One number, so this file runs in order and owns it. Real numbers are tested by hand.
 */
test.skip(
  !hasPortal,
  "Portal Supabase env (NEXT_PUBLIC_PORTAL_SUPABASE_*, E2E_PORTAL_SECRET) not set",
);
test.skip(!phoneSignInOn, "Phone sign-in is switched off (NEXT_PUBLIC_PORTAL_PHONE_SIGNIN)");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
let ref: string;

test.beforeAll(async () => {
  await cleanupPhone();
  ref = await addPhoneBooking();
});
test.afterAll(async () => {
  await cleanupPhone();
  await cleanup(RUN);
});

test("a number that can't be right is caught before anything is sent", async ({ page }) => {
  await page.goto("/portal/login");
  await page.getByRole("textbox", { name: "Your WhatsApp number" }).fill("12");
  await page.getByRole("button", { name: "Send code on WhatsApp" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Enter your WhatsApp number");
});

test("WhatsApp code → wrong code → SMS instead → in, with the booking made with that number", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/portal/login");
  // WhatsApp is the default; the UAE code is preselected, so the local number is enough.
  await expect(page.getByRole("button", { name: "WhatsApp", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("textbox", { name: "Your WhatsApp number" }).fill("050 000 0001");
  await page.getByRole("button", { name: "Send code on WhatsApp" }).click();
  await expect(page.getByText("Enter the 6-digit code we sent by WhatsApp to")).toBeVisible();
  await expect(page.getByText("+971 50 000 0001")).toBeVisible();
  await expect(page.getByLabel("Code")).toBeFocused();

  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("isn’t right or has expired");

  // Resend options appear after the countdown (Supabase also spaces sends a few seconds apart).
  await expect(page.getByRole("button", { name: "Send by SMS instead" })).toHaveCount(0);
  await page.waitForTimeout(6_000);
  await page.clock.fastForward("00:31");
  await page.getByRole("button", { name: "Send by SMS instead" }).click();
  await expect(page.getByRole("status")).toContainText("New code sent by SMS.");
  await expect(page.getByText("we sent by SMS to")).toBeVisible();
  await expect(page.locator("p[role=alert]")).toHaveCount(0); // the old "wrong code" is gone

  await page.getByLabel("Code").fill(TEST_CODE);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/portal\/welcome$/);
  await expect(page.getByRole("status")).toContainText(
    "We found 1 earlier booking with +971 50 000 0001",
  );

  await page.getByRole("radio", { name: /^Individual/ }).check({ force: true });
  await page.getByLabel("Your name").fill("Omar Phone");
  await page.getByRole("checkbox", { name: /^Property shoots/ }).check({ force: true });
  await page.getByRole("button", { name: "Go to my portal" }).click();
  await expect(page).toHaveURL(/\/portal\?claimed=1$/);
  await expect(page.locator("main")).toContainText(ref);
  await expect(page.locator("main")).toContainText("Savannah");
  await expect(page.getByText("+971 50 000 0001").first()).toBeVisible();
});

test("an invite sent to a number is accepted when that number signs in", async () => {
  const owner = await signedIn(await createUser(RUN, "owner"));
  const team = (
    await owner.rpc("create_my_account", {
      p_type: "company",
      p_name: "Team Co",
      p_industry: "agency",
    })
  ).data;
  expect(
    (await owner.from("account_invites").insert({ account_id: team, phone_e164: TEST_PHONE }))
      .error,
  ).toBeNull();

  const phone = portalClient();
  // Supabase spaces codes to one number a few seconds apart; the previous test just sent one.
  for (let i = 0; i < 10; i++) {
    const { error } = await phone.auth.signInWithOtp({ phone: TEST_PHONE });
    if (!error) break;
    expect(error.code).toBe("over_sms_send_rate_limit");
    await new Promise((r) => setTimeout(r, 2_000));
  }
  expect(
    (await phone.auth.verifyOtp({ phone: TEST_PHONE, token: TEST_CODE, type: "sms" })).error,
  ).toBeNull();
  expect((await phone.rpc("accept_my_invites")).data).toBe(1);
  const names = (await phone.from("accounts").select("name")).data?.map((a) => a.name);
  expect(names).toContain("Team Co");
  // Their own booking stays in their own account, not the one they joined.
  const team_bookings = (await owner.rpc("account_bookings", { p_account: team })).data;
  expect(team_bookings).toEqual([]);
});
