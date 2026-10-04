import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signWebhook } from "@/lib/stripe";
import { env, WEBHOOK_SECRET } from "./helpers/env";
import {
  adminRpc,
  backdateDelivery,
  cleanup,
  clientAccount,
  createUser,
  deliveredItems,
  hasPortalAdmin,
  newRun,
  setDeliveredAt,
  signedIn,
  signInUI,
} from "./helpers/portal";

/**
 * Billing add-on (owner, 4 Oct 2026), in the database: the package suggestion (last 3 complete
 * months, ≥2 active; overage and uncovered services counted; minimum saving; pinned offer wins;
 * 6-month price), the package usage view, month-end statements, Stripe and bank payments, and
 * Members seeing none of it. Then the same in the client's Billing page. One serial file: some
 * tests flip global settings (the switch, the minimum, VAT).
 */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
const TAG = RUN.slice(-4);
const packages: string[] = [];
let O: SupabaseClient, M: SupabaseClient;
let account = "";
const must = async <T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};
type Offer = {
  package: string;
  price: number;
  average: number;
  overage: number;
  uncovered: number;
  cost: number;
  saving: number;
  price_6: number;
  saving_6: number;
  discount_pct: number;
  pinned: boolean;
};
const admin = <T>(fn: string, args: Record<string, unknown>) => must<T>(adminRpc(fn, args));
const billing = () =>
  admin<{ suggestion: Offer | null; best_offer: Offer | null }>("portal_admin_client_billing", {
    p_account: account,
  });
const mine = () => must<{ suggestion: Offer | null }>(O.rpc("my_billing", { p_account: account }));
const pkg = async (args: Record<string, unknown>) => {
  const id = await admin<string>("portal_admin_save_package", {
    p_id: null,
    p_account: null,
    p_currency: "AED",
    p_overage: [],
    ...args,
  });
  packages.push(id);
  return id;
};
/** A month of work, `ago` complete months back: 12 reels at 200 and an avatar video at 900. */
const month = async (ago: number, acc = account) => {
  const p = await deliveredItems(acc, `Month -${ago}`, [
    { kind: "reel", qty: 12, price: 200 },
    { kind: "avatar_video", qty: 1, price: 900 },
  ]);
  await backdateDelivery(p.id, ago);
  return p;
};
const monthStart = (ago: number) => {
  const d = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()) + "T12:00:00Z",
  );
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - ago);
  return d.toISOString().slice(0, 10);
};

test.beforeAll(async () => {
  const c = await clientAccount(RUN, "owner", "Plus Realty");
  O = c.db;
  account = c.account;
  const m = await createUser(RUN, "member");
  await must(O.from("account_invites").insert({ account_id: account, email: m, name: "Mo" }));
  M = await signedIn(m);
  await must(M.rpc("accept_my_invites"));
  await admin("portal_admin_save_billing_settings", { p: { suggestions_enabled: true } });
});
test.afterAll(async () => {
  await adminRpc("portal_admin_save_billing_settings", {
    p: {
      suggestions_enabled: true,
      vat_registered: false,
      bank_account_name: "",
      bank_name: "",
      bank_iban: "",
      bank_swift: "",
    },
  });
  await adminRpc("portal_admin_set_client_billing", {
    p_account: account,
    p: { pinned_package_id: null },
  });
  await cleanup(RUN);
  for (const id of packages) await adminRpc("portal_admin_delete_package", { p_id: id });
});

test("no suggestion with fewer than 2 active months in the last 3; this month never counts", async () => {
  const cheap = await pkg({
    p_name: `E2E Cheap ${TAG}`,
    p_price: 1,
    p_price_usd: 1,
    p_inclusions: [{ key: "reel", label: "Reels", qty: 100 }],
  });
  await deliveredItems(account, "This month", [{ kind: "reel", qty: 50, price: 200 }]);
  await month(1);
  expect((await billing()).best_offer).toBeNull();
  expect((await mine()).suggestion).toBeNull();
  await admin("portal_admin_delete_package", { p_id: cheap });
});

