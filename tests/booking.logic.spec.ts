import { expect, test } from "@playwright/test";
import { propertyPricing as pricing } from "@/content/pricing";
import {
  addDays,
  bookingWindow,
  dubaiToday,
  firstBookable,
  isBookable,
  monthWeeks,
} from "@/lib/booking/dates";
import {
  EVENING,
  blankProperty,
  buildMessage,
  dateLabel,
  priceLines,
  reducer,
  setType,
  subtotal,
  toggle,
  total,
  twilightNote,
  validate,
  type BookingProperty,
  type BookingState,
} from "@/lib/booking";

/** Rules and prices of guide §8, tested without a browser. */

const base = (patch: Partial<BookingProperty> = {}): BookingProperty => ({
  ...blankProperty(1, pricing, "2026-10-02", "Morning"),
  ...patch,
});
const state = (...properties: BookingProperty[]): BookingState => ({
  properties,
  nextId: properties.length + 1,
});
const run = reducer(pricing);

test.describe("prices (guide §8.3)", () => {
  test("apartment 1 Bed defaults to photography only: AED 500", () => {
    expect(subtotal(base(), pricing)).toBe(500);
  });

  test("every apartment and villa cell matches the tables", () => {
    const apt: [number, number, number, number, number, number][] = [
      [450, 300, 500, 600, 800, 500],
      [500, 300, 600, 700, 950, 600],
      [550, 350, 700, 800, 1100, 700],
      [650, 400, 800, 900, 1200, 800],
      [750, 400, 900, 1000, 1350, 900],
      [850, 450, 1000, 1200, 1500, 1000],
    ];
    const villa: typeof apt = [
      [700, 400, 900, 1000, 1250, 900],
      [800, 450, 950, 1100, 1400, 950],
      [900, 550, 1050, 1200, 1500, 1100],
      [1100, 650, 1150, 1300, 1600, 1250],
      [1200, 750, 1250, 1400, 1800, 1400],
      [1400, 800, 1350, 1600, 2000, 1500],
    ];
    for (const [type, table] of [
      ["apartment", apt],
      ["villa", villa],
    ] as const) {
      table.forEach(([photo, short, day, night, dn, tour], size) => {
        const p = (patch: Partial<BookingProperty>) =>
          subtotal(base({ type, size, photo: false, ...patch }), pricing);
        expect(p({ photo: true })).toBe(photo);
        expect(p({ video: true, short: true })).toBe(short);
        expect(p({ video: true, long: true, lighting: "day" })).toBe(day);
        expect(p({ video: true, long: true, lighting: "night" })).toBe(night);
        expect(p({ video: true, long: true, lighting: "dayNight" })).toBe(dn);
        expect(p({ tour: true })).toBe(tour);
      });
    }
  });

  test("commercial tiers, long-form at the daylight price", () => {
    const rows: [number, number, number | null, number | null][] = [
      [450, 300, null, null],
      [550, 350, 600, 600],
      [700, 450, 800, 800],
      [850, 500, 1000, 1000],
    ];
    rows.forEach(([photo, short, long, tour], size) => {
      const c = base({
        type: "commercial",
        size,
        photo: true,
        video: true,
        short: true,
        long: true,
        tour: true,
      });
      const lines = priceLines(c, pricing);
      expect(lines.find((l) => l.label === "Photography")?.amount).toBe(photo);
      expect(lines.find((l) => l.label === "Short-form video")?.amount).toBe(short);
      expect(lines.find((l) => l.label.startsWith("Long-form"))?.amount).toBe(long ?? undefined);
      expect(lines.find((l) => l.label === "360° tour")?.amount).toBe(tour ?? undefined);
    });
  });
});

