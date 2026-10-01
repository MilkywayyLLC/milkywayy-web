import { expect, test } from "@playwright/test";
import { otherPricing } from "@/content/pricing";

/** Phase 4: Post-production and AI avatars (guide §6.4, §6.5). */

test.describe("post-production", () => {
  test("hero shows three labelled frames; the slider lives in the gallery @mobile", async ({
    page,
  }) => {
    await page.goto("/post-production");
    const hero = page.locator(".pp-hero");
    await expect(hero.locator(".trio .fr")).toHaveCount(3);
    await expect(hero.locator(".trio .tag")).toHaveText(["HDR edit", "Reel", "Long-form"]);
    await expect(hero.getByRole("slider")).toHaveCount(0);

    // "See our work" goes to the before/after gallery, where the slider works by keyboard.
    await hero.getByRole("link", { name: "See our work" }).click();
    const gallery = page.locator("#before-after");
    await expect(gallery).toBeInViewport();
    const slider = gallery.getByRole("slider");
    await expect(slider).toHaveValue("50");
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveValue("52");
    await expect(gallery.locator(".ba")).toHaveAttribute("style", /--pos:\s*52%/);
  });

  test("before/after tabs switch the pair and its description", async ({ page }) => {
    await page.goto("/post-production");
    await expect(page.getByRole("heading", { name: "Sky replacement" })).toBeVisible();
    await page.getByRole("tab", { name: "Twilight" }).click();
    await expect(page.getByRole("heading", { name: "Virtual twilight" })).toBeVisible();
    await page.getByRole("tab", { name: "Twilight" }).press("ArrowRight");
    await expect(page.getByRole("tab", { name: "HDR" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "HDR blending" })).toBeVisible();
  });

  test("rate cards come from the pricing config, in USD, starting from", async ({ page }) => {
    await page.goto("/post-production");
    const cards = page.locator(".price-grid .pcard");
    await expect(cards).toHaveCount(otherPricing.postProduction.rates.length);
    await expect(cards.nth(0)).toContainText("$0.80/ HDR photo");
    await expect(cards.nth(1)).toContainText("$50/ reel");
    await expect(cards.nth(2)).toContainText("$150/ video");
    for (const c of await cards.all()) await expect(c).toContainText("Starting from");
    await expect(page.locator("#rates")).not.toContainText(/AED|€|£/);
  });

  test("free test: three steps, back and continue, email alternative @mobile", async ({ page }) => {
    await page.goto("/post-production");
    await page.getByRole("link", { name: "Book a free test edit" }).click();
    await expect(page).toHaveURL(/#free-test$/);
    const form = page.getByRole("form", { name: "Book a free test edit" });
    await expect(form.getByRole("group", { name: "What do you need edited?" })).toBeVisible();
    await form.getByRole("button", { name: "Continue" }).click();
    await expect(form.getByLabel("Email")).toBeVisible();
    await expect(form.getByText("Send your requirements instead")).toBeVisible();
    await form.getByRole("button", { name: "Back" }).click();
    await expect(form.getByLabel("How much per month?")).toBeVisible();
    // No package recommendations anywhere in the flow (guide §9.3).
    await expect(form).not.toContainText(/package|tier|plan/i);
  });

  test("the free test also has its own page", async ({ page }) => {
    await page.goto("/post-production/free-test");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("See the quality first.");
  });

  test("tone rules: no overnight or guarantee lines", async ({ page }) => {
    await page.goto("/post-production");
    const text = (await page.locator("main").innerText()).toLowerCase();
    for (const banned of ["overnight", "while you sleep", "guarantee", "usually back in hours"]) {
      expect(text).not.toContain(banned);
    }
  });
});

/** Rows of an option group: distinct top positions of its options. */
const rows = (page: import("@playwright/test").Page, legend: string) =>
  page
    .getByRole("group", { name: legend })
    .locator(".opt")
    .evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);