test("the math: price + overage beyond inclusions + the client's own rates for what isn't covered; 6-month price uses the discount", async () => {
  await month(2);
  await month(3);
  // Each of the 3 complete months: 12 × 200 + 900 = 3,300.
  await pkg({
    p_name: `E2E Growth ${TAG}`,
    p_price: 2000,
    p_price_usd: 545,
    p_inclusions: [{ key: "reel", label: "Reels", qty: 10 }],
    p_overage: [{ key: "reel", label: "Extra reel", amount: 150, amount_usd: 40 }],
    p_discount_pct: 20,
  });
  const o = (await billing()).best_offer!;
  expect(o).toMatchObject({
    package: `E2E Growth ${TAG}`,
    price: 2000,
    average: 3300,
    overage: 300, // 2 reels a month beyond 10, at the package's overage rate
    uncovered: 900, // the avatar video isn't in the package: at the client's own rate
    cost: 3200,
    saving: 100,
    discount_pct: 20,
    price_6: 1600,
    saving_6: 500,
    pinned: false,
  });
  // A saving of 100 is under the AED 500 minimum: the client sees nothing.
  expect((await mine()).suggestion).toBeNull();

  // A bigger package with the reels covered: 1,500 + 0 + 900 → saving 900, shown.
  await pkg({
    p_name: `E2E Scale ${TAG}`,
    p_price: 1500,
    p_price_usd: 410,
    p_inclusions: [{ key: "reel", label: "Reels", qty: 12 }],
  });
  const s = (await mine()).suggestion!;
  expect(s).toMatchObject({
    package: `E2E Scale ${TAG}`,
    cost: 2400,
    saving: 900,
    price_6: 1350, // default 10% off for 6 months
    saving_6: 1050,
  });
});

test("the minimum is set in admin; the switches hide it; a pinned offer overrides the templates", async () => {
  await admin("portal_admin_save_billing_settings", { p: { min_saving_aed: 1000 } });
  expect((await mine()).suggestion).toBeNull();
  await admin("portal_admin_save_billing_settings", { p: { min_saving_aed: 500 } });
  expect((await mine()).suggestion).not.toBeNull();

  await admin("portal_admin_save_billing_settings", { p: { suggestions_enabled: false } });
  expect((await mine()).suggestion).toBeNull();
  await admin("portal_admin_save_billing_settings", { p: { suggestions_enabled: true } });
  await admin("portal_admin_hide_suggestions", { p_account: account, p_hide: true });
  expect((await mine()).suggestion).toBeNull();
  await admin("portal_admin_hide_suggestions", { p_account: account, p_hide: false });

  // A private offer for this client, worse than "Scale" but pinned: it's the only candidate.
  const offer = await pkg({
    p_account: account,
    p_name: `E2E Offer ${TAG}`,
    p_price: 2200,
    p_inclusions: [
      { key: "reel", label: "Reels", qty: 12 },
      { key: "avatar_video", label: "Avatar videos", qty: 1 },
    ],
  });
  await admin("portal_admin_set_client_billing", {
    p_account: account,
    p: { pinned_package_id: offer },
  });
  expect((await mine()).suggestion).toMatchObject({
    package: `E2E Offer ${TAG}`,
    pinned: true,
    cost: 2200,
    saving: 1100,
  });
  // Pinned offers always show (owner, 4 Oct 2026): even with the switch off or under the minimum…
  await admin("portal_admin_save_billing_settings", {
    p: { suggestions_enabled: false, min_saving_aed: 5000 },
  });
  expect((await mine()).suggestion).toMatchObject({
    package: `E2E Offer ${TAG}`,
    show_saving: true,
  });
  await admin("portal_admin_save_billing_settings", {
    p: { suggestions_enabled: true, min_saving_aed: 500 },
  });
  // …and one that doesn't save money is "Your offer", without a saving.
  const dear = await pkg({
    p_account: account,
    p_name: `E2E Dear ${TAG}`,
    p_price: 9000,
    p_inclusions: [{ key: "reel", label: "Reels", qty: 20 }],
  });
  await admin("portal_admin_set_client_billing", {
    p_account: account,
    p: { pinned_package_id: dear },
  });
  expect((await mine()).suggestion).toMatchObject({
    package: `E2E Dear ${TAG}`,
    pinned: true,
    show_saving: false,
    saving: -6600, // 3,300 − (9,000 + the 900 avatar video it doesn't cover)
  });
  // "Never show" still wins.
  await admin("portal_admin_hide_suggestions", { p_account: account, p_hide: true });
  expect((await mine()).suggestion).toBeNull();
  await admin("portal_admin_hide_suggestions", { p_account: account, p_hide: false });
  await admin("portal_admin_set_client_billing", {
    p_account: account,
    p: { pinned_package_id: null },
  });
  expect((await mine()).suggestion).toMatchObject({ package: `E2E Scale ${TAG}` });
});

