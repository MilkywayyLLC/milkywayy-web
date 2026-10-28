import { expect, test } from "@playwright/test";
import { adminRpc, cleanup, clientAccount, hasPortalAdmin, newRun } from "./helpers/portal";

/**
 * Phase 1 part 4 (27 Oct 2026): value packages carry unused allowance and shoot days. The month logic
 * (private.carry_step) runs over made-up months through portal_admin_carry_sim; one client then checks
 * the real month (portal_admin_value_month) and the next-month rule change.
 * Base month here: AED 5,000 and 4 half-days (2 shoot days).
 */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial", timeout: 120_000 });

const RUN = newRun();
const must = async <T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};
const admin = <T>(fn: string, args: Record<string, unknown>) => must<T>(adminRpc(fn, args));
test.afterAll(() => cleanup(RUN));

type Lot = { from: string; allowance: number; half_days: number; expires: string };
type Step = {
  lots: Lot[];
  used: { from: string; allowance: number; half_days: number }[];
  used_allowance: number;
  used_half_days: number;
  expired: Lot[];
  out: Lot | null;
  in_allowance: number;
  in_half_days: number;
};
type Rule = { enabled: boolean; months: number; allowance: boolean; days: boolean };
const ON: Rule = { enabled: true, months: 1, allowance: true, days: true };
const m = (month: string, used: number, usedHd: number, rule: Rule = ON) => ({
  month,
  base_allowance: 5000,
  base_half_days: 4,
  used,
  used_half_days: usedHd,
  rule,
});
const sim = (months: ReturnType<typeof m>[]) =>
  admin<Step[]>("portal_admin_carry_sim", { p_months: months });

test("rollover off: nothing carries", async () => {
  const [oct, nov] = await sim([
    m("2026-10-01", 3800, 1, { ...ON, enabled: false }),
    m("2026-11-01", 0, 0, { ...ON, enabled: false }),
  ]);
  expect(oct.out).toBeNull();
  expect(nov.in_allowance).toBe(0);
  // 0 months is off too.
  const [z] = await sim([m("2026-10-01", 0, 0, { ...ON, months: 0 })]);
  expect(z.out).toBeNull();
});

test("1 month: October's unused is there in November and expires at its end", async () => {
  const [oct, nov, dec] = await sim([
    m("2026-10-01", 3800, 1),
    m("2026-11-01", 0, 0),
    m("2026-12-01", 0, 0),
  ]);
  expect(oct.out).toEqual({
    from: "2026-10-01",
    allowance: 1200,
    half_days: 3,
    expires: "2026-11-01",
  });
  expect(nov).toMatchObject({ in_allowance: 1200, in_half_days: 3 });
  expect(nov.expired).toEqual([
    { from: "2026-10-01", allowance: 1200, half_days: 3, expires: "2026-11-01" },
  ]);
  // December only has November's own unused month.
  expect(dec).toMatchObject({ in_allowance: 5000, in_half_days: 4 });
});

test("2 months: still usable the month after, expired after that", async () => {
  const two = { ...ON, months: 2 };
  const [, nov, dec, jan] = await sim([
    m("2026-10-01", 3800, 1, two),
    m("2026-11-01", 5000, 4, two),
    m("2026-12-01", 5000, 4, two),
    m("2027-01-01", 0, 0, two),
  ]);
  // November used 5,000: October's 1,200 first, then 3,800 of its own (1,200 left of November's).
  expect(nov).toMatchObject({ in_allowance: 1200, used_allowance: 1200, used_half_days: 3 });
  expect(nov.expired).toEqual([]);
  expect(nov.out).toMatchObject({ allowance: 1200, half_days: 3, expires: "2027-01-01" });
  expect(dec).toMatchObject({ in_allowance: 1200, used_allowance: 1200 });
  // Nothing of October is left by January.
  expect(jan.lots.find((l) => l.from === "2026-10-01")).toBeUndefined();
});

test("shoot days only / allowance only", async () => {
  const [daysOnly] = await sim([m("2026-10-01", 3800, 1, { ...ON, allowance: false })]);
  expect(daysOnly.out).toMatchObject({ allowance: 0, half_days: 3 });
  const [allowOnly] = await sim([m("2026-10-01", 3800, 1, { ...ON, days: false })]);
  expect(allowOnly.out).toMatchObject({ allowance: 1200, half_days: 0 });
});

