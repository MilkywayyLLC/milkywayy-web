import { expect, test } from "@playwright/test";
import { propertyPricing } from "@/content/pricing";
import {
  estimate,
  estimateLines,
  logPrefill,
  minimumTopUp,
  normalizeServices,
  packageLines,
  type BookingService,
} from "@/lib/portal/booking";

/** Booking redesign (site-refine, 18 Oct 2026): Photos and/or Videos, flexible day minimums. */
const rates = {
  reel_shoot: 400,
  long_form_shoot: 1000,
  long_form_extra_min: 100,
  half_day: 1200,
  full_day: 1800,
  min_half_day: 1600,
  min_full_day: 2800,
};
const photos = (size = 1): BookingService => ({
  service: "property",
  property: { type: "apartment", size, photo: true, tour: false, twilight: false } as never,
});

test("flexible minimum vs per-video", () => {
  // 3 reels = 1,200 < 1,600: top-up 400. 5 reels = 2,000: no top-up.
  expect(minimumTopUp([{ key: "reel_shoot", qty: 3, unit: 400 }], 1600, false)).toBe(400);
  expect(minimumTopUp([{ key: "reel_shoot", qty: 5, unit: 400 }], 1600, false)).toBe(0);
  // Photos don't count toward the video minimum.
  expect(
    minimumTopUp(
      [
        { key: "shoot", qty: 1, unit: 500 },
        { key: "long_form_shoot", qty: 1, unit: 1000 },
      ],
      1600,
      false,
    ),
  ).toBe(600);
  // The estimate shows the minimum ("from").
  const flex: BookingService[] = [{ service: "videos", videos: { by: "time", day: "full" } }];
  expect(estimate(flex, rates, propertyPricing)).toBe(2800);
  expect(estimateLines(flex, rates, propertyPricing)[0].minimum).toBe(true);
});

test("package: no minimum top-up, videos draw from inclusions", () => {
  expect(minimumTopUp([{ key: "reel_shoot", qty: 1, unit: 0 }], 1600, true)).toBe(0);
  const flex = estimateLines(
    [{ service: "videos", videos: { by: "time", day: "half" } }],
    rates,
    propertyPricing,
  );
  expect(packageLines(flex, { reel_shoot: { qty: 8, remaining: 8 } })[0].amount).toBe(0);
  const counted = estimateLines(
    [{ service: "videos", videos: { by: "count", short: 10 } }],
    rates,
    propertyPricing,
  );
  const pl = packageLines(counted, { reel_shoot: { qty: 8, remaining: 8 } })[0];
  expect(pl.included).toBe(8);
  expect(pl.amount).toBe(800); // 2 extras at the client's rate
});

test("long-form extra minutes", () => {
  const s: BookingService[] = [
    { service: "videos", videos: { by: "count", long: 2, extra_min: 3 } },
  ];
  expect(estimate(s, rates, propertyPricing)).toBe(2 * 1000 + 3 * 100);
  expect(logPrefill(s, propertyPricing).map((l) => [l.key, l.qty])).toEqual([
    ["long_form_shoot", 2],
    ["long_form_extra_min", 3],
  ]);
});

test("raw files by time: one flat day rate, no minimum", () => {
  const s: BookingService[] = [
    { service: "videos", videos: { by: "time", day: "half", raw: true } },
  ];
  expect(estimate(s, rates, propertyPricing)).toBe(1200);
  expect(logPrefill(s, propertyPricing).some((l) => l.minimum)).toBe(false);
});

test("mixed photos + videos", () => {
  const s = [photos(1), { service: "videos", videos: { by: "count", short: 2 } } as BookingService];
  expect(estimate(s, rates, propertyPricing)).toBe(propertyPricing.apartment.sizes[1].photo + 800);
});

test("older bookings read in today's shape", () => {
  const old: BookingService[] = [
    { service: "reels", mode: "edited", qty: 3, day: "half" },
    {
      service: "property",
      property: { type: "apartment", size: 1, photo: true, video: true, short: true } as never,
    },
  ];
  const n = normalizeServices(old);
  expect(n[0].service).toBe("property");
  expect(n[0].property?.video).toBe(false);
  expect(n[1].videos).toEqual({ by: "count", short: 4 });
  // No old day fee on the prefill.
  expect(logPrefill(old, propertyPricing).some((l) => l.key === "half_day")).toBe(false);
  expect(normalizeServices([{ service: "long_form", mode: "raw", day: "full" }])[0].videos).toEqual(
    { by: "time", raw: true, day: "full" },
  );
});
