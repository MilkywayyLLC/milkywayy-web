import { expect, test } from "@playwright/test";

/**
 * Website refinement (site-refine, 3 Oct 2026): logo by tone, homepage order, stats count-up
 * without layout shift, the dashboard showcase, reviews, and avatar plan tags.
 */
test("the brand logo follows the page tone; favicon and apple icon exist @mobile", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator("header .logo img")).toHaveAttribute("src", "/brand/logo-on-dark.png");
  await expect(page.locator("footer .logo img")).toHaveAttribute("src", "/brand/logo-on-dark.png");
  await page.goto("/post-production");
  await expect(page.locator("header .logo img")).toHaveAttribute("src", "/brand/logo-on-light.png");
  await expect(page.locator("footer .logo img")).toHaveAttribute("src", "/brand/logo-on-dark.png");
  const img = page.locator("header .logo img");
  expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  for (const path of [
    "/favicon.ico",
    "/icon.png",
    "/apple-icon.png",
    "/brand/og.png",
    "/brand/logo-on-dark.webp",
  ])
    expect((await request.get(path)).status(), path).toBe(200);
});

test("homepage: sections in the agreed order, no reels strip, FAQ at most 6", async ({ page }) => {
  await page.goto("/");
  const order = await page
    .locator("main section")
    .evaluateAll((els) =>
      els.map(
        (e) => e.getAttribute("aria-label") ?? e.querySelector("h1, h2")?.textContent?.trim() ?? "",
      ),
    );
  const at = (s: string) => order.findIndex((o) => o.toLowerCase().includes(s.toLowerCase()));
  const seq = [
    at("Content that"),
    at("What do you need"),
    at("Three services"),
    at("Studio in numbers"),
    at("Everything in one place"),
    at("Brief to delivery"),
    at("What clients say"),
    at("Questions"),
  ];
  for (const i of seq) expect(i).toBeGreaterThanOrEqual(0);
  expect(seq).toEqual([...seq].sort((a, b) => a - b));
  await expect(page.getByText("Made for the feed")).toHaveCount(0);
  await expect(page.getByText("From the founder")).toHaveCount(0);
  expect(
    await page.locator(".faq details, .faq [role=button], .faq button").count(),
  ).toBeLessThanOrEqual(6);
  // One media item per service row.
  for (const row of await page.locator(".door").all())
    await expect(row.locator(".fr")).toHaveCount(1);
});

test("stats count up once, land on the final numbers, and nothing shifts", async ({ page }) => {
  await page.goto("/");
  const stats = page.locator(".stats");
  const box = async () => (await stats.boundingBox())!;
  await stats.scrollIntoViewIfNeeded();
  const before = await box();
  const v = page.locator(".stat-v").nth(1);
  await expect(v).toHaveAttribute("aria-label", "1,000+");
  await expect(v.locator(".stat-live")).toHaveText("1,000+", { timeout: 5000 });
  const after = await box();
  expect(after.height).toBe(before.height);
  // The year doesn't count.
  await expect(page.locator(".stat-v.yr .stat-live")).toHaveText("2020");
});

test("stats with reduced motion: final numbers straight away", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.locator(".stats").scrollIntoViewIfNeeded();
  await expect(page.locator(".stat-v").nth(1).locator(".stat-live")).toHaveText("1,000+");
  await ctx.close();
});

test("dashboard showcase: click selects, frames follow, keyboard works", async ({ page }) => {
  // Static portal frames (owner, 13 Oct 2026): one still frame per tab, crossfaded.
  await page.goto("/");
  const list = page.getByRole("tablist", { name: "Client dashboard features" });
  await list.scrollIntoViewIfNeeded();
  const tabs = list.getByRole("tab");
  const n = await tabs.count();
  expect(n).toBeGreaterThanOrEqual(3);
  const panel = page.getByRole("tabpanel");
  await expect(panel.locator(".dsh-frame")).toHaveCount(n);
  await expect(panel.locator(".dsh-frame.on")).toHaveCount(1);
  const onIndex = () =>
    panel
      .locator(".dsh-frame")
      .evaluateAll((fs) => fs.findIndex((f) => f.classList.contains("on")));
  await tabs.nth(n - 1).click();
  await expect(tabs.nth(n - 1)).toHaveAttribute("aria-selected", "true");
  await expect.poll(onIndex).toBe(n - 1);
  await tabs.nth(n - 1).press("ArrowDown");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(tabs.first()).toBeFocused();
  await expect.poll(onIndex).toBe(0);
});

test("dashboard showcase advances by itself while in view, even on hover", async ({ page }) => {
  await page.goto("/property-shoots");
  const list = page.getByRole("tablist", { name: "Client dashboard features" });
  await list.scrollIntoViewIfNeeded();
  const tabs = list.getByRole("tab");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true", { timeout: 8000 });
  await page.locator(".dsh-win").hover(); // never pauses on hover
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true", { timeout: 8000 });
});

test("each service page has its own showcase screens", async ({ page }) => {
  await page.goto("/post-production");
  await expect(page.getByRole("tab", { name: /Edit my files/ })).toBeVisible();
  await page.goto("/ai-avatars");
  await expect(page.getByRole("tab", { name: /Brief your video/ })).toBeVisible();
});

test("reviews: under 6, a static row", async ({ page }) => {
  await page.goto("/");
  const n = await page.locator(".quotes .q, .mq-set:not(.mq-copy) .q").count();
  if (n < 6) {
    await expect(page.locator(".mq")).toHaveCount(0);
    await expect(page.locator(".quotes .q")).toHaveCount(n);
  } else await expect(page.locator(".mq-copy")).toHaveAttribute("aria-hidden", "true");
});

test("no page mixes ratios in a row of media @mobile", async ({ page }) => {
  for (const path of ["/", "/work", "/property-shoots", "/post-production", "/production"]) {
    await page.goto(path);
    const rows = await page.evaluate(() => {
      const bad: string[] = [];
      for (const grid of document.querySelectorAll(".fg-grid, .trio, .avs")) {
        const frames = [...grid.querySelectorAll(".fr")].filter((f) => f.getClientRects().length);
        const byTop = new Map<number, number[]>();
        for (const f of frames) {
          const r = f.getBoundingClientRect();
          const k = Math.round(r.top / 4);
          byTop.set(k, [...(byTop.get(k) ?? []), r.width / r.height]);
        }
        for (const ratios of byTop.values())
          if (ratios.some((x) => Math.abs(x - ratios[0]) > 0.02)) bad.push(grid.className);
      }
      return bad;
    });
    expect(rows, path).toEqual([]);
  }
});

test("dashboard previews fit the screen: the desktop portal everywhere, scaled like a screenshot", async ({
  browser,
}) => {
  // Owner, 20 Oct 2026 (revised): phones see the same desktop frame scaled to the screen width,
  // not a phone layout; nothing scrolls sideways; the frames load only near the section.
  for (const width of [390, 768, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto("/property-shoots");
    await expect(page.locator(".scm")).toHaveCount(0);
    await page.getByRole("tablist", { name: "Client dashboard features" }).scrollIntoViewIfNeeded();
    const frame = page.locator(".dsh-frame.on .scm");
    await expect(frame).toHaveAttribute("data-l", "desk");
    await expect(frame.locator(".s-rail")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await ctx.close();
  }
});
