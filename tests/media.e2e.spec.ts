import { expect, test, type Page } from "@playwright/test";
import { MEDIA, type MediaKind } from "@/lib/media-config";

/**
 * Portfolio media on the site (owner, 7 Oct 2026). The styleguide's "Media formats" section
 * renders one fixture per format and source (lib/media-fixtures.ts); the Instagram API is the
 * local mock (tests/mocks/instagram.mjs).
 */
const ratio = (k: MediaKind) => {
  const [w, h] = MEDIA[k].ratio.split("/").map(Number);
  return w / h;
};

async function framesAtTheirRatio(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main .fr[data-kind]")]
      .filter((f) => f.getClientRects().length && f.offsetWidth > 0)
      .map((f) => ({ kind: f.dataset.kind!, r: f.offsetWidth / f.offsetHeight })),
  );
}

const fixture = (page: Page, id: string) => page.locator(`[data-fixture="${id}"]`).first();

test("every portfolio frame on the site is at its format's ratio @mobile", async ({ page }) => {
  for (const path of [
    "/",
    "/work",
    "/post-production",
    "/property-shoots",
    "/production",
    "/ai-avatars",
  ]) {
    await page.goto(path);
    const frames = await framesAtTheirRatio(page);
    expect(frames.length, path).toBeGreaterThan(0);
    for (const f of frames)
      expect(Math.abs(f.r / ratio(f.kind as MediaKind) - 1), `${path} ${f.kind}`).toBeLessThan(
        0.02,
      );
  }
});

test("each format renders at its ratio (fixtures)", async ({ page }) => {
  await page.goto("/styleguide#formats");
  const want: Record<string, MediaKind> = {
    "fx-photos": "photo",
    "fx-reel-upload": "reel",
    "fx-reel-ig": "reel",
    "fx-youtube": "long-form",
    "fx-matterport": "360",
    "fx-avatar": "ai-avatar",
  };
  for (const [id, kind] of Object.entries(want)) {
    const box = (await fixture(page, id).locator(".fr").boundingBox())!;
    expect(Math.abs(box.width / box.height / ratio(kind) - 1), id).toBeLessThan(0.02);
  }
  await expect(fixture(page, "fx-photos").locator(".fr-badge")).toHaveText("5 photos");
  await expect(fixture(page, "fx-matterport").locator(".fr-badge")).toHaveText("360°");
});

test("photo set: lightbox with buttons, keys, swipe, thumbnails and Esc", async ({ page }) => {
  await page.goto("/styleguide#formats");
  const open = page.getByRole("button", { name: "Open photos: Fixture villa, 5 photos" }).first();
  // Nothing of the viewer loads with the page.
  await expect(page.locator("dialog.mv")).toHaveCount(0);
  await open.click();
  const dlg = page.getByRole("dialog", { name: "Fixture villa, 5 photos: photos" });
  await expect(dlg).toBeVisible();
  const count = dlg.locator(".lb-count");
  await expect(count).toContainText("1 / 5");
  // A 3:2 stage, and the page behind doesn't scroll.
  const stage = (await dlg.locator(".lb-stage").boundingBox())!;
  expect(Math.abs(stage.width / stage.height - 1.5)).toBeLessThan(0.02);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");

  await dlg.getByRole("button", { name: "Next photo" }).click();
  await expect(count).toContainText("2 / 5");
  await page.keyboard.press("ArrowRight");
  await expect(count).toContainText("3 / 5");
  await page.keyboard.press("ArrowLeft");
  await expect(count).toContainText("2 / 5");
  await dlg.getByRole("button", { name: "Previous photo" }).click();
  await dlg.getByRole("button", { name: "Previous photo" }).click();
  await expect(count).toContainText("5 / 5"); // wraps round
  await dlg.getByRole("button", { name: "Photo 3 of 5" }).click();
  await expect(count).toContainText("3 / 5");
  await expect(dlg.getByRole("button", { name: "Photo 3 of 5" })).toHaveAttribute(
    "aria-current",
    "true",
  );

  // Swipe left → next, swipe right → previous.
  const mid = { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 };
  await page.mouse.move(mid.x + 120, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x - 120, mid.y, { steps: 5 });
  await page.mouse.up();
  await expect(count).toContainText("4 / 5");
  await page.mouse.move(mid.x - 120, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 120, mid.y, { steps: 5 });
  await page.mouse.up();
  await expect(count).toContainText("3 / 5");

  // Focus stays inside; Esc closes and gives focus back to the card.
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(open).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
});

test("swipe on a phone moves through the photos @mobile", async ({ page }) => {
  await page.goto("/styleguide#formats");
  await page.getByRole("button", { name: "Open photos: Fixture villa, 5 photos" }).first().click();
  const dlg = page.getByRole("dialog");
  const stage = (await dlg.locator(".lb-stage").boundingBox())!;
  const y = stage.y + stage.height / 2;
  await dlg.locator(".lb-stage").dispatchEvent("pointerdown", {
    clientX: stage.x + stage.width - 20,
    clientY: y,
    pointerType: "touch",
  });
  await dlg.locator(".lb-stage").dispatchEvent("pointerup", {
    clientX: stage.x + 20,
    clientY: y,
    pointerType: "touch",
  });
  await expect(dlg.locator(".lb-count")).toContainText("2 / 5");
});

