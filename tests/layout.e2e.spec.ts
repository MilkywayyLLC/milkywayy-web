import { expect, test, type Page } from "@playwright/test";

/**
 * Layout rules from the owner's phone reviews (1 Oct 2026), checked on every page:
 * no text overflowing its box, no overlapping siblings, CTA pairs equal width (or stacked only when
 * they don't fit), hero trios never lifted into the text, frame labels on one line inside the
 * brackets, the mobile menu's action row, and the founder photo keeping the whole head in frame.
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
];

async function audit(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const vis = (e: Element) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const name = (e: Element) =>
      `${e.tagName.toLowerCase()}.${typeof e.className === "string" ? e.className.split(" ")[0] : ""} "${(e.textContent ?? "").trim().slice(0, 30)}"`;

    // Text wider than its own box.
    document
      .querySelectorAll(
        "main .btn, main .chip, main .sc, main .opt span, main figcaption, main .direct > div, main .seg button, main .tabs button, main .cal-d, main h1 .ln, main h2, main h3, main .eb, main .anchor span, header .btn, .mbar .btn, .bk-bar .btn",
      )
      .forEach((e) => {
        const el = e as HTMLElement;
        if (vis(e) && el.scrollWidth > el.clientWidth + 1) out.push(`overflow: ${name(e)}`);
      });

    // Overlapping siblings in normal flow.
    document.querySelectorAll("main *").forEach((parent) => {
      if (!vis(parent)) return;
      const kids = [...parent.children].filter(
        (k) => vis(k) && !["absolute", "fixed"].includes(getComputedStyle(k).position),
      );
      for (let i = 0; i < kids.length; i++)
        for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i].getBoundingClientRect();
          const b = kids[j].getBoundingClientRect();
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 1 && oy > 1) out.push(`overlap: ${name(kids[i])} × ${name(kids[j])}`);
        }
    });

    // CTA rows: buttons on one row are equal; a pair only stacks when it can't fit side by side.
    document.querySelectorAll("main .ctas").forEach((c) => {
      if (!vis(c)) return;
      const btns = [...c.children].filter(
        (k) => k.classList.contains("btn") && vis(k),
      ) as HTMLElement[];
      const rows = new Map<number, number[]>();
      btns.forEach((b) => {
        const r = b.getBoundingClientRect();
        rows.set(Math.round(r.top), [...(rows.get(Math.round(r.top)) ?? []), r.width]);
      });
      rows.forEach((ws) => {
        if (ws.length > 1 && Math.max(...ws) - Math.min(...ws) > 1) out.push(`uneven: ${name(c)}`);
      });
      const cw = c.getBoundingClientRect().width;
      if (btns.length === 2 && rows.size === 2) {
        const natural = btns.map((b) => {
          const prev = b.style.width;
          b.style.width = "max-content";
          const w = b.getBoundingClientRect().width;
          b.style.width = prev;
          return w;
        });
        if (Math.max(...natural) * 2 + 12 <= cw) out.push(`stacked but fits: ${name(c)}`);
        btns.forEach((b) => {
          if (Math.abs(b.getBoundingClientRect().width - cw) > 1)
            out.push(`stacked not full: ${name(c)}`);
        });
      }
    });

    // Frame labels: one line, inside the brackets.
    document.querySelectorAll("main .fr.has-corners").forEach((fr) => {
      const tag = fr.querySelector(".tag");
      const corners = fr.querySelector(".corners");
      if (!tag || !corners || !vis(tag)) return;
      const t = tag.getBoundingClientRect();
      const k = corners.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(tag).lineHeight) || 15;
      if (t.height > lh * 1.5) out.push(`label wraps: ${name(tag)}`);
      if (t.left < k.left + 3 || t.right > k.right - 3 || t.bottom > k.bottom - 3)
        out.push(`label on bracket: ${name(tag)}`);
    });

    return [...new Set(out)];
  });
}

for (const w of [360, 390]) {
  test(`phone layout audit at ${w}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: w, height: 800 });
    const report: string[] = [];
    for (const p of PAGES) {
      await page.goto(p);
      await page.evaluate(() => document.fonts.ready);
      const issues = await audit(page);
      if (issues.length) report.push(`${p}: ${issues.join(" | ")}`);
    }
    expect(report).toEqual([]);
  });
}

for (const w of [360, 390, 768]) {
  test(`hero trios sit below the text with a clear gap at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    for (const p of ["/production", "/post-production"]) {
      await page.goto(p);
      const gap = await page.locator(".trio").evaluate((trio) => {
        const copy = trio.previousElementSibling!.getBoundingClientRect();
        const top = Math.min(...[...trio.children].map((f) => f.getBoundingClientRect().top));
        return top - copy.bottom;
      });
      expect(gap, p).toBeGreaterThanOrEqual(24);
    }
  });
}

test("mobile menu actions: WhatsApp icon, Get a quote, Client login on one row @mobile-only", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const row = page.locator(".mnav-actions");
  const kids = row.locator(":scope > *");
  await expect(kids).toHaveCount(3);
  await expect(kids.nth(0)).toHaveAttribute("aria-label", "WhatsApp us");
  await expect(kids.nth(1)).toHaveText("Get a quote");
  await expect(kids.nth(2)).toHaveText("Client login");
  const boxes = await kids.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  const rowBox = await row.boundingBox();
  expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBe(1);
  expect(new Set(boxes.map((b) => Math.round(b.height))).size).toBe(1);
  expect(Math.abs(boxes[1].width - boxes[2].width)).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes[2].right - (rowBox!.x + rowBox!.width))).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes[0].left - rowBox!.x)).toBeLessThanOrEqual(1);
});

for (const [w, h] of [
  [360, 800],
  [390, 844],
  [768, 1024],
  [1440, 900],
] as const) {
  test(`About photo keeps the whole head in frame at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/about");
    const img = page.locator(".about-hero img");
    await expect(img).toBeVisible();
    // Source photo 1200×1500: head spans x ≈ 540–830, y ≈ 185–590.
    const visible = await img.evaluate((el: HTMLImageElement) => {
      const box = el.getBoundingClientRect();
      const [px, py] = getComputedStyle(el)
        .objectPosition.split(" ")
        .map((v) => parseFloat(v) / 100);
      const scale = Math.max(box.width / 1200, box.height / 1500);
      const offX = (1200 * scale - box.width) * px;
      const offY = (1500 * scale - box.height) * py;
      return {
        left: offX / scale,
        right: (offX + box.width) / scale,
        top: offY / scale,
        bottom: (offY + box.height) / scale,
      };
    });
    expect(visible.top).toBeLessThanOrEqual(160);
    expect(visible.bottom).toBeGreaterThanOrEqual(600);
    expect(visible.left).toBeLessThanOrEqual(520);
    expect(visible.right).toBeGreaterThanOrEqual(850);
  });
}
