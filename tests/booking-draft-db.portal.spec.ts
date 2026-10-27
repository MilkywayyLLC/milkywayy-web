import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_TERMS_VERSION } from "@/lib/portal/payments";
import { adminRpc, cleanup, clientAccount, hasPortalAdmin, newRun } from "./helpers/portal";

/**
 * Pay before the request goes through (owner, 27 Oct 2026; migration booking_awaiting_payment): a
 * 100% / 50% upfront shoot is held as "Awaiting payment" until it's paid or a bank receipt is uploaded,
 * then it's Requested and the "New booking request" email is claimed once. Drafts stay out of the
 * admin lists; discarding voids the invoice; month-end clients are never held.
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

type Client = { db: SupabaseClient; account: string; email: string };
const clients: Record<string, Client> = {};

/** As the portal books: book_shoot, the terms, the invoice by the client's term, then the hold. */
async function book(c: Client, estimate = 800) {
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
  const inv = await admin<{ id: string; number: string } | null>("portal_admin_booking_invoice", {
    p_project: p.id,
    p_lines: [{ description: "4 × Short-form video", qty: 4, unit_price: estimate / 4 }],
    p_estimate: estimate,
  });
  const held = await admin<boolean>("portal_admin_hold_booking", { p_project: p.id });
  return { ...p, inv, held };
}
const project = async (c: Client, id: string) =>
  (
    await must<{ status: string; meta: Record<string, unknown> }[]>(
      c.db.from("projects").select("status, meta").eq("id", id),
    )
  )[0];
const inAdminList = async (ref: string) =>
  (await admin<{ ref: string }[]>("portal_admin_projects", { p_q: ref })).some(
    (r) => r.ref === ref,
  );

test.beforeAll(async () => {
  for (const [k, terms] of [
    ["split", "split"],
    ["prepay", "prepay"],
    ["monthend", "month_end"],
  ] as const) {
    clients[k] = await clientAccount(RUN, k, `E2E Draft ${k}`);
    await admin("portal_admin_set_payment_terms", {
      p_account: clients[k].account,
      p_terms: terms,
    });
  }
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("50% upfront: held as a draft, out of the admin lists, released when paid, emailed once", async () => {
  const c = clients.split;
  const b = await book(c);
  expect(b.held).toBe(true);
  expect((await project(c, b.id)).status).toBe("awaiting_payment");
  expect(await inAdminList(b.ref)).toBe(false);
  // Not released yet: nothing to email.
  expect(await admin<boolean>("portal_admin_claim_request_email", { p_project: b.id })).toBe(false);

  await admin("portal_admin_set_invoice_status", { p_id: b.inv!.id, p_status: "paid" });
  const p = await project(c, b.id);
  expect(p.status).toBe("requested");
  expect(p.meta.released_at).toBeTruthy();
  expect(p.meta.awaiting_since).toBeUndefined();
  expect(p.meta.paid_at).toBeTruthy(); // invoices_paid_confirms still runs after the release
  expect(await inAdminList(b.ref)).toBe(true);
  expect(await admin<boolean>("portal_admin_claim_request_email", { p_project: b.id })).toBe(true);
  expect(await admin<boolean>("portal_admin_claim_request_email", { p_project: b.id })).toBe(false);
});

test("bank transfer: uploading the receipt sends the request (payment to verify)", async () => {
  const c = clients.prepay;
  const b = await book(c);
  expect(b.held).toBe(true);
  await must(
    c.db.rpc("submit_payment_proof", {
      p_invoice: b.inv!.id,
      p_key: `payments/${c.account}/${b.inv!.id}/receipt.pdf`,
      p_filename: "receipt.pdf",
      p_bytes: 2000,
      p_content_type: "application/pdf",
      p_note: null,
    }),
  );
  expect((await project(c, b.id)).status).toBe("requested");
  expect(await admin<boolean>("portal_admin_claim_request_email", { p_project: b.id })).toBe(true);
});

test("discard voids the invoice; only the booker can, and only a draft", async () => {
  const c = clients.split;
  const b = await book(c);
  const other = clients.prepay;
  const { error } = await other.db.rpc("discard_booking_draft", { p_project: b.id });
  expect(error?.message).toMatch(/not your booking/);
  await must(c.db.rpc("discard_booking_draft", { p_project: b.id }));
  const p = await project(c, b.id);
  expect(p.status).toBe("cancelled");
  expect(p.meta.discarded).toBe(true);
  const inv = await must<{ status: string }[]>(
    c.db.from("invoices").select("status").eq("id", b.inv!.id),
  );
  expect(inv[0]?.status ?? "void").toBe("void");
  expect(await inAdminList(b.ref)).toBe(false);
  const again = await c.db.rpc("discard_booking_draft", { p_project: b.id });
  expect(again.error?.message).toMatch(/only an unpaid draft/);
});

test("send to company releases the draft (the teammate flow is unchanged)", async () => {
  const c = clients.split;
  const b = await book(c);
  expect(
    await admin<boolean>("portal_admin_release_booking", {
      p_project: b.id,
      p_why: "Sent to the company for payment. Request sent.",
    }),
  ).toBe(true);
  expect((await project(c, b.id)).status).toBe("requested");
});

test("month-end clients are never held; expiry leaves fresh drafts alone", async () => {
  const c = clients.monthend;
  const b = await book(c);
  expect(b.inv).toBeNull();
  expect(b.held).toBe(false);
  expect((await project(c, b.id)).status).toBe("requested");

  const d = await book(clients.split);
  await admin<number>("portal_admin_expire_booking_drafts", {});
  expect((await project(clients.split, d.id)).status).toBe("awaiting_payment");
});
