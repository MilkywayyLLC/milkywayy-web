import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminRpc,
  backdateDelivery,
  cleanup,
  clientAccount,
  createUser,
  deliveredItems,
  hasPortalAdmin,
  newRun,
  signedIn,
} from "./helpers/portal";

/**
 * Billing rules (Phase 12): Owners/Admins see invoices, plans and prices; Members never do; Overdue
 * after the due date; the usage meter counts delivered items; this month's total is the sum of
 * delivered line items. Package suggestions: billing-plus-db.portal.spec.ts.
 */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
let O: SupabaseClient, M: SupabaseClient;
let account = "";
const must = async <T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};
/** The 1st of this month (Dubai): packages run by calendar month. */
const firstOfMonth =
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()).slice(0, 8) +
  "01";
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

test.beforeAll(async () => {
  const c = await clientAccount(RUN, "owner", "Billing Realty");
  O = c.db;
  account = c.account;
  const m = await createUser(RUN, "member");
  await must(O.from("account_invites").insert({ account_id: account, email: m, name: "Max" }));
  M = await signedIn(m);
  await must(M.rpc("accept_my_invites"));
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("invoices: the Owner sees them, a Member doesn't; a PDF key must be this client's", async () => {
  expect(
    (
      await adminRpc("portal_admin_create_invoice", {
        p_account: account,
        p_number: "X-1",
        p_issued: day(0),
        p_due: day(14),
        p_amount: 100,
        p_currency: "AED",
        p_status: "due",
        p_pdf_key: "invoices/someone-else/x.pdf",
      })
    ).error?.message,
  ).toMatch(/not a PDF for this client/);
  const out = await must<{ id: string; recipients: { email: string }[] }>(
    adminRpc("portal_admin_create_invoice", {
      p_account: account,
      p_number: "INV-1",
      p_issued: day(0),
      p_due: day(14),
      p_amount: 1050,
      p_currency: "AED",
      p_status: "due",
      p_pdf_key: `invoices/${account}/inv-1.pdf`,
    }),
  );
  // "New invoice" goes to the Owner, not the Member.
  expect(out.recipients.map((r) => r.email)).toEqual([`${RUN}-owner@example.com`]);
  expect(await must<unknown[]>(O.from("invoices").select("number"))).toHaveLength(1);
  expect(await must<unknown[]>(M.from("invoices").select("number"))).toEqual([]);
  // Paid → "Payment received" to the Owner.
  const paid = await must<{ recipients: unknown[] }>(
    adminRpc("portal_admin_set_invoice_status", { p_id: out.id, p_status: "paid" }),
  );
  expect(paid.recipients).toHaveLength(1);
});

test("Overdue: the day after the due date it shows Overdue, and housekeeping records it", async () => {
  const out = await must<{ id: string }>(
    adminRpc("portal_admin_create_invoice", {
      p_account: account,
      p_number: "INV-2",
      p_issued: day(-30),
      p_due: day(-1),
      p_amount: 500,
      p_currency: "AED",
      p_status: "due",
      p_pdf_key: null,
    }),
  );
  const list = await must<{ id: string; status: string; shown_status: string }[]>(
    adminRpc("portal_admin_invoices", { p_account: account }),
  );
  expect(list.find((i) => i.id === out.id)).toMatchObject({
    status: "due",
    shown_status: "overdue",
  });
  expect(await must<number>(adminRpc("portal_admin_mark_overdue", {}))).toBeGreaterThanOrEqual(1);
  const [row] = await must<{ status: string }[]>(
    O.from("invoices").select("status").eq("id", out.id),
  );
  expect(row.status).toBe("overdue");
});

test("this month so far = the sum of this month's delivered line items; Members see no price", async () => {
  await deliveredItems(account, "October reels", [
    { kind: "reel", qty: 3, price: 200 },
    { kind: "photo", qty: 40, price: 3 },
  ]);
  const old = await deliveredItems(account, "Last quarter", [
    { kind: "reel", qty: 10, price: 200 },
  ]);
  await backdateDelivery(old.id, 2); // not this month
  const b = await must<{ payg: { total: number; items: unknown[] }; mode: string }>(
    O.rpc("my_billing", { p_account: account }),
  );
  expect(b.mode).toBe("payg");
  expect(Number(b.payg.total)).toBe(3 * 200 + 40 * 3);
  expect(b.payg.items).toHaveLength(2);
  // Members: no billing, no line items, no plan.
  expect((await M.rpc("my_billing", { p_account: account })).error?.message).toMatch(
    /owners and admins/,
  );
  expect(await must<unknown[]>(M.from("line_items").select("id"))).toEqual([]);
  expect(await must<unknown[]>(M.from("account_plans").select("account_id"))).toEqual([]);
});

test("a package's usage meter counts delivered items of each kind in the period", async () => {
  const pkg = await must<string>(
    adminRpc("portal_admin_save_package", {
      p_id: null,
      p_account: account,
      p_name: "Growth",
      p_price: 4000,
      p_currency: "AED",
      p_inclusions: [
        { key: "reel", label: "Reels", qty: 10 },
        { key: "long_form", label: "Long-form", qty: 2 },
      ],
      p_overage: [{ key: "reel", label: "Extra reel", amount: 250 }],
    }),
  );
  await must(
    adminRpc("portal_admin_set_plan", {
      p_account: account,
      p_mode: "package",
      p_package: pkg,
      p_started: firstOfMonth,
      p_renews: null,
    }),
  );
  await deliveredItems(account, "More reels", [{ kind: "reel", qty: 4, price: 0 }]);
  const b = await must<{
    mode: string;
    plan: { name: string; usage: { key: string; used: number; qty: number }[] };
  }>(O.rpc("my_billing", { p_account: account }));
  expect(b.mode).toBe("package");
  expect(b.plan.name).toBe("Growth");
  // 3 (earlier this period) + 4 = 7 reels; the back-dated 10 are outside the period.
  expect(b.plan.usage.find((u) => u.key === "reel")).toMatchObject({ used: 7, qty: 10 });
  expect(b.plan.usage.find((u) => u.key === "long_form")).toMatchObject({ used: 0, qty: 2 });
  // The Member can't read the package either.
  expect(await must<unknown[]>(M.from("packages").select("id"))).toEqual([]);
  await must(
    adminRpc("portal_admin_set_plan", {
      p_account: account,
      p_mode: "payg",
      p_package: null,
      p_started: null,
      p_renews: null,
    }),
  );
});

test("rates: the client's own rate wins over the card; line items use it", async () => {
  await must(
    adminRpc("portal_admin_set_override", { p_account: account, p_key: "reel", p_amount: 175 }),
  );
  const p = await deliveredItems(account, "Rate check", [{ kind: "reel", qty: 2 }]);
  const items = await must<{ unit_price: number; kind: string }[]>(
    O.from("line_items").select("unit_price, kind").eq("project_id", p.id),
  );
  expect(items).toEqual([{ unit_price: 175, kind: "reel" }]);
  const billing = await must<{ rates: { key: string; card: number; override: number | null }[] }>(
    adminRpc("portal_admin_client_billing", { p_account: account }),
  );
  expect(billing.rates.find((r) => r.key === "reel")).toMatchObject({ override: 175 });
});
