import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_TERMS_VERSION } from "@/lib/portal/payments";
import { adminRpc, cleanup, clientAccount, hasPortalAdmin, newRun } from "./helpers/portal";

/**
 * Package billing (owner, 28 Oct 2026): calendar months with the full allowance from the first one,
 * and two invoice modes. Month end bills the month's work at client prices (minus deposits paid, at
 * least the minimum); start of month bills the fee on the 1st, carries what's unused, and puts extras
 * on next month's invoice. Every number comes from private.plan_summary, the same for the client and
 * the admin. Base package: AED 10,000 and 8 half-days.
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

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
const firstOf = (d: string, add = 0) => {
  const x = new Date(`${d.slice(0, 8)}01T00:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + add);
  return x.toISOString().slice(0, 10);
};
const lastOf = (d: string) => {
  const x = new Date(`${firstOf(d, 1)}T00:00:00Z`);
  x.setUTCDate(0);
  return x.toISOString().slice(0, 10);
};
const THIS = firstOf(today());
const NEXT = firstOf(today(), 1);
const AFTER = firstOf(today(), 2);

type Client = { db: SupabaseClient; account: string; email: string };
type Plan = {
  allowance: number;
  half_day_cap: number;
  base_allowance: number;
  used: number;
  extras_total: number;
  month_mode: "usage" | "upfront";
  billing: "usage" | "upfront";
  upfront_from: string | null;
  usage_total: number;
  credits: { description: string; amount: number; paid: boolean }[];
  credits_total: number;
  amount: number;
  next_invoice_on: string;
  next_invoice_amount: number;
  carry: {
    allowance: number;
    half_days: number;
    in: { from: string }[];
    expired: { from: string }[];
  } | null;
  carry_notice: { allowance: number; half_days: number; month: string; until: string } | null;
};

async function onPackage(
  c: Client,
  o: { started: string; billing: "usage" | "upfront"; minimum?: number | null; allowance?: number },
) {
  const id = await admin<string>("portal_admin_save_client_package", {
    p_account: c.account,
    p: {
      name: "E2E Growth",
      amount: 10000,
      term: 1,
      started: o.started,
      billing: o.billing,
      minimum: o.minimum ?? null,
      inclusions: [],
    },
  });
  await admin("portal_admin_set_package_value", {
    p_package: id,
    p_allowance: o.allowance ?? 10000,
    p_cap: 8,
  });
  return id;
}
const plan = (c: Client, month?: string) =>
  admin<Plan>("portal_admin_value_month", { p_account: c.account, p_month: month ?? null });

/** A booking as the portal makes it (book_shoot + the terms), with the invoice its term asks for. */
async function book(c: Client, estimate: number) {
  const p = await must<{ id: string; ref: string }>(
    c.db.rpc("book_shoot", {
      p_account: c.account,
      p_date: today(),
      p_slot: "morning",
      p_location: { address: "Marina Gate 1, Dubai Marina" },
      p_services: [{ service: "videos", videos: { by: "count", short: 4 } }],
      p_note: null,
      p_estimate: estimate,
      p_start_time: "09:00",
    }),
  );
  await must(
    c.db.rpc("accept_booking_terms", { p_project: p.id, p_version: BOOKING_TERMS_VERSION }),
  );
  const inv = await admin<{ id: string; number: string; amount: number } | null>(
    "portal_admin_booking_invoice",
    {
      p_project: p.id,
      p_lines: [{ description: "4 × Short-form video", qty: 4, unit_price: estimate / 4 }],
      p_estimate: estimate,
    },
  );
  return { ...p, inv };
}

type Line = { description: string; amount: number; qty: number; unit_price: number };
/** The draft made for a client's month (advance = the start-of-month one). */
async function draftFor(c: Client, month: string, advance: boolean) {
  const q = await admin<
    { id: string; account_id: string; period_start: string; advance: boolean; status: string }[]
  >("portal_admin_invoice_queue", { p_status: null });
  const row = q.find(
    (r) =>
      r.account_id === c.account &&
      r.period_start === month &&
      !!r.advance === advance &&
      r.status === "draft",
  );
  if (!row) return null;
  return admin<{ amount: number; lines: Line[] }>("portal_admin_invoice", { p_id: row.id });
}
const generate = (day: string) => admin("portal_admin_generate_drafts", { p_today: day });