test("month-end statement: frozen once; later changes don't move it; VAT after everything when on", async () => {
  const last = monthStart(1);
  expect(
    await admin<number>("portal_admin_freeze_statements", { p_month: last, p_account: account }),
  ).toBe(1);
  const st = await admin<{ total: number; vat: number; mode: string; lines: unknown[] }>(
    "portal_admin_statement",
    { p_account: account, p_month: last },
  );
  expect(st).toMatchObject({ mode: "payg", total: 3300, vat: 0 });
  expect(st.lines).toHaveLength(2);
  // More work lands in that month afterwards: the frozen statement doesn't change…
  await month(1);
  await admin("portal_admin_freeze_statements", { p_month: last, p_account: account });
  expect(
    (
      await admin<{ total: number }>("portal_admin_statement", {
        p_account: account,
        p_month: last,
      })
    ).total,
  ).toBe(3300);
  // …unless the admin re-freezes it; with VAT on, 5% goes on after everything.
  await admin("portal_admin_save_billing_settings", { p: { vat_registered: true } });
  await admin("portal_admin_freeze_statements", {
    p_month: last,
    p_account: account,
    p_replace: true,
  });
  expect(
    await admin<{ subtotal: number; vat: number; total: number }>("portal_admin_statement", {
      p_account: account,
      p_month: last,
    }),
  ).toMatchObject({ subtotal: 6600, vat_rate: 5, vat: 330, total: 6930 });
  await admin("portal_admin_save_billing_settings", { p: { vat_registered: false } });
  // The current month can't be frozen.
  await expect(
    admin("portal_admin_freeze_statements", { p_month: monthStart(0), p_account: account }),
  ).rejects.toThrow(/only complete months/);
  // The client sees last month as final.
  const b = await must<{ payg: { last_month: { total: number; final: boolean } } }>(
    O.rpc("my_billing", { p_account: account }),
  );
  expect(b.payg.last_month).toMatchObject({ total: 6930, final: true });
});

test("a 6-month package: Month n of 6, end date, usage left, overage and the month estimate", async () => {
  const pkgId = await pkg({
    p_account: account,
    p_name: `E2E Contract ${TAG}`,
    p_price: 3000,
    p_inclusions: [
      { key: "reel", label: "Reels", qty: 10 },
      { key: "shoot_day", label: "Shoot days", qty: 2 },
    ],
    p_overage: [{ key: "reel", label: "Extra reel", amount: 180 }],
    p_discount_pct: 10,
  });
  const started = monthStart(2);
  const renews = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  await admin("portal_admin_set_plan", {
    p_account: account,
    p_mode: "package",
    p_package: pkgId,
    p_started: started,
    p_renews: renews,
    p_term: 6,
  });
  await deliveredItems(account, "Package work", [
    { kind: "shoot_day", qty: 1, price: 0 },
    { kind: "avatar_video", qty: 1, price: 900 },
  ]);
  const plan = (
    await must<{
      plan: {
        price: number;
        term_months: number;
        month_no: number;
        ends_on: string;
        usage: { key: string; used: number; remaining: number; over: number; overage: number }[];
        overage_total: number;
        extras_total: number;
        estimate: number;
      };
      suggestion: unknown;
    }>(O.rpc("my_billing", { p_account: account }))
  ).plan;
  expect(plan.price).toBe(2700); // 3,000 less 10% for the 6-month term
  expect(plan.term_months).toBe(6);
  expect(plan.month_no).toBe(3); // started on the 1st two months ago
  expect(plan.ends_on).toBeTruthy();
  const reels = plan.usage.find((u) => u.key === "reel")!;
  const days = plan.usage.find((u) => u.key === "shoot_day")!;
  // The 50 reels delivered this month are 40 over 10, at 180 each.
  expect(reels).toMatchObject({ used: 50, remaining: 0, over: 40, overage: 7200 });
  expect(days).toMatchObject({ used: 1, remaining: 1, over: 0 });
  expect(plan.extras_total).toBe(900);
  expect(plan.estimate).toBe(2700 + 7200 + 900);
  // On a package: no suggestion.
  expect((await mine()).suggestion).toBeNull();
  await admin("portal_admin_set_plan", {
    p_account: account,
    p_mode: "payg",
    p_package: null,
    p_started: null,
    p_renews: null,
  });
});