test.describe("twilight add-on", () => {
  test("flat price by pack, villa rate for villas, only with photography", () => {
    expect(subtotal(base({ twilight: true, twilightQty: 10 }), pricing)).toBe(500 + 220);
    expect(
      subtotal(base({ type: "commercial", size: 1, twilight: true, twilightQty: 20 }), pricing),
    ).toBe(550 + 400);
    expect(
      subtotal(base({ type: "villa", size: 0, twilight: true, twilightQty: 5 }), pricing),
    ).toBe(700 + 150);
    // Twilight can't stay on without photography.
    const off = toggle(base({ twilight: true }), "photo", pricing);
    expect(off.twilight).toBe(false);
    expect(subtotal(off, pricing)).toBe(0);
  });

  test("per-image note and saving against the 5-image rate", () => {
    expect(twilightNote(base({ twilightQty: 5 }), pricing)).toBe("AED 24 per image.");
    expect(twilightNote(base({ twilightQty: 10 }), pricing)).toBe(
      "AED 22 per image. You save AED 20.",
    );
    expect(twilightNote(base({ twilightQty: 20 }), pricing)).toBe(
      "AED 20 per image. You save AED 80.",
    );
    expect(twilightNote(base({ type: "villa", size: 0, twilightQty: 10 }), pricing)).toBe(
      "AED 27.5 per image. You save AED 25.",
    );
  });
});

test.describe("video rules", () => {
  test("turning videography on selects short-form", () => {
    const p = toggle(base(), "video", pricing);
    expect(p.video && p.short && !p.long).toBe(true);
  });

  test("turning off both formats turns videography off", () => {
    const p = toggle(toggle(base(), "video", pricing), "short", pricing);
    expect(p.video).toBe(false);
  });

  test("night or day + night long-form forces the evening slot", () => {
    let p = toggle(toggle(base({ slot: "Morning" }), "video", pricing), "long", pricing);
    expect(p.slot).toBe("Morning");
    p = run(state(p), { type: "update", id: 1, patch: { lighting: "night" } }).properties[0];
    expect(p.slot).toBe(EVENING);
    // Trying to move to the morning while the lock applies keeps the evening.
    p = run(state(p), { type: "update", id: 1, patch: { slot: "Morning" } }).properties[0];
    expect(p.slot).toBe(EVENING);
    p = run(state(p), { type: "update", id: 1, patch: { lighting: "dayNight" } }).properties[0];
    expect(p.slot).toBe(EVENING);
    // Commercial long-form has no lighting option, so no lock.
    const c = base({
      type: "commercial",
      size: 1,
      video: true,
      long: true,
      lighting: "night",
      slot: "Morning",
    });
    expect(run(state(c), { type: "update", id: 1, patch: {} }).properties[0].slot).toBe("Morning");
  });
});

test.describe("commercial Basic lock", () => {
  test("long-form and 360 can't be selected in Basic, and are dropped when switching to it", () => {
    const basic = base({ type: "commercial", size: 0 });
    expect(toggle(basic, "tour", pricing).tour).toBe(false);
    const withVideo = toggle(basic, "video", pricing);
    expect(toggle(withVideo, "long", pricing).long).toBe(false);

    const premium = base({
      type: "commercial",
      size: 2,
      video: true,
      short: false,
      long: true,
      tour: true,
    });
    const toBasic = run(state(premium), { type: "update", id: 1, patch: { size: 0 } })
      .properties[0];
    expect(toBasic.tour).toBe(false);
    expect(toBasic.long).toBe(false);
    expect(toBasic.video).toBe(false); // long was the only format
  });

  test("changing type resets the size to that type's default", () => {
    expect(setType(base(), "villa", pricing).size).toBe(0); // 2 Bed
    expect(setType(base(), "commercial", pricing).size).toBe(1); // Essential
    expect(setType(base({ type: "villa", size: 5 }), "apartment", pricing).size).toBe(1); // 1 Bed
  });
});

