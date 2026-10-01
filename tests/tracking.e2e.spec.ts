import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ownerDb } from "./helpers/admin";
import { hasAdminAccounts } from "./helpers/env";
import { markTestLeads } from "./helpers/leads";

/**
 * Tracking (guide §13 + owner, 2 Oct 2026). Meta, Google and Clarity scripts are stubbed: the
 * stubs record every call, so nothing reaches those services. Test IDs come from the
 * `mw-tracking-test` cookie, which only works outside production.
 */
const THIRD_PARTY = /connect\.facebook\.net|googletagmanager\.com|clarity\.ms|facebook\.com\/tr/;

async function stubTags(context: BrowserContext, ids = true) {
  if (ids)
    await context.addCookies([
      {
        name: "mw-tracking-test",
        value: encodeURIComponent(
          JSON.stringify({ pixel: "123456789", ga: "G-TEST123", clarity: "testclar" }),
        ),
        url: process.env.BASE_URL ?? "http://localhost:3200",
      },
    ]);
  await context.route("https://connect.facebook.net/**", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: "window.__fb=[];fbq.callMethod=function(){window.__fb.push([].slice.call(arguments))};fbq.queue.forEach(function(a){window.__fb.push([].slice.call(a))});",
    }),
  );
  await context.route("https://www.googletagmanager.com/**", (r) =>
    r.fulfill({ contentType: "text/javascript", body: "" }),
  );
  await context.route("https://www.clarity.ms/**", (r) =>
    r.fulfill({ contentType: "text/javascript", body: "" }),
  );
}

test.afterAll(async () => {
  test.setTimeout(150_000);
  if (hasAdminAccounts) await (await ownerDb()).from("leads").delete().eq("name", "E2E Tracking");
});

const fb = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fb?: unknown[][] }).__fb ?? []);
const ga = (page: Page) =>
  page.evaluate(() =>
    ((window as unknown as { dataLayer?: IArguments[] }).dataLayer ?? []).map((a) => Array.from(a)),
  );
const fbEvents = async (page: Page) =>
  (await fb(page)).filter((c) => c[0] === "track").map((c) => c[1]);

test("off by default: no tags, no banner, no cookie settings", async ({ page }) => {
  test.skip(!!process.env.BASE_URL, "staging may be in test mode");
  const third: string[] = [];
  page.on("request", (r) => THIRD_PARTY.test(r.url()) && third.push(r.url()));
  for (const path of ["/", "/production", "/contact"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(third).toEqual([]);
  await expect(page.locator(".consent")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cookie settings" })).toHaveCount(0);
});

test.describe("outside the EU/UK: tracked by default", () => {
  test("tags load after the page is interactive; PageView, ViewContent, Contact, Lead (event id = MW ref)", async ({
    page,
    context,
  }) => {
    await stubTags(context);
    await markTestLeads(page);
    await page.goto("/");
    await expect.poll(() => fbEvents(page)).toContain("PageView");
    await expect(page.locator(".consent")).toHaveCount(0);

    // Loaded only after the page finished loading.
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const tags = performance
        .getEntriesByType("resource")
        .filter((r) => /fbevents|gtag\/js|clarity/.test(r.name))
        .map((r) => r.startTime);
      return { loadEnd: nav.loadEventEnd, first: Math.min(...tags), count: tags.length };
    });
    expect(timing.count).toBe(3);
    expect(timing.first).toBeGreaterThanOrEqual(timing.loadEnd);

    expect(await fb(page)).toContainEqual(["init", "123456789"]);
    expect((await ga(page)).some((a) => a[0] === "config" && a[1] === "G-TEST123")).toBe(true);
    expect((await ga(page)).some((a) => a[0] === "event" && a[1] === "page_view")).toBe(true);

    // Client-side navigation to a service page: PageView + ViewContent.
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Production", exact: true })
      .first()
      .click();
    await page.waitForURL("**/production");
    await expect
      .poll(async () => (await fb(page)).filter((c) => c[1] === "ViewContent").length)
      .toBe(1);
    expect((await fb(page)).find((c) => c[1] === "ViewContent")?.[2]).toMatchObject({
      content_name: "Production",
    });

    // Contact: a WhatsApp link.
    const before = (await fbEvents(page)).filter((e) => e === "Contact").length;
    await page.locator('a[href^="https://wa.me/"]').first().dispatchEvent("click");
    await expect
      .poll(async () => (await fbEvents(page)).filter((e) => e === "Contact").length)
      .toBe(before + 1);

    // Lead, with the MW ref as the event id (the server sends the same id to the Conversions API).
    const form = page.getByRole("form", { name: "Send a request" });
    await form.getByLabel("Name").fill("E2E Tracking");
    await form.getByRole("radio", { name: "Email", exact: true }).check();
    await form.getByRole("textbox", { name: /^Email/ }).fill("e2e-tracking@example.com");
    await page.waitForTimeout(2700);
    const req = page.waitForRequest("**/api/lead");
    await form.getByRole("button", { name: "Send request" }).click();
    expect((await req).postDataJSON()).toMatchObject({ consent: true });
    const done = page.getByRole("status").filter({ hasText: /Ref #MW-\d+/ });
    const ref = (await done.textContent())!.match(/MW-\d+/)![0];
    await expect
      .poll(async () => (await fb(page)).find((c) => c[1] === "Lead"))
      .toEqual([
        "track",
        "Lead",
        { content_name: "production", lead_type: "production" },
        { eventID: ref },
      ]);
    expect(
      (await ga(page)).some(
        (a) => a[0] === "event" && a[1] === "generate_lead" && a[2]?.event_id === ref,
      ),
    ).toBe(true);
  });
});

test.describe("EU/EEA, UK, Switzerland: opt-in banner", () => {
  test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "DE" } });

  test("nothing loads until Accept; Reject sticks; Cookie settings reopens the choice", async ({
    page,
    context,
  }) => {
    test.skip(!!process.env.BASE_URL, "Vercel sets the real country header");
    await stubTags(context);
    const third: string[] = [];
    page.on("request", (r) => THIRD_PARTY.test(r.url()) && third.push(r.url()));
    await page.goto("/");
    const banner = page.getByRole("dialog", { name: "Cookie choice" });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("link", { name: "Privacy notice" })).toHaveAttribute(
      "href",
      "/privacy#cookies",
    );
    await page.waitForTimeout(500);
    expect(third).toEqual([]);

    await banner.getByRole("button", { name: "Reject" }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(banner).toBeHidden();
    expect(third).toEqual([]);

    await page.getByRole("button", { name: "Cookie settings" }).click();
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Accept" }).click();
    await expect.poll(() => fbEvents(page)).toContain("PageView");
    expect(third.length).toBeGreaterThan(0);
  });

  test("the banner sits above the mobile action bar and doesn't block it @mobile-only", async ({
    page,
    context,
  }) => {
    test.skip(!!process.env.BASE_URL, "Vercel sets the real country header");
    await stubTags(context);
    await page.goto("/production");
    const banner = page.getByRole("dialog", { name: "Cookie choice" });
    await expect(banner).toBeVisible();
    const b = (await banner.boundingBox())!;
    const bar = (await page.locator(".mbar").boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(bar.y);
  });
});
