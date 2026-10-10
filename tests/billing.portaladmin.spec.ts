import { expect, test } from "@playwright/test";
import { OWNER } from "./helpers/admin";
import { env, hasAdminAccounts } from "./helpers/env";
import {
  adminRpc,
  backdateDelivery,
  cleanup,
  clientAccount,
  deliveredItems,
  hasPortalAdmin,
  newRun,
  publishedInvoice,
  signInUI,
} from "./helpers/portal";

/** Admin → Billing (Phase 12), as the e2e Owner, and what the client then sees. */
test.skip(
  !hasAdminAccounts || !hasPortalAdmin,
  "needs the e2e admin accounts and PORTAL_ADMIN_SECRET",
);
test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER });

const RUN = newRun();
const NAME = `E2E Bill ${RUN.slice(-5).toUpperCase()}`;
const NUMBER = `INV-${RUN.slice(-6).toUpperCase()}`;
const hasR2 = !!(
  env.R2_ACCOUNT_ID &&
  env.R2_ACCESS_KEY_ID &&
  env.R2_SECRET_ACCESS_KEY &&
  env.R2_BUCKET
);
let c: Awaited<ReturnType<typeof clientAccount>>;
// A tiny valid PDF.
const PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

test.beforeAll(async () => {
  c = await clientAccount(RUN, "owner", NAME);
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("upload an invoice PDF; the client sees it in Billing and downloads it; then it's paid", async ({
  page,
  browser,
}) => {
  test.skip(!hasR2, "R2 not in .env.local");
  test.setTimeout(90_000);
  await page.goto("/admin/billing");
  const form = page.getByRole("form", { name: "New invoice" });
  await form.getByLabel("Client", { exact: true }).selectOption({ label: NAME });
  await form.getByLabel("Invoice number (from Ledger)").fill(NUMBER);
  await form
    .getByLabel("Due date")
    .fill(new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10));
  await form.getByLabel("Amount", { exact: true }).fill("1250");
  await form.getByRole("button", { name: "Add invoice" }).click();
  await expect(form.getByRole("status")).toContainText("Choose the invoice PDF");
  await form
    .getByLabel("PDF")
    .setInputFiles({ name: `${NUMBER}.pdf`, mimeType: "application/pdf", buffer: PDF });
  await form.getByRole("button", { name: "Add invoice" }).click();
  await expect(form.getByRole("status")).toContainText(`Invoice ${NUMBER} added`, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("invoices")).toContainText(`${NUMBER} · ${NAME} · AED 1,250`);

  // The client downloads it.
  const ctx = await browser.newContext({ storageState: undefined });
  const p = await ctx.newPage();
  await signInUI(p, c.email);
  await p.goto("/portal/billing");
  const inv = p.getByTestId("invoices");
  await expect(inv).toContainText(NUMBER);
  await expect(inv).toContainText("Due");
  const [dl] = await Promise.all([
    p.waitForEvent("download"),
    inv.getByRole("button", { name: `Download invoice ${NUMBER}` }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe(`${NUMBER}.pdf`);

  // Paid (the client is emailed "Payment received"; test addresses are skipped and logged).
  await page.reload();
  const row = page.getByTestId("invoices").locator(".ad-row", { hasText: NUMBER });
  await row.getByLabel(`Status of ${NUMBER}`).selectOption("paid");
  await expect(row.getByRole("status")).toContainText("Marked paid");
  await p.reload();
  await expect(p.getByTestId("invoices")).toContainText("Paid");
  await ctx.close();

  // Deleting it removes the PDF from storage too.
  await page.reload();
  const again = page.getByTestId("invoices").locator(".ad-row", { hasText: NUMBER });
  await again.getByRole("button", { name: "Delete" }).click();
  await again.getByRole("button", { name: "Really delete?" }).click();
  await expect(page.getByTestId("invoices")).not.toContainText(NUMBER);
});

test("a private package, the client on it, and line items counting towards usage", async ({
  page,
}) => {
  await page.goto("/admin/billing/packages");
  const form = page.getByRole("form", { name: "New package" });
  await form.getByLabel("Package name").fill("Growth");
  await form.getByLabel("Client (private package)").selectOption({ label: NAME });
  await form.getByLabel("Monthly price").fill("4000");
  await form.getByRole("button", { name: "Create package" }).click();
  await expect(form.getByRole("status")).toContainText("Growth saved");

  await page.goto(`/admin/accounts/${c.account}`);
  const billing = page.getByTestId("client-billing");
  await billing.getByRole("button", { name: "Monthly package" }).click();
  await billing
    .getByLabel("Package", { exact: true })
    .selectOption({ label: "Growth · AED 4,000/month" });
  // Calendar months: start on the 1st (mid-month would pro-rate the first month).
  await billing
    .getByLabel("Starts on")
    .fill(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()).slice(0, 8) +
        "01",
    );
  await billing.getByRole("button", { name: "Save plan" }).click();
  await expect(billing.getByRole("status").filter({ hasText: "Plan saved" })).toBeVisible();

  // Line items on a delivered project count straight away.
  const p = await deliveredItems(c.account, "Reels batch", []);
  await page.goto(`/admin/projects/${p.id}`);
  const li = page.getByTestId("line-items");
  await li.getByLabel("Kind").selectOption("reel");
  await li.getByLabel("Quantity").fill("6");
  await li.getByLabel("Price each (blank = client's rate)").fill("0");
  await li.getByRole("button", { name: "Add", exact: true }).click();
  await expect(li.getByRole("status").filter({ hasText: "Added." })).toBeVisible();
  await expect(li.locator("table")).toContainText("Short-form reel");
  await page.goto(`/admin/accounts/${c.account}`);
  await expect(page.getByTestId("client-billing")).toContainText("Reels: 6 of 10");
});

test("suggestions (on by default, with minimums); a template in AED and USD; VAT and bank details in Settings", async ({
  page,
}) => {
  await page.goto("/admin/billing/suggestions");
  await expect(page.getByRole("checkbox", { name: /Show package suggestions/ })).toBeChecked();
  await expect(page.getByLabel("Minimum saving a month (AED)")).toHaveValue("500");
  await expect(page.getByLabel("Minimum saving a month (USD)")).toHaveValue("135");

  const TPL = `E2E Template ${RUN.slice(-4)}`;
  await page.goto("/admin/billing/packages");
  const form = page.getByRole("form", { name: "New package" });
  await form.getByLabel("Package name").fill(TPL);
  await form
    .getByLabel("Client (private package)")
    .selectOption({ label: "Template, no client (internal, for suggestions)" });
  await form.getByLabel("Monthly price (AED)").fill("2500");
  await form.getByLabel("Monthly price (USD)").fill("680");
  await form.getByLabel("6-month commitment discount (%)").fill("15");
  await expect(form.getByLabel("Use for suggestions")).toBeChecked();
  await form.getByRole("button", { name: "+ Add" }).nth(1).click();
  await form.getByLabel("Overage rates 1: kind").selectOption("reel");
  await form.getByLabel("Overage rates 1: AED each").fill("160");
  await form.getByLabel("Overage rates 1: USD each").fill("44");
  await form.getByRole("button", { name: "Create package" }).click();
  await expect(form.getByRole("status")).toContainText(`${TPL} saved`);
  const pkgs = await adminRpc("portal_admin_packages", {});
  const tpl = (
    pkgs.data as {
      id: string;
      name: string;
      price_usd: number;
      six_month_discount_pct: number;
      overage: { amount: number; amount_usd: number }[];
    }[]
  ).find((p) => p.name === TPL)!;
  expect(tpl).toMatchObject({ price_usd: 680, six_month_discount_pct: 15 });
  expect(tpl.overage[0]).toMatchObject({ amount: 160, amount_usd: 44 });
  await adminRpc("portal_admin_delete_package", { p_id: tpl.id });

  await page.goto("/admin/billing/settings");
  const set = page.getByRole("form", { name: "Billing settings" });
  await set.getByLabel("IBAN").fill("AE07 0331 2345 6789 0123 456");
  await set.getByLabel("SWIFT").fill("bomlaead");
  await set.getByLabel("Account name").fill("Milkywayy (test)");
  await set.getByRole("button", { name: "Save settings" }).click();
  await expect(set.getByRole("status")).toContainText("Saved");
  await page.reload();
  await expect(set.getByLabel("IBAN")).toHaveValue("AE070331234567890123456");
  await expect(set.getByLabel("SWIFT")).toHaveValue("BOMLAEAD");
  await expect(set.getByLabel(/VAT registered/)).not.toBeChecked();
  await adminRpc("portal_admin_save_billing_settings", {
    p: { bank_account_name: "", bank_name: "", bank_iban: "", bank_swift: "" },
  });

  await page.goto("/admin/billing/rates");
  await expect(page.getByLabel("Label reel")).toHaveValue("Short-form reel");
  await expect(page.getByLabel("AED reel")).toBeVisible();
});

test("the invoice form takes the amount from the frozen statement and warns if it differs; a bank transfer is confirmed", async ({
  page,
}) => {
  const p = await deliveredItems(c.account, "Last month's reels", [
    { kind: "reel", qty: 5, price: 300 },
  ]);
  await backdateDelivery(p.id, 1);
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const last = d.toISOString().slice(0, 8) + "01";
  await adminRpc("portal_admin_freeze_statements", { p_month: last, p_account: c.account });

  await page.goto("/admin/billing");
  const form = page.getByRole("form", { name: "New invoice" });
  await form.getByLabel("Client", { exact: true }).selectOption({ label: NAME });
  // The Growth package (above) starts this month, so last month was pay as you go: 5 × 300.
  await expect(form.getByTestId("statement-note")).toContainText("AED 1,500");
  await expect(form.getByLabel("Amount", { exact: true })).toHaveValue("1500");
  await expect(form.getByRole("alert")).toHaveCount(0);
  await form.getByLabel("Amount", { exact: true }).fill("1600");
  await expect(form.getByRole("alert")).toContainText("Differs from the statement (AED 1,500)");

  // The client says they've paid by transfer; the admin confirms it.
  const inv = await publishedInvoice({
    p_account: c.account,
    p_number: `TR-${RUN.slice(-5)}`,
    p_issued: last,
    p_due: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    p_amount: 1500,
    p_currency: "AED",
    p_status: "due",
    p_pdf_key: null,
    p_statement_month: last,
  });
  const id = inv.id;
  const { error } = await c.db.rpc("submit_payment_proof", {
    p_invoice: id,
    p_key: `payments/${c.account}/${id}/receipt.pdf`,
    p_filename: "receipt.pdf",
    p_bytes: 1000,
    p_content_type: "application/pdf",
  });
  expect(error).toBeNull();
  await page.goto("/admin/billing?status=submitted");
  const review = page.getByTestId("payment-review").filter({ hasText: "receipt.pdf" });
  await expect(review).toContainText("Payment submitted");
  await review.getByRole("button", { name: `Confirm payment for TR-${RUN.slice(-5)}` }).click();
  // Paid: it leaves the "Payment submitted" list.
  await expect(review).toHaveCount(0);
  const [row] = (await c.db.from("invoices").select("status, paid_via").eq("id", id)).data as {
    status: string;
    paid_via: string;
  }[];
  expect(row).toEqual({ status: "paid", paid_via: "bank" });

  // The client page: statements, and the engine's view of a suggestion.
  await page.goto(`/admin/accounts/${c.account}`);
  const billing = page.getByTestId("client-billing");
  await billing.getByText("Monthly statements").click();
  await expect(billing.getByTestId("statements")).toContainText("AED 1,500");
  await expect(billing.getByLabel("How they pay")).toHaveValue("");
});