test.describe("multiple properties", () => {
  test("add copies area, date and slot; duplicate clears the unit; remove keeps one", () => {
    let s = state(
      base({ area: "JVC", building: "Bloom", unit: "12", date: "2026-10-03", slot: "Afternoon" }),
    );
    s = run(s, { type: "add", date: "2026-10-01", slot: "Morning" });
    expect(s.properties[1]).toMatchObject({
      area: "JVC",
      building: "",
      unit: "",
      date: "2026-10-03",
      slot: "Afternoon",
    });
    s = run(s, { type: "duplicate", id: 1 });
    expect(s.properties.map((p) => p.id)).toEqual([1, 3, 2]);
    expect(s.properties[1]).toMatchObject({ building: "Bloom", unit: "" });
    s = run(run(run(s, { type: "remove", id: 1 }), { type: "remove", id: 2 }), {
      type: "remove",
      id: 3,
    });
    expect(s.properties).toHaveLength(1);
    expect(total(s, pricing)).toBe(500);
  });
});

test.describe("WhatsApp message (guide §8.4)", () => {
  test("two properties, numbered, no prices — matches the guide's example", () => {
    const a = base({
      twilight: true,
      twilightQty: 10,
      video: true,
      short: true,
      long: true,
      lighting: "dayNight",
      area: "Dubai Marina",
      building: "Marina Heights",
      unit: "1205",
      date: "2026-10-02",
      slot: EVENING,
    });
    const b = base({
      id: 2,
      size: 2,
      area: "Dubai Marina",
      building: "Marina Gate 1",
      date: "2026-10-02",
      slot: "Morning",
    });
    expect(buildMessage(state(a, b), pricing, "MW-1042")).toBe(
      [
        "Ref #MW-1042",
        "Hi Milkywayy,",
        "I'd like to book 2 properties:",
        "1. 1 Bed apartment — Photography + 10 twilight + Short-form video + Long-form video (day + night).",
        "Unit 1205, Marina Heights, Dubai Marina · Fri 2 Oct, evening",
        "2. 2 Bed apartment — Photography.",
        "Marina Gate 1, Dubai Marina · Fri 2 Oct, morning",
      ].join("\n"),
    );
  });

  test("single property: no count, no numbering; commercial title", () => {
    const c = base({
      type: "commercial",
      size: 2,
      video: true,
      long: true,
      area: "Business Bay",
      building: "Bay Square 5",
    });
    const msg = buildMessage(state(c), pricing, "MW-7");
    expect(msg).toContain("I'd like to book:\nPremium commercial — Photography + Long-form video.");
    expect(msg).not.toMatch(/AED|\d+\. /);
  });
});

test.describe("validation and dates", () => {
  test("needs a service, an area and a building", () => {
    const errs = validate(state(base({ photo: false })));
    expect(Object.keys(errs[1]).sort()).toEqual(["area", "building", "services"]);
    expect(validate(state(base({ area: "JLT", building: "Lake View" })))).toEqual({});
  });

  test("calendar window: from tomorrow in Dubai, off days and past dates closed", () => {
    // 21:30 UTC on Tue 29 Sep is already Wed 30 Sep in Dubai (UTC+4).
    const today = dubaiToday(new Date("2026-09-29T21:30:00Z"));
    expect(today).toBe("2026-09-30");
    const w = bookingWindow(today, 60, [0]);
    expect(w.first).toBe("2026-10-01");
    expect(w.last).toBe("2026-11-29");
    expect(isBookable("2026-09-30", w)).toBe(false); // today
    expect(isBookable("2026-10-01", w)).toBe(true);
    expect(isBookable("2026-10-04", w)).toBe(false); // Sunday
    expect(isBookable("2026-11-30", w)).toBe(false); // past the window
    // When tomorrow is an off day, the first bookable day skips it.
    expect(firstBookable(bookingWindow("2026-10-03", 60, [0]))).toBe("2026-10-05");
    expect(firstBookable(bookingWindow("2026-10-03", 60, []))).toBe("2026-10-04");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dateLabel("2026-10-01")).toBe("Thu 1 Oct");
  });

  test("month grid is Monday-first with blanks outside the month", () => {
    const weeks = monthWeeks(2026, 9); // October 2026 starts on a Thursday
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});