test("calendar months: a mid-month start pro-rates the first month (price and inclusions); earlier work is pay as you go; the statement matches", async () => {
  const pro = await clientAccount(RUN, "pro", "Pro Realty");
  const last = monthStart(1);
  const ym = last.slice(0, 8);
  const dim = new Date(Date.UTC(+last.slice(0, 4), +last.slice(5, 7), 0)).getUTCDate();
  const p = await pkg({
    p_account: pro.account,
    p_name: `Pro Monthly ${TAG}`,
    p_price: 3100,
    p_inclusions: [{ key: "reel", label: "Reels", qty: 10 }],
    p_overage: [{ key: "reel", label: "Extra reel", amount: 200 }],
  });
  await admin("portal_admin_set_plan", {
    p_account: pro.account,
    p_mode: "package",
    p_package: p,
    p_started: `${ym}16`,
    p_renews: null,
  });
  const before = await deliveredItems(pro.account, "Before the package", [
    { kind: "reel", qty: 2, price: 150 },
  ]);
  await setDeliveredAt(before.id, `${ym}05T10:00:00+04:00`);
  const within = await deliveredItems(pro.account, "On the package", [
    { kind: "reel", qty: 7, price: 0 },
    { kind: "avatar_video", qty: 1, price: 900 },
  ]);
  await setDeliveredAt(within.id, `${ym}20T10:00:00+04:00`);
  await admin("portal_admin_freeze_statements", { p_month: last, p_account: pro.account });
  const st = await admin<{
    mode: string;
    total: number;
    package: { prorated: boolean; price: number; full_price: number; before_total: number };
    overage: { key: string; qty: number; used: number; over: number }[];
  }>("portal_admin_statement", { p_account: pro.account, p_month: last });
  const frac = (dim - 15) / dim;
  const price = Math.round(3100 * frac * 100) / 100;
  const reels = Math.round(10 * frac);
  const over = Math.max(0, 7 - reels);
  expect(st.mode).toBe("package");
  expect(st.package).toMatchObject({ prorated: true, full_price: 3100, price, before_total: 300 });
  expect(st.overage[0]).toMatchObject({ key: "reel", qty: reels, used: 7, over });
  expect(Number(st.total)).toBeCloseTo(price + over * 200 + 900 + 300, 2);
  // This month is the first full one: full price, full inclusions.
  const now = await must<{
    mode: string;
    plan: { prorated: boolean; price: number; month_no: number };
  }>(pro.db.rpc("my_billing", { p_account: pro.account }));
  expect(now.mode).toBe("package");
  expect(now.plan).toMatchObject({ prorated: false, price: 3100, month_no: 1 });
  // A package starting next month: this month is still pay as you go.
  await admin("portal_admin_set_plan", {
    p_account: pro.account,
    p_mode: "package",
    p_package: p,
    p_started: monthStart(-1),
    p_renews: null,
  });
  expect(
    (await must<{ mode: string }>(pro.db.rpc("my_billing", { p_account: pro.account }))).mode,
  ).toBe("payg");
});

