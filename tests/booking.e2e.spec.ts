import { expect, test, type Page } from "@playwright/test";

/**
 * Booking builder in the browser (guide §14, Phase 3): multi-property, twilight, lighting/evening
 * lock, Commercial Basic lock, WhatsApp message. window.open is stubbed to capture the WhatsApp URL.
 */

const URL = "/production/property-shoots";

async function open(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url: string) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url));
      return null;
    }) as typeof window.open;
  });
  await page.goto(URL);
  return page.locator("#build-your-booking");
}

const card = (b: ReturnType<Page["locator"]>, name: RegExp) => b.getByRole("button", { name });
const total = (b: ReturnType<Page["locator"]>) => b.locator(".b-sum .tot");
const preview = (b: ReturnType<Page["locator"]>) => b.locator(".wa-preview");

test("starts with one 1 Bed apartment, photography only, AED 500", async ({ page }) => {
  const b = await open(page);
  await expect(b.locator(".prop")).toHaveCount(1);
  await expect(b.getByRole("button", { name: "1 Bed", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(card(b, /^Photography/)).toHaveAttribute("aria-pressed", "true");
  await expect(total(b)).toHaveText("AED 500");
});

test("twilight add-on adds the pack price and shows the saving", async ({ page }) => {
  const b = await open(page);
  await b.getByLabel(/Add twilight images/).check();
  await b.getByRole("button", { name: /^10 images/ }).click();
  await expect(total(b)).toHaveText("AED 720");
  await expect(b.getByText("AED 22 per image. You save AED 20.")).toBeVisible();
  await expect(preview(b)).toContainText("Photography + 10 twilight");
});

test("night long-form locks the slot to evening", async ({ page }) => {
  const b = await open(page);
  await card(b, /^Videography/).click();
  await expect(card(b, /^Short-form/)).toHaveAttribute("aria-pressed", "true");
  await card(b, /^Long-form/).click();
  await b.getByRole("button", { name: "Night", exact: true }).click();
  await expect(b.getByText("Night footage needs an evening slot")).toBeVisible();
  await expect(b.getByRole("button", { name: "Morning", exact: true })).toBeDisabled();
  await expect(b.getByRole("button", { name: "Afternoon", exact: true })).toBeDisabled();
  await expect(b.getByRole("button", { name: "Evening", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // 500 photo + 300 short + 700 night long-form (1 Bed)
  await expect(total(b)).toHaveText("AED 1,500");
  await expect(preview(b)).toContainText("Long-form video (night)");
  await expect(preview(b)).toContainText(", evening");
});

test("commercial Basic can't book long-form or a 360 tour", async ({ page }) => {
  const b = await open(page);
  await b.getByRole("button", { name: "Commercial", exact: true }).click();
  await card(b, /^Basic/).click();
  await expect(card(b, /^360° tour/)).toBeDisabled();
  await expect(card(b, /^360° tour/)).toContainText("Not in Basic");
  await card(b, /^Videography/).click();
  await expect(card(b, /^Long-form/)).toBeDisabled();
  await expect(b.locator(".incl-strip")).toContainText("Walkthrough Not included");
  // Essential re-enables both.
  await card(b, /^Essential/).click();
  await expect(card(b, /^360° tour/)).toBeEnabled();
  await expect(card(b, /^Long-form/)).toBeEnabled();
});

test("multiple properties: numbered message, summary and total", async ({ page }) => {
  const b = await open(page);
  await b.getByLabel("Community / area").fill("Dubai Marina");
  await b.getByLabel("Building / tower").fill("Marina Heights");
  await b.getByRole("button", { name: "+ Add another property" }).click();
  await expect(b.locator(".prop")).toHaveCount(2);
  // The new card is open and copied the area.
  await expect(b.getByLabel("Community / area")).toHaveValue("Dubai Marina");
  await b.getByRole("button", { name: "2 Bed", exact: true }).click();
  await b.getByLabel("Building / tower").fill("Marina Gate 1");
  await expect(b.locator(".sum-item")).toHaveCount(2);
  await expect(total(b)).toHaveText("AED 1,050");
  await expect(preview(b)).toContainText("I'd like to book 2 properties:");
  await expect(preview(b)).toContainText("1. 1 Bed apartment — Photography.");
  await expect(preview(b)).toContainText("2. 2 Bed apartment — Photography.");
  await expect(preview(b)).not.toContainText("AED");
});

test("send: validates, then opens WhatsApp with the message and shows the ref @mobile", async ({
  page,
}) => {
  const b = await open(page);
  await b.getByRole("button", { name: "Send request on WhatsApp" }).click();
  await expect(b.getByText("Add the community or area")).toBeVisible();
  await expect(b.getByLabel("Community / area")).toBeFocused();
  expect(
    await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened),
  ).toHaveLength(0);

  await b.getByLabel("Community / area").fill("JVC");
  await b.getByLabel("Building / tower").fill("Bloom Towers");
  await b.getByLabel("Unit number").fill("804");
  await b.getByRole("button", { name: "Send request on WhatsApp" }).click();

  const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  expect(opened).toHaveLength(1);
  const url = new globalThis.URL(opened[0]);
  expect(url.origin + url.pathname).toBe("https://wa.me/971507263306");
  const text = url.searchParams.get("text") ?? "";
  expect(text).toMatch(
    /^Ref #MW-\d{4,6}\nHi Milkywayy,\nI'd like to book:\n1 Bed apartment — Photography\.\nUnit 804, Bloom Towers, JVC · \w{3} \d{1,2} \w{3}, morning$/,
  );
  const ref = text.match(/MW-\d+/)?.[0] ?? "";
  await expect(b.getByRole("status").filter({ hasText: "Request ready." })).toContainText(
    `Ref #${ref}`,
  );
});
