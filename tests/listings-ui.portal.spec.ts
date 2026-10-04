import { expect, test, type Browser } from "@playwright/test";
import {
  adminRpc,
  cleanup,
  clientAccount,
  createUser,
  deliveredShoot,
  hasPortalAdmin,
  newRun,
  PHONE_UA,
  signedIn,
  signInUI,
} from "./helpers/portal";

/**
 * Share pages end to end (Phase 13): made from a delivered shoot in the portal, opened in public,
 * paused/expired/turned off, counted without bots, and made by a Member who never sees our prices.
 */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
let c: Awaited<ReturnType<typeof clientAccount>>;
let shoot: Awaited<ReturnType<typeof deliveredShoot>>;
let member = "";
let slug = "";
let listingId = "";
const ok = async <T = unknown>(
  p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};
const stats = async () => {
  const rows = await ok<{ views: number; wa_taps: number; call_taps: number }[]>(
    c.db.from("share_stats").select("views, wa_taps, call_taps").eq("listing_id", listingId),
  );
  return rows.reduce(
    (t, r) => ({ views: t.views + r.views, wa: t.wa + r.wa_taps, call: t.call + r.call_taps }),
    { views: 0, wa: 0, call: 0 },
  );
};
const visitor = (browser: Browser, userAgent = PHONE_UA) =>
  browser.newContext({ userAgent, viewport: { width: 390, height: 844 } });

