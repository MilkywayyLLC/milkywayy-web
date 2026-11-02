import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminRpc,
  cleanup,
  clientAccount,
  hasPortalAdmin,
  newRun,
  signInUI,
} from "./helpers/portal";

/** An issued invoice keeps the client details it was issued with; a draft reads them live (owner, 2 Nov 2026). */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");

const RUN = newRun();
type Res = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const must = async <T>(p: Res) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
const month = today.slice(0, 8) + "01";

type Details = { name: string; trn: string | null; billing_address: string | null };
type Pdf = { invoice: Record<string, unknown>; account: Details; current: { account: Details } };

test.afterAll(() => cleanup(RUN));

test("drafts read details live; publishing freezes them; statements still see today's", async ({
  page,
}) => {
  const c = await clientAccount(RUN, "owner", "Details Before");
  const db: SupabaseClient = c.db;
  const save = (name: string, trn: string, billing_address: string) =>
    must(db.from("accounts").update({ name, trn, billing_address }).eq("id", c.account));
  await must(
    adminRpc("portal_admin_set_billing_switches", {
      p_account: c.account,
      p_show_budget: false,
      p_payg_invoicing: "month_end",
    }),
  );
  const pj = await must<{ id: string }>(
    adminRpc("portal_admin_create_project", {
      p_account: c.account,
      p_type: "edit",
      p_title: "Details",
      p_kind: "short_form",
    }),
  );
  await must(
    adminRpc("portal_admin_add_line_item", {
      p_project: pj.id,
      p_kind: "reel",
      p_description: null,
      p_qty: 1,
      p_unit_price: 400,
    }),
  );
  await must(adminRpc("portal_admin_set_status", { p_id: pj.id, p_status: "delivered" }));
  await must(adminRpc("portal_admin_generate_drafts", { p_month: month }));
  const q = await must<{ id: string; account_id: string }[]>(
    adminRpc("portal_admin_invoice_queue", { p_status: "open" }),
  );
  const id = q.find((r) => r.account_id === c.account)!.id;

  // The draft picks up details saved after it was made.
  await save("Details Saved", "100000000000001", "Saved Street");
  const draft = await must<Pdf>(adminRpc("portal_admin_invoice_pdf", { p_invoice: id }));
  expect(draft.account).toMatchObject({
    name: "Details Saved",
    trn: "100000000000001",
    billing_address: "Saved Street",
  });

  await must(adminRpc("portal_admin_approve_invoice", { p_id: id, p_publish_now: true }));

  // Changed after issuing: the invoice keeps what it was issued with, for the client and for us.
  await save("Details Renamed", "100000000000002", "New Street");
  for (const pdf of [
    await must<Pdf>(db.rpc("my_invoice_pdf", { p_invoice: id })),
    await must<Pdf>(adminRpc("portal_admin_invoice_pdf", { p_invoice: id })),
  ]) {
    expect(pdf.account.name).toBe("Details Saved");
    expect(pdf.account.trn).toBe("100000000000001");
    expect(pdf.current.account.name).toBe("Details Renamed");
    expect(pdf.invoice).not.toHaveProperty("issued_details");
  }

  // A later status change doesn't overwrite it.
  await must(adminRpc("portal_admin_set_invoice_status", { p_id: id, p_status: "paid" }));
  const paid = await must<Pdf>(db.rpc("my_invoice_pdf", { p_invoice: id }));
  expect(paid.account.name).toBe("Details Saved");

  // PDFs from the real routes: the invoice as issued, a statement with today's details.
  await must(adminRpc("portal_admin_set_invoice_status", { p_id: id, p_status: "due" }));
  await signInUI(page, c.email);
  const text = async (url: string) => {
    const r = await page.request.get(url);
    expect(r.status()).toBe(200);
    return (await r.body()).toString("latin1");
  };
  const invoice = await text(`/portal/billing/invoice/${id}`);
  expect(invoice).toContain("Details Saved");
  expect(invoice).not.toContain("Details Renamed");
  const statement = await text(`/portal/billing/statement?ids=${id}`);
  expect(statement).toContain("Details Renamed");
});
