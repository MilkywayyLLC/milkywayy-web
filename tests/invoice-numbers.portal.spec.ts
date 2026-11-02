import { expect, test } from "@playwright/test";
import {
  adminRpc,
  cleanup,
  clientAccount,
  hasPortalAdmin,
  newRun,
  publishedInvoice,
  signInUI,
} from "./helpers/portal";

/** Invoice numbers never repeat, and the settings form can't send the counter back (owner, 2 Nov 2026). */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");

const RUN = newRun();
const RUN_B = newRun();
type Res = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const must = async <T>(p: Res) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
const settings = () =>
  must<{ next_invoice_no: number; invoice_prefix: string }>(adminRpc("portal_admin_billing_settings", {}));

test.afterAll(async () => {
  await cleanup(RUN);
  await cleanup(RUN_B);
});

async function manual(account: string, number: string) {
  return adminRpc("portal_admin_create_invoice", {
    p_account: account,
    p_number: number,
    p_issued: today,
    p_due: today,
    p_amount: 100,
    p_currency: "AED",
    p_status: "due",
    p_pdf_key: null,
  });
}

test("a saved settings form can't lower the counter; a used number is skipped, on any client", async ({
  page,
}) => {
  const a = await clientAccount(RUN, "owner", "Numbers A");
  const b = await clientAccount(RUN_B, "owner", "Numbers B");

  const before = await settings();
  await must(adminRpc("portal_admin_save_billing_settings", { p: { next_invoice_no: 1 } }));
  expect((await settings()).next_invoice_no).toBe(before.next_invoice_no);

  // The next number is on client A's void invoice (a typed one), so client B's invoice skips it.
  const taken = `${before.invoice_prefix}${before.next_invoice_no}`;
  await publishedInvoice({
    p_account: a.account,
    p_number: taken,
    p_issued: today,
    p_due: today,
    p_amount: 100,
    p_currency: "AED",
    p_status: "void",
    p_pdf_key: null,
  });
  const pj = await must<{ id: string; ref: string }>(
    adminRpc("portal_admin_create_project", {
      p_account: b.account,
      p_type: "edit",
      p_title: "Numbers",
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
  await must(
    adminRpc("portal_admin_set_billing_switches", {
      p_account: b.account,
      p_show_budget: false,
      p_payg_invoicing: "month_end",
    }),
  );
  await must(adminRpc("portal_admin_set_status", { p_id: pj.id, p_status: "delivered" }));
  await must(adminRpc("portal_admin_generate_drafts", { p_month: today.slice(0, 8) + "01" }));
  const q = await must<{ id: string; account_id: string }[]>(
    adminRpc("portal_admin_invoice_queue", { p_status: "open" }),
  );
  const id = q.find((r) => r.account_id === b.account)!.id;
  const out = await must<{ number: string }>(
    adminRpc("portal_admin_approve_invoice", { p_id: id, p_publish_now: true }),
  );
  expect(out.number).not.toBe(taken);
  expect(Number(out.number.slice(before.invoice_prefix.length))).toBeGreaterThan(before.next_invoice_no);

  // Typing a used number for another client is refused.
  const { error } = await manual(b.account, taken);
  expect(error?.message).toMatch(/duplicate key|unique/);

  // The email lookup and checkout see the period.
  const period = await must<string>(
    adminRpc("portal_admin_invoice_period", { p_account: b.account, p_number: out.number }),
  );
  expect(period).toBe(today.slice(0, 8) + "01");

  // A month-end invoice has no project of its own: checkout names its booking from the billed lines.
  await signInUI(page, b.email);
  await page.goto(`/portal/pay/${id}`);
  await expect(page.getByRole("complementary", { name: "Summary" })).toContainText(pj.ref);
  const statement = await page.request.get(`/portal/billing/statement?ids=${id}`);
  expect(statement.status()).toBe(200);
  expect(statement.headers()["content-disposition"]).toContain("Statement");
});

test("the portal shows the invoice's period, not the month it was issued; checkout and bank card", async ({
  page,
}) => {
  const c = await clientAccount(RUN, "admin", "Period Client");
  const lastMonth = new Date(`${today.slice(0, 8)}15T12:00:00Z`);
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
  const period = lastMonth.toISOString().slice(0, 8) + "01";
  const label = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const number = `INV-P-${RUN}`;
  const inv = await must<{ id: string }>(
    adminRpc("portal_admin_create_invoice", {
      p_account: c.account,
      p_number: number,
      p_issued: today,
      p_due: today,
      p_amount: 900,
      p_currency: "AED",
      p_status: "due",
      p_pdf_key: null,
      p_statement_month: period,
    }),
  );
  await must(adminRpc("portal_admin_approve_invoice", { p_id: inv.id, p_publish_now: true }));
  await must(
    adminRpc("portal_admin_save_billing_settings", {
      p: {
        bank_name: "Test Bank",
        bank_account_name: "Milkywayy Test",
        bank_account_no: "9050203284",
        bank_iban: "AE070331234567890123456",
        bank_swift: "TESTAEAD",
      },
    }),
  );
  await signInUI(page, c.email);

  await page.goto("/portal/billing");
  const row = page.getByRole("group", { name: `Invoice ${number}`, exact: true });
  await expect(row).toContainText(label(period));
  await expect(row).not.toContainText(label(today));

  await page.goto(`/portal/pay/${inv.id}`);
  const summary = page.getByRole("complementary", { name: "Summary" });
  await expect(summary).toContainText("Period");
  await expect(summary).toContainText(label(period));
  await expect(summary).toContainText("Due");

  const panel = page.getByTestId("pay-panel");
  await expect(panel).not.toContainText("no fees");
  await expect(panel).not.toContainText("no card fees");
  await panel.getByRole("button", { name: /Pay by bank transfer/ }).click();
  const bank = page.getByTestId("bank");
  for (const name of ["Bank", "Account name", "Account number", "IBAN", "SWIFT/BIC", "Reference"])
    await expect(bank.getByRole("button", { name: `Copy ${name}`, exact: true })).toBeVisible();
  await expect(bank).toContainText("9050203284");
  await expect(bank).toContainText(number);
  await expect(bank.getByText("Upload receipt")).toBeVisible();
  await expect(bank.getByRole("button", { name: "I’ve paid" })).toBeVisible();
});