test("our Instagram reel plays in our 9:16 player, streamed through our server", async ({
  page,
  request,
}) => {
  await page.goto("/styleguide#formats");
  await fixture(page, "fx-reel-ig")
    .getByRole("button", { name: "Play: Fixture reel, our Instagram" })
    .click();
  const video = page.getByRole("dialog").locator("video");
  await expect(video).toHaveAttribute("src", "/media/ig/17900000000000001");
  const stage = (await page.getByRole("dialog").locator(".mv-stage").boundingBox())!;
  expect(Math.abs(stage.width / stage.height - 9 / 16)).toBeLessThan(0.02);
  // No Instagram link or CDN URL in the page itself.
  expect(await page.content()).not.toContain("127.0.0.1:3298");

  const part = await request.get("/media/ig/17900000000000001", {
    headers: { range: "bytes=0-99" },
  });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-type"]).toContain("video/mp4");
  expect(part.headers()["content-range"]).toMatch(/^bytes 0-99\//);
  expect((await part.body()).length).toBe(100);
});

test("a reel Instagram won't serve shows its cover and “View on Instagram ↗”", async ({
  page,
  request,
}) => {
  await page.goto("/styleguide#formats");
  const broken = fixture(page, "fx-reel-ig-broken");
  await expect(broken.getByRole("button", { name: /Play/ })).toHaveCount(0);
  await expect(broken.getByRole("link", { name: "View on Instagram ↗" })).toHaveAttribute(
    "href",
    "https://www.instagram.com/reel/MWBROKEN01/",
  );
  expect((await request.get("/media/ig/17900000000000002")).status()).toBe(404);
  // Another account's reel is a link only.
  const other = fixture(page, "fx-reel-other");
  await expect(other.getByRole("button", { name: /Play/ })).toHaveCount(0);
  await expect(other.getByRole("link", { name: "View on Instagram ↗" })).toHaveAttribute(
    "href",
    "https://www.instagram.com/reel/OTHER0001/",
  );
  // The optional post link on any item.
  await expect(
    fixture(page, "fx-avatar").getByRole("link", { name: "View on Instagram ↗" }),
  ).toHaveAttribute("href", "https://www.instagram.com/p/MWPOST0001/");
});

test("uploaded reels play from R2 through a short-lived link", async ({ page, request }) => {
  await page.goto("/styleguide#formats");
  await fixture(page, "fx-reel-upload")
    .getByRole("button", { name: "Play: Fixture reel, uploaded" })
    .click();
  await expect(page.getByRole("dialog").locator("video")).toHaveAttribute(
    "src",
    "/media/file/site/reels/fixture.mp4",
  );
  const r = await request.get("/media/file/site/reels/fixture.mp4", { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  expect(r.headers().location).toContain("site/reels/fixture.mp4");
  // Only the site's own videos: never client files.
  expect(
    (await request.get("/media/file/projects/abc/secret.mp4", { maxRedirects: 0 })).status(),
  ).toBe(404);
});

test("YouTube and Vimeo open in a 16:9 player, loaded only on click", async ({ page }) => {
  await page.goto("/styleguide#formats");
  expect(await page.locator("iframe[src*='youtube'], iframe[src*='vimeo']").count()).toBe(0);
  await fixture(page, "fx-youtube").getByRole("button", { name: /Play/ }).click();
  const yt = page.getByRole("dialog").locator("iframe");
  await expect(yt).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/aqz-KE-bpKQ/);
  const stage = (await page.getByRole("dialog").locator(".mv-stage").boundingBox())!;
  expect(Math.abs(stage.width / stage.height - 16 / 9)).toBeLessThan(0.02);
  await page.keyboard.press("Escape");
  await fixture(page, "fx-vimeo").getByRole("button", { name: /Play/ }).click();
  await expect(page.getByRole("dialog").locator("iframe")).toHaveAttribute(
    "src",
    /player\.vimeo\.com\/video\/76979871/,
  );
});

test("360 tours open in a window with “Open full screen ↗”; the CSP allows the tour hosts", async ({
  page,
  request,
}) => {
  await page.goto("/styleguide#formats");
  await fixture(page, "fx-matterport")
    .getByRole("button", { name: /Open 360 tour/ })
    .click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.locator("iframe")).toHaveAttribute(
    "src",
    "https://my.matterport.com/show/?m=SxQL3iGyoDo&play=1&qs=1",
  );
  await expect(dlg.locator("iframe")).toHaveAttribute("allow", /fullscreen.*gyroscope/);
  await expect(dlg.getByRole("link", { name: "Open full screen ↗" })).toHaveAttribute(
    "href",
    "https://my.matterport.com/show/?m=SxQL3iGyoDo",
  );
  const csp = (await request.get("/")).headers()["content-security-policy"];
  for (const host of ["my.matterport.com", "tour.panoee.net", "kuula.co", "player.vimeo.com"])
    expect(csp).toContain(host);
});

test("home hero: showreel at 16:9 beside the title; poster first, no player until play", async ({
  page,
}) => {
  await page.goto("/");
  const frame = page.locator(".hero .fr[data-kind='showreel']");
  const box = (await frame.boundingBox())!;
  expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.02);
  // The poster is the LCP image (until it's uploaded the frame shows a placeholder swatch).
  if (await frame.locator("img").count())
    await expect(frame.locator("img")).toHaveAttribute("fetchpriority", "high");
  expect(await page.locator(".hero video, .hero iframe").count()).toBe(0);
  // Desktop: frame to the right of the copy, vertically centred against it.
  const copy = (await page.locator(".hero-copy").boundingBox())!;
  const select = (await page.locator(".hero-select").boundingBox())!;
  expect(box.x).toBeGreaterThan(copy.x + copy.width);
  const textMid = (copy.y + select.y + select.height) / 2;
  expect(Math.abs(box.y + box.height / 2 - textMid)).toBeLessThan(60);
});