test.beforeAll(async () => {
  c = await clientAccount(RUN, "owner", "Harbourline Homes");
  // Booked at AED 1,234 (an estimate): only the Owner/Admins may ever see that number.
  shoot = await deliveredShoot(c.account, "3 Bed apartment, Burj Vista 1", 3, { p_price: 1234 });
  await ok(
    c.db.from("contacts").insert({
      account_id: c.account,
      name: "Rania Haddad",
      role: "Sales agent",
      whatsapp: "+971501234567",
      brn: "47720",
      is_default: true,
    }),
  );
  member = await createUser(RUN, "member");
  await ok(
    c.db.from("account_invites").insert({ account_id: c.account, email: member, name: "Mia" }),
  );
  await ok((await signedIn(member)).rpc("accept_my_invites"));
  await ok(c.db.from("accounts").update({ member_visibility: "all" }).eq("id", c.account));
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("from a delivered shoot: create the link; the public page shows the chosen photos, price, agent and previews", async ({
  page,
}) => {
  await signInUI(page, c.email);
  await page.goto(`/portal/shoots/${shoot.ref}`);
  await page.getByRole("link", { name: "Create share link" }).click();
  const form = page.getByRole("form", { name: "Create share link" });
  await expect(form).toContainText(shoot.ref);
  await expect(form.getByLabel("Location")).toHaveValue("Burj Vista 1, Downtown Dubai");
  await form.getByLabel("Title *").fill("Sky-high 3 bed penthouse");
  await form.getByLabel("Price * (AED)").fill("6,950,000");
  await form.getByLabel("Bedrooms").fill("3");
  await form.getByLabel("Bathrooms").fill("4");
  await form.getByLabel("Size (sq ft)").fill("2,410");
  await form.getByLabel("Add a highlight").fill("Burj Khalifa view");
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    form.getByText("Required by DLD for property adverts. Check your permit."),
  ).toBeVisible();
  await form.getByLabel("Permit number (Trakheesi)").fill("7120345678");
  // The default contact is picked; leave photo 2 out.
  await expect(form.getByRole("button", { name: /Rania Haddad/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await form.getByRole("button", { name: "Photo 2: IMG_2.jpg" }).click();
  await expect(form).toContainText("(2 of 3)");
  await form.getByRole("button", { name: "Create link" }).click();
  const done = page.getByTestId("share-done");
  await expect(done).toContainText("Link ready");
  const link = (await done.locator(".pt-link-box").textContent()) ?? "";
  slug = link.split("/l/")[1];
  expect(slug).toMatch(/^sky-high-3-bed-penthouse-[0-9a-f]{4}$/);
  listingId = (await ok<{ id: string }[]>(c.db.from("listings").select("id").eq("slug", slug)))[0]
    .id;

  // The public page, signed out.
  const pub = await page.context().browser()!.newPage({ userAgent: PHONE_UA });
  const res = await pub.goto(`/l/${slug}`);
  expect(res?.status()).toBe(200);
  await expect(pub.getByRole("heading", { level: 1 })).toHaveText("Sky-high 3 bed penthouse");
  await expect(pub.getByText("AED 6,950,000", { exact: true })).toBeVisible();
  await expect(pub.getByRole("list", { name: "Key facts" })).toContainText("3 Bed");
  await expect(pub.getByRole("list", { name: "Key facts" })).toContainText("2,410 sq ft");
  await expect(pub.getByText("1 / 2 · View all")).toBeVisible();
  await expect(pub.getByRole("button", { name: "Photo 2 of 2" })).toBeVisible();
  await expect(pub.getByLabel("DLD advertising permit")).toContainText("7120345678");
  const agent = pub.getByRole("region", { name: "Ask about this home" });
  await expect(agent).toContainText("Rania Haddad");
  await expect(agent).toContainText("BRN 47720");
  const wa = agent.getByRole("link", { name: "WhatsApp Rania Haddad" });
  const href = (await wa.getAttribute("href")) ?? "";
  expect(href).toMatch(/^https:\/\/wa\.me\/971501234567\?text=/);
  expect(decodeURIComponent(href.split("text=")[1])).toBe(
    `Hi, I’m interested in Sky-high 3 bed penthouse (${new URL(pub.url()).origin}/l/${slug})`,
  );
  await expect(agent.getByRole("link", { name: "Call Rania Haddad" })).toHaveAttribute(
    "href",
    "tel:+971501234567",
  );
  await expect(pub.getByText("Media & page by Milkywayy")).toBeVisible();
  // Rich previews in WhatsApp, and never indexed.
  await expect(pub.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Sky-high 3 bed penthouse",
  );
  await expect(pub.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    new RegExp(`/l/${slug}/og\\.jpg$`),
  );
  await expect(pub.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    /AED 6,950,000 · 3 Bed · 4 Bath/,
  );
  await expect(pub.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const og = await pub.request.get(`/l/${slug}/og.jpg`);
  expect(og.ok()).toBe(true);
  // Nothing sideways on a phone.
  expect(await pub.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await pub.close();

  // The details were saved to the property: the next share starts filled in.
  await page.goto(`/portal/listings/new?shoot=${shoot.ref}`);
  await expect(page.getByLabel("Title *")).toHaveValue("Sky-high 3 bed penthouse");
});

test("views and WhatsApp/Call taps count for people, not bots", async ({ browser }) => {
  // The public visit in the test above already counted once; count from here.
  const base = await stats();
  const plus = async () => {
    const s = await stats();
    return { views: s.views - base.views, wa: s.wa - base.wa, call: s.call - base.call };
  };
  const person = await visitor(browser);
  const p = await person.newPage();
  await p.route("https://wa.me/**", (r) => r.abort());
  await p.goto(`/l/${slug}`);
  await expect.poll(plus).toMatchObject({ views: 1, wa: 0 });
  await p.reload();
  await p.getByRole("link", { name: "WhatsApp Rania Haddad" }).click();
  await expect.poll(plus).toMatchObject({ views: 1, wa: 1 });
  await p.evaluate(() => {
    // The Call link would hand off to the phone app; count the tap without leaving.
    const a = document.querySelector<HTMLAnchorElement>('#sh-contact a[href^="tel:"]')!;
    a.addEventListener("click", (e) => e.preventDefault(), { once: true });
    a.click();
  });
  await expect.poll(plus).toMatchObject({ views: 1, wa: 1, call: 1 });
  await person.close();

  // WhatsApp's own preview fetcher, a crawler, a headless browser: none of it counts.
  for (const ua of [
    "WhatsApp/2.24.6.77 A",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36",
  ]) {
    const bot = await visitor(browser, ua);
    const b = await bot.newPage();
    await b.route("https://wa.me/**", (r) => r.abort());
    await b.goto(`/l/${slug}`);
    await b.getByRole("link", { name: "WhatsApp Rania Haddad" }).click();
    const r = await b.request.post("/api/share/hit", {
      data: { kind: "l", slug, event: "wa" },
      headers: { "user-agent": ua },
    });
    expect(r.status()).toBe(204);
    await bot.close();
  }
  await new Promise((r) => setTimeout(r, 1500));
  expect(await plus()).toMatchObject({ views: 1, wa: 1, call: 1 });
});

test("paused, expired, turned off or unknown: a friendly page, not an error", async ({
  page,
  browser,
}) => {
  await signInUI(page, c.email);
  await page.goto("/portal/listings");
  const card = page.getByRole("article", { name: "Sky-high 3 bed penthouse" });
  await expect(card).toContainText("Live");
  await expect(card).toContainText("2views");
  await expect(card).toContainText("2WhatsApp/Call taps");
  await card.getByRole("button", { name: "Pause" }).click();
  await expect(card).toContainText("Paused");

  const v = await (await visitor(browser)).newPage();
  const gone = async (path: string) => {
    const res = await v.goto(path);
    expect(res?.status()).toBe(200);
    await expect(v.getByRole("heading", { level: 1 })).toHaveText(/isn’t available/);
    await expect(v.getByText("Media & page by Milkywayy")).toBeVisible();
  };
  await gone(`/l/${slug}`);

  await card.getByRole("button", { name: "Resume" }).click();
  await expect(card).toContainText("Live");
  // Expired yesterday.
  await ok(
    c.db.rpc("save_listing", {
      p_id: listingId,
      p_project: null,
      p: {
        ...(await ok<Record<string, unknown>[]>(
          c.db.from("projects").select("listing_defaults").eq("id", shoot.id),
        ).then((r) => r[0].listing_defaults as Record<string, unknown>)),
        expires_on: "2026-01-01",
      },
    }),
  );
  await gone(`/l/${slug}`);
  await page.reload();
  await expect(card).toContainText("Expired");

  // Back on, then turned off by Milkywayy with a reason the client sees.
  await page.goto(`/portal/listings/${listingId}`);
  await page.getByLabel("Expires on a date").uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("share-done")).toContainText("Saved");
  await ok(
    adminRpc("portal_admin_disable_share", {
      p_kind: "l",
      p_id: listingId,
      p_reason: "Permit number doesn't match",
    }),
  );
  await gone(`/l/${slug}`);
  await page.goto("/portal/listings");
  await expect(card).toContainText("Turned off by Milkywayy");
  await expect(card).toContainText("Permit number doesn't match");
  await expect(card.getByRole("button", { name: "Pause" })).toHaveCount(0);
  await ok(
    adminRpc("portal_admin_disable_share", { p_kind: "l", p_id: listingId, p_reason: null }),
  );

  await gone(`/l/nothing-here-${RUN.slice(-4)}`);
  await gone(`/c/nothing-here-${RUN.slice(-4)}`);

  await v.context().close();
});

test("a collection of listings on one link", async ({ page }) => {
  await signInUI(page, c.email);
  await page.goto("/portal/listings");
  await page.getByRole("link", { name: "+ New collection" }).click();
  const form = page.getByRole("form", { name: "New collection" });
  await form.getByLabel("Title *").fill("3 homes picked for the Khans");
  await form.getByRole("button", { name: "Create collection link" }).click();
  const link = (await page.getByTestId("share-done").locator(".pt-link-box").textContent()) ?? "";
  const pub = await page.context().browser()!.newPage({ userAgent: PHONE_UA });
  await pub.goto(`/c/${link.split("/c/")[1]}`);
  await expect(pub.getByRole("heading", { level: 1 })).toHaveText("3 homes picked for the Khans");
  await expect(pub.getByText("Picked by Rania Haddad · Harbourline Homes")).toBeVisible();
  await pub.getByRole("link", { name: /Sky-high 3 bed penthouse/ }).click();
  await expect(pub).toHaveURL(new RegExp(`/l/${slug}$`));
  await pub.close();
});

test("a Member makes a share page, but sees no prices of ours and no Billing", async ({ page }) => {
  await signInUI(page, member);
  const nav = page.getByRole("navigation", { name: "Portal sections" });
  await expect(nav.getByRole("link", { name: "Listings" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Billing" })).toHaveCount(0);
  await page.goto(`/portal/shoots/${shoot.ref}`);
  await expect(page.getByText(/1,234/)).toHaveCount(0);
  await page.getByRole("link", { name: "Create share link" }).click();
  const form = page.getByRole("form", { name: "Create share link" });
  // Starts from the details saved to the property.
  await expect(form.getByLabel("Title *")).toHaveValue("Sky-high 3 bed penthouse");
  await form.getByLabel("Title *").fill("Mia's penthouse page");
  await form.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByTestId("share-done")).toContainText("Link ready");
  await page.goto("/portal/listings");
  await expect(page.getByRole("article", { name: "Mia's penthouse page" })).toBeVisible();
  // The owner's page: visible (the account shares everything) but not editable by Mia.
  const theirs = page.getByRole("article", { name: "Sky-high 3 bed penthouse" });
  await expect(theirs.getByRole("button", { name: "Pause" })).toHaveCount(0);
  await expect(page.getByText(/1,234/)).toHaveCount(0);
});

test("polish: the permit QR shows, facts stay on one line, the bar steps aside for the contact card", async ({
  browser,
}) => {
  const [d] = await ok<{ listing_defaults: Record<string, unknown> }[]>(
    c.db.from("projects").select("listing_defaults").eq("id", shoot.id),
  );
  await ok(
    c.db.rpc("save_listing", {
      p_id: listingId,
      p_project: null,
      p: {
        ...d.listing_defaults,
        expires_on: "",
        permit_qr_key: `listings/${c.account}/qr-e2e.png`,
      },
    }),
  );
  for (const width of [390, 360]) {
    const ctx = await browser.newContext({ userAgent: PHONE_UA, viewport: { width, height: 560 } });
    const p = await ctx.newPage();
    await p.goto(`/l/${slug}`);
    await expect(p.getByAltText("Permit QR code")).toHaveAttribute("src", /qr-e2e\.png/);
    // Every fact on one line.
    for (const li of await p.getByRole("list", { name: "Key facts" }).getByRole("listitem").all()) {
      const { h, lh } = await li.evaluate((el) => ({
        h: el.getBoundingClientRect().height,
        lh: parseFloat(getComputedStyle(el).lineHeight) + 24,
      }));
      expect(h).toBeLessThanOrEqual(lh + 1);
    }
    const cols = await p
      .getByRole("list", { name: "Key facts" })
      .evaluate(
        (el) => new Set([...el.children].map((li) => li.getBoundingClientRect().left)).size,
      );
    const n = await p.getByRole("list", { name: "Key facts" }).getByRole("listitem").count();
    expect(cols).toBe(width < 381 ? 2 : n);
    const bar = p.locator(".sh-bar");
    await expect(bar).not.toHaveAttribute("data-hidden");
    await p.locator("#sh-contact").scrollIntoViewIfNeeded();
    await expect(bar).toHaveAttribute("data-hidden", "true");
    await expect(bar).toBeHidden();
    await ctx.close();
  }
  const v = await browser.newPage({ userAgent: PHONE_UA });
  await v.goto(`/l/gone-${RUN.slice(-4)}`);
  await expect(v.getByRole("link", { name: "Browse Milkywayy →" })).toHaveAttribute(
    "href",
    "/?utm_source=sharepage&utm_medium=referral&utm_campaign=listing",
  );
  const footer = await v.locator(".sh-byline").boundingBox();
  expect(Math.round(footer!.y + footer!.height)).toBe(v.viewportSize()!.height);
  await v.close();
});
