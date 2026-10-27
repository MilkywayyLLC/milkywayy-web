import { expect, test } from "@playwright/test";
import { BOOKING_TERMS_VERSION } from "@/lib/portal/payments";
import { adminRpc, cleanup, clientAccount, createUser, hasPortalAdmin, newRun, signedIn } from "./helpers/portal";

/**
 * Phase 1 part 1 (27 Oct 2026): a teammate without price access books; the server prices it at the
 * company's rates (portal_admin_account_rates), the booking invoice is the company's, and the owner sees
 * it on Billing. The teammate never gets the rates.
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
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date(Date.now() + n * 864e5));

test.afterAll(() => cleanup(RUN));

test("teammate booking on 100% upfront creates the company's invoice", async () => {
  const owner = await clientAccount(RUN, "owner", "E2E Teammate Co");
  await admin("portal_admin_set_payment_terms", { p_account: owner.account, p_terms: "prepay" });
  const mate = await createUser(RUN, "mate");
  await must(owner.db.from("account_invites").insert({ account_id: owner.account, email: mate, name: "Mate" }));
  const M = await signedIn(mate);
  expect(await must<number>(M.rpc("accept_my_invites"))).toBe(1);
  const mid = (await M.auth.getUser()).data.user!.id;
  await must(
    owner.db
      .from("account_members")
      .update({ access: { preset: "custom", shoots: true, billing: false, all_projects: false } })
      .eq("user_id", mid)
      .select(),
  );

  // The teammate's own view hides the rates; the server's gated view has them.
  const opts = await must<{ rates: unknown; sees_prices: boolean }>(
    M.rpc("my_booking_options", { p_account: owner.account }),
  );
  expect(opts.sees_prices).toBe(false);
  expect(opts.rates).toBeNull();
  const rates = await admin<Record<string, number | null>>("portal_admin_account_rates", {
    p_account: owner.account,
  });
  expect(rates && Object.keys(rates).length).toBeGreaterThan(5);

  // What bookShoot now does for a teammate: book with the server's estimate, then the invoice.
  const p = await must<{ id: string; ref: string }>(
    M.rpc("book_shoot", {
      p_account: owner.account,
      p_date: inDays(10),
      p_slot: "morning",
      p_location: { address: "Marina Gate 1, Dubai Marina" },
      p_services: [{ service: "property", property: { type: "apartment", size: 1, photo: true } }],
      p_note: null,
      p_estimate: 600,
      p_start_time: "10:15",
    }),
  );
  await must(M.rpc("accept_booking_terms", { p_project: p.id, p_version: BOOKING_TERMS_VERSION }));
  const inv = await admin<{ id: string; stage: string; amount: number } | null>(
    "portal_admin_booking_invoice",
    { p_project: p.id, p_lines: [{ description: "Photos", qty: 1, unit_price: 600 }], p_estimate: 600 },
  );
  expect(inv).toMatchObject({ stage: "full", amount: 600 });

  // The owner sees it on Billing; it belongs to the company account.
  const seen = await must<{ id: string; account_id: string }[]>(
    owner.db.from("invoices").select("id, account_id").eq("project_id", p.id),
  );
  expect(seen).toEqual([{ id: inv!.id, account_id: owner.account }]);
  // The backfill finds nothing left for this booking.
  const left = await admin<{ ref: string }[]>("portal_admin_unpriced_bookings", {});
  expect(left.map((r) => r.ref)).not.toContain(p.ref);
});

test("a teammate booking without an estimate is listed for the backfill and priced", async () => {
  const owner = await clientAccount(RUN, "owner2", "E2E Teammate Two");
  await admin("portal_admin_set_payment_terms", { p_account: owner.account, p_terms: "month_end" });
  const p = await must<{ id: string; ref: string }>(
    owner.db.rpc("book_shoot", {
      p_account: owner.account,
      p_date: inDays(12),
      p_slot: "morning",
      p_location: { address: "Marina Gate 1, Dubai Marina" },
      p_services: [{ service: "property", property: { type: "apartment", size: 1, photo: true } }],
      p_note: null,
      p_estimate: null,
      p_start_time: "11:00",
    }),
  );
  const left = await admin<{ ref: string; estimate: number | null }[]>("portal_admin_unpriced_bookings", {});
  expect(left.find((r) => r.ref === p.ref)?.estimate).toBeNull();
  await admin("portal_admin_set_estimate", { p_project: p.id, p_estimate: 750 });
  await admin("portal_admin_set_estimate", { p_project: p.id, p_estimate: 1 }); // never overwrites
  const after = await admin<{ ref: string }[]>("portal_admin_unpriced_bookings", {});
  expect(after.map((r) => r.ref)).not.toContain(p.ref);
  const row = await must<{ meta: { booking: { estimate: number } } }[]>(
    owner.db.from("projects").select("meta").eq("id", p.id),
  );
  expect(row[0].meta.booking.estimate).toBe(750);
});
