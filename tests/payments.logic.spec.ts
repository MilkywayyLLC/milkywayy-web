import { expect, test } from "@playwright/test";
import {
  dayCount,
  dueNow,
  packageSplitUsage,
  shootDays,
  halfDaysOf,
  packageSplit,
  quoteChange,
  BOOKING_TERMS,
  BOOKING_TERMS_VERSION,
  type ChangeInput,
  type PaidInvoice,
} from "@/lib/portal/payments";

/**
 * Payment terms (owner, 24 Oct 2026): what's due at booking, a value package's split, and the
 * cancellation fee / refund matrix. The database tests (payments-db.portal.spec.ts) apply these.
 */
const settings = { cancel_free_hours: 3, late_fee_pct: 50, late_fee_min: 250, work_keep_pct: 50 };
const NOW = new Date("2026-11-10T06:00:00Z"); // 10:00 in Dubai
const inHours = (h: number) => new Date(NOW.getTime() + h * 36e5).toISOString();
const paid = (amount: number, via: PaidInvoice["paid_via"] = "bank"): PaidInvoice[] =>
  amount ? [{ id: "inv-1", amount, refunded: 0, paid_via: via }] : [];
const shoot = (o: Partial<ChangeInput>): ChangeInput => ({
  kind: "cancel",
  type: "shoot",
  status: "confirmed",
  start: inHours(24),
  now: NOW,
  value: 1000,
  paid: [],
  settings,
  ...o,
});

test("due now: 100% / 50% / end of month, VAT on top", () => {
  expect(dueNow("prepay", 1600)).toEqual({ pct: 100, subtotal: 1600, vat: 0, total: 1600 });
  expect(dueNow("split", 1600)).toEqual({ pct: 50, subtotal: 800, vat: 0, total: 800 });
  expect(dueNow("month_end", 1600).total).toBe(0);
  expect(dueNow("prepay", 1000, 5)).toEqual({ pct: 100, subtotal: 1000, vat: 50, total: 1050 });
  expect(dueNow("split", 1001, 5)).toEqual({ pct: 50, subtotal: 500.5, vat: 25.03, total: 525.53 });
  // Nothing to charge without an estimate.
  expect(dueNow("prepay", null).total).toBe(0);
  expect(dueNow("split", 0).total).toBe(0);
});

test("half-days: content by slot, a full day is 2, property shoots none", () => {
  expect(halfDaysOf({ hasVideo: true, slot: "morning" })).toBe(1);
  expect(halfDaysOf({ hasVideo: true, slot: "afternoon" })).toBe(1);
  expect(halfDaysOf({ hasVideo: true, slot: "full_day" })).toBe(2);
  expect(halfDaysOf({ hasVideo: true, slot: "morning", fullDay: true })).toBe(2);
  expect(halfDaysOf({ hasVideo: false, slot: "full_day" })).toBe(0);
});

test("shoot days in full days: half a day is 0.5 (stored as half-days)", () => {
  expect(shootDays(8)).toBe("4 shoot days");
  expect(shootDays(2)).toBe("1 shoot day");
  expect(shootDays(1)).toBe("0.5 shoot days");
  expect(dayCount(5)).toBe("2.5");
  expect(`${dayCount(5)} of ${shootDays(8)}`).toBe("2.5 of 4 shoot days");
});

test("package meters: completed (delivered) / booked / remaining, days up to the cap", () => {
  const u = packageSplitUsage({
    allowance: 10000,
    half_day_cap: 8,
    bookings: [
      { status: "delivered", late_cancel: false, included: 3200, half_days: 2 },
      { status: "confirmed", late_cancel: false, included: 1600, half_days: 1 },
      { status: "cancelled", late_cancel: true, included: 0, half_days: 1 },
      { status: "requested", late_cancel: false, included: 1600, half_days: 6 },
    ],
  });
  expect(u.aed).toEqual({ done: 3200, booked: 3200, rest: 3600, total: 10000 });
  // 2 + 1 (late cancel, done) = 3 done; 1 + 4 of the last booking's 6 (cap 8) booked.
  expect(u.hd).toEqual({ done: 3, booked: 5, rest: 0, total: 8 });
});

