import { expect, test, type Locator, type Page } from "@playwright/test";
import { siteSettings } from "@/content/site";
import {
  addDays,
  bookingWindow,
  dubaiToday,
  firstBookable,
  isBookable,
  longDate,
} from "@/lib/booking/dates";

/**
 * Booking builder on /book (guide §8 + owner changes 30 Sep 2026): multi-property, twilight,
 * evening lock, Commercial Basic lock, calendar, accordion panels, WhatsApp message, and the
 * mobile bottom bar + summary sheet. window.open is stubbed to capture the WhatsApp URL.
 */

const URL = "/book";

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

const opened = (page: Page) =>
  page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
const card = (b: Locator, name: RegExp) => b.getByRole("button", { name });
// The desktop side summary (a second copy lives in the closed mobile sheet).
const side = (b: Locator) => b.locator(".bk > .b-sum");
const total = (b: Locator) => side(b).locator(".tot");
const preview = (b: Locator) => side(b).locator(".wa-preview");

const range = () => {
  const b = siteSettings.booking;
  return bookingWindow(dubaiToday(new Date()), b.windowDays, b.closedWeekdays);
};

test.describe("desktop builder", () => {
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

  test("twilight options open under Photography and add the pack price", async ({ page }) => {
    const b = await open(page);
    const panel = b.getByRole("group", { name: "Photography options" });
    await expect(card(b, /^Photography/)).toHaveAttribute(
      "aria-controls",
      (await panel.getAttribute("id")) ?? "",
    );
    await panel.getByLabel(/Add twilight images/).check();
    await panel.getByRole("button", { name: /^10 images/ }).click();
    await expect(total(b)).toHaveText("AED 720");
    await expect(b.getByText("AED 22 per image. You save AED 20.")).toBeVisible();
    await expect(preview(b)).toContainText("Photography + 10 twilight");
  });

  test("night long-form locks the slot to evening", async ({ page }) => {
    const b = await open(page);
    await card(b, /^Videography/).click();
    const panel = b.getByRole("group", { name: "Videography options" });
    await expect(card(panel, /^Short-form/)).toHaveAttribute("aria-pressed", "true");
    await card(panel, /^Long-form/).click();
    await panel.getByRole("button", { name: "Night", exact: true }).click();
    await expect(b.getByText("Night footage needs an evening slot")).toBeVisible();
    const slots = b.getByRole("group", { name: "Time slot" });
    await expect(slots.getByRole("button", { name: "Morning" })).toBeDisabled();
    await expect(slots.getByRole("button", { name: "Afternoon" })).toBeDisabled();
    await expect(slots.getByRole("button", { name: "Evening" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(total(b)).toHaveText("AED 1,500"); // 500 photo + 300 short + 700 night (1 Bed)
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
    await card(b, /^Essential/).click();
    await expect(card(b, /^360° tour/)).toBeEnabled();
    await expect(card(b, /^Long-form/)).toBeEnabled();
  });

  test("calendar: past and off days disabled, month navigation, date in the message", async ({
    page,
  }) => {
    const b = await open(page);
    const w = range();
    const cal = b.getByRole("group", { name: "Preferred date" });
    const day = (iso: string) => cal.getByRole("button", { name: new RegExp(`^${longDate(iso)}`) });

    const first = firstBookable(w);
    await expect(day(first)).toHaveAttribute("aria-pressed", "true");
    // Today (if shown this month) is unavailable.
    const today = addDays(w.first, -1);
    if (today.slice(0, 7) === first.slice(0, 7)) {
      await expect(day(today)).toHaveAttribute("aria-disabled", "true");
    }
    // An off day in the shown month is unavailable.
    let off = first;
    while (off.slice(0, 7) === first.slice(0, 7) && isBookable(off, w)) off = addDays(off, 1);
    if (off.slice(0, 7) === first.slice(0, 7)) {
      await expect(day(off)).toHaveAttribute("aria-disabled", "true");
      await day(off).click({ force: true }); // aria-disabled: still focusable, click is ignored
      await expect(day(first)).toHaveAttribute("aria-pressed", "true"); // unchanged
    }
    // Previous month is disabled; next month works and a bookable day there can be picked.
    await expect(cal.getByRole("button", { name: "Previous month" })).toBeDisabled();
    await cal.getByRole("button", { name: "Next month" }).click();
    let next = `${addDays(`${first.slice(0, 7)}-28`, 7).slice(0, 7)}-01`;
    while (!isBookable(next, w)) next = addDays(next, 1);
    await day(next).click();
    await expect(day(next)).toHaveAttribute("aria-pressed", "true");
    const label = new Date(`${next}T00:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    await expect(preview(b)).toContainText(label.replace(",", ""));
    // Keyboard: arrow keys move focus between days.
    await day(next).focus();
    await page.keyboard.press("ArrowRight");
    await expect(day(addDays(next, 1))).toBeFocused();
  });

  test("multiple properties: numbered message, summary and total", async ({ page }) => {
    const b = await open(page);
    await b.getByLabel("Community / area").fill("Dubai Marina");
    await b.getByLabel("Building / tower").fill("Marina Heights");
    await b.getByRole("button", { name: "+ Add another property" }).click();
    await expect(b.locator(".prop")).toHaveCount(2);
    await expect(b.getByLabel("Community / area")).toHaveValue("Dubai Marina");
    await b.getByRole("button", { name: "2 Bed", exact: true }).click();
    await b.getByLabel("Building / tower").fill("Marina Gate 1");
    await expect(side(b).locator(".sum-item")).toHaveCount(2);
    await expect(total(b)).toHaveText("AED 1,050");
    await expect(preview(b)).toContainText("I'd like to book 2 properties:");
    await expect(preview(b)).toContainText("1. 1 Bed apartment — Photography.");
    await expect(preview(b)).toContainText("2. 2 Bed apartment — Photography.");
    await expect(preview(b)).not.toContainText("AED");
  });

  test("send: validates, then opens WhatsApp with the message and shows the ref", async ({
    page,
  }) => {
    const b = await open(page);
    const send = side(b).getByRole("button", { name: "Send request on WhatsApp" });
    await send.click();
    await expect(b.getByText("Add the community or area")).toBeVisible();
    await expect(b.getByLabel("Community / area")).toBeFocused();
    expect(await opened(page)).toHaveLength(0);

    await b.getByLabel("Community / area").fill("JVC");
    await b.getByLabel("Building / tower").fill("Bloom Towers");
    await b.getByLabel("Unit number").fill("804");
    await send.click();

    const urls = await opened(page);
    expect(urls).toHaveLength(1);
    const url = new globalThis.URL(urls[0]);
    expect(url.origin + url.pathname).toBe("https://wa.me/971507263306");
    const text = url.searchParams.get("text") ?? "";
    expect(text).toMatch(
      /^Ref #MW-\d{4,6}\nHi Milkywayy,\nI'd like to book:\n1 Bed apartment — Photography\.\nUnit 804, Bloom Towers, JVC · \w{3} \d{1,2} \w{3}, morning$/,
    );
    const ref = text.match(/MW-\d+/)?.[0] ?? "";
    await expect(side(b).getByRole("status")).toContainText(`Ref #${ref}`);
  });
});

test.describe("phone layout @mobile-only", () => {
  test("rows: type 3 across, sizes 3 per row, commercial tiers 2 × 2, panels under their card", async ({
    page,
  }) => {
    const b = await open(page);
    const tops = (l: Locator) =>
      l.evaluateAll(
        (els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))].length,
      );
    expect(await tops(b.getByRole("group", { name: "Property type" }).getByRole("button"))).toBe(1);
    expect(await tops(b.getByRole("group", { name: "Size" }).getByRole("button"))).toBe(2);
    await card(b, /^Videography/).click();
    // DOM and visual order: Photography, its panel, Videography, its panel, 360.
    const order = await b.locator(".svc-grid > *").evaluateAll((els) =>
      els
        .map((e) => ({
          top: e.getBoundingClientRect().top,
          name: e.getAttribute("aria-label") ?? e.querySelector("b")?.textContent,
        }))
        .sort((x, y) => x.top - y.top)
        .map((x) => x.name),
    );
    expect(order).toEqual([
      "Photography",
      "Photography options",
      "Videography",
      "Videography options",
      "360° tour",
    ]);
    await b.getByRole("button", { name: "Commercial" }).click();
    const tiers = b.locator(".cards.cols-4 .sc");
    expect(await tops(tiers)).toBe(2);
    for (const c of await tiers.all()) {
      expect(await c.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    }
  });

  test("bottom bar opens the summary sheet; send works from the sheet", async ({ page }) => {
    const b = await open(page);
    await expect(page.locator(".mbar")).toHaveCount(0); // replaced on /book
    const bar = page.getByRole("region", { name: "Booking total" });
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("1 property");
    await expect(bar).toContainText("AED 500");
    await bar.getByRole("button", { name: "Review & send" }).click();
    const sheet = page.getByRole("dialog", { name: "Booking summary" });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator(".wa-preview")).toContainText("I'd like to book:");
    // Missing location: the sheet closes and the field gets focus.
    await sheet.getByRole("button", { name: "Send request on WhatsApp" }).click();
    await expect(sheet).toBeHidden();
    await expect(b.getByLabel("Community / area")).toBeFocused();
    await b.getByLabel("Community / area").fill("Al Barsha");
    await b.getByLabel("Building / tower").fill("Barsha Heights Tower");
    await bar.getByRole("button", { name: "Review & send" }).click();
    await sheet.getByRole("button", { name: "Send request on WhatsApp" }).click();
    expect(await opened(page)).toHaveLength(1);
    await expect(sheet.getByRole("status")).toContainText("Request ready.");
    await sheet.getByRole("button", { name: "Close summary" }).click();
    await expect(sheet).toBeHidden();
  });
});
