import { expect, test } from "@playwright/test";

/** Every built page renders: 200, one h1, no uncaught errors, no horizontal scroll. */
const PAGES = ["/", "/production", "/production/property-shoots", "/book", "/styleguide"];

for (const path of PAGES) {
  test(`${path} renders cleanly @mobile`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    if (path !== "/styleguide") await expect(page.locator("h1")).toHaveCount(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("hero titles are exactly two lines @mobile", async ({ page }) => {
  for (const path of ["/", "/production", "/production/property-shoots"]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const lines = await page.locator("h1.two").evaluate((h) => {
      const lh = parseFloat(getComputedStyle(h).lineHeight);
      return Math.round(h.getBoundingClientRect().height / lh);
    });
    expect(lines, path).toBe(2);
  }
});

test.describe("property shoots page", () => {
  test("no builder; price overview; every Price my shoot goes to /book @mobile", async ({
    page,
  }) => {
    await page.goto("/production/property-shoots");
    await expect(page.locator(".bk")).toHaveCount(0);
    await expect(page.locator("#prices")).toContainText("AED 450");
    const ctas = page.getByRole("link", { name: /Price my shoot|Build your booking/ });
    expect(await ctas.count()).toBeGreaterThanOrEqual(3);
    for (const l of await ctas.all()) await expect(l).toHaveAttribute("href", "/book");
    await page.getByRole("link", { name: "Build your booking" }).click();
    await expect(page).toHaveURL(/\/book$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Build your booking.");
  });

  test("switching sample tabs keeps the section height @mobile", async ({ page }) => {
    await page.goto("/production/property-shoots");
    const stage = page.locator(".gal-stage");
    const before = await stage.boundingBox();
    await page.getByRole("tab", { name: "Video" }).click();
    await expect(page.getByRole("tab", { name: "Video" })).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(400);
    const after = await stage.boundingBox();
    expect(after?.height).toBe(before?.height);
    await expect(page.getByRole("tabpanel")).toHaveCount(1); // hidden panels are inert/aria-hidden
  });
});

test.describe("navigation", () => {
  test("Production dropdown and footer link to Book a shoot", async ({ page }) => {
    await page.goto("/");
    const main = page.getByRole("navigation", { name: "Main" });
    await main.getByRole("button", { name: "Production pages" }).click();
    await expect(main.getByRole("link", { name: "Book a shoot" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(main.getByRole("link", { name: "Book a shoot" })).toBeHidden();
    await expect(
      page.locator("footer").getByRole("link", { name: "Book a shoot" }),
    ).toHaveAttribute("href", "/book");
  });

  test("mobile menu has Book a shoot @mobile-only", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(
      page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Book a shoot" }),
    ).toHaveAttribute("href", "/book");
  });
});
