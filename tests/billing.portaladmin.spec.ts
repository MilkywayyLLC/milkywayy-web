import { expect, test } from "@playwright/test";
import { OWNER } from "./helpers/admin";
import { env, hasAdminAccounts } from "./helpers/env";
import {
  adminRpc,
  cleanup,
  clientAccount,
  deliveredItems,
  hasPortalAdmin,
  newRun,
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
  await billing
    .getByLabel("Renews on")
    .fill(new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10));
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

test("suggestions are off for everyone by default; rate card lists the rates", async ({ page }) => {
  await adminRpc("portal_admin_set_suggestions", { p_enabled: false });
  await page.goto("/admin/billing/suggestions");
  await expect(page.getByRole("checkbox", { name: /Show package suggestions/ })).not.toBeChecked();
  await expect(page.getByText("Off: no client sees a suggestion")).toBeVisible();
  await page.goto("/admin/billing/rates");
  await expect(page.getByLabel("Label reel")).toHaveValue("Short-form reel");
  await expect(page.getByLabel("AED reel")).toBeVisible();
});
