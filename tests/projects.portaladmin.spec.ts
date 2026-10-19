import { expect, test } from "@playwright/test";
import { OWNER } from "./helpers/admin";
import { hasAdminAccounts } from "./helpers/env";
import { cleanup, clientWithProject, hasPortalAdmin, newRun, setLeadPhone } from "./helpers/portal";

/** Admin → Projects (Phase 10), as the e2e Owner: board/list, status, delivery, reply, retention. */
test.skip(
  !hasAdminAccounts || !hasPortalAdmin,
  "needs the e2e admin accounts and PORTAL_ADMIN_SECRET",
);
test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER });

const RUN = newRun();
const ACCOUNT = `E2E Board ${RUN.slice(-6).toUpperCase()}`;
let c: Awaited<ReturnType<typeof clientWithProject>>;
test.beforeAll(async () => {
  c = await clientWithProject(RUN, "a", ACCOUNT);
  await setLeadPhone(c.ref, "+971500000002");
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("the board shows the new booking under Requested", async ({ page }) => {
  await page.goto(`/admin/projects?q=${c.ref}`);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByTestId("board").getByRole("region", { name: "Requested" })).toContainText(
    c.ref,
  );
  await expect(page.getByTestId("board").getByRole("region", { name: "Requested" })).toContainText(
    ACCOUNT,
  );
});

test("confirm with a date: email logged (test address skipped), WhatsApp ready for the client's number", async ({
  page,
}) => {
  await page.goto(`/admin/projects/${c.id}`);
  await page
    .getByRole("group", { name: `Set status for ${c.ref}` })
    .getByRole("button", { name: "Confirmed" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Date").fill("2026-11-04");
  await dialog.getByLabel("Slot").selectOption("Afternoon");
  await expect(dialog.getByRole("checkbox", { name: "Email the client" })).toBeChecked();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Saved.");
  const wa = dialog.getByRole("link", { name: "Send on WhatsApp" });
  const href = decodeURIComponent((await wa.getAttribute("href"))!);
  expect(href).toMatch(/^https:\/\/wa\.me\/971500000002\?text=/);
  expect(href).toContain(c.ref);
  expect(href).toContain(`/portal/p/${c.ref}`);
  expect(href).toContain("afternoon");
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await expect(
    page
      .getByRole("group", { name: `Set status for ${c.ref}` })
      .getByRole("button", { name: "Confirmed" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("notifications")).toContainText("booking_confirmed");
  await expect(page.getByTestId("notifications")).toContainText(
    /skipped \((test address|RESEND_API_KEY not set)\)/,
  );
});

test("deliver a link, publish, reply; the client is told by email (logged)", async ({ page }) => {
  await page.goto(`/admin/projects/${c.id}`);
  const d = page.getByTestId("deliveries");
  await d.getByRole("button", { name: "Start Delivery 1" }).click();
  await d.getByLabel("Name the client sees").fill("360 tour");
  await d.getByLabel("Or add a link: what is it?").selectOption("tour");
  await d.getByLabel("Link", { exact: true }).fill("https://example.com/tour");
  await d.getByRole("button", { name: "Add link" }).click();
  await expect(d).toContainText("360 tour");
  await expect(d).toContainText("Not published yet");
  await d.getByRole("button", { name: "Publish Delivery 1" }).click();
  await expect(d.getByRole("status").filter({ hasText: "Delivery 1 published" })).toBeVisible();
  await expect(d.getByRole("link", { name: "Send on WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/971500000002\?text=/,
  );

  const t = page.getByTestId("thread");
  await t.getByLabel("Reply").fill("Tour is up. Photos follow tomorrow.");
  await t.getByRole("button", { name: "Send reply" }).click();
  await expect(t.getByRole("status").filter({ hasText: /^Sent/ })).toBeVisible();
  await expect(t).toContainText("Tour is up.");
  await page.reload();
  await expect(page.getByText(/Delivered/).first()).toBeVisible();
  await expect(page.getByTestId("notifications")).toContainText("delivered");
  await expect(page.getByTestId("notifications")).toContainText("new_message");
});

test("keep a client's files longer", async ({ page }) => {
  await page.goto(`/admin/accounts/${c.account}`);
  await page.getByLabel("Keep delivered files").selectOption("24");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Files now kept 24 months after completion.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Keep delivered files")).toHaveValue("24");
});

test("on a phone: the list with one-tap status buttons, nothing scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/admin/projects?q=${c.ref}`);
  await expect(page.getByTestId("board")).toBeHidden();
  const list = page.getByTestId("project-list");
  await expect(list).toContainText(c.ref);
  await expect(list.getByRole("group", { name: `Set status for ${c.ref}` })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await page.goto(`/admin/projects/${c.id}`);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
});