test("full allowance from a mid-month start; month end billed on what's used", async () => {
  const c = await clientAccount(RUN, "mid", "E2E Pkg mid");
  await onPackage(c, { started: today(), billing: "usage" });
  const p = await plan(c);
  expect(p).toMatchObject({
    allowance: 10000,
    half_day_cap: 8,
    month_mode: "usage",
    usage_total: 0,
    amount: 0,
    next_invoice_on: lastOf(today()),
  });
});

test("month end, under the allowance: the work at client prices", async () => {
  const c = await clientAccount(RUN, "under", "E2E Pkg under");
  await onPackage(c, { started: THIS, billing: "usage" });
  const b = await book(c, 1600);
  expect(b.inv).toBeNull(); // package clients aren't invoiced at booking
  const p = await plan(c);
  expect(p.usage_total).toBeGreaterThan(0);
  expect(p.usage_total).toBeLessThan(10000);
  expect(p.extras_total).toBe(0);
  expect(p.amount).toBe(p.usage_total);
  expect(p.next_invoice_amount).toBe(p.usage_total);
  await generate(`${THIS.slice(0, 8)}28`);
  const d = await draftFor(c, THIS, false);
  expect(Number(d!.amount)).toBe(p.amount);
});

test("month end, over the allowance: everything on the same invoice, nothing carries", async () => {
  const c = await clientAccount(RUN, "over", "E2E Pkg over");
  await onPackage(c, { started: THIS, billing: "usage", allowance: 500 });
  await book(c, 1600);
  const p = await plan(c);
  expect(p.usage_total).toBeGreaterThan(500);
  expect(p.extras_total).toBe(p.usage_total - 500);
  expect(p.amount).toBe(p.usage_total);
  expect(p.carry).toBeNull();
  expect((await plan(c, NEXT)).allowance).toBe(500); // no rollover in month-end mode
  await generate(`${THIS.slice(0, 8)}28`);
  expect(Number((await draftFor(c, THIS, false))!.amount)).toBe(p.usage_total);
});

test("month end with a minimum: topped up to it", async () => {
  const c = await clientAccount(RUN, "min", "E2E Pkg min");
  await onPackage(c, { started: THIS, billing: "usage", minimum: 5000 });
  await book(c, 1600);
  const p = await plan(c);
  expect(p.usage_total).toBeLessThan(5000);
  expect(p.amount).toBe(5000);
  await generate(`${THIS.slice(0, 8)}28`);
  const d = await draftFor(c, THIS, false);
  expect(Number(d!.amount)).toBe(5000);
  expect(d!.lines.some((l) => /minimum/i.test(l.description))).toBe(true);
});

test("start of month: the fee on the 1st, unused carries, expires after a month; extras next month", async () => {
  const c = await clientAccount(RUN, "up", "E2E Pkg upfront");
  await onPackage(c, { started: THIS, billing: "upfront" });
  const p = await plan(c);
  expect(p).toMatchObject({ month_mode: "upfront", upfront_from: THIS, amount: 10000 });
  expect(p.next_invoice_on).toBe(NEXT);
  // The fee, invoiced on the 1st.
  await generate(THIS);
  const fee = await draftFor(c, THIS, true);
  expect(Number(fee!.amount)).toBe(10000);
  // Nothing used: all of it carries into next month (default rule: 1 month)…
  const nov = await plan(c, NEXT);
  expect(nov.allowance).toBe(20000);
  expect(nov.carry!.in.map((l) => l.from)).toEqual([THIS]);
  // …and expires after it: the month after only has next month's own.
  const dec = await plan(c, AFTER);
  expect(dec.allowance).toBe(20000);
  expect(dec.carry!.in.map((l) => l.from)).toEqual([NEXT]);
  expect(nov.carry!.expired.map((l) => l.from)).toEqual([THIS]);

  // A small upfront package with work beyond it: the extra is on next month's invoice.
  const s = await clientAccount(RUN, "upx", "E2E Pkg upfront extras");
  await onPackage(s, { started: THIS, billing: "upfront", allowance: 500 });
  await book(s, 1600);
  const sp = await plan(s);
  expect(sp.extras_total).toBeGreaterThan(0);
  expect(sp.next_invoice_amount).toBe(10000 + sp.extras_total);
  await generate(`${THIS.slice(0, 8)}28`);
  const next = await draftFor(s, NEXT, true);
  expect(Number(next!.amount)).toBe(10000 + sp.extras_total);
});

