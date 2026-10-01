import { expect, test } from "@playwright/test";
import { EDITOR, OWNER, ownerDb } from "./helpers/admin";
import { env, hasAdminAccounts } from "./helpers/env";
import { e2eKey } from "@/lib/leads/e2e";

/** The Leads inbox: find a lead, open it, set status and notes, export CSV. Owner only. */
test.skip(
  !hasAdminAccounts || !env.LEAD_SECRET,
  "needs LEAD_SECRET and the e2e accounts in .env.local",
);
test.describe.configure({ mode: "serial" });

const NAME = `E2E Inbox ${Date.now().toString(36).slice(-4).toUpperCase()}`;
let ref = "";

test.beforeAll(async ({ request }) => {
  const res = await request.post("/api/lead", {
    headers: { "x-e2e-key": e2eKey(env.LEAD_SECRET) },
    data: {
      type: "production",
      name: NAME,
      phone: "+971 50 000 0001",
      preferred_reply: "WhatsApp",
      fields: { service: "production", brief: "Inbox test" },
      page: "/production",
      utm: { utm_source: "e2e" },
      hp: "",
      elapsed: 9000,
      eventId: "e2e-inbox",
    },
  });
  ref = (await res.json()).ref;
  expect(ref).toMatch(/^MW-\d+$/);
});
test.afterAll(async () => {
  test.setTimeout(150_000);
  const db = await ownerDb();
  await db.from("leads").delete().eq("ref", ref);
});

test.describe("Owner", () => {
  test.use({ storageState: OWNER });

  test("finds the lead, opens it, sets status and notes, exports CSV", async ({ page }) => {
    await page.goto("/admin/leads");
    await page.getByRole("searchbox", { name: "Search leads" }).fill(ref);
    await page.getByRole("button", { name: "Filter" }).click();
    const row = page.getByTestId(`lead-${ref}`);
    await expect(row).toContainText(NAME);
    await expect(page.locator(".ad-row.ad-lead")).toHaveCount(1);
    await row.click();

    await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
    await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/971500000001",
    );
    await expect(page.getByRole("region", { name: "Answers" })).toContainText("Inbox test");
    await expect(page.getByRole("region", { name: "Source" })).toContainText("utm_source=e2e");

    await page.getByLabel("Status").selectOption("contacted");
    await expect(page.getByRole("status").filter({ hasText: "Status saved." })).toBeVisible();
    await page.getByLabel("Notes (only admins see these)").fill("Called, sending a quote.");
    await page.getByRole("button", { name: "Save notes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Notes saved." })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Status")).toHaveValue("contacted");
    await expect(page.getByLabel("Notes (only admins see these)")).toHaveValue(
      "Called, sending a quote.",
    );

    const csv = await page.request.get(`/admin/leads/export?q=${ref}`);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const text = await csv.text();
    expect(text).toContain(`"${ref}"`);
    expect(text).toContain('"contacted"');
    expect(text).toContain('"Called, sending a quote."');
  });
});

test.describe("Editor", () => {
  test.use({ storageState: EDITOR });
  test("can't open leads or export them", async ({ page }) => {
    await page.goto(`/admin/leads/${ref}`);
    await expect(page).toHaveURL(/owner-only=1$/);
    expect((await page.request.get("/admin/leads/export")).status()).toBe(403);
  });
});
