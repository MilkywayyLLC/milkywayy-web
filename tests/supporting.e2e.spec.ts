import { expect, test } from "@playwright/test";

/** Phase 5: Contact, Work (+ case study), About, legal, 404 (guide §6.6, §6.7). */

test("unknown URLs get a real 404 page with the site around it @mobile", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Out of");
  await expect(page.getByRole("link", { name: "Property shoots" }).first()).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  expect((await page.goto("/work/no-such-case"))?.status()).toBe(404);
});

test("contact: service cards, details, form defaults @mobile", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tell us what");
  const form = page.getByRole("form", { name: "Send a request" });
  const services = form.getByRole("group", { name: "Which service?" });
  await expect(services.getByRole("radio")).toHaveCount(3);
  await expect(services.getByLabel(/Production/)).toBeChecked();
  await expect(form.getByLabel("WhatsApp")).toBeChecked();
  await expect(page.getByRole("link", { name: "hello@milkywayy.com" })).toHaveAttribute(
    "href",
    "mailto:hello@milkywayy.com",
  );
});

test("work: one tab per format, each a uniform grid at that format's ratio", async ({ page }) => {
  await page.goto("/work");
  const tabs = page.getByRole("tablist", { name: "Work by format" });
  const panel = page.getByRole("tabpanel");
  const expected: Record<string, number> = { Photos: 3 / 2, Reels: 9 / 16, "Long-form": 16 / 9 };
  for (const name of await tabs.getByRole("tab").allTextContents()) {
    await tabs.getByRole("tab", { name }).click();
    const ratios = await panel
      .locator("figure .fr")
      .evaluateAll((els) => els.map((e) => e.clientWidth / e.clientHeight));
    expect(ratios.length, name).toBeGreaterThan(0);
    // Never mixed: every frame in the tab has the same ratio (and the format's, where it's fixed).
    for (const r of ratios) expect(Math.abs(r - ratios[0]), name).toBeLessThan(0.02);
    if (expected[name]) expect(Math.abs(ratios[0] - expected[name]), name).toBeLessThan(0.02);
  }
  // Case study card leads to the template.
  await page.getByRole("link", { name: "Read the case study →" }).first().click();
  await expect(page).toHaveURL(/\/work\/.+/);
  await expect(page.getByText("Sample case study")).toBeVisible();
});

test("about: story, team, company details, clients @mobile", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Creating content");
  await expect(page.getByText("Draft · owner to confirm")).toBeVisible();
  await expect(page.getByText("Milkywayy LLC").first()).toBeVisible();
  await expect(page.locator(".proof")).toContainText("Xperience Realty");
});

test("legal pages are marked as drafts until reviewed", async ({ page }) => {
  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await expect(page.getByText("Draft · to be reviewed before launch")).toBeVisible();
    await expect(page.getByRole("link", { name: "hello@milkywayy.com" })).toBeVisible();
  }
});

test("Client login opens the portal; the old “portal is moving” page still works @mobile", async ({
  page,
}) => {
  await page.goto("/");
  const login = page.locator('a[href="/portal/login"]').first();
  await expect(login).toHaveCount(1);
  await page.goto("/client-login");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your portal");
  const wa = page.getByRole("link", { name: "WhatsApp us for files" });
  await expect(wa).toHaveAttribute("href", /^https:\/\/wa\.me\/971507263306\?text=/);
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
});
