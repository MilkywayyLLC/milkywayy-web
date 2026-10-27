import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargeSavedCard, createCustomer, refundCheckout, signWebhook } from "@/lib/stripe";
import {
  quoteChange,
  BOOKING_TERMS_VERSION,
  type ChangeKind,
  type ChangeReason,
} from "@/lib/portal/payments";
import { invoicePdf, type PdfInvoice } from "@/lib/invoice-pdf";
import { env, WEBHOOK_SECRET } from "./helpers/env";
import {
  adminRpc,
  cleanup,
  clientAccount,
  createUser,
  hasPortalAdmin,
  newRun,
  signInUI,
  signedIn,
} from "./helpers/portal";

/**
 * Payment terms in the database (owner, 24 Oct 2026; docs/PAYMENT_TERMS_PLAN.md): each term ×
 * paid/unpaid × the download lock; value package consumption; receipt upload → mark paid;
 * cancellations and refunds (the fee worked out by lib/portal/payments, applied by
 * portal_admin_apply_change); the Stripe refund webhook; terms acceptance stored per booking.
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
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
const inDays = (n: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(
    new Date(Date.now() + n * 864e5),
  );
const firstOfMonth = () => today().slice(0, 8) + "01";

type Client = { db: SupabaseClient; account: string; email: string };
const clients: Record<string, Client> = {};

const VIDEOS = (short: number, day?: "half" | "full") =>
  day
    ? [{ service: "videos", videos: { by: "time", day } }]
    : [{ service: "videos", videos: { by: "count", short } }];
const PROPERTY = [
  {
    service: "property",
    property: { type: "apartment", size: 1, photo: true, tour: false, twilight: false },
  },
];

/** A booking as the portal makes it: book_shoot, the terms, then the invoice by the client's term. */
async function book(
  c: Client,
  o: { estimate: number; date?: string; slot?: string; services?: unknown[]; start?: string },
) {
  const p = await must<{ id: string; ref: string }>(
    c.db.rpc("book_shoot", {
      p_account: c.account,
      p_date: o.date ?? inDays(10),
      p_slot: o.slot ?? "morning",
      p_location: { address: "Marina Gate 1, Dubai Marina" },
      p_services: o.services ?? VIDEOS(4),
      p_note: null,
      p_estimate: o.estimate,
      p_start_time: o.start ?? "09:00",
    }),
  );
  await must(
    c.db.rpc("accept_booking_terms", { p_project: p.id, p_version: BOOKING_TERMS_VERSION }),
  );
  const inv = await admin<{ id: string; number: string; amount: number; stage: string } | null>(
    "portal_admin_booking_invoice",
    {
      p_project: p.id,
      p_lines: [{ description: "4 × Short-form video", qty: 4, unit_price: o.estimate / 4 }],
      p_estimate: o.estimate,
    },
  );
  return { ...p, inv };
}
const pay = (c: Client, id: string) =>
  must<{
    locked: boolean;
    invoices: { id: string; stage: string; status: string; amount: number }[];
  }>(c.db.rpc("my_project_payment", { p_project: id }));
const status = async (c: Client, id: string) =>
  (await must<{ status: string }[]>(c.db.from("projects").select("status").eq("id", id)))[0].status;
const paidAt = async (c: Client, id: string) =>
  (
    await must<{ meta: { paid_at?: string } }[]>(c.db.from("projects").select("meta").eq("id", id))
  )[0].meta.paid_at;
const markPaid = (invoice: string) =>
  admin("portal_admin_set_invoice_status", { p_id: invoice, p_status: "paid" });
