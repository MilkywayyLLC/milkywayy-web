import { expect, test } from "@playwright/test";
import { propertyPricing } from "@/content/pricing";
import {
  cleanVideos,
  estimate,
  estimateLines,
  normalizeServices,
  videoSummary,
  type BookingService,
} from "@/lib/portal/booking";
import { aed0, halfDaysOf, monthEndSoFar, packageSplit } from "@/lib/portal/payments";

/** Portal refinement (owner, 25 Oct 2026): content shoot by length, month-end so far, whole AED. */
const rates = {
  content_2h: 750,
  content_4h: 1200,
  content_8h: 2000,
  content_short_edit: 200,
  content_long_edit: 600,
};
const content = (v: Record<string, unknown>): BookingService => ({
  service: "videos",
  videos: cleanVideos({ by: "hours", ...v } as never),
});

test("content shoot: total = length + edits", () => {
  expect(estimate([content({ hours: 4, short: 4 })], rates, propertyPricing)).toBe(2000);
  expect(estimate([content({ hours: 2, short: 2 })], rates, propertyPricing)).toBe(1150);
  expect(estimate([content({ hours: 8, short: 8, long: 2 })], rates, propertyPricing)).toBe(
    2000 + 1600 + 1200,
  );
  expect(
    estimateLines([content({ hours: 4, short: 4, long: 1 })], rates, propertyPricing).map((l) => [
      l.key,
      l.qty,
      l.amount,
    ]),
  ).toEqual([
    ["content_4h", 1, 1200],
    ["content_short_edit", 4, 800],
    ["content_long_edit", 1, 600],
  ]);
});

test("content shoot: raw files only drops the edits; long-form edits 1–3", () => {
  expect(cleanVideos({ by: "hours", hours: 8, raw: true, short: 8, long: 2 })).toEqual({
    by: "hours",
    hours: 8,
    raw: true,
  });
  expect(estimate([content({ hours: 8, raw: true, short: 8 })], rates, propertyPricing)).toBe(2000);
  expect(cleanVideos({ by: "hours", hours: 4, long: 9 }).long).toBe(3);
  // An unknown length falls back to 4 hours.
  expect(cleanVideos({ by: "hours", hours: 5 as never }).hours).toBe(4);
  expect(videoSummary(cleanVideos({ by: "hours", hours: 2, short: 2 }))).toBe(
    "2 h content shoot · 2 short-form edits",
  );
});

test("content shoot on a package: 2 h a quarter day, 4 h a half, 8 h a full day", () => {
  expect(halfDaysOf({ hasVideo: true, hours: 2 })).toBe(0.5);
  expect(halfDaysOf({ hasVideo: true, hours: 4 })).toBe(1);
  expect(halfDaysOf({ hasVideo: true, hours: 8 })).toBe(2);
  // Property shoots and older bookings unchanged.
  expect(halfDaysOf({ hasVideo: false, hours: 8 })).toBe(0);
  expect(halfDaysOf({ hasVideo: true, slot: "full_day" })).toBe(2);
  // Value = length + edits; it draws from the allowance as before.
  const s = packageSplit(2000, 1, { allowance_left: 1258, half_days_left: 7 });
  expect(s).toMatchObject({ included: 1258, extra: 742 });
});

test("older content bookings stay readable", () => {
  const old: BookingService = { service: "videos", videos: { by: "time", day: "half", raw: true } };
  expect(normalizeServices([old])).toEqual([old]);
  expect(videoSummary(old.videos!)).toBe("Half day · raw files only");
  expect(estimate([old], { half_day: 1200 }, propertyPricing)).toBe(1200);
});

test("month-end so far: lines add up, nothing counted twice, whole dirhams", () => {
  // Both bookings covered by a pro-rated Growth month (10,000 × 7/31): just the package.
  const covered = monthEndSoFar({ price: 2258.06, extras_total: 0, estimate: 2258.06 });
  expect(covered.total).toBe(2258);
  expect(covered.lines).toEqual([
    { key: "package", amount: 2258 },
    { key: "extras", amount: 0 },
  ]);
  // Work from before the package started is its own line, so the total is never a mystery.
  const before = monthEndSoFar({ price: 2258, extras_total: 0, estimate: 2758 });
  expect(before.total).toBe(2758);
  expect(before.lines.reduce((n, l) => n + l.amount, 0)).toBe(before.total);
  expect(aed0(1258.4)).toBe(1258);
});

test("short titles for lists: building and community, no city or country", async () => {
  const { shortTitle } = await import("@/lib/portal/projects");
  expect(
    shortTitle("Shoot · Marina Heights Tower - Dubai Marina - Dubai - United Arab Emirates"),
  ).toBe("Marina Heights Tower, Dubai Marina");
  expect(shortTitle("2 Bed apartment, Marina Gate 1")).toBe("2 Bed apartment, Marina Gate 1");
  expect(shortTitle("Brand reel")).toBe("Brand reel");
  expect(shortTitle("Shoot · Dubai Marina Mall Tram Station, Dubai Marina, Dubai, UAE")).toBe(
    "Dubai Marina Mall Tram Station, Dubai Marina",
  );
});