test("the last 7 days of an upfront month: what carries over and when it expires", async () => {
  const c = await clientAccount(RUN, "notice", "E2E Pkg notice");
  await onPackage(c, { started: THIS, billing: "upfront" });
  const p = await plan(c);
  const last = lastOf(today());
  const daysLeft = (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 864e5;
  if (daysLeft <= 6) {
    expect(p.carry_notice).toEqual({
      allowance: 10000,
      half_days: 8,
      month: NEXT,
      until: lastOf(NEXT),
    });
  } else {
    expect(p.carry_notice).toBeNull();
  }
  // Month end mode never shows it.
  const u = await clientAccount(RUN, "notice2", "E2E Pkg notice usage");
  await onPackage(u, { started: THIS, billing: "usage" });
  expect((await plan(u)).carry_notice).toBeNull();
});

test("switching mid-month from pay as you go: deposit credited, unpaid moved, upfront from the 1st", async () => {
  const c = await clientAccount(RUN, "switch", "E2E Pkg switch");
  await admin("portal_admin_set_payment_terms", { p_account: c.account, p_terms: "prepay" });
  const paid = await book(c, 1600);
  const open = await book(c, 800);
  expect(paid.inv && open.inv).toBeTruthy();
  await admin("portal_admin_set_invoice_status", { p_id: paid.inv!.id, p_status: "paid" });
  const preview = await admin<{
    projects: unknown[];
    credits: { paid: boolean; amount: number }[];
    voids: { id: string }[];
  }>("portal_admin_switch_preview", { p_account: c.account, p_start: today() });
  expect(preview.projects).toHaveLength(2);
  expect(preview.voids.map((v) => v.id)).toEqual([open.inv!.id]);
  expect(preview.credits).toEqual([expect.objectContaining({ paid: true, amount: 1600 })]);

  await onPackage(c, { started: today(), billing: "upfront" });
  // Voided (the client no longer sees it); its work is on the package's month.
  const inv = await admin<{ status: string }>("portal_admin_invoice", { p_id: open.inv!.id });
  expect(inv.status).toBe("void");
  const p = await plan(c);
  expect(p).toMatchObject({ billing: "upfront", month_mode: "usage", upfront_from: NEXT });
  expect(p.credits_total).toBe(1600);
  expect(p.amount).toBe(Math.max(p.usage_total - 1600, 0));
  expect((await plan(c, NEXT)).month_mode).toBe("upfront");
  // Already on a package: no switch to preview.
  expect(
    await admin("portal_admin_switch_preview", { p_account: c.account, p_start: today() }),
  ).toBeNull();
});

test("admin and portal read the same numbers", async () => {
  const c = await clientAccount(RUN, "same", "E2E Pkg same");
  await onPackage(c, { started: THIS, billing: "usage", minimum: 2000 });
  await book(c, 1600);
  const a = (await plan(c)) as Plan & { package_id?: string };
  const { package_id, ...adminView } = a;
  void package_id;
  const portal = await must<{ value: Plan }>(
    c.db.rpc("my_billing_payments", { p_account: c.account }),
  );
  expect(portal.value).toEqual(adminView);
  const all = await admin<{ account_id: string; plan: Plan }[]>("portal_admin_plan_summaries", {});
  expect(all.find((r) => r.account_id === c.account)!.plan).toEqual(adminView);
});
