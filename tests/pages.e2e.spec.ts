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
