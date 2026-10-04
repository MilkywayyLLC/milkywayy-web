import { expect, test } from "@playwright/test";
import { env } from "./helpers/env";
import { adminRpc, cleanup, clientAccount, newRun, signInUI } from "./helpers/portal";

/**
 * One real Stripe TEST-mode payment, end to end (billing add-on). By hand only:
 *   npx playwright test --project=stripe-manual
 * The local app (localhost) opens Checkout with STRIPE_SECRET_KEY (test) from .env.local; the
 * payment uses Stripe's published test card; Stripe then calls the PREVIEW's webhook (through the
 * Vercel protection bypass), which marks the invoice Paid in the shared dev database, and the
 * local page shows it. Needs the preview endpoint set up (scripts/stripe-preview-webhook.mts).
 */
test.skip(
  !/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? ""),
  "needs a Stripe TEST key in .env.local",
);

const RUN = newRun();
test.afterAll(async () => {
  await cleanup(RUN);
});

test("Pay now → Stripe test Checkout (4242) → the preview's webhook marks it Paid", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = await clientAccount(RUN, "card", "Stripe Test Studio");
  await adminRpc("portal_admin_update_client", { p_id: c.account, p_currency: "USD" });
  const number = `INV-STRIPE-${RUN.slice(-5).toUpperCase()}`;
  const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const { error } = await adminRpc("portal_admin_create_invoice", {
    p_account: c.account,
    p_number: number,
    p_issued: new Date().toISOString().slice(0, 10),
    p_due: due,
    p_amount: 125.5,
    p_currency: "USD",
    p_status: "due",
    p_pdf_key: null,
  });
  expect(error).toBeNull();

  await signInUI(page, c.email);
  await page.goto("/portal/billing");
  const row = page.getByRole("group", { name: `Invoice ${number}`, exact: true });
  await row.getByRole("button", { name: `Pay invoice ${number} now` }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await expect(page.getByText("TEST MODE", { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });

  // Stripe's published test card.
  const email = page.locator("#email");
  if (await email.isVisible().catch(() => false)) await email.fill(c.email);
  const card = page.locator('[data-testid="card-accordion-item-button"]');
  if (await card.isVisible().catch(() => false)) await card.click();
  await page.locator("#cardNumber").fill("4242 4242 4242 4242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("Test Card");
  const zip = page.locator("#billingPostalCode");
  if (await zip.isVisible().catch(() => false)) await zip.fill("10001");
  await page.locator('[data-testid="hosted-payment-submit-button"]').click();

  await page.waitForURL(/\/portal\/billing\?paid=/, { timeout: 90_000 });
  await expect(page.getByRole("status").first()).toContainText(number);
  // Paid only once the preview's webhook has run.
  await expect
    .poll(
      async () => {
        const { data } = await c.db
          .from("invoices")
          .select("status, paid_via")
          .eq("account_id", c.account);
        return data?.[0];
      },
      { timeout: 90_000, intervals: [2000] },
    )
    .toEqual({ status: "paid", paid_via: "stripe" });
  await page.reload();
  await expect(row).toContainText("Paid");
  await expect(row).toContainText("paid by card");
});
