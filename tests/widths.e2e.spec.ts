/** Guide §17: every page works at 360, 390, 768, 1024 and 1440px with no horizontal scroll, and hero titles stay two lines. */
import { expect, test } from "@playwright/test";
const PAGES = [
  "/",
  "/production",
  "/property-shoots",
  "/post-production",
  "/post-production/free-test",
  "/ai-avatars",
  "/contact",
  "/work",
  "/work/sample-monthly-content-for-a-brokerage",
  "/about",
  "/privacy",
  "/terms",
];
for (const w of [360, 390, 768, 1024, 1440]) {
  test(`no horizontal scroll and two-line heroes at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    const bad: string[] = [];
    for (const p of PAGES) {
      await page.goto(p);
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(() => {
        const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const h = document.querySelector("h1.two") as HTMLElement | null;
        const lines = h
          ? Math.round(
              h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight),
            )
          : 2;
        return { over, lines };
      });
      if (r.over > 0 || r.lines !== 2) bad.push(`${p}: overflow ${r.over}, lines ${r.lines}`);
    }
    expect(bad).toEqual([]);
  });
}
