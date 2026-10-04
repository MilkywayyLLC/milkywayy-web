import { expect, test } from "@playwright/test";
import { OWNER } from "./helpers/admin";
import { hasAdminAccounts } from "./helpers/env";
import {
  adminRpc,
  cleanup,
  clientAccount,
  hasPortalAdmin,
  newRun,
  signInUI,
} from "./helpers/portal";

/**
 * Onboarding without an import (owner, 4 Oct 2026): create a client by hand and email them
 * "Your Milkywayy portal is ready"; add their earlier work as a past project (Completed, files
 * kept from the day they're added, no email unless ticked); a past shoot can make share pages.
 */
test.skip(
  !hasAdminAccounts || !hasPortalAdmin,
  "needs the e2e admin accounts and PORTAL_ADMIN_SECRET",
);
test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER });

const RUN = newRun();
const NAME = `E2E Onboard ${RUN.slice(-5).toUpperCase()}`;
const must = async <T = unknown>(
  p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};

test.afterAll(async () => {
  await cleanup(RUN);
});

test("create a client by hand; the invite email goes out (logged); resend it", async ({ page }) => {
  const email = `${RUN}-boss@example.com`;
  await page.goto("/admin/accounts/new");
  await page.getByLabel("Company", { exact: true }).check();
  await page.getByLabel("Company name").fill(NAME);
  await page.getByLabel("What they do").selectOption({ index: 1 });
  await page.getByLabel("Billing currency").selectOption("USD");
  await page.getByLabel("Contact name").fill("Bea Boss");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await expect(page.getByLabel(/Your Milkywayy portal is ready/)).toBeChecked();
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page).toHaveURL(/\/admin\/accounts\/[0-9a-f-]{36}\?created=1&emailed=skipped/);
  // Test addresses are never really emailed; the attempt is logged.
  await expect(page.getByRole("status").first()).toContainText("isn’t sent here");
  const invites = page.getByTestId("invites");
  await expect(invites).toContainText(email);
  await expect(invites).toContainText("not emailed yet");
  await expect(page.getByText(/· USD ·/)).toBeVisible();
  await invites.getByRole("button", { name: "Resend invite" }).click();
  await expect(invites.getByRole("status")).toContainText("not sent here");
});

test("a past property shoot: Completed, files published without an email, kept 12 months from today; it can make a share page", async ({
  page,
  browser,
}) => {
  const c = await clientAccount(RUN, "past", `${NAME} Past`);
  await page.goto(`/admin/accounts/${c.account}`);
  await page.getByRole("link", { name: "Add past project" }).click();
  const form = page.getByRole("form", { name: "Add past project" });
  await form.getByLabel("Title").fill("3 Bed villa, Arabian Ranches");
  await form.getByLabel("Original date").fill("2025-11-20");
  await form.getByLabel("Building").fill("Saheel 2");
  await form.getByLabel("Area").fill("Arabian Ranches");
  await form.getByLabel("Property type").selectOption("villa");
  await form.getByRole("button", { name: "Add past project" }).click();
  await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]{36}\?past=1/);
  await expect(page.getByTestId("past-note")).toContainText("20 Nov 2025");
  const projectId = page.url().split("/projects/")[1].split("?")[0];

  // Files: a link here (uploads work the same), plus a photo added for the share page.
  await page.getByRole("button", { name: /Start Delivery 1/ }).click();
  await page.getByLabel("Or add a link: what is it?").selectOption("tour");
  await page.getByLabel("Name the client sees").fill("360 tour");
  await page.getByLabel("Link", { exact: true }).fill("https://example.com/tour");
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByText("https://example.com/tour")).toBeVisible();
  const photo = await must<string>(
    adminRpc("portal_admin_add_file", {
      p_id: projectId,
      p_delivery_no: 1,
      p_delivery_label: "Delivery 1",
      p_kind: "photos",
      p_source: "r2",
      p_url: null,
      p_r2_key: `projects/past-${RUN}/d1/IMG_1.jpg`,
      p_label: "IMG_1.jpg",
      p_bytes: 1000,
      p_content_type: "image/jpeg",
    }),
  );
  await page.reload();
  const notify = page.getByLabel(/Notify client/);
  await expect(notify).not.toBeChecked();
  await page.getByRole("button", { name: "Publish Delivery 1" }).click();
  const published = page.getByRole("status").filter({ hasText: "published" }).first();
  await expect(published).toBeVisible();
  await expect(published).not.toContainText("emailed"); // "Notify client" was off
  await expect(page.getByText(/kept until/).first()).toBeVisible();

  // Still Completed; kept ~12 months from today; nobody emailed.
  const [p] = await must<{ status: string }[]>(
    c.db.from("projects").select("status").eq("id", projectId),
  );
  expect(p.status).toBe("completed");
  const files = await must<{ id: string; expires_at: string | null; source: string }[]>(
    c.db.from("project_files").select("id, expires_at, source").eq("project_id", projectId),
  );
  expect(files).toHaveLength(2);
  const kept = new Date(files.find((f) => f.id === photo)!.expires_at!).getTime();
  expect(Math.abs(kept - (Date.now() + 365 * 864e5)) / 864e5).toBeLessThan(3);
  // The client sees it under Shoots → Completed, with the files.
  const client = await browser.newPage();
  await signInUI(client, c.email);
  await client.goto("/portal/shoots");
  await expect(client.getByText("3 Bed villa, Arabian Ranches")).toBeVisible();
  await client.getByText("3 Bed villa, Arabian Ranches").click();
  await expect(client.getByTestId("delivery")).toContainText("360 tour");
  await expect(client.getByTestId("delivery")).toContainText("IMG_1.jpg");
  // And a share page can be made from it.
  await expect(client.getByRole("link", { name: "Create share link" })).toBeVisible();
  const [contact] = await must<{ id: string }[]>(
    c.db
      .from("contacts")
      .insert({ account_id: c.account, name: "Pat Past", whatsapp: "+971501234567" })
      .select("id"),
  );
  const listing = await must<{ slug: string }>(
    c.db.rpc("save_listing", {
      p_id: null,
      p_project: projectId,
      p: {
        title: "Villa in Saheel",
        purpose: "sale",
        price: "4200000",
        contact_ids: [contact.id],
        photo_ids: [photo],
        highlights: [],
        show_brand: true,
      },
    }),
  );
  expect(listing.slug).toMatch(/^villa-in-saheel-/);
  await client.close();
});