test.describe("option groups on phones @mobile-only", () => {
  test("cards stack full width; 3 options on one row; 4 in 2 × 2; edges match the submit button", async ({
    page,
  }) => {
    await page.goto("/post-production#free-test");
    const ft = page.getByRole("form", { name: "Book a free test edit" });
    const cards = ft.getByRole("group", { name: "What do you need edited?" }).locator(".opt");
    await expect(cards).toHaveCount(3);
    expect(await rows(page, "What do you need edited?")).toBe(3);
    expect(await rows(page, "Who edits for you now?")).toBe(1);
    const submit = await ft.getByRole("button", { name: "Continue" }).boundingBox();
    for (const c of await cards.all()) {
      const box = await c.boundingBox();
      expect(Math.abs(box!.x - submit!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(box!.width - submit!.width)).toBeLessThanOrEqual(1);
    }

    await page.goto("/ai-avatars#demo");
    const demo = page.getByRole("form", { name: "Book a demo" });
    expect(await rows(page, "What's it for?")).toBe(2);
    expect(await rows(page, "How should we reply?")).toBe(1);
    const btn = await demo.getByRole("button", { name: "Book my demo" }).boundingBox();
    const group = await demo
      .getByRole("group", { name: "How should we reply?" })
      .locator(".opts")
      .boundingBox();
    expect(Math.abs(group!.x - btn!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(group!.x + group!.width - (btn!.x + btn!.width))).toBeLessThanOrEqual(1);

    await page.goto("/production#get-your-package");
    expect(await rows(page, "How should we reply?")).toBe(1);
  });
});

test.describe("AI avatars", () => {
  test("Show me the reveal overlays 100% AI and toggles back @mobile", async ({ page }) => {
    await page.goto("/ai-avatars");
    const btn = page.getByRole("button", { name: "Show me the reveal" });
    const overlay = page.locator(".reveal");
    await expect(overlay).not.toHaveClass(/on/);
    await btn.click();
    await expect(overlay).toHaveClass(/on/);
    await expect(overlay).toContainText("100% AI");
    await expect(page.getByRole("button", { name: "Hide the reveal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Hide the reveal" }).click();
    await expect(overlay).not.toHaveClass(/on/);
  });

  test("demo form: Other reveals a required field; reply defaults to Book a call", async ({
    page,
  }) => {
    await page.goto("/ai-avatars#demo");
    const form = page.getByRole("form", { name: "Book a demo" });
    await expect(form.getByLabel("Book a call")).toBeChecked();
    await expect(form.getByLabel("Tell us what it's for")).toHaveCount(0);
    await form.getByLabel("Other").check();
    const other = form.getByLabel("Tell us what it's for");
    await expect(other).toBeVisible();
    await expect(other).toBeFocused();
    await expect(other).toHaveAttribute("required", "");
  });

  test("plans show structure and launch pricing, no prices", async ({ page }) => {
    await page.goto("/ai-avatars");
    const plans = page.locator(".ai-tiers .pcard");
    await expect(plans).toHaveCount(3);
    await expect(page.getByText(otherPricing.aiAvatars.launchLine)).toBeVisible();
    await expect(page.locator(".ai-tiers")).not.toContainText(/AED|\$/);
  });
});

test.describe("service page actions", () => {
  const cases = [
    { path: "/post-production", mbar: "Book a free test", href: "#free-test" },
    { path: "/ai-avatars", mbar: "Book a demo", href: "#demo" },
  ];
  for (const c of cases) {
    test(`${c.path}: mobile bar "${c.mbar}" scrolls to its form @mobile-only`, async ({ page }) => {
      await page.goto(c.path);
      const bar = page.locator(".mbar");
      const cta = bar.getByRole("link", { name: c.mbar });
      await expect(cta).toHaveAttribute("href", c.href);
      await cta.click();
      await expect(page).toHaveURL(new RegExp(`${c.href}$`));
      await expect(page.locator(c.href)).toBeInViewport();
    });
  }
});
