import { expect, test } from "@playwright/test";
import { signWebhook } from "@/lib/stripe";
import { BOOKING_TERMS_VERSION } from "@/lib/portal/payments";
import { WEBHOOK_SECRET } from "./helpers/env";
import { adminRpc, cleanup, clientAccount, hasPortalAdmin, newRun } from "./helpers/portal";

/**
 * `invoices.paid_at` and Admin → Today's revenue (admin redesign, 27 Oct 2026): Mark as paid and
 * the Stripe webhook stamp the time; `portal_admin_revenue` sums paid invoices by the month of
 * that time, per currency.
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
const inDays = (n: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(
    new Date(Date.now() + n * 864e5),
  );
type Revenue = { currency: string; total: number; refunded: number; count: number }[];
const aed = async (month?: string) => {
  const r = await admin<Revenue>("portal_admin_revenue", month ? { p_month: month } : {});
  const x = r.find((v) => v.currency === "AED");
  return { total: Number(x?.total ?? 0), count: Number(x?.count ?? 0) };
};

let c: Awaited<ReturnType<typeof clientAccount>>;

async function book(estimate: number) {
  const p = await must<{ id: string; ref: string }>(
    c.db.rpc("book_shoot", {
      p_account: c.account,
      p_date: inDays(10),
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
  const inv = await admin<{ id: string; amount: number }>("portal_admin_booking_invoice", {
    p_project: p.id,
    p_lines: [{ description: "4 × Short-form video", qty: 4, unit_price: estimate / 4 }],
    p_estimate: estimate,
  });
  return { ...p, inv };
}
const paidAtOf = async (invoice: string) =>
  (
    await must<{ paid_at: string | null; status: string }[]>(
      c.db.from("invoices").select("paid_at, status").eq("id", invoice),
    )
  )[0];

test.beforeAll(async () => {
  c = await clientAccount(RUN, "paidat", "E2E Paid at");
  await admin("portal_admin_set_payment_terms", { p_account: c.account, p_terms: "prepay" });
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("Mark as paid stamps paid_at; revenue this month counts it", async () => {
  const before = await aed();
  const b = await book(800);
  expect((await paidAtOf(b.inv.id)).paid_at).toBeNull();
  const t0 = Date.now();
  await admin("portal_admin_set_invoice_status", { p_id: b.inv.id, p_status: "paid" });
  const row = await paidAtOf(b.inv.id);
  expect(row.status).toBe("paid");
  expect(Date.parse(row.paid_at!)).toBeGreaterThanOrEqual(t0 - 60_000);
  const after = await aed();
  expect(after.count).toBe(before.count + 1);
  expect(after.total).toBeCloseTo(before.total + 800, 2);
});

test("the Stripe webhook stamps paid_at", async ({ request }) => {
  const b = await book(900);
  const session = `cs_test_paidat_${RUN}`;
  await admin("portal_admin_set_stripe_session", { p_invoice: b.inv.id, p_session: session });
  const body = JSON.stringify({
    id: `evt_paidat_${RUN}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: session,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 90000,
        currency: "aed",
        client_reference_id: b.inv.id,
        metadata: { invoice_id: b.inv.id },
      },
    },
  });
  const res = await request.post("/api/stripe/webhook", {
    data: body,
    headers: {
      "stripe-signature": signWebhook(body, WEBHOOK_SECRET),
      "content-type": "application/json",
    },
  });
  expect(await res.json()).toMatchObject({ received: true, paid: true });
  expect((await paidAtOf(b.inv.id)).paid_at).toBeTruthy();
});

test("revenue is by the month paid: last month doesn't include this month's payments", async () => {
  const d = new Date();
  const lastMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10);
  const now = await aed();
  const before = await aed(lastMonth);
  const b = await book(400);
  await admin("portal_admin_set_invoice_status", { p_id: b.inv.id, p_status: "paid" });
  expect((await aed(lastMonth)).count).toBe(before.count);
  expect((await aed()).count).toBe(now.count + 1);
});

test("revenue needs the admin key", async () => {
  const { error } = await c.db.rpc("portal_admin_revenue", {
    p_secret: "wrong",
    p_actor: "e2e",
  });
  expect(error).toBeTruthy();
});
