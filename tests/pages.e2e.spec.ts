import { expect, test, type Page } from "@playwright/test";

/** Site-wide checks: every page renders, navigation, redirects, scroll behaviour, layout rules. */
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
  "/styleguide",
];

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
    await expect(page.locator("body")).not.toContainText("Book property shoot");
  });
}

test("hero titles are exactly two lines @mobile", async ({ page }) => {
  for (const path of [
    "/",
    "/production",
    "/property-shoots",
    "/post-production",
    "/ai-avatars",
    "/contact",
    "/work",
    "/about",
  ]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const lines = await page.locator("h1.two").evaluate((h) => {
      const lh = parseFloat(getComputedStyle(h).lineHeight);
      return Math.round(h.getBoundingClientRect().height / lh);
    });
    expect(lines, path).toBe(2);
  }
});

test.describe("navigation", () => {
  const NAV = ["Production", "Property shoots", "Post-production", "AI avatars", "Work", "About"];

  test("desktop nav and footer: one list, no dropdown, no old links", async ({ page }) => {
    await page.goto("/");
    const main = page.getByRole("navigation", { name: "Main" });
    await expect(main.getByRole("link")).toHaveText(NAV);
    await expect(main.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Get a quote" }).first()).toHaveAttribute(
      "href",
      "/contact",
    );
    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: "Property shoots" })).toHaveAttribute(
      "href",
      "/property-shoots",
    );
    await expect(
      footer.locator('a[href="/book"], a[href="/production/property-shoots"]'),
    ).toHaveCount(0);
  });

  test("mobile menu has the same items @mobile-only", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu.locator("a.item")).toHaveText(NAV);
  });

  test("old URLs redirect permanently (301) to /property-shoots", async ({ request }) => {
    for (const from of ["/production/property-shoots", "/book", "/booking"]) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(301);
      expect(res.headers()["location"], from).toMatch(/\/property-shoots$/);
    }
  });

  test("Price my shoot and property-shoot links land on the page or its builder", async ({
    page,
  }) => {
    await page.goto("/production");
    await expect(page.getByRole("link", { name: /Book a property shoot/ })).toHaveAttribute(
      "href",
      "/property-shoots",
    );
    await page.goto("/property-shoots");
    for (const l of await page.getByRole("link", { name: "Price my shoot" }).all()) {
      await expect(l).toHaveAttribute("href", "#booking");
    }
    await page.getByRole("link", { name: "Price my shoot" }).first().click();
    await expect(page.locator("#booking")).toBeInViewport();
  });
});

/** Scroll to the bottom, then change page: the new page must open at the top. */
async function expectOpensAtTop(page: Page, go: () => Promise<void>, path: RegExp) {
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
  );
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  await go();
  await expect(page).toHaveURL(path);
  await page.locator("h1").waitFor();
  // Sample the first frames after the change: the page must already be at the top, not animating
  // up from the old position.
  const frames = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const ys: number[] = [];
        const tick = () => {
          ys.push(Math.round(window.scrollY));
          if (ys.length < 6) requestAnimationFrame(tick);
          else resolve(ys);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(frames).toEqual([0, 0, 0, 0, 0, 0]);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
}

test.describe("page changes open at the top", () => {
  for (const [w, h] of [
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const) {
    test(`from the footer at ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto("/");
      await expectOpensAtTop(
        page,
        () => page.locator("footer").getByRole("link", { name: "Production", exact: true }).click(),
        /\/production$/,
      );
      // An in-page anchor still jumps to its section.
      await page.getByRole("link", { name: "See packages ↓" }).click();
      await expect(page.locator("#packages")).toBeInViewport();
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    });

    if (w < 1020) {
      test(`from the mobile menu at ${w}px`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await page.goto("/production");
        await expectOpensAtTop(
          page,
          async () => {
            await page.getByRole("button", { name: "Open menu" }).click();
            await page
              .getByRole("dialog", { name: "Menu" })
              .getByRole("link", { name: "AI avatars" })
              .click();
          },
          /\/ai-avatars$/,
        );
      });
    }
  }
});

test.describe("mobile menu covers the bottom bars @mobile-only", () => {
  test("booking bar and action bar hide while the menu is open", async ({ page }) => {
    await page.goto("/property-shoots");
    const bar = page.getByRole("region", { name: "Booking total" });
    await expect(bar).toBeVisible();
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(bar).toBeHidden();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu.getByRole("link", { name: "About" })).toBeVisible();
    await menu.getByRole("button", { name: "Close menu" }).click();
    await expect(bar).toBeVisible();

    await page.goto("/production");
    const mbar = page.locator(".mbar");
    await expect(mbar).toBeVisible();
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(mbar).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(mbar).toBeVisible();
  });
});

test.describe("layout rules", () => {
  test("no two sections with the same background back to back", async ({ page }) => {
    for (const path of [
      "/",
      "/production",
      "/property-shoots",
      "/post-production",
      "/ai-avatars",
    ]) {
      await page.goto(path);
      const clashes = await page.locator("main").evaluate((main) => {
        const secs = [...main.querySelectorAll(":scope > section.sec")] as HTMLElement[];
        const name = (el: HTMLElement) =>
          el.getAttribute("aria-labelledby") ?? el.getAttribute("aria-label") ?? el.id;
        const out: string[] = [];
        for (let i = 1; i < secs.length; i++) {
          const [a, b] = [secs[i - 1], secs[i]];
          if (a.nextElementSibling !== b) continue; // something (proof strip) sits between
          // A section that continues the one above (padding-top 0) is one logical section.
          if (getComputedStyle(b).paddingTop === "0px") continue;
          if (getComputedStyle(a).backgroundColor === getComputedStyle(b).backgroundColor) {
            out.push(`${name(a)} → ${name(b)}`);
          }
        }
        return out;
      });
      expect(clashes, path).toEqual([]);
    }
  });

  test("client strip only on Home and Production", async ({ page }) => {
    for (const [path, shown] of [
      ["/", 1],
      ["/production", 1],
      ["/post-production", 0],
      ["/ai-avatars", 0],
    ] as const) {
      await page.goto(path);
      await expect(page.locator(".proof"), path).toHaveCount(shown);
    }
  });

  test("hero media is never taller than the text beside it (desktop)", async ({ page }) => {
    for (const [path, sel] of [
      ["/", ".hero"],
      ["/ai-avatars", ".av-hero"],
    ] as const) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const [text, frame] = await page.locator(sel).evaluate((g) => {
        const [a, b] = [...g.children] as HTMLElement[];
        return [
          a.getBoundingClientRect().height,
          b.querySelector(".fr")!.getBoundingClientRect().height,
        ];
      });
      expect(frame, path).toBeLessThanOrEqual(text + 1);
      expect(frame, path).toBeGreaterThan(text * 0.6); // still a substantial frame
    }
  });
});