test("Stripe: Paid only when the session, amount and currency match", async () => {
  const inv = await admin<{ id: string }>("portal_admin_create_invoice", {
    p_account: account,
    p_number: `INV-S-${TAG}`,
    p_issued: monthStart(0),
    p_due: monthStart(-1),
    p_amount: 1250.5,
    p_currency: "AED",
    p_status: "due",
    p_pdf_key: null,
  });
  expect(await must(O.rpc("my_invoice_for_payment", { p_invoice: inv.id }))).toMatchObject({
    unpaid: true,
    pay_online: false, // AED → bank transfer by default
  });
  await expect(
    M.rpc("my_invoice_for_payment", { p_invoice: inv.id }).then((r) => {
      if (r.error) throw new Error(r.error.message);
    }),
  ).rejects.toThrow(/not your invoice/);
  await admin("portal_admin_set_stripe_session", { p_invoice: inv.id, p_session: "cs_test_1" });
  await expect(
    admin("portal_admin_stripe_paid", {
      p_invoice: inv.id,
      p_session: "cs_test_1",
      p_amount_minor: 125000,
      p_currency: "aed",
    }),
  ).rejects.toThrow(/amount mismatch/);
  await expect(
    admin("portal_admin_stripe_paid", {
      p_invoice: inv.id,
      p_session: "cs_test_other",
      p_amount_minor: 125050,
      p_currency: "aed",
    }),
  ).rejects.toThrow(/session mismatch/);
  const paid = await admin<{ already: boolean; recipients: unknown[] }>(
    "portal_admin_stripe_paid",
    {
      p_invoice: inv.id,
      p_session: "cs_test_1",
      p_amount_minor: 125050,
      p_currency: "aed",
    },
  );
  expect(paid.already).toBe(false);
  expect(paid.recipients.length).toBeGreaterThan(0);
  const [row] = await must<{ status: string; paid_via: string }[]>(
    O.from("invoices").select("status, paid_via").eq("id", inv.id),
  );
  expect(row).toEqual({ status: "paid", paid_via: "stripe" });
  // A repeated webhook changes nothing and emails nobody.
  expect(
    await admin<{ already: boolean }>("portal_admin_stripe_paid", {
      p_invoice: inv.id,
      p_session: "cs_test_1",
      p_amount_minor: 125050,
      p_currency: "aed",
    }),
  ).toMatchObject({ already: true });
});

test("bank transfer: the owner submits proof; rejected with a reason; resubmitted; confirmed → Paid", async () => {
  const inv = await admin<{ id: string }>("portal_admin_create_invoice", {
    p_account: account,
    p_number: `INV-B-${TAG}`,
    p_issued: monthStart(0),
    p_due: monthStart(-1),
    p_amount: 3300,
    p_currency: "AED",
    p_status: "due",
    p_pdf_key: null,
  });
  const key = (n: number) => `payments/${account}/${inv.id}/proof-${n}.pdf`;
  const submit = (db: SupabaseClient, n: number, k = key(n)) =>
    must(
      db.rpc("submit_payment_proof", {
        p_invoice: inv.id,
        p_key: k,
        p_filename: `transfer-${n}.pdf`,
        p_bytes: 2048,
        p_content_type: "application/pdf",
      }),
    );
  await expect(submit(M, 1)).rejects.toThrow(/not your invoice/);
  await expect(submit(O, 1, `payments/${account}/other/proof.pdf`)).rejects.toThrow(
    /check constraint/,
  );
  await submit(O, 1);
  await expect(submit(O, 2)).rejects.toThrow(/already submitted/);
  const list = await admin<
    { id: string; payment_state: string; proof: { id: string; status: string } }[]
  >("portal_admin_invoices", { p_account: account, p_status: "submitted" });
  expect(list).toHaveLength(1);
  expect(list[0].proof.status).toBe("submitted");
  await expect(
    admin("portal_admin_decide_payment", {
      p_proof: list[0].proof.id,
      p_confirm: false,
      p_reason: "",
    }),
  ).rejects.toThrow(/give a reason/);
  await admin("portal_admin_decide_payment", {
    p_proof: list[0].proof.id,
    p_confirm: false,
    p_reason: "Amount short by AED 300",
  });
  const [rej] = await must<{ status: string; payment_state: string; reject_reason: string }[]>(
    O.from("invoices").select("status, payment_state, reject_reason").eq("id", inv.id),
  );
  expect(rej).toEqual({
    status: "due",
    payment_state: "rejected",
    reject_reason: "Amount short by AED 300",
  });
  await submit(O, 2);
  const again = await admin<{ proof: { id: string } }[]>("portal_admin_invoices", {
    p_account: account,
    p_status: "submitted",
  });
  const ok = await admin<{ event: string; recipients: unknown[] }>("portal_admin_decide_payment", {
    p_proof: again[0].proof.id,
    p_confirm: true,
  });
  expect(ok.event).toBe("payment_received");
  const [paid] = await must<{ status: string; paid_via: string; payment_state: string | null }[]>(
    O.from("invoices").select("status, paid_via, payment_state").eq("id", inv.id),
  );
  expect(paid).toEqual({ status: "paid", paid_via: "bank", payment_state: null });
});