test("value package: covered, over by value, over by half-days", () => {
  // Inside both: all covered.
  expect(packageSplit(1600, 1, { allowance_left: 10000, half_days_left: 6 })).toMatchObject({
    included: 1600,
    extra: 0,
    allowance_after: 8400,
    half_days_after: 5,
  });
  // Over by value: the part beyond the allowance.
  expect(packageSplit(2000, 0, { allowance_left: 1400, half_days_left: 6 })).toMatchObject({
    included: 1400,
    extra: 600,
    half_days_after: 6,
  });
  // Over by half-days: a full day with 1 half-day left → half its value is extra.
  expect(packageSplit(2800, 2, { allowance_left: 10000, half_days_left: 1 })).toMatchObject({
    included: 1400,
    extra: 1400,
    half_days_after: 0,
  });
  // Both run out: the larger extra wins.
  expect(packageSplit(2800, 2, { allowance_left: 400, half_days_left: 1 }).extra).toBe(2400);
  // Nothing left at all: all extra.
  expect(packageSplit(1600, 1, { allowance_left: 0, half_days_left: 0 }).extra).toBe(1600);
});

test("shoot cancelled more than 3 hours before: free, full refund, any amount paid", () => {
  for (const p of [0, 500, 1000]) {
    const q = quoteChange(shoot({ start: inHours(3.5), paid: paid(p) }));
    expect(q).toMatchObject({ allowed: true, late: false, fee: 0, refund: p, owed: 0 });
    expect(q.refunds.reduce((n, r) => n + r.amount, 0)).toBe(p);
  }
  // Reschedules too: free, nothing refunded (the booking stands).
  const r = quoteChange(shoot({ kind: "reschedule", start: inHours(5), paid: paid(1000) }));
  expect(r).toMatchObject({ allowed: true, late: false, fee: 0, refund: 0 });
});

test("late (under 3h, crew en route, no access) × paid 0 / 50% / 100%", () => {
  const cases: [Partial<ChangeInput>, string][] = [
    [{ start: inHours(2) }, "under 3 hours"],
    [{ start: inHours(30), reason: "en_route" }, "crew on the way"],
    [{ start: inHours(-0.5), reason: "no_access" }, "no access"],
  ];
  for (const [c, label] of cases) {
    // Nothing paid: the fee is invoiced.
    expect(quoteChange(shoot({ ...c, paid: paid(0) })), label).toMatchObject({
      late: true,
      fee: 500,
      refund: 0,
      owed: 500,
    });
    // 50% paid: the deposit covers the fee, nothing back, nothing more to pay.
    expect(quoteChange(shoot({ ...c, paid: paid(500) })), label).toMatchObject({
      fee: 500,
      refund: 0,
      owed: 0,
    });
    // 100% paid: the fee kept, the rest refunded.
    expect(quoteChange(shoot({ ...c, paid: paid(1000) })), label).toMatchObject({
      fee: 500,
      refund: 500,
      owed: 0,
    });
  }
});

test("late fee: minimum AED 250, never more than the booking", () => {
  expect(quoteChange(shoot({ start: inHours(1), value: 400 })).fee).toBe(250);
  expect(quoteChange(shoot({ start: inHours(1), value: 200 })).fee).toBe(200);
  expect(quoteChange(shoot({ start: inHours(1), value: 3000 })).fee).toBe(1500);
  // Paid 400 on a 400 booking: 250 kept, 150 back.
  expect(quoteChange(shoot({ start: inHours(1), value: 400, paid: paid(400) }))).toMatchObject({
    fee: 250,
    refund: 150,
  });
});

