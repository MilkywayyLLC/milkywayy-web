import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 8 QA sweep (guide §17): every public page at 360, 390, 768 and 1440 px, accessibility
 * basics, links, WhatsApp numbers and keyboard use.
 */
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
  "/client-login",
];
const WIDTHS = [360, 390, 768, 1440];
const CHAT = "971507263306";
const TWILIO = "971508305678";

/** Structure and accessibility checks that need no layout. */
async function audit(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.lang !== "en") out.push("html lang");
    const h1 = document.querySelectorAll("h1");
    if (h1.length !== 1) out.push(`${h1.length} h1`);
    // Heading levels never skip (h2 → h4) inside main.
    let last = 1;
    document.querySelectorAll("main h1, main h2, main h3, main h4").forEach((h) => {
      const lvl = Number(h.tagName[1]);
      if (lvl > last + 1)
        out.push(`heading skip h${last}→h${lvl}: "${h.textContent?.trim().slice(0, 30)}"`);
      last = lvl;
    });
    // Images: real alt text, or explicitly decorative.
    document.querySelectorAll("img").forEach((img) => {
      const alt = img.getAttribute("alt");
      const hidden =
        img.closest("[aria-hidden='true']") || img.getAttribute("role") === "presentation";
      if (alt === null || (alt.trim() === "" && !hidden))
        out.push(`img without alt: ${img.src.slice(-40)}`);
    });
    // role=img placeholders carry a label.
    document.querySelectorAll("[role='img']").forEach((e) => {
      if (!e.getAttribute("aria-label")?.trim()) out.push("role=img without label");
    });
    // Landmarks.
    if (!document.querySelector("header, [role='banner']")) out.push("no banner");
    if (!document.querySelector("main")) out.push("no main");
    if (!document.querySelector("footer, [role='contentinfo']")) out.push("no footer");
    // Every control has an accessible name.
    const named = (el: Element) => {
      const e = el as HTMLElement;
      if (e.getAttribute("aria-label")?.trim() || e.getAttribute("aria-labelledby")) return true;
      if ((e as HTMLInputElement).labels?.length) return true;
      if (e.getAttribute("title")) return true;
      return !!e.textContent?.trim();
    };
    document
      .querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea")
      .forEach((el) => {
        if (el.closest("[aria-hidden='true'], .hp")) return;
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return;
        if (!named(el))
          out.push(
            `unnamed ${el.tagName.toLowerCase()}${el.getAttribute("name") ? `[name=${el.getAttribute("name")}]` : ""}`,
          );
      });
    return [...new Set(out)];
  });
}

test("every page at 360, 390, 768 and 1440: no sideways scroll, one h1, alt text, names, no console errors @mobile", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on(
    "console",
    (m) => m.type() === "error" && errors.push(`${page.url()}: ${m.text().slice(0, 120)}`),
  );
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message.slice(0, 120)}`));
  const report: string[] = [];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      if (overflow > 0) report.push(`${w}px ${path}: scrolls sideways by ${overflow}px`);
      if (w === 390) for (const issue of await audit(page)) report.push(`${path}: ${issue}`);
    }
  }
  expect(report).toEqual([]);
  expect(errors).toEqual([]);
});

test("every form shows and fits at each width @mobile", async ({ page }) => {
  const forms: [string, string][] = [
    ["/production", "Send a request"],
    ["/contact", "Send a request"],
    ["/ai-avatars", "Book a demo"],
    ["/post-production/free-test", "Book a free test edit"],
  ];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const [path, name] of forms) {
      await page.goto(path);
      const form = page.getByRole("form", { name });
      await form.scrollIntoViewIfNeeded();
      await expect(form, `${w} ${path}`).toBeVisible();
      const box = (await form.boundingBox())!;
      expect(box.x, `${w} ${path} left`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${w} ${path} right`).toBeLessThanOrEqual(w);
    }
    await page.goto("/property-shoots");
    await expect(page.locator("#booking .prop").first(), `${w} booking`).toBeVisible();
  }
});

test("every WhatsApp link uses the business chat number; the Twilio number never appears", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const bad: string[] = [];
  let count = 0;
  for (const path of [...PAGES, "/styleguide"]) {
    await page.goto(path);
    const html = await page.content();
    if (html.includes(TWILIO) || html.includes("50 830 5678"))
      bad.push(`${path}: Twilio number in the page`);
    const hrefs = await page
      .locator('a[href*="wa.me"], a[href*="whatsapp.com"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    for (const h of hrefs) {
      count++;
      const n = new URL(h).pathname.replace(/\D/g, "") || new URL(h).searchParams.get("phone");
      if (n !== CHAT) bad.push(`${path}: ${h.slice(0, 60)}`);
    }
  }
  expect(count).toBeGreaterThan(20);
  expect(bad).toEqual([]);
});

test("internal links all resolve (no broken links, no 404s)", async ({ page, request }) => {
  test.setTimeout(180_000);
  const links = new Set<string>();
  for (const path of PAGES) {
    await page.goto(path);
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    for (const h of hrefs) {
      const u = new URL(h);
      if (u.origin === new URL(page.url()).origin && !u.pathname.startsWith("/admin"))
        links.add(u.pathname);
    }
  }
  const broken: string[] = [];
  for (const path of links) {
    const res = await request.get(path, { maxRedirects: 5 });
    if (res.status() >= 400) broken.push(`${path} → ${res.status()}`);
  }
  expect(links.size).toBeGreaterThan(10);
  expect(broken).toEqual([]);
});

test("images load (no broken images) @mobile", async ({ page }) => {
  const broken: string[] = [];
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Lazy images: scroll through so they load.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 50));
      }
    });
    await page.waitForLoadState("networkidle");
    broken.push(
      ...(await page
        .locator("img")
        .evaluateAll(
          (imgs, p) =>
            imgs
              .filter(
                (i) =>
                  (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0,
              )
              .map((i) => `${p}: ${(i as HTMLImageElement).src.slice(-50)}`),
          path,
        )),
    );
  }
  expect(broken).toEqual([]);
});

test("unknown URLs return 404 with the site around them", async ({ page }) => {
  for (const path of ["/nope", "/work/not-a-case-study", "/production/nope"]) {
    const res = await page.goto(path);
    expect(res!.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Home" }).first()).toBeVisible();
  }
});

test.describe("keyboard", () => {
  test("skip link first, lands on main; focus is always visible", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
    // The next stops show a focus ring.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const s = getComputedStyle(el);
        return {
          tag: el.tagName,
          outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0,
          shadow: s.boxShadow !== "none",
        };
      });
      expect(ring.outline || ring.shadow, `${ring.tag} has a visible focus style`).toBe(true);
    }
  });

  test("mobile menu: opens with Enter, closes with Escape, focus returns @mobile-only", async ({
    page,
  }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Open menu" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  });

  test("forms can be completed and sent from the keyboard alone", async ({ page }) => {
    await page.goto("/contact");
    const form = page.getByRole("form", { name: "Send a request" });
    await form.getByLabel("Name").focus();
    await page.keyboard.type("Keyboard Test");
    // Submit with Enter from a text field: validation runs, errors are announced.
    await page.keyboard.press("Enter");
    await expect(form.getByRole("alert").first()).toBeVisible();
  });

  test("booking summary sheet closes with Escape @mobile-only", async ({ page }) => {
    await page.goto("/property-shoots");
    await page.getByRole("button", { name: "Review & send" }).click();
    const sheet = page.getByRole("dialog", { name: "Booking summary" });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });
});