test("Members see none of it: no billing, statements, proofs, invoices or plan", async () => {
  await expect(
    M.rpc("my_billing", { p_account: account }).then((r) => {
      if (r.error) throw new Error(r.error.message);
    }),
  ).rejects.toThrow(/owners and admins/);
  for (const t of ["statements", "payment_proofs", "invoices", "account_plans", "line_items"])
    expect(await must<unknown[]>(M.from(t).select("*")), t).toHaveLength(0);
  // The Owner does see them.
  expect((await must<unknown[]>(O.from("statements").select("id"))).length).toBeGreaterThan(0);
  expect((await must<unknown[]>(O.from("payment_proofs").select("id"))).length).toBe(2);
});

// ---------------- the client's Billing page ----------------

const hasR2 = !!(
  env.R2_ACCOUNT_ID &&
  env.R2_ACCESS_KEY_ID &&
  env.R2_SECRET_ACCESS_KEY &&
  env.R2_BUCKET
);
let ui: Awaited<ReturnType<typeof clientAccount>>;
let uiMember = "";

test("pay as you go: the suggestion card (monthly and 6-month), last month's final total, bank transfer; Members see none", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  ui = await clientAccount(RUN, "ui", "Plus UI Realty");
  uiMember = await createUser(RUN, "uimember");
  await must(
    ui.db.from("account_invites").insert({ account_id: ui.account, email: uiMember, name: "Uma" }),
  );
  await must((await signedIn(uiMember)).rpc("accept_my_invites"));
  for (const ago of [1, 2, 3]) await month(ago, ui.account);
  // A private offer pinned to this client: the only candidate, whatever the templates are.
  const offer = await pkg({
    p_account: ui.account,
    p_name: `Plus Offer ${TAG}`,
    p_price: 2200,
    p_inclusions: [
      { key: "reel", label: "Reels", qty: 12 },
      { key: "avatar_video", label: "Avatar videos", qty: 1 },
    ],
  });
  await admin("portal_admin_set_client_billing", {
    p_account: ui.account,
    p: { pinned_package_id: offer },
  });
  await admin("portal_admin_freeze_statements", {
    p_month: monthStart(1),
    p_account: ui.account,
  });
  await admin("portal_admin_save_billing_settings", {
    p: {
      bank_account_name: "Milkywayy (test)",
      bank_name: "Test Bank",
      bank_iban: "AE070331234567890123456",
      bank_swift: "BOMLAEAD",
    },
  });
  const inv = await admin<{ id: string }>("portal_admin_create_invoice", {
    p_account: ui.account,
    p_number: `INV-UI-${TAG}`,
    p_issued: monthStart(0),
    p_due: monthStart(-1),
    p_amount: 3300,
    p_currency: "AED",
    p_status: "due",
    p_pdf_key: null,
  });

  await signInUI(page, ui.email);
  await page.goto("/portal/billing");
  const card = page.getByTestId("suggestion");
  await expect(card).toContainText(`Plus Offer ${TAG}: AED 2,200 a month`);
  await expect(card).toContainText("Includes 12 reels, 1 avatar videos every month.");
  await expect(card).toContainText("save ~AED 1,100 a month");
  await expect(card).toContainText("6 months (10% off)");
  await expect(card).toContainText("AED 1,980");
  await expect(card).toContainText("save ~AED 1,320 a month");
  const talk = card.getByRole("link", { name: "Talk to us →" });
  const href = (await talk.getAttribute("href")) ?? "";
  expect(href).toMatch(/^https:\/\/wa\.me\/971507263306\?text=/);
  expect(decodeURIComponent(href.split("text=")[1])).toContain(`Plus Offer ${TAG} package`);
  await expect(page.getByTestId("last-month")).toContainText("Final total");
  await expect(page.getByTestId("last-month")).toContainText("AED 3,300");
  await expect(page.getByTestId("statements")).toContainText("AED 3,300");

  // AED → bank transfer: the details, then "I've paid" with the receipt.
  const bank = page.getByTestId("bank");
  await expect(bank).toContainText("AE070331234567890123456");
  await expect(bank).toContainText("BOMLAEAD");
  const row = page.getByRole("group", { name: `Invoice INV-UI-${TAG}`, exact: true });
  await expect(row.getByRole("button", { name: /Pay invoice/ })).toHaveCount(0);
  if (hasR2) {
    await row.getByRole("button", { name: `I've paid invoice INV-UI-${TAG}` }).click();
    const sheet = page.getByRole("form", { name: "Payment proof" });
    await sheet.getByLabel("Transfer receipt (PDF or image, up to 10 MB)").setInputFiles({
      name: "receipt.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.1\n%%EOF\n"),
    });
    await sheet.getByLabel("Note (optional)").fill("Paid from the company account");
    await sheet.getByRole("button", { name: "Send proof" }).click();
    // The row turns "Payment submitted" straight away (the sheet closes with it).
    await expect(row).toContainText("Payment submitted");
    await expect(row.getByRole("button", { name: /I've paid/ })).toHaveCount(0);
    const [proof] = await must<{ id: string }[]>(
      ui.db.from("payment_proofs").select("id").eq("invoice_id", inv.id),
    );
    await admin("portal_admin_decide_payment", {
      p_proof: proof.id,
      p_confirm: false,
      p_reason: "Reference missing",
    });
    await page.reload();
    await expect(row).toContainText("We couldn’t confirm your transfer: Reference missing");
  }

  // Pinned but not cheaper: "Your offer", no saving line.
  const dear = await pkg({
    p_account: ui.account,
    p_name: `Plus Premium ${TAG}`,
    p_price: 8000,
    p_inclusions: [{ key: "reel", label: "Reels", qty: 30 }],
  });
  await admin("portal_admin_set_client_billing", {
    p_account: ui.account,
    p: { pinned_package_id: dear },
  });
  await page.reload();
  await expect(card).toContainText("Your offer");
  await expect(card).toContainText(`Plus Premium ${TAG}: AED 8,000 a month`);
  await expect(card).not.toContainText("save ~");

  // A Member: no Billing tab, no prices.
  const m = await browser.newPage();
  await signInUI(m, uiMember);
  await expect(
    m.getByRole("navigation", { name: "Portal sections" }).getByRole("link", { name: "Billing" }),
  ).toHaveCount(0);
  await m.goto("/portal/billing");
  await expect(m.getByText("Billing is for the account’s owner and admins")).toBeVisible();
  await expect(m.getByText(/AED \d/)).toHaveCount(0);
  await m.close();
});

test("a package client: Month n of 6, usage left and over, other work, the month's estimate", async ({
  page,
}) => {
  // No pinned offer (a pinned one shows to package clients too).
  await admin("portal_admin_set_client_billing", {
    p_account: ui.account,
    p: { pinned_package_id: null },
  });
  const contract = await pkg({
    p_account: ui.account,
    p_name: `Plus Contract ${TAG}`,
    p_price: 3000,
    p_inclusions: [
      { key: "reel", label: "Reels", qty: 10 },
      { key: "shoot_day", label: "Shoot days", qty: 2 },
    ],
    p_overage: [{ key: "reel", label: "Extra reel", amount: 180 }],
  });
  await admin("portal_admin_set_plan", {
    p_account: ui.account,
    p_mode: "package",
    p_package: contract,
    p_started: monthStart(2),
    p_renews: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10),
    p_term: 6,
  });
  await deliveredItems(ui.account, "October work", [
    { kind: "reel", qty: 12, price: 200 },
    { kind: "shoot_day", qty: 1, price: 0 },
    { kind: "avatar_video", qty: 1, price: 900 },
  ]);
  await signInUI(page, ui.email);
  await page.goto("/portal/billing");
  const plan = page.getByTestId("plan");
  await expect(plan).toContainText(`Plus Contract ${TAG}`);
  await expect(plan).toContainText(/Month [23] of 6/);
  await expect(plan).toContainText("AED 2,700 a month · 6-month contract until");
  await expect(plan.getByRole("meter", { name: "Reels: 12 of 10" })).toBeVisible();
  await expect(plan).toContainText("2 over · AED 360 at AED 180 each");
  await expect(plan.getByRole("meter", { name: "Shoot days: 1 of 2" })).toBeVisible();
  await expect(plan).toContainText("1 left this month");
  await expect(plan).toContainText("Other work this month");
  await expect(page.getByTestId("estimate")).toContainText("AED 3,960"); // 2,700 + 360 + 900
  await expect(page.getByTestId("suggestion")).toHaveCount(0);
});

