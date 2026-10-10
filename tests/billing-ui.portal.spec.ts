import { expect, test } from "@playwright/test";
import {
  adminRpc,
  cleanup,
  clientAccount,
  createUser,
  deliveredItems,
  hasPortalAdmin,
  newRun,
  publishedInvoice,
  signedIn,
  signInUI,
} from "./helpers/portal";

/** The client's Billing (Phase 12): Owner/Admins only, plan and usage, this month, invoices. */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
let c: Awaited<ReturnType<typeof clientAccount>>;
let member = "";
const ok = async (p: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
};
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

test.beforeAll(async () => {
  c = await clientAccount(RUN, "owner", "Ledger Homes");
  member = await createUser(RUN, "member");
  await ok(
    c.db.from("account_invites").insert({ account_id: c.account, email: member, name: "Mia" }),
  );
  await ok((await signedIn(member)).rpc("accept_my_invites"));
  await deliveredItems(c.account, "Marina reels", [{ kind: "reel", qty: 3, price: 200 }]);
  await publishedInvoice({
    p_account: c.account,
    p_number: "INV-OLD",
    p_issued: day(-40),
    p_due: day(-10),
    p_amount: 750,
    p_currency: "AED",
    p_status: "due",
    p_pdf_key: null,
  });
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("Owner: Billing is invoices only (unpaid first), no running totals; Home shows the invoice without an amount", async ({
  page,
}) => {
  await publishedInvoice({
    p_account: c.account,
    p_number: "INV-PAID",
    p_issued: day(-60),
    p_due: day(-45),
    p_amount: 900,
    p_currency: "AED",
    p_status: "paid",
    p_pdf_key: null,
  });
  await signInUI(page, c.email);
  await page
    .getByRole("navigation", { name: "Portal sections" })
    .getByRole("link", { name: "Billing" })
    .click();
  await expect(page.getByRole("heading", { name: "Billing", level: 1 })).toBeVisible();
  const inv = page.getByTestId("invoices");
  await expect(inv).toContainText("INV-OLD");
  await expect(inv).toContainText("Overdue"); // due 10 days ago, still marked Due
  await expect(inv).toContainText("AED 750");
  // Unpaid first, then paid.
  await expect(inv.getByRole("group", { name: /^Invoice / })).toHaveText([/INV-OLD/, /INV-PAID/]);
  // No running month: not the total, not the line items in progress.
  await expect(page.getByTestId("payg")).toHaveCount(0);
  await expect(page.getByText(/so far/i)).toHaveCount(0);
  await expect(page.getByText("AED 600")).toHaveCount(0);
  await expect(page.getByText(/3 × AED 200/)).toHaveCount(0);
  // One active month: too little history for a package suggestion.
  await expect(page.getByTestId("suggestion")).toHaveCount(0);
  await page.goto("/portal");
  await expect(page.getByTestId("attention")).toContainText("Invoice overdue");
  await expect(page.getByTestId("attention")).not.toContainText("AED");
});

test("Owner on a package: plan name, usage as counts, renewal date; the badge says so", async ({
  page,
}) => {
  const pkg = await ok(
    adminRpc("portal_admin_save_package", {
      p_id: null,
      p_account: c.account,
      p_name: "Growth",
      p_price: 4000,
      p_currency: "AED",
      p_inclusions: [{ key: "reel", label: "Reels", qty: 10 }],
      p_overage: [],
    }),
  );
  await ok(
    adminRpc("portal_admin_set_plan", {
      p_account: c.account,
      p_mode: "package",
      p_package: pkg,
      p_started:
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" })
          .format(new Date())
          .slice(0, 8) + "01",
      p_renews: null,
    }),
  );
  await deliveredItems(c.account, "More reels", [{ kind: "reel", qty: 4, price: 0 }]);
  await signInUI(page, c.email);
  await page.goto("/portal/billing");
  const plan = page.getByTestId("plan");
  await expect(plan).toContainText("Growth");
  await expect(plan.getByRole("meter", { name: "Reels: 7 of 10" })).toBeVisible();
  await expect(plan).toContainText("3 left this month");
  // Counts only: no price, no estimate.
  await expect(plan).not.toContainText("AED");
  await expect(page.locator(".pt-plan")).toHaveText("Monthly: Growth");
});

test("Member: no Billing tab, no plan badge, no prices anywhere", async ({ page }) => {
  await signInUI(page, member);
  // The Member only belongs to Ledger Homes, so that's the account they're in.
  await expect(page.locator(".pt-switch").first()).toContainText("Ledger Homes");
  await expect(
    page
      .getByRole("navigation", { name: "Portal sections" })
      .getByRole("link", { name: "Billing" }),
  ).toHaveCount(0);
  await expect(page.locator(".pt-plan")).toHaveCount(0);
  await page.goto("/portal/billing");
  await expect(page.getByText("Billing is for the account’s owner and admins")).toBeVisible();
  await expect(page.getByText(/AED \d/)).toHaveCount(0);
  await page.goto("/portal/editing?tab=completed");
  await expect(page.getByText(/AED \d/)).toHaveCount(0);
});