/** A delivery for a project (one photo), published: the project turns Delivered. */
async function deliver(projectId: string, ref: string) {
  const f = await admin<string>("portal_admin_add_file", {
    p_id: projectId,
    p_delivery_no: 1,
    p_delivery_label: "Delivery 1",
    p_kind: "photos",
    p_source: "r2",
    p_url: null,
    p_r2_key: `projects/${ref}/d1/IMG_1.jpg`,
    p_label: "IMG_1.jpg",
    p_bytes: 1000,
    p_content_type: "image/jpeg",
  });
  await admin("portal_admin_set_status", { p_id: projectId, p_status: "delivered" });
  return f;
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  for (const [k, terms] of [
    ["prepay", "prepay"],
    ["split", "split"],
    ["monthend", "month_end"],
    ["pkg", "prepay"],
    ["pkg2", "prepay"],
  ] as const) {
    clients[k] = await clientAccount(RUN, k, `E2E Pay ${k}`);
    await admin("portal_admin_set_payment_terms", {
      p_account: clients[k].account,
      p_terms: terms,
    });
  }
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("new accounts start on 100% before the shoot; the term is set per client", async () => {
  const fresh = await clientAccount(RUN, "fresh", "E2E Pay fresh");
  expect(
    (await must<{ terms: string }>(fresh.db.rpc("my_payment_terms", { p_account: fresh.account })))
      .terms,
  ).toBe("prepay");
  const t = await must<{ terms: string; late_fee_min: number }>(
    clients.split.db.rpc("my_payment_terms", { p_account: clients.split.account }),
  );
  expect(t).toMatchObject({ terms: "split", late_fee_min: 250 });
});

test("100% before: invoice at booking, locked until paid, paid = pending confirmation, unlocked on delivery", async () => {
  const c = clients.prepay;
  const b = await book(c, { estimate: 1600 });
  expect(b.inv).toMatchObject({ stage: "full", amount: 1600 });
  expect(await status(c, b.id)).toBe("requested");
  expect((await pay(c, b.id)).locked).toBe(true);
  // The client sees it as a published, due invoice.
  const [inv] = await must<{ status: string; number: string }[]>(
    c.db.from("invoices").select("status, number").eq("id", b.inv!.id),
  );
  expect(inv.status).toBe("due");
  await markPaid(b.inv!.id);
  // Phase 1: paying never confirms; the booking waits for Milkywayy (paid_at marks it).
  expect(await status(c, b.id)).toBe("requested");
  expect(await paidAt(c, b.id)).toBeTruthy();
  expect((await pay(c, b.id)).locked).toBe(false);
  await deliver(b.id, b.ref);
  expect((await pay(c, b.id)).locked).toBe(false);
  // Nothing logged beyond what was paid: no further invoice.
  const all = await must<{ stage: string | null }[]>(
    c.db.from("invoices").select("stage").eq("project_id", b.id),
  );
  expect(all).toHaveLength(1);
});

test("100% before, unpaid at delivery: still locked; Mark as paid releases", async () => {
  const c = clients.prepay;
  const b = await book(c, { estimate: 800 });
  await deliver(b.id, b.ref);
  expect((await pay(c, b.id)).locked).toBe(true);
  // Release only: unlocked while still unpaid.
  await admin("portal_admin_mark_project_paid", { p_project: b.id, p_release_only: true });
  expect((await pay(c, b.id)).locked).toBe(false);
  await admin("portal_admin_lock_files", { p_project: b.id });
  expect((await pay(c, b.id)).locked).toBe(true);
  const out = await admin<{ paid: number }>("portal_admin_mark_project_paid", { p_project: b.id });
  expect(out.paid).toBe(1);
  const p = await pay(c, b.id);
  expect(p.locked).toBe(false);
  expect(p.invoices[0].status).toBe("paid");
});

test("50/50: deposit at booking (pending confirmation); balance issued on delivery locks the files until paid", async () => {
  const c = clients.split;
  const b = await book(c, { estimate: 2000 });
  expect(b.inv).toMatchObject({ stage: "deposit", amount: 1000 });
  expect((await pay(c, b.id)).locked).toBe(true);
  await markPaid(b.inv!.id);
  expect(await status(c, b.id)).toBe("requested");
  expect((await pay(c, b.id)).locked).toBe(false);
  // What was shot: 6 reels at 400 = 2,400 (more than the estimate).
  await admin("portal_admin_add_line_item", {
    p_project: b.id,
    p_kind: "reel_shoot",
    p_description: "Short-form video",
    p_qty: 6,
    p_unit_price: 400,
  });
  await deliver(b.id, b.ref);
  const p = await pay(c, b.id);
  expect(p.locked).toBe(true);
  const balance = p.invoices.find((i) => i.stage === "balance")!;
  expect(balance).toMatchObject({ status: "due", amount: 1400 });
  // The admin is handed it once for the email.
  const unsent = await admin<{ id: string }[]>("portal_admin_unsent_invoices", { p_project: b.id });
  expect(unsent.map((i) => i.id)).toContain(balance.id);
  expect(await admin<unknown[]>("portal_admin_unsent_invoices", { p_project: b.id })).toHaveLength(
    0,
  );
  await markPaid(balance.id);
  expect((await pay(c, b.id)).locked).toBe(false);
});

test("end of month: nothing due at booking, never locked, the term means month-end invoicing", async () => {
  const c = clients.monthend;
  const b = await book(c, { estimate: 1600 });
  expect(b.inv).toBeNull();
  await deliver(b.id, b.ref);
  expect((await pay(c, b.id)).locked).toBe(false);
  const setup = await admin<{ payg_invoicing: string }>("portal_admin_client_setup", {
    p_account: c.account,
  });
  expect(setup.payg_invoicing).toBe("month_end");
});

test("receipt upload → the admin is asked → Mark as paid → pending confirmation", async () => {
  const c = clients.prepay;
  const b = await book(c, { estimate: 1200 });
  const key = `payments/${c.account}/${b.inv!.id}/receipt.pdf`;
  await must(
    c.db.rpc("submit_payment_proof", {
      p_invoice: b.inv!.id,
      p_key: key,
      p_filename: "receipt.pdf",
      p_bytes: 2000,
      p_content_type: "application/pdf",
      p_note: "Paid from the company account",
    }),
  );
  const queue = await admin<{ id: string }[]>("portal_admin_invoices", {
    p_account: null,
    p_status: "submitted",
  });
  expect(queue.map((i) => i.id)).toContain(b.inv!.id);
  const [proof] = await must<{ id: string }[]>(
    c.db.from("payment_proofs").select("id").eq("invoice_id", b.inv!.id),
  );
  await admin("portal_admin_decide_payment", { p_proof: proof.id, p_confirm: true });
  expect(await status(c, b.id)).toBe("requested");
  expect(await paidAt(c, b.id)).toBeTruthy();
  expect((await pay(c, b.id)).invoices[0].status).toBe("paid");
});

test("Booking Terms acceptance is stored per booking: user, time, version", async () => {
  const c = clients.prepay;
  const b = await book(c, { estimate: 400 });
  const p = await admin<{ acceptances: { version: string; email: string; accepted_at: string }[] }>(
    "portal_admin_project_payment",
    { p_project: b.id },
  );
  expect(p.acceptances).toHaveLength(1);
  expect(p.acceptances[0]).toMatchObject({ version: BOOKING_TERMS_VERSION, email: c.email });
  expect(Date.now() - new Date(p.acceptances[0].accepted_at).getTime()).toBeLessThan(120_000);
  // The client can read their own; another account can't record one on it.
  const other = await clientAccount(RUN, "other", "E2E Pay other");
  const { error } = await other.db.rpc("accept_booking_terms", {
    p_project: b.id,
    p_version: BOOKING_TERMS_VERSION,
  });
  expect(error?.message).toMatch(/not your project/);
});

/* ---------- value packages ---------- */

async function valuePackage(c: Client, allowance: number, cap: number) {
  const id = await admin<string>("portal_admin_save_client_package", {
    p_account: c.account,
    p: {
      name: "E2E Value",
      amount: allowance,
      term: 1,
      started: firstOfMonth(),
      advance: false,
      inclusions: [],
    },
  });
  await admin("portal_admin_set_package_value", {
    p_package: id,
    p_allowance: allowance,
    p_cap: cap,
  });
  return id;
}
type Month = {
  allowance: number;
  half_day_cap: number;
  used: number;
  half_days_used: number;
  extras_total: number;
  bookings: { ref: string; value: number; half_days: number; included: number; extra: number }[];
};
const month = (c: Client) => admin<Month>("portal_admin_value_month", { p_account: c.account });

test("package: fixed quantity = qty × rate; day booking = the larger of that and the day rate; cap hit by days", async () => {
  const c = clients.pkg;
  await valuePackage(c, 10000, 2);
  // Package clients book like end of month: no invoice at booking.
  const fixed = await book(c, { estimate: 1600, date: today(), services: VIDEOS(4) });
  expect(fixed.inv).toBeNull();
  // A full content day: estimate is the full-day minimum (2,800), 2 half-days.
  const day = await book(c, {
    estimate: 2800,
    date: today(),
    slot: "full_day",
    services: VIDEOS(0, "full"),
  });
  let m = await month(c);
  const rowOf = (ref: string) => m.bookings.find((b) => b.ref === ref)!;
  expect(rowOf(fixed.ref)).toMatchObject({ value: 1600, half_days: 1, included: 1600, extra: 0 });
  // 1 half-day left for a 2-half-day booking: half of it is extra.
  expect(rowOf(day.ref)).toMatchObject({ value: 2800, half_days: 2, included: 1400, extra: 1400 });
  expect(m).toMatchObject({ half_days_used: 3, used: 3000, extras_total: 1400 });
  // What was shot that day: 8 reels = 3,200 > the 2,800 minimum, so the value is 3,200.
  await admin("portal_admin_add_line_item", {
    p_project: day.id,
    p_kind: "reel_shoot",
    p_description: "Short-form video",
    p_qty: 8,
    p_unit_price: 400,
  });
  m = await month(c);
  expect(rowOf(day.ref)).toMatchObject({ value: 3200, included: 1600, extra: 1600 });
  // The client's Billing sees the same month.
  const bp = await must<{ value: Month }>(
    c.db.rpc("my_billing_payments", { p_account: c.account }),
  );
  expect(bp.value).toMatchObject({ allowance: 10000, half_day_cap: 2, extras_total: 1600 });
});

test("package: property shoots count their price, not shoot days; cap hit by value", async () => {
  const c = clients.pkg2;
  await valuePackage(c, 3000, 10);
  const content = await book(c, { estimate: 1600, date: today(), services: VIDEOS(4) });
  const property = await book(c, { estimate: 2000, date: today(), services: PROPERTY });
  const m = await month(c);
  const rowOf = (ref: string) => m.bookings.find((b) => b.ref === ref)!;
  expect(rowOf(property.ref)).toMatchObject({
    value: 2000,
    half_days: 0,
    included: 1400,
    extra: 600,
  });
  expect(rowOf(content.ref)).toMatchObject({ half_days: 1, extra: 0 });
  expect(m).toMatchObject({ used: 3000, half_days_used: 1, extras_total: 600 });
  // Booking summary numbers for the next one: nothing left of the allowance.
  const t = await must<{ package: { allowance_left: number; half_days_left: number } }>(
    c.db.rpc("my_payment_terms", { p_account: c.account }),
  );
  expect(t.package).toMatchObject({ allowance_left: 0, half_days_left: 9 });
});

test("what the client sees: plan card, segmented meters, How you pay, sidebar plan, summary line", async ({
  page,
}) => {
  // pkg2 (AED 3,000 · 5 shoot days): content 1,600 (0.5 day) + property 2,000 → 600 extra.
  const c = clients.pkg2;
  await signInUI(page, c.email);
  await page.goto("/portal/billing");
  const card = page.getByTestId("value-package");
  await expect(card).toContainText("E2E Value");
  await expect(card.getByTestId("plan-amount")).toContainText("AED 3,000 a month");
  // Refinement round (25 Oct 2026): full-width bars with a label row under each.
  await expect(card.getByTestId("meter-allowance")).toContainText("AED 3,000 of AED 3,000");
  await expect(card.getByTestId("meter-allowance")).toContainText("AED 3,000 booked · AED 0 left");
  await expect(card.getByTestId("meter-shoot-days")).toContainText(
    "0.5 days booked · 4.5 days left",
  );
  await expect(card.getByTestId("value-statement")).toContainText("AED 3,600");
  await expect(card.getByTestId("value-extras")).toContainText("AED 600");
  await expect(page.getByTestId("value-bookings")).toContainText("Package + extra AED 600");
  await expect(page.getByTestId("how-you-pay")).toContainText("billed at the end of each month");
  await expect(page.getByTestId("how-you-pay")).toContainText("WhatsApp us");
  await expect(page.getByTestId("rail-plan")).toContainText("E2E Value");
  // A pay-per-shoot client: the sidebar says how they pay; the summary says what's due now.
  const p = clients.split;
  await page.context().clearCookies();
  await signInUI(page, p.email);
  await page.goto("/portal/billing");
  await expect(page.getByTestId("rail-plan")).toContainText("Pay per shoot · 50% upfront");
  await expect(page.getByTestId("how-you-pay")).toContainText("You pay 50% when you book");
  const { data: u } = await p.db.auth.getUser();
  await p.db.from("portal_drafts").upsert({
    account_id: p.account,
    user_id: u.user!.id,
    kind: "booking",
    data: {
      kind: "content",
      step: "review",
      // 4 h (AED 1,200) + 4 short-form edits (4 × 200) = AED 2,000.
      hours: 4,
      raw: false,
      shortN: 4,
      longN: 0,
      startTime: "09:00",
      date: inDays(3),
      slot: "morning",
      loc: { address: "Marina Gate 1, Dubai Marina" },
    },
  });
  await page.goto("/portal/book?kind=content&draft=1&step=review");
  await expect(page.getByTestId("due-line")).toContainText("Due now: AED 1,000 (50% upfront");
  await expect(page.getByTestId("terms-check")).toBeVisible();
});

/* ---------- cancellations and refunds ---------- */

type AdminPay = {
  value: number;
  start: string;
  status: string;
  type: "shoot" | "edit" | "avatar";
  on_package: boolean;
  package_left: number | null;
  settings: {
    cancel_free_hours: number;
    late_fee_pct: number;
    late_fee_min: number;
    work_keep_pct: number;
  };
  invoices: {
    id: string;
    stage: string | null;
    status: string;
    amount: number;
    refunded: number;
    paid_via: "stripe" | "bank" | "manual" | null;
  }[];
};
/** As the server does it: quote from the database's numbers (at a chosen moment), then apply. */
async function change(
  projectId: string,
  kind: ChangeKind,
  hoursBefore: number,
  o: { reason?: ChangeReason; waive?: boolean; date?: string } = {},
) {
  const p = await admin<AdminPay>("portal_admin_project_payment", { p_project: projectId });
  const q = quoteChange({
    kind,
    type: p.type,
    status: p.status,
    start: p.start,
    now: new Date(new Date(p.start).getTime() - hoursBefore * 36e5),
    value: Number(p.value),
    paid: p.invoices
      .filter((i) => i.stage && i.status === "paid")
      .map((i) => ({ id: i.id, amount: i.amount, refunded: i.refunded, paid_via: i.paid_via })),
    reason: o.reason,
    onPackage: p.on_package && p.package_left != null,
    halfDaysLeft: p.package_left,
    settings: p.settings,
    waive: o.waive,
  });
  const out = await admin<{
    refunds: { id: string; amount: number; stripe: boolean }[];
    charged: number;
  }>("portal_admin_apply_change", {
    p_project: projectId,
    p: {
      kind,
      reason: o.reason ?? "client",
      fee: q.fee,
      waived: !!o.waive,
      half_days: q.halfDays,
      refunds: q.refunds.map((r) => ({
        invoice_id: r.invoice_id,
        amount: r.amount,
        method: "bank",
      })),
      by: "admin",
      ...(o.date ? { date: o.date, start_time: "10:00" } : {}),
    },
  });
  return { q, out };
}
const refundsOf = (c: Client, projectId: string) =>
  must<{ amount: number; status: string; method: string }[]>(
    c.db.from("refunds").select("amount, status, method").eq("project_id", projectId),
  );

test("cancel more than 3h before: free, full refund (bank → Refund due), unpaid invoices cancelled", async () => {
  const c = clients.prepay;
  const paid = await book(c, { estimate: 1000 });
  await markPaid(paid.inv!.id);
  const { q } = await change(paid.id, "cancel", 5);
  expect(q).toMatchObject({ late: false, fee: 0, refund: 1000 });
  expect(await status(c, paid.id)).toBe("cancelled");
  expect(await refundsOf(c, paid.id)).toEqual([{ amount: 1000, status: "due", method: "bank" }]);
  // Unpaid: the booking invoice is cancelled (void), nothing refunded.
  const unpaid = await book(c, { estimate: 1000 });
  await change(unpaid.id, "cancel", 24);
  const [inv] = await must<{ status: string }[]>(
    c.db.from("invoices").select("status").eq("id", unpaid.inv!.id),
  );
  expect(inv).toBeUndefined(); // void invoices aren't shown to the client
  const all = await admin<AdminPay>("portal_admin_project_payment", { p_project: unpaid.id });
  expect(all.invoices[0].status).toBe("void");
});

test("late cancel × paid 0 / 50% / 100%: fee 50% (min AED 250), refunds and fee invoices follow", async () => {
  // 100% paid, under 3h: 500 kept, 500 back.
  const full = await book(clients.prepay, { estimate: 1000 });
  await markPaid(full.inv!.id);
  await change(full.id, "cancel", 2);
  expect(await refundsOf(clients.prepay, full.id)).toEqual([
    { amount: 500, status: "due", method: "bank" },
  ]);
  // 50% paid (deposit 500 of 1,000), crew on the way: the deposit covers the fee.
  const half = await book(clients.split, { estimate: 1000 });
  await markPaid(half.inv!.id);
  const h = await change(half.id, "cancel", 30, { reason: "en_route" });
  expect(h.q).toMatchObject({ fee: 500, refund: 0, owed: 0 });
  expect(await refundsOf(clients.split, half.id)).toEqual([]);
  // Nothing paid, no access on arrival: a fee invoice, the booking invoice cancelled.
  const none = await book(clients.prepay, { estimate: 1000 });
  const n = await change(none.id, "cancel", 0, { reason: "no_access" });
  expect(n.out.charged).toBe(500);
  const inv = (await admin<AdminPay>("portal_admin_project_payment", { p_project: none.id }))
    .invoices;
  expect(inv.find((i) => i.stage === "full")!.status).toBe("void");
  expect(inv.find((i) => i.stage === "fee")).toMatchObject({ status: "due", amount: 500 });
  // A small booking: the AED 250 minimum.
  const small = await book(clients.prepay, { estimate: 400 });
  await markPaid(small.inv!.id);
  const s = await change(small.id, "cancel", 1);
  expect(s.q).toMatchObject({ fee: 250, refund: 150 });
  // End of month, late: the fee goes on the month-end invoice as a line.
  const me = await book(clients.monthend, { estimate: 1000 });
  await change(me.id, "cancel", 1);
  const lines = await must<{ kind: string; unit_price: number }[]>(
    clients.monthend.db.from("line_items").select("kind, unit_price").eq("project_id", me.id),
  );
  expect(lines).toEqual([{ kind: "cancel_fee", unit_price: 500 }]);
});

test("waive the fee; a package client's late cancel uses 1 half-day instead", async () => {
  const w = await book(clients.prepay, { estimate: 1000 });
  await markPaid(w.inv!.id);
  const { q } = await change(w.id, "cancel", 1, { waive: true });
  expect(q).toMatchObject({ fee: 0, refund: 1000 });
  const p = await admin<{ fee_waived: boolean; cancel_fee: number }>(
    "portal_admin_project_payment",
    {
      p_project: w.id,
    },
  );
  expect(p).toMatchObject({ fee_waived: true, cancel_fee: 0 });

  // Package (value model, cap 10, 1 used so far): late → 1 half-day, no fee.
  const c = clients.pkg2;
  const before = await month(c);
  const late = await book(c, { estimate: 1600, date: today(), services: VIDEOS(4) });
  const { q: pq } = await change(late.id, "cancel", 1);
  expect(pq).toMatchObject({ fee: 0, halfDays: 1 });
  const after = await month(c);
  expect(after.half_days_used).toBe(before.half_days_used + 1);
  expect(after.used).toBe(before.used);
  expect(after.bookings.find((b) => b.ref === late.ref)).toMatchObject({ value: 0, half_days: 1 });
});

test("reschedule: free more than 3h before; late = fee, nothing refunded", async () => {
  const c = clients.prepay;
  const b = await book(c, { estimate: 1000 });
  await markPaid(b.inv!.id);
  const free = await change(b.id, "reschedule", 10, { date: inDays(12) });
  expect(free.q.fee).toBe(0);
  const late = await change(b.id, "reschedule", 1, { date: inDays(14) });
  expect(late.q).toMatchObject({ fee: 500, refund: 0 });
  expect(late.out.charged).toBe(500);
  const p = await admin<AdminPay & { cancel_fee: number }>("portal_admin_project_payment", {
    p_project: b.id,
  });
  expect(p.invoices.find((i) => i.stage === "fee")).toMatchObject({ amount: 500, status: "due" });
  expect(p.status).not.toBe("cancelled");
});

test("Stripe: a paid booking waits for confirmation; a cancellation refunds through Stripe and the refund webhook settles it", async ({
  request,
}) => {
  const c = clients.prepay;
  const b = await book(c, { estimate: 900 });
  const session = `cs_test_${RUN}`;
  await admin("portal_admin_set_stripe_session", { p_invoice: b.inv!.id, p_session: session });
  const paidEvent = JSON.stringify({
    id: `evt_${RUN}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: session,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 90000,
        currency: "aed",
        client_reference_id: b.inv!.id,
        metadata: { invoice_id: b.inv!.id },
      },
    },
  });
  const ok = await request.post("/api/stripe/webhook", {
    data: paidEvent,
    headers: {
      "stripe-signature": signWebhook(paidEvent, WEBHOOK_SECRET),
      "content-type": "application/json",
    },
  });
  expect(await ok.json()).toMatchObject({ received: true, paid: true });
  expect(await status(c, b.id)).toBe("requested");
  expect(await paidAt(c, b.id)).toBeTruthy();

  // Cancelled early: a Stripe refund (pending until Stripe confirms it).
  const { out } = await change(b.id, "cancel", 10);
  expect(out.refunds).toEqual([expect.objectContaining({ amount: 900, stripe: true })]);
  expect(await refundsOf(c, b.id)).toEqual([{ amount: 900, status: "pending", method: "stripe" }]);
  const refundEvent = (s: string) =>
    JSON.stringify({
      id: `evt_r_${RUN}_${s}`,
      type: "refund.updated",
      data: {
        object: {
          id: `re_${RUN}`,
          object: "refund",
          status: s,
          metadata: { refund_id: out.refunds[0].id },
        },
      },
    });
  const forged = await request.post("/api/stripe/webhook", {
    data: refundEvent("succeeded"),
    headers: { "stripe-signature": signWebhook(refundEvent("succeeded"), "whsec_wrong") },
  });
  expect(forged.status()).toBe(400);
  const body = refundEvent("succeeded");
  const r = await request.post("/api/stripe/webhook", {
    data: body,
    headers: {
      "stripe-signature": signWebhook(body, WEBHOOK_SECRET),
      "content-type": "application/json",
    },
  });
  expect(await r.json()).toMatchObject({ received: true, refund: "succeeded" });
  expect(await refundsOf(c, b.id)).toEqual([{ amount: 900, status: "done", method: "stripe" }]);
  const p = await admin<AdminPay>("portal_admin_project_payment", { p_project: b.id });
  expect(Number(p.invoices[0].refunded)).toBe(900);
});

test("bank refunds: Refund due until the admin ticks it off", async () => {
  const due = await admin<{ id: string; status: string; account: string }[]>(
    "portal_admin_refunds",
    {
      p_status: "due",
    },
  );
  const mine = due.filter((r) => r.account.startsWith("E2E Pay"));
  expect(mine.length).toBeGreaterThan(0);
  await admin("portal_admin_refund_done", { p_refund: mine[0].id });
  const after = await admin<{ id: string; status: string }[]>("portal_admin_refunds", {});
  expect(after.find((r) => r.id === mine[0].id)!.status).toBe("done");
  const st = await admin<Record<string, { refunds_due: number }>>(
    "portal_admin_payment_status",
    {},
  );
  expect(st[clients.prepay.account]).toBeDefined();
});

/* ---------- Phase 1 (27 Oct 2026): Stripe as the main way to pay ---------- */

const metaOf = async (c: Client, id: string) =>
  (
    await must<{ meta: Record<string, unknown>; status: string; shoot_date: string }[]>(
      c.db.from("projects").select("meta, status, shoot_date").eq("id", id),
    )
  )[0];

test("Pay page access: billing people and the booker see it; another teammate doesn't; send to company", async () => {
  const owner = await clientAccount(RUN, "payowner", "E2E Pay team");
  await admin("portal_admin_set_payment_terms", { p_account: owner.account, p_terms: "prepay" });
  const mates: { email: string; db: SupabaseClient; id: string }[] = [];
  for (const n of ["paybooker", "payother"]) {
    const email = await createUser(RUN, n);
    await must(
      owner.db.from("account_invites").insert({ account_id: owner.account, email, name: n }),
    );
    const db = await signedIn(email);
    await must(db.rpc("accept_my_invites"));
    const id = (await db.auth.getUser()).data.user!.id;
    await must(
      owner.db
        .from("account_members")
        .update({ access: { preset: "custom", shoots: true, billing: false, all_projects: false } })
        .eq("user_id", id)
        .select(),
    );
    mates.push({ email, db, id });
  }
  const [booker, other] = mates;
  const b = await book(
    { db: booker.db, account: owner.account, email: booker.email },
    { estimate: 700 },
  );
  const ownerId = (await owner.db.auth.getUser()).data.user!.id;
  const view = (u: string) =>
    admin<{ billing: boolean; amount: number; unpaid: boolean } | null>("portal_admin_pay_view", {
      p_invoice: b.inv!.id,
      p_user: u,
    });
  expect(await view(ownerId)).toMatchObject({ billing: true, amount: 700, unpaid: true });
  expect(await view(booker.id)).toMatchObject({ billing: false, amount: 700 });
  expect(await view(other.id)).toBeNull();
  // Billing options are for billing people only.
  expect(await must(booker.db.rpc("my_payment_options", { p_account: owner.account }))).toBeNull();
  expect(
    await must(owner.db.rpc("my_payment_options", { p_account: owner.account })),
  ).toMatchObject({ bank_transfer: true, card: null, autopay: false });

  // Only the booker can hand it to the company; the owners are the recipients.
  await expect(
    admin("portal_admin_send_to_company", { p_project: b.id, p_user: other.id, p_by: "Other" }),
  ).rejects.toThrow(/not yours/);
  const sent = await admin<{ number: string; recipients: { email: string }[] }>(
    "portal_admin_send_to_company",
    { p_project: b.id, p_user: booker.id, p_by: "Booker" },
  );
  expect(sent.number).toBe(b.inv!.number);
  expect(sent.recipients.map((r) => r.email)).toContain(owner.email);
  expect((await metaOf(owner, b.id)).meta.pay_by).toBe("company");

  // Admin turns bank transfer off for this client.
  await admin("portal_admin_set_bank_transfer", { p_account: owner.account, p_on: false });
  expect(
    await must(owner.db.rpc("my_payment_options", { p_account: owner.account })),
  ).toMatchObject({
    bank_transfer: false,
  });
});

test("Propose a new time: accept confirms at that time; decline cancels with a full Stripe refund", async ({
  request,
}) => {
  const c = clients.prepay;
  // Accept.
  const a = await book(c, { estimate: 600, start: "10:15" });
  await markPaid(a.inv!.id);
  await admin("portal_admin_propose_time", {
    p_project: a.id,
    p_date: inDays(14),
    p_start: "11:30",
    p_note: "Photographer is booked that morning",
  });
  expect((await metaOf(c, a.id)).meta.proposal).toMatchObject({ start_time: "11:30" });
  await admin("portal_admin_accept_proposal", { p_project: a.id, p_by: "Client" });
  const m = await metaOf(c, a.id);
  expect(m.status).toBe("confirmed");
  expect(m.shoot_date).toBe(inDays(14));
  expect((m.meta.booking as { start_time: string }).start_time).toBe("11:30");
  expect(m.meta.proposal).toBeUndefined();
  await expect(
    admin("portal_admin_propose_time", {
      p_project: a.id,
      p_date: inDays(15),
      p_start: "25:00",
      p_note: null,
    }),
  ).rejects.toThrow(/bad time/);

  // Decline, paid by card, an hour before (late): the admin reason waives the fee, all of it comes back.
  const d = await book(c, { estimate: 900 });
  const session = `cs_test_decline_${RUN}`;
  await admin("portal_admin_set_stripe_session", { p_invoice: d.inv!.id, p_session: session });
  const paid = JSON.stringify({
    id: `evt_d_${RUN}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: session,
        object: "checkout.session",
        mode: "payment",
        payment_status: "paid",
        amount_total: 90000,
        currency: "aed",
        client_reference_id: d.inv!.id,
        metadata: { invoice_id: d.inv!.id },
      },
    },
  });
  const ok = await request.post("/api/stripe/webhook", {
    data: paid,
    headers: {
      "stripe-signature": signWebhook(paid, WEBHOOK_SECRET),
      "content-type": "application/json",
    },
  });
  expect(await ok.json()).toMatchObject({ received: true, paid: true });
  expect(await status(c, d.id)).toBe("requested");
  await admin("portal_admin_propose_time", {
    p_project: d.id,
    p_date: inDays(20),
    p_start: "09:00",
    p_note: null,
  });
  const { q, out } = await change(d.id, "cancel", 1, { reason: "admin", waive: true });
  expect(q).toMatchObject({ fee: 0, refund: 900 });
  expect(out.refunds).toEqual([expect.objectContaining({ amount: 900, stripe: true })]);
  expect(await status(c, d.id)).toBe("cancelled");
});