test("card payments: Pay now for online accounts; a signed Stripe webhook marks it Paid; a forged one doesn't", async ({
  page,
  request,
}) => {
  await admin("portal_admin_set_client_billing", {
    p_account: ui.account,
    p: { pay_online: true },
  });
  const inv = await admin<{ id: string }>("portal_admin_create_invoice", {
    p_account: ui.account,
    p_number: `INV-CARD-${TAG}`,
    p_issued: monthStart(0),
    p_due: monthStart(-1),
    p_amount: 2700,
    p_currency: "AED",
    p_status: "due",
    p_pdf_key: null,
  });
  await signInUI(page, ui.email);
  await page.goto("/portal/billing");
  const row = page.getByRole("group", { name: `Invoice INV-CARD-${TAG}`, exact: true });
  const pay = row.getByRole("button", { name: `Pay invoice INV-CARD-${TAG} now` });
  await expect(pay).toBeVisible();
  await expect(row.getByRole("button", { name: /I've paid/ })).toHaveCount(0);
  if (!env.STRIPE_SECRET_KEY) {
    await pay.click();
    await expect(row.getByRole("alert")).toContainText("Card payments aren’t set up yet");
  }

  // What Stripe sends after a test payment (the session id was saved when Checkout opened).
  await admin("portal_admin_set_stripe_session", {
    p_invoice: inv.id,
    p_session: `cs_test_${TAG}`,
  });
  const event = (amount: number) =>
    JSON.stringify({
      id: `evt_${TAG}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_${TAG}`,
          object: "checkout.session",
          payment_status: "paid",
          amount_total: amount,
          currency: "aed",
          client_reference_id: inv.id,
          metadata: { invoice_id: inv.id },
        },
      },
    });
  const forged = await request.post("/api/stripe/webhook", {
    data: event(270000),
    headers: { "stripe-signature": signWebhook(event(270000), "whsec_wrong") },
  });
  expect(forged.status()).toBe(400);
  const body = event(270000);
  const ok = await request.post("/api/stripe/webhook", {
    data: body,
    headers: {
      "stripe-signature": signWebhook(body, WEBHOOK_SECRET),
      "content-type": "application/json",
    },
  });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ received: true, paid: true });
  await page.reload();
  await expect(row).toContainText("Paid");
  await expect(row).toContainText("paid by card");
  await expect(row.getByRole("button", { name: /Pay invoice/ })).toHaveCount(0);
});