test("package clients: a late change uses 1 half-day instead of the fee (fee if none left)", () => {
  const q = quoteChange(shoot({ start: inHours(1), onPackage: true, halfDaysLeft: 2 }));
  expect(q).toMatchObject({ late: true, fee: 0, halfDays: 1, owed: 0 });
  expect(q.summary).toContain("half a shoot day");
  expect(quoteChange(shoot({ start: inHours(1), onPackage: true, halfDaysLeft: 0 }))).toMatchObject(
    {
      fee: 500,
      halfDays: 0,
    },
  );
  // Early: free on a package too.
  expect(
    quoteChange(shoot({ start: inHours(10), onPackage: true, halfDaysLeft: 2 })),
  ).toMatchObject({
    fee: 0,
    halfDays: 0,
  });
});

test("admin: waive or change the fee before it's applied", () => {
  const waived = quoteChange(shoot({ start: inHours(1), paid: paid(1000), waive: true }));
  expect(waived).toMatchObject({ fee: 0, standardFee: 500, refund: 1000, halfDays: 0 });
  const changed = quoteChange(shoot({ start: inHours(1), paid: paid(1000), feeOverride: 300 }));
  expect(changed).toMatchObject({ fee: 300, standardFee: 500, refund: 700 });
  const pkgWaived = quoteChange(
    shoot({ start: inHours(1), onPackage: true, halfDaysLeft: 3, waive: true }),
  );
  expect(pkgWaived).toMatchObject({ fee: 0, halfDays: 0 });
});

test("late reschedule: the fee is charged, nothing refunded", () => {
  expect(
    quoteChange(shoot({ kind: "reschedule", start: inHours(1), paid: paid(1000) })),
  ).toMatchObject({ late: true, fee: 500, refund: 0, owed: 500 });
});

test("refunds spread over paid invoices, never more than is left on each", () => {
  const q = quoteChange(
    shoot({
      start: inHours(10),
      paid: [
        { id: "dep", amount: 500, refunded: 0, paid_via: "stripe" },
        { id: "bal", amount: 500, refunded: 100, paid_via: "bank" },
      ],
    }),
  );
  expect(q.refund).toBe(900);
  expect(q.refunds).toEqual([
    { invoice_id: "bal", amount: 400, stripe: false },
    { invoice_id: "dep", amount: 500, stripe: true },
  ]);
});

test("edits and AI avatars: full refund before work, keep 50% after (admin can change), none after delivery", () => {
  const base = { type: "edit" as const, start: null, value: 1000, paid: paid(1000) };
  expect(quoteChange(shoot({ ...base, status: "submitted" }))).toMatchObject({
    allowed: true,
    kept: 0,
    refund: 1000,
  });
  expect(quoteChange(shoot({ ...base, status: "in_editing" }))).toMatchObject({
    kept: 500,
    refund: 500,
  });
  expect(quoteChange(shoot({ ...base, status: "in_editing", keep: 200 }))).toMatchObject({
    kept: 200,
    refund: 800,
  });
  expect(quoteChange(shoot({ ...base, type: "avatar", status: "in_production" })).kept).toBe(500);
  expect(quoteChange(shoot({ ...base, status: "delivered" })).allowed).toBe(false);
  expect(quoteChange(shoot({ ...base, kind: "reschedule", status: "submitted" })).allowed).toBe(
    false,
  );
});

test("nothing changes once cancelled, completed or delivered", () => {
  expect(quoteChange(shoot({ status: "cancelled" })).allowed).toBe(false);
  expect(quoteChange(shoot({ status: "completed" })).allowed).toBe(false);
  expect(quoteChange(shoot({ status: "delivered" })).allowed).toBe(false);
});

test("booking terms: eight clauses, a version", () => {
  expect(BOOKING_TERMS).toHaveLength(8);
  expect(BOOKING_TERMS.map((t) => t.title)).toEqual([
    "Payment",
    "Cancellation",
    "Editing and AI avatars",
    "Revisions",
    "Delivery times are estimates",
    "Usage rights",
    "Access and permissions",
    "AI avatars",
  ]);
  expect(BOOKING_TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