test("Saved card + automatic payment: signed payment_intent events, failures recorded, 3 tries max", async ({
  request,
}) => {
  const c = clients.monthend;
  await admin("portal_admin_set_stripe_customer", {
    p_account: c.account,
    p: {
      customer_id: `cus_test_${RUN}`,
      pm_id: `pm_test_${RUN}`,
      brand: "visa",
      last4: "4242",
      exp: "12/30",
    },
  });
  await admin("portal_admin_set_stripe_customer", {
    p_account: c.account,
    p: { autopay: true, by: c.email },
  });
  expect(await must(c.db.rpc("my_payment_options", { p_account: c.account }))).toMatchObject({
    card: { brand: "visa", last4: "4242" },
    autopay: true,
  });
  // A month-end invoice, due today.
  const number = `INV-AP-${RUN.slice(-5).toUpperCase()}`;
  const created = await admin<{ id: string }>("portal_admin_create_invoice", {
    p_account: c.account,
    p_number: number,
    p_issued: today(),
    p_due: today(),
    p_amount: 450,
    p_currency: "AED",
    p_status: "due",
    p_pdf_key: null,
  });
  await admin("portal_admin_approve_invoice", { p_id: created.id, p_publish_now: true });
  const inv = { id: created.id, number };
  const due = await admin<{ id: string }[]>("portal_admin_autopay_due", {});
  expect(due.map((r) => r.id)).toContain(inv.id);

  // A declined try: recorded, still due, shown to the client.
  const r1 = await admin<{ attempts: number }>("portal_admin_autopay_result", {
    p_invoice: inv.id,
    p_pi: `pi_fail_${RUN}`,
    p_error: "Your card was declined.",
  });
  expect(r1.attempts).toBe(1);
  expect(await must(c.db.rpc("my_payment_options", { p_account: c.account }))).toMatchObject({
    failed: [{ number: inv.number, error: "Your card was declined." }],
  });
  // Not retried within 20 hours.
  expect(
    (await admin<{ id: string }[]>("portal_admin_autopay_due", {})).map((r) => r.id),
  ).not.toContain(inv.id);

  // The next try succeeds: the signed webhook marks it paid (intent and amount must match).
  const pi = `pi_ok_${RUN}`;
  await admin("portal_admin_autopay_result", { p_invoice: inv.id, p_pi: pi, p_error: null });
  const event = (amount: number) =>
    JSON.stringify({
      id: `evt_pi_${RUN}_${amount}`,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: pi,
          object: "payment_intent",
          status: "succeeded",
          amount,
          currency: "aed",
          metadata: { invoice_id: inv.id, autopay: "1" },
        },
      },
    });
  const post = (body: string) =>
    request.post("/api/stripe/webhook", {
      data: body,
      headers: {
        "stripe-signature": signWebhook(body, WEBHOOK_SECRET),
        "content-type": "application/json",
      },
    });
  expect(await (await post(event(100))).json()).toMatchObject({ error: "not recorded" });
  expect(await (await post(event(45000))).json()).toMatchObject({ received: true, paid: true });
  expect(await (await post(event(45000))).json()).toMatchObject({ received: true, paid: false });
  const [after] = await must<{ status: string }[]>(
    c.db.from("invoices").select("status").eq("id", inv.id),
  );
  expect(after.status).toBe("paid");

  // Remove the card: autopay goes off with it.
  await admin("portal_admin_set_stripe_customer", {
    p_account: c.account,
    p: { clear_card: true },
  });
  expect(await must(c.db.rpc("my_payment_options", { p_account: c.account }))).toMatchObject({
    card: null,
    autopay: false,
  });
});

