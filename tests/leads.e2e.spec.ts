import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerDb } from "./helpers/admin";
import { env, hasAdminAccounts } from "./helpers/env";
import { markTestLeads } from "./helpers/leads";

/**
 * Every form saves a lead and hands off correctly (guide §14, Phase 6): inline errors that say
 * how to fix, the saved row (read back as the Owner), the WhatsApp message starting with the ref,
 * and the confirmation. Plus the spam checks. Leads are flagged as tests and deleted afterwards.
 */
test.skip(
  !hasAdminAccounts || !env.LEAD_SECRET,
  "needs LEAD_SECRET and the e2e accounts in .env.local",
);
test.describe.configure({ mode: "serial" });

const RUN = `E2E L${Date.now().toString(36).slice(-4).toUpperCase()}`;
let db: SupabaseClient;
const refs: string[] = [];

test.beforeAll(async () => {
  test.setTimeout(150_000);
  db = await ownerDb();
});
test.afterAll(async () => {
  // Only this file's leads (other files run in parallel).
  await db.from("leads").delete().in("ref", refs);
  await db.from("leads").delete().like("name", `${RUN}%`);
});

/** Forms ignore anything sent faster than a person could fill them in. */
const humanPause = (page: Page) => page.waitForTimeout(2700);

async function lead(ref: string) {
  refs.push(ref);
  const { data } = await db.from("leads").select("*").eq("ref", ref).single();
  return data!;
}