test("carried credit is used first, oldest first; a lot keeps its own expiry", async () => {
  const two = { ...ON, months: 2 };
  const [, , dec] = await sim([
    m("2026-10-01", 3800, 4, two), // carries 1,200 to Dec
    m("2026-11-01", 4500 + 1200, 4, two), // uses Oct's 1,200 + 4,500 of its own: carries 500 to Jan
    m("2026-12-01", 1500, 0, ON), // Dec rule is 1 month: older lots keep their 2-month expiry
  ]);
  // Oct's lot was spent in Nov; Dec takes Nov's 500 first, then 1,000 of its own.
  expect(dec.used).toEqual([{ from: "2026-11-01", allowance: 500, half_days: 0 }]);
  expect(dec.out).toEqual({
    from: "2026-12-01",
    allowance: 4000,
    half_days: 4,
    expires: "2027-01-01",
  });
  // Oldest first across two live lots.
  const [, , d2] = await sim([
    m("2026-10-01", 3800, 4, two), // 1,200 until Dec
    m("2026-11-01", 0, 0, two), // nothing used: Oct's 1,200 waits, Nov carries 5,000 until Jan
    m("2026-12-01", 1500, 0, two),
  ]);
  expect(d2.used).toEqual([
    { from: "2026-10-01", allowance: 1200, half_days: 0 },
    { from: "2026-11-01", allowance: 300, half_days: 0 },
  ]);
});

test("expiry: what's left of a lot after its last month expires; the rest carries on", async () => {
  const [, nov] = await sim([m("2026-10-01", 3000, 2), m("2026-11-01", 500, 0)]);
  expect(nov.used).toEqual([{ from: "2026-10-01", allowance: 500, half_days: 0 }]);
  expect(nov.expired).toEqual([
    { from: "2026-10-01", allowance: 1500, half_days: 2, expires: "2026-11-01" },
  ]);
  expect(nov.out).toMatchObject({ allowance: 5000, half_days: 4 });
});

test("a client's month: carried credit adds to the pool; rule changes wait for next month; client beats template", async () => {
  const c = await clientAccount(RUN, "roll", "E2E Rollover");
  const first =
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()).slice(0, 8) +
    "01";
  const pkg = await admin<string>("portal_admin_save_client_package", {
    p_account: c.account,
    // Only start-of-month (upfront) months carry (28 Oct 2026).
    p: {
      name: "E2E Roll",
      amount: 5000,
      term: 1,
      started: first,
      billing: "upfront",
      inclusions: [],
    },
  });
  await admin("portal_admin_set_package_value", { p_package: pkg, p_allowance: 5000, p_cap: 4 });
  const next = new Date(`${first}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toISOString().slice(0, 10);
  // Nothing booked this month: all of it carries into next month (default: on, 1 month, both).
  type V = {
    allowance: number;
    half_day_cap: number;
    base_allowance: number;
    carry: { allowance: number };
  };
  const nm = await admin<V>("portal_admin_value_month", {
    p_account: c.account,
    p_month: nextMonth,
  });
  if (first >= "2026-10-01") {
    expect(nm).toMatchObject({ allowance: 10000, half_day_cap: 8, base_allowance: 5000 });
    expect(nm.carry.allowance).toBe(5000);
  }
  // Switch the client off: from next month, so this month's carry is untouched.
  const from = await admin<string>("portal_admin_set_rollover", {
    p_package: null,
    p_account: c.account,
    p: { enabled: false, months: 1, allowance: true, days: true },
  });
  expect(from).toBe(nextMonth);
  const r = await admin<{
    now: { enabled: boolean };
    next: { enabled: boolean; source: string };
    override: boolean;
  }>("portal_admin_rollover", { p_package: null, p_account: c.account });
  expect(r).toMatchObject({
    now: { enabled: true },
    next: { enabled: false, source: "client" },
    override: true,
  });
  // Template set to 3 months: the client's own rule still wins.
  await admin("portal_admin_set_rollover", {
    p_package: pkg,
    p_account: null,
    p: { enabled: true, months: 3 },
  });
  const r2 = await admin<{ next: { enabled: boolean } }>("portal_admin_rollover", {
    p_package: null,
    p_account: c.account,
  });
  expect(r2.next.enabled).toBe(false);
  // Back to the template.
  await admin("portal_admin_set_rollover", {
    p_package: null,
    p_account: c.account,
    p: { use_template: true },
  });
  const r3 = await admin<{ next: { months: number; source: string } }>("portal_admin_rollover", {
    p_package: null,
    p_account: c.account,
  });
  expect(r3.next).toMatchObject({ months: 3, source: "package" });
  await expect(
    admin("portal_admin_set_rollover", { p_package: pkg, p_account: null, p: { months: 4 } }),
  ).rejects.toThrow(/0 to 3/);
});