test("Stripe test mode, real API: customer, off-session charge on a saved card, refund by intent", async () => {
  test.skip(
    !/^sk_test_/.test(env.STRIPE_SECRET_KEY ?? ""),
    "needs a Stripe test key in .env.local",
  );
  process.env.STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
  const c = clients.prepay;
  const cus = await createCustomer({
    accountId: `${c.account}-${RUN}`,
    name: "E2E Phase 1",
    email: c.email,
  });
  expect(cus.id).toMatch(/^cus_/);
  // Attach Stripe's test Visa (what a saved card from Checkout setup mode becomes).
  const attach = await fetch("https://api.stripe.com/v1/payment_methods/pm_card_visa/attach", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `customer=${cus.id}`,
  });
  const pm = (await attach.json()) as { id: string };
  expect(pm.id).toMatch(/^pm_/);
  const b = await book(c, { estimate: 300 });
  const charged = await chargeSavedCard({
    customer: cus.id,
    pm: pm.id,
    invoiceId: b.inv!.id,
    number: b.inv!.number,
    amount: 300,
    currency: "AED",
    attempt: 1,
  });
  expect(charged).toMatchObject({ status: "succeeded", amount: 30000, currency: "aed" });
  await admin("portal_admin_set_payment_intent", { p_invoice: b.inv!.id, p_pi: charged.id });
  const out = await admin<{ already: boolean; project_id: string }>("portal_admin_stripe_pi_paid", {
    p_invoice: b.inv!.id,
    p_pi: charged.id,
    p_amount_minor: charged.amount,
    p_currency: charged.currency,
  });
  expect(out).toMatchObject({ already: false, project_id: b.id });
  expect(await status(c, b.id)).toBe("requested"); // pending confirmation, never auto-confirmed
  const refund = await refundCheckout({
    sessionId: charged.id,
    amount: 300,
    refundId: `e2e-${RUN}`,
  });
  expect(refund.id).toMatch(/^re_/);
  expect(["succeeded", "pending"]).toContain(refund.status);
});