test("home hero on a phone: title and lede, then the frame full width, then the selector @mobile-only", async ({
  page,
}) => {
  await page.goto("/");
  const lede = (await page.locator(".hero-copy .lede").boundingBox())!;
  const frame = (await page.locator(".hero .fr").boundingBox())!;
  const select = (await page.locator(".hero-select").boundingBox())!;
  expect(frame.y).toBeGreaterThan(lede.y + lede.height);
  expect(select.y).toBeGreaterThan(frame.y + frame.height);
  const content = (await page.locator(".hero-copy").boundingBox())!;
  expect(Math.abs(frame.width - content.width)).toBeLessThan(2); // full width of the column
});

test("home sections alternate backgrounds in the agreed order", async ({ page }) => {
  await page.goto("/");
  const bgs = await page.evaluate(() => {
    const css = (v: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const bg = css("--bg");
    const s2 = css("--surface-2");
    const name = (c: string) => {
      const probe = document.createElement("i");
      document.body.append(probe);
      const of = (v: string) => ((probe.style.color = v), getComputedStyle(probe).color);
      const out = c === "rgba(0, 0, 0, 0)" || c === of(bg) ? "bg" : c === of(s2) ? "surface-2" : c;
      probe.remove();
      return out;
    };
    return [...document.querySelectorAll<HTMLElement>(".home > section")].map((s) => [
      s.getAttribute("aria-label") ?? s.querySelector("h2")?.textContent ?? "",
      name(getComputedStyle(s).backgroundColor),
    ]);
  });
  expect(bgs.map(([, b]) => b).slice(0, 7)).toEqual([
    "surface-2", // Services
    "bg", // Stats
    "rgb(245, 244, 240)", // Dashboard (cream)
    "surface-2", // Brief to delivery
    "bg", // Reviews
    "surface-2", // Founder
    "bg", // FAQ
  ]);
  await expect(page.locator(".home > .proof")).toHaveCSS("border-bottom-width", "0px");
});

test("Post-production services: four full-width rows, media at true ratios, alternating @mobile", async ({
  page,
}) => {
  await page.goto("/post-production");
  const rows = page.locator("section[aria-labelledby='services-title'] .door");
  await expect(rows).toHaveCount(4);
  const kinds = ["photo", "reel", "long-form", "ai-avatar"] as const;
  const prices = [
    /From \$0\.80 \/ HDR photo/,
    /From \$50 \/ reel/,
    /From \$150 \/ video/,
    /White-label/,
  ];
  const ctas = ["Free test →", "Free test →", "Free test →", "See AI avatars →"];
  for (let i = 0; i < 4; i++) {
    const row = rows.nth(i);
    const fr = row.locator(".fr");
    await expect(fr).toHaveAttribute("data-kind", kinds[i]);
    const b = (await fr.boundingBox())!;
    expect(Math.abs(b.width / b.height / ratio(kinds[i]) - 1), kinds[i]).toBeLessThan(0.02);
    await expect(row.locator(".price")).toHaveText(prices[i]);
    await expect(row.locator(".lnk")).toHaveText(ctas[i]);
    expect(await row.getAttribute("class")).toBe(i % 2 ? "door flip" : "door");
  }
  // Phones: media on top, text below.
  if (page.viewportSize()!.width < 700) {
    const m = (await rows.first().locator(".door-media").boundingBox())!;
    const t = (await rows.first().locator(".door-copy").boundingBox())!;
    expect(m.y).toBeLessThan(t.y);
  }
});

test("/work: photos are property cards that open the lightbox @mobile", async ({ page }) => {
  await page.goto("/work");
  const cards = page.locator(".fg-grid figure");
  await expect(cards.first()).toHaveAttribute("data-kind", "photo");
  await cards
    .first()
    .getByRole("button", { name: /Open photos/ })
    .click();
  await expect(page.getByRole("dialog").locator(".lb-count")).toContainText("1 /");
});
