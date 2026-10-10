import { expect, test } from "@playwright/test";
import { OWNER } from "./helpers/admin";
import { hasAdminAccounts } from "./helpers/env";
import { adminRpc, cleanup, clientAccount, hasPortalAdmin, newRun } from "./helpers/portal";

/**
 * Milkywayy's side of retainers (owner, 10 Oct 2026): the client's budget and dated rates with
 * history, "Log what we shot" (prefilled, extras, a reason for a manual price), deliverables, the
 * shoot calendar and its feed, the invoice queue with a draft edited and published, and an
 * inquiry reply with a private link.
 */
test.skip(
  !hasAdminAccounts || !hasPortalAdmin,
  "needs the e2e admin accounts and PORTAL_ADMIN_SECRET",
);
test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER });

const RUN = newRun();
type Res = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const must = async <T>(p: Res) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
const month = today.slice(0, 8) + "01";

let account = "";
let db: Awaited<ReturnType<typeof clientAccount>>["db"];
let shoot = "";
let shootRef = "";

test.beforeAll(async () => {
  const c = await clientAccount(RUN, "owner", `E2E Retainer ${RUN.slice(-4)}`);
  account = c.account;
  db = c.db;
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("client page: put on a budget package, set a rate from a date; history kept", async ({
  page,
}) => {
  await page.goto(`/admin/accounts/${account}`);
  const panel = page.getByTestId("budget-panel");
  await panel.getByLabel(/Monthly amount/).fill("10000");
  await panel.getByLabel("Starts").selectOption(month);
  await panel.getByRole("button", { name: "Put on a budget package" }).click();
  await expect(panel.getByRole("status")).toContainText("Monthly package saved.");
  await expect(panel).toContainText("of AED 10,000");
  await page.getByText("Rates for this client").click();
  const rates = page.getByTestId("client-rates");
  const reel = rates.getByRole("form", { name: "Short-form reel rate" });
  await reel.getByLabel("Short-form reel: new rate").fill("450");
  await reel.getByLabel("Short-form reel: applies from").fill(month);
  await reel.getByRole("button", { name: "Save" }).click();
  await expect(reel.getByRole("status")).toContainText("already logged keep their price");
  await page.reload();
  await page.getByText("Rates for this client").click();
  await page.getByTestId("client-rates").getByText("Rate history").click();
  await expect(page.getByTestId("rate-history")).toContainText("Short-form reel: AED 450 from");
  await page.getByTestId("budget-panel").getByText("Package history").click();
  await expect(page.getByTestId("budget-history")).toContainText("AED 10,000/month from");
});

test("log what we shot: prefilled from the booking, an extra item, a manual price needs a reason", async ({
  page,
}) => {
  const out = await must<{ id: string; ref: string }>(
    db.rpc("book_shoot", {
      p_account: account,
      p_date: today,
      p_slot: "morning",
      p_location: { address: "Bay Square 5, Business Bay, Dubai", lat: 25.188, lng: 55.282 },
      p_services: [
        { service: "reels", qty: 3 },
        { service: "property", property: { type: "apartment", size: 1, photo: true, tour: true } },
      ],
    }),
  );
  shoot = out.id;
  shootRef = out.ref;
  await page.goto(`/admin/projects/${shoot}`);
  const log = page.getByTestId("shoot-log");
  const lines = log.getByTestId("log-line");
  await expect(lines).toHaveCount(2);
  await expect(log.getByLabel("Item 1: quantity")).toHaveValue("3");
  await expect(lines.nth(0).getByTestId("log-price")).toHaveText("AED 450");
  await expect(lines.nth(1)).toContainText("Property shoot (price list)");
  await expect(log.getByTestId("deliverables-preview")).toContainText(
    "Reel 1, Reel 2, Reel 3, Photos, 360 tour",
  );
  // One more reel than asked, and an extra item at a manual price.
  await log.getByLabel("Item 1: quantity").fill("4");
  await log.getByRole("button", { name: "Add an item" }).click();
  await log.getByLabel("Item 3: service").selectOption("photo");
  await log.getByLabel("Item 3: description").fill("Drone stills");
  await lines.nth(2).getByLabel("Change price").check();
  await log.getByLabel("Item 3: price").fill("500");
  await log.getByRole("button", { name: "Log it" }).click();
  await expect(log.getByRole("alert")).toHaveText("Say why the price was changed.");
  await log.getByLabel("Item 3: why the price changed").fill("Agreed on site");
  await log.getByRole("button", { name: "Log it" }).click();
  await expect(page.getByTestId("shoot-log").getByRole("status")).toHaveText("Logged 3 items.");
  const items = await must<
    { unit_price: number; price_basis: string; override_reason: string | null }[]
  >(
    db
      .from("line_items")
      .select("unit_price, price_basis, override_reason")
      .eq("project_id", shoot)
      .order("sort"),
  );
  expect(items.map((i) => i.price_basis)).toEqual(["client_rate", "price_list", "override"]);
  expect(Number(items[0].unit_price)).toBe(450);
  expect(items[2].override_reason).toBe("Agreed on site");
  // Deliverables were made from the log; statuses are changed here.
  const deliv = page.getByTestId("deliverables-admin");
  // 4 reels, Photos and 360 tour from the property, and the extra drone stills.
  await expect(deliv.getByTestId("deliverable-row")).toHaveCount(7);
  await expect(deliv.getByLabel("Deliverable 7: name")).toHaveValue("Drone stills");
  await deliv.getByLabel("Reel 1: status").selectOption("delivered");
  await expect(deliv.getByRole("status")).toHaveText("Status saved.");
});

test("the shoot calendar shows the booking; the private feed has it as an event", async ({
  page,
  request,
}) => {
  await page.goto("/admin/projects/calendar");
  await expect(
    page.getByTestId("calendar").getByRole("link", { name: /E2E Retainer/ }),
  ).toBeVisible();
  const url = await page.getByTestId("ics-url").inputValue();
  const ics = await (await request.get(new URL(url).pathname)).text();
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain(`UID:${shoot}@milkywayy.com`);
  expect(ics).toContain("LOCATION:Bay Square 5\\, Business Bay\\, Dubai");
  expect((await request.get("/api/portal/calendar/not-the-token.ics")).status()).toBe(404);
});

test("invoice queue: a month-end draft, edited, approved and published now", async ({ page }) => {
  await must(adminRpc("portal_admin_generate_drafts", { p_today: today.slice(0, 8) + "25" }));
  await page.goto("/admin/billing?status=draft");
  const row = page.getByTestId("queue-row").filter({ hasText: /E2E Retainer/ });
  await expect(row).toContainText("Budget package");
  await expect(row).toContainText("AED 10,000");
  await row.click();
  await expect(page.getByTestId("invoice-status")).toHaveText("Draft");
  const editor = page.getByRole("form", { name: "Invoice draft" });
  await editor.getByRole("button", { name: "Add a line" }).click();
  await editor.getByLabel("Line 2 description").fill("Rush delivery");
  await editor.getByLabel("Line 2 unit price").fill("250");
  await expect(editor.getByTestId("draft-total")).toHaveText("AED 10,250");
  await editor.getByRole("button", { name: "Approve & publish now" }).click();
  await expect(page.getByTestId("invoice-status")).toHaveText("Published");
  await expect(page.getByTestId("invoice-lines")).toContainText("Rush delivery");
  const seen = await must<{ amount: number; status: string }[]>(
    db.from("invoices").select("amount, status"),
  );
  expect(seen).toEqual([{ amount: 10250, status: "due" }]);
  // The generated PDF.
  const pdf = await page.request.get(`${page.url()}/pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("inquiries inbox: a client question tagged with the shoot; reply with a private link", async ({
  page,
}) => {
  await must(
    db.rpc("create_inquiry", {
      p_account: account,
      p_subject: "Where are the raw files?",
      p_body: "Hi, can we get the raw footage?",
      p_project: shoot,
    }),
  );
  await page.goto("/admin/inquiries");
  const row = page.getByRole("link", { name: /Where are the raw files\?/ });
  await expect(row).toContainText(shootRef);
  await expect(row.getByTestId("unread")).toHaveText("Unread");
  await row.click();
  await page.getByRole("textbox", { name: "Reply" }).fill("Here they are.");
  await page
    .getByLabel("Private link (optional)")
    .fill("https://drive.google.com/drive/folders/raw");
  await page.getByLabel("What it is (optional)").fill("Raw footage");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sent" })).toBeVisible();
  await expect(page.getByTestId("admin-thread")).toContainText("Raw footage ↗");
});