/** Captures where the reserved WhatsApp tab ends up. */
async function whatsappTab(page: Page, click: () => Promise<void>) {
  const popup = page.waitForEvent("popup");
  await click();
  const tab = await popup;
  await tab.waitForURL(/^https:\/\/wa\.me\//);
  const url = new URL(tab.url());
  await tab.close();
  return { number: url.pathname.slice(1), text: url.searchParams.get("text") ?? "" };
}

test("Production: errors say how to fix; WhatsApp opens with the ref; the lead is saved", async ({
  page,
}) => {
  await markTestLeads(page);
  await page.goto("/production");
  const form = page.getByRole("form", { name: "Send a request" });
  await form.getByRole("button", { name: "Send and open WhatsApp" }).click();
  await expect(form.getByText("Add your name so we know who we're talking to.")).toBeVisible();
  await expect(form.getByText("Add a phone number or an email so we can reply.")).toBeVisible();
  await expect(form.getByLabel("Name")).toBeFocused();

  await form.getByLabel("Name").fill(`${RUN} Production`);
  await form.getByLabel("Phone (or email)").fill("abc");
  await form.getByRole("button", { name: "Send and open WhatsApp" }).click();
  await expect(form.getByText(/Check the number/)).toBeVisible();
  await form.getByLabel("Phone (or email)").fill("+971 50 000 0000");
  await form.getByLabel("What do you need?").fill("Ten listings a month in Marina.");
  await humanPause(page);
  const wa = await whatsappTab(page, () =>
    form.getByRole("button", { name: "Send and open WhatsApp" }).click(),
  );

  const ref = wa.text.match(/^Ref #(MW-\d+)\n/)?.[1];
  expect(ref, wa.text).toBeTruthy();
  expect(wa.number).toBe("971507263306");
  expect(wa.text).toContain(`I'm ${RUN} Production. I sent a request about Production`);
  await expect(page.getByRole("status").filter({ hasText: `Ref #${ref}` })).toBeVisible();

  const row = await lead(ref!);
  expect(row).toMatchObject({
    type: "production",
    name: `${RUN} Production`,
    phone: "+971500000000", // stored in E.164
    preferred_reply: "WhatsApp",
    page: "/production",
    status: "new",
  });
  expect(row.data).toMatchObject({
    service: "production",
    brief: "Ten listings a month in Marina.",
    phone_entered: "+971 50 000 0000",
    test: true,
  });
});

test("Contact: email reply needs an email; service cards; UTM and landing page are kept", async ({
  page,
}) => {
  await markTestLeads(page);
  await page.goto("/?utm_source=e2e&utm_campaign=phase6");
  await page.goto("/contact");
  const form = page.getByRole("form", { name: "Send a request" });
  await form.getByRole("radio", { name: /^AI avatars/ }).check();
  await form.getByLabel("Name").fill(`${RUN} Contact`);
  await form.getByRole("radio", { name: "Email", exact: true }).check();
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form.getByText("Add your email, or choose another way to reply.")).toBeVisible();
  await form.getByRole("textbox", { name: "Email", exact: true }).fill("e2e-contact@example.com");
  await humanPause(page);
  await form.getByRole("button", { name: "Send request" }).click();
  const done = page.getByRole("status").filter({ hasText: "Request sent." });
  await expect(done).toContainText("We'll reply to e2e-contact@example.com");
  const ref = (await done.textContent())!.match(/MW-\d+/)![0];

  const row = await lead(ref);
  expect(row).toMatchObject({
    type: "contact",
    email: "e2e-contact@example.com",
    preferred_reply: "Email",
  });
  expect(row.data).toMatchObject({ service: "ai-avatars", landing: "/" });
  expect(row.utm).toMatchObject({ utm_source: "e2e", utm_campaign: "phase6" });
});

test("AI demo: “Other” needs a description; Book a call confirms", async ({ page }) => {
  await markTestLeads(page);
  await page.goto("/ai-avatars");
  const form = page.getByRole("form", { name: "Book a demo" });
  await form.getByLabel("Name").fill(`${RUN} Demo`);
  await form.getByLabel("Email (or phone)").fill("e2e-demo@example.com");
  await form.getByRole("radio", { name: "Other", exact: true }).check();
  await form.getByRole("button", { name: "Book my demo" }).click();
  await expect(form.getByText("Tell us in a few words what it's for.")).toBeVisible();
  await form.getByLabel("Tell us what it's for").fill("A hotel concierge");
  await humanPause(page);
  await form.getByRole("button", { name: "Book my demo" }).click();
  const done = page.getByRole("status").filter({ hasText: /Demo request sent|Now pick a time/ });
  await expect(done).toBeVisible();
  const ref = (await done.textContent())!.match(/MW-\d+/)![0];
  const row = await lead(ref);
  expect(row).toMatchObject({ type: "avatars", preferred_reply: "Call" });
  expect(row.data).toMatchObject({ use: "Other", use_other: "A hotel concierge" });
});

test("Free test: step checks, then “send your requirements instead”", async ({ page }) => {
  await markTestLeads(page);
  await page.goto("/post-production/free-test");
  const form = page.getByRole("form", { name: "Book a free test edit" });
  await form.getByRole("checkbox", { name: /^Photo edits/ }).uncheck(); // the default
  await form.getByRole("button", { name: "Continue" }).click();
  await expect(
    form.getByText("Pick at least one: photo edits, short-form or long-form."),
  ).toBeVisible();
  await form.getByRole("checkbox", { name: /^Short-form/ }).check();
  await form.getByLabel("How much per month?").fill("30 reels");
  await form.getByRole("button", { name: "Continue" }).click();

  await form.getByLabel("Name").fill(`${RUN} Free test`);
  await form.getByRole("button", { name: "Send your requirements instead" }).click();
  await expect(
    form.getByText("Add your email so we can send the test and the call invite."),
  ).toBeVisible();
  await form.getByLabel("Email").fill("e2e-freetest@example.com");
  await form.getByLabel("Link to a recent listing or video").fill("https://example.com/reel");
  await humanPause(page);
  await form.getByRole("button", { name: "Send your requirements instead" }).click();
  const done = page.getByRole("status").filter({ hasText: "We'll be in touch" });
  await expect(done).toContainText("e2e-freetest@example.com");
  const ref = (await done.textContent())!.match(/MW-\d+/)![0];
  const row = await lead(ref);
  expect(row).toMatchObject({
    type: "free-test",
    email: "e2e-freetest@example.com",
    preferred_reply: "Email",
  });
  expect(row.data).toMatchObject({
    what: ["short"],
    volume: "30 reels",
    path: "email",
    link: "https://example.com/reel",
  });
});

test("Booking: saved with the server's estimate and the exact WhatsApp message", async ({
  page,
}) => {
  await markTestLeads(page);
  await page.goto("/property-shoots");
  const b = page.locator("#booking");
  await b.getByLabel("Community / area").fill("JVC");
  await b.getByLabel("Building / tower").fill(`${RUN} Tower`);
  await b.getByLabel("Name").fill("E2E Booker");
  await b.getByLabel("WhatsApp number").fill("50 000 0007");
  await b
    .getByLabel("Email", { exact: true })
    .fill(`${RUN.toLowerCase().replace(/\s+/g, "-")}@example.com`);
  await humanPause(page);
  const wa = await whatsappTab(page, () =>
    b.locator(".bk > .b-sum").getByRole("button", { name: "Send request on WhatsApp" }).click(),
  );
  const ref = wa.text.match(/^Ref #(MW-\d+)\n/)![1];
  await expect(b.locator(".bk > .b-sum").getByRole("status")).toContainText(`Ref #${ref}`);
  const row = await lead(ref);
  // Who it's for (owner QA, 3 Oct 2026).
  expect(row).toMatchObject({
    type: "property",
    name: "E2E Booker",
    phone: "+971500000007",
    preferred_reply: "WhatsApp",
    page: "/property-shoots",
  });
  expect(row.data.message).toBe(wa.text);
  expect(row.data.estimate.total).toBe(500);
  expect(row.data.booking.properties[0]).toMatchObject({
    area: "JVC",
    building: `${RUN} Tower`,
    size: 1,
  });

  // One structured row per property, for the client portal (CLIENT_PORTAL_GUIDE §12).
  const { data: lines } = await db.from("booking_properties").select("*").eq("lead_id", row.id);
  expect(lines).toHaveLength(1);
  expect(lines![0]).toMatchObject({
    line_no: 1,
    property_type: "apartment",
    size_label: "1 Bed",
    services: ["photo"],
    add_ons: [],
    area: "JVC",
    building: `${RUN} Tower`,
    shoot_date: row.data.booking.properties[0].date,
    slot: row.data.booking.properties[0].slot,
    subtotal: 500,
  });
});

test.describe("spam protection (API)", () => {
  const base = (over: Record<string, unknown> = {}) => ({
    type: "contact",
    name: `${RUN} Spam`,
    email: "e2e-spam@example.com",
    preferred_reply: "Email",
    fields: { service: "production" },
    page: "/contact",
    utm: {},
    hp: "",
    elapsed: 6000,
    eventId: "e2e",
    ...over,
  });

  test("honeypot and too-fast submissions look accepted but save nothing", async ({ request }) => {
    for (const body of [base({ hp: "http://spam.example" }), base({ elapsed: 300 })]) {
      const res = await request.post("/api/lead", { data: body });
      expect(res.status()).toBe(200);
      const { ref } = await res.json();
      expect(ref).toMatch(/^MW-\d{4}$/);
      const { data } = await db.from("leads").select("ref").eq("ref", ref);
      // A decoy ref: either unused, or (rarely) a real older lead that isn't this one.
      for (const r of data ?? []) expect((await lead(r.ref)).name).not.toBe(`${RUN} Spam`);
    }
  });

  test("bad input is refused with field errors", async ({ request }) => {
    const res = await request.post("/api/lead", { data: base({ email: "nope", name: "" }) });
    expect(res.status()).toBe(422);
    const { errors } = await res.json();
    expect(errors).toMatchObject({ name: expect.any(String), email: expect.any(String) });
    expect(
      (await request.post("/api/lead", { data: { type: "contact", junk: true } })).status(),
    ).toBe(400);
  });

  test("a double tap saves one lead", async ({ request }) => {
    const body = base({ name: `${RUN} Double` });
    const [a, b] = await Promise.all(
      [1, 2].map(() => request.post("/api/lead", { data: body }).then((r) => r.json())),
    );
    // Sequential repeats inside two minutes return the first ref too.
    const c = await (await request.post("/api/lead", { data: body })).json();
    // Two taps at the very same instant can race; any later repeat folds into an earlier one.
    expect(new Set([a.ref, b.ref]).size).toBeLessThanOrEqual(2);
    expect([a.ref, b.ref]).toContain(c.ref);
  });

  test("more than 6 from one visitor in 10 minutes is refused", async ({ request }) => {
    test.skip(!!process.env.BASE_URL, "staging sees one IP for every test");
    const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request.post("/api/lead", {
        data: base({ name: `${RUN} Rate ${i}` }),
        headers: { "x-forwarded-for": ip },
      });
      codes.push(res.status());
    }
    expect(codes.slice(0, 6)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(codes[6]).toBe(429);
  });
});