test("Invoices: issued at booking, Due → Paid → Refunded, PDF for owner / billing teammate / admin only", async () => {
  const owner = await clientAccount(RUN, "invowner", "E2E Pay invoices");
  await admin("portal_admin_set_payment_terms", { p_account: owner.account, p_terms: "prepay" });
  const b = await book(owner, { estimate: 500 });
  expect(b.inv).toMatchObject({ stage: "full", amount: 500 });
  const row = async () =>
    (
      await must<{ status: string; refunded: number }[]>(
        owner.db.from("invoices").select("status, refunded").eq("id", b.inv!.id),
      )
    )[0];
  expect(await row()).toMatchObject({ status: "due" });

  // PDF: the owner and a teammate with billing access, never a plain teammate.
  const team: SupabaseClient[] = [];
  for (const [n, billing] of [
    ["billmate", true],
    ["plainmate", false],
  ] as const) {
    const email = await createUser(RUN, n);
    await must(
      owner.db.from("account_invites").insert({ account_id: owner.account, email, name: n }),
    );
    const db = await signedIn(email);
    await must(db.rpc("accept_my_invites"));
    const id = (await db.auth.getUser()).data.user!.id;
    await must(
      owner.db
        .from("account_members")
        .update({ access: { preset: "custom", shoots: true, billing, all_projects: false } })
        .eq("user_id", id)
        .select(),
    );
    team.push(db);
  }
  const pdfOf = (db: SupabaseClient) => db.rpc("my_invoice_pdf", { p_invoice: b.inv!.id });
  expect((await pdfOf(owner.db)).error).toBeNull();
  expect((await pdfOf(team[0])).error).toBeNull();
  expect((await pdfOf(team[1])).error?.message).toMatch(/not your invoice/);
  const d = (await pdfOf(owner.db)).data as PdfInvoice & { invoice: Record<string, unknown> };
  // No Stripe ids in what the PDF is made from.
  expect(Object.keys(d.invoice)).not.toContain("stripe_payment_intent");
  expect(Object.keys(d.invoice)).not.toContain("stripe_session_id");
  expect(
    (await admin<PdfInvoice | null>("portal_admin_invoice_pdf", { p_invoice: b.inv!.id }))?.invoice,
  ).toMatchObject({ number: b.inv!.number });

  // Paid, then cancelled early: a full bank refund; ticked off, the invoice shows it.
  await markPaid(b.inv!.id);
  expect(await row()).toMatchObject({ status: "paid" });
  await change(b.id, "cancel", 48);
  const due = await admin<{ id: string; invoice_id?: string }[]>("portal_admin_refunds", {
    p_status: "due",
  });
  const mine = await refundsOf(owner, b.id);
  expect(mine).toEqual([{ amount: 500, status: "due", method: "bank" }]);
  const [ref] = await must<{ id: string }[]>(
    owner.db.from("refunds").select("id").eq("project_id", b.id),
  );
  expect(due.map((r) => r.id)).toContain(ref.id);
  await admin("portal_admin_refund_done", { p_refund: ref.id });
  expect(Number((await row()).refunded)).toBe(500);
  const refunded = await admin<Record<string, number>>("portal_admin_refunded_invoices", {});
  expect(Number(refunded[b.inv!.id])).toBe(500);

  // The PDF renders, PAID with the refund.
  const after = (await pdfOf(owner.db)).data as PdfInvoice;
  const pdf = Buffer.from(
    await invoicePdf(after, { payUrl: "https://example.test/portal/billing" }),
  );
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.toString("latin1")).toContain("REFUNDED");
});
