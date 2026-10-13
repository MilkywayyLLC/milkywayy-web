import { expect, test, type Browser, type Page } from "@playwright/test";
import { OWNER } from "./helpers/admin";
import { hasAdminAccounts } from "./helpers/env";
import {
  cleanup,
  clientAccount,
  adminRpc,
  createUser,
  hasPortalAdmin,
  newRun,
  signedIn,
  signInUI,
} from "./helpers/portal";

/**
 * Launch QA (13 Oct 2026): the client ↔ admin chain end to end, as each side sees it.
 * Book in the portal (with a draft on the way) → Requested on the admin board → confirmed with an
 * email logged → the client sees Confirmed → the client requests a change → the admin sees
 * "Change requested" → confirmed again. Then Team: a Production member sees no billing until the
 * owner gives them Finance.
 */
test.skip(
  !hasAdminAccounts || !hasPortalAdmin,
  "needs the e2e admin accounts and PORTAL_ADMIN_SECRET",
);
test.describe.configure({ mode: "serial" });

const RUN = newRun();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(
  new Date(Date.now() + 2 * 864e5),
);
let c: Awaited<ReturnType<typeof clientAccount>>;
let ref = "";
let projectId = "";

test.beforeAll(async () => {
  c = await clientAccount(RUN, "chain", "E2E Chain Co");
});
test.afterAll(async () => {
  await cleanup(RUN);
});

async function admin(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: OWNER });
  return ctx.newPage();
}

async function confirm(page: Page, slot: "Morning" | "Afternoon") {
  await page
    .getByRole("group", { name: `Set status for ${ref}` })
    .getByRole("button", { name: "Confirmed" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Date").fill(tomorrow);
  await dialog.getByLabel("Slot").selectOption(slot);
  await expect(dialog.getByRole("checkbox", { name: "Email the client" })).toBeChecked();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Saved.");
  await dialog.getByRole("button", { name: "Done" }).click();
}

test("draft: close a half-filled booking, keep it, continue it later", async ({ page }) => {
  await signInUI(page, c.email);
  await page.goto("/portal/shoots?new=shoot");
  const m = page.getByTestId("booking-modal");
  await m
    .getByRole("group", { name: "Type of shoot" })
    .getByRole("button", { name: /^Agent \/ social reels/ })
    .click();
  await m.getByRole("button", { name: "Close" }).click();
  await page
    .getByRole("alertdialog", { name: "Leave this form?" })
    .getByRole("button", { name: "Keep as draft" })
    .click();
  await expect(m).toHaveCount(0);
  await page.goto("/portal/shoots?new=shoot");
  const offer = page.getByTestId("booking-modal").getByRole("status");
  await expect(offer).toContainText("Continue your draft");
  await offer.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByTestId("booking-modal").getByRole("button", { name: /^Agent \/ social reels/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("book in the portal → Requested on the admin board", async ({ page, browser }) => {
  await signInUI(page, c.email);
  await page.goto("/portal/shoots?new=shoot");
  const m = page.getByTestId("booking-modal");
  const offer = m.getByRole("status").filter({ hasText: "Continue your draft" });
  if (await offer.count()) await offer.getByRole("button", { name: "Continue" }).click();
  const reels = m.getByRole("button", { name: /^Agent \/ social reels/ });
  if ((await reels.getAttribute("aria-pressed")) !== "true") await reels.click();
  await m.getByRole("button", { name: "Next", exact: true }).click();
  await m.getByLabel("Date").fill(tomorrow);
  await m.getByRole("button", { name: "Morning" }).click();
  await m
    .getByRole("textbox", { name: /^(Address|Location)\b/ })
    .first()
    .fill("Marina Gate 1, Dubai Marina");
  await m.getByRole("button", { name: "Next", exact: true }).click();
  await m.getByRole("button", { name: "Confirm booking" }).click();
  const done = m.getByRole("status").filter({ hasText: "your booking request is in" });
  await expect(done).toBeVisible();
  ref = (await done.locator(".pt-mono").textContent())!.trim();
  expect(ref).toMatch(/^MW-\d+$/);
  const row = await c.db.from("projects").select("id, status").eq("ref", ref).single();
  projectId = row.data!.id;
  expect(row.data!.status).toBe("requested");

  const a = await admin(browser);
  await a.goto(`/admin/projects?q=${ref}`);
  await expect(a.getByTestId("board").getByRole("region", { name: "Requested" })).toContainText(
    ref,
  );
});

test("admin confirms → the client sees Confirmed; the email is logged", async ({
  page,
  browser,
}) => {
  const a = await admin(browser);
  await a.goto(`/admin/projects/${projectId}`);
  await confirm(a, "Morning");
  await a.reload();
  await expect(a.getByTestId("notifications")).toContainText(/email/i);

  await signInUI(page, c.email);
  await page.goto(`/portal/shoots/${ref}`);
  await expect(page.getByRole("list", { name: "Status: Confirmed" })).toBeVisible();
});

test("the client requests a change → the admin sees “Change requested” → confirms again", async ({
  page,
  browser,
}) => {
  await signInUI(page, c.email);
  await page.goto(`/portal/shoots/${ref}`);
  await page.getByRole("button", { name: "Request a change" }).click();
  const m = page.getByTestId("booking-modal");
  await m.getByRole("button", { name: "Next", exact: true }).click();
  await m.getByRole("button", { name: "Afternoon" }).click();
  await m.getByRole("button", { name: "Next", exact: true }).click();
  await m.getByRole("button", { name: "Send change request" }).click();
  await expect(m.getByRole("status")).toContainText("Change requested");
  await page.goto(`/portal/shoots/${ref}`);
  await expect(page.getByRole("list", { name: "Status: Requested" })).toBeVisible();

  const a = await admin(browser);
  await a.goto(`/admin/projects/${projectId}`);
  await expect(a.getByRole("region", { name: "Activity" })).toContainText("Change requested");
  await confirm(a, "Afternoon");
  await page.reload();
  await expect(page.getByRole("list", { name: "Status: Confirmed" })).toBeVisible();
  // Home → Your work follows the same status.
  await page.goto("/portal");
  const work = page.getByTestId("your-work");
  await expect(work).toContainText("Marina Gate 1");
  await expect(work).toContainText(/Confirmed/i);
});

test("admin logs the shoot (one more reel on site, plus photos) → line items and deliverables", async ({
  browser,
}) => {
  const a = await admin(browser);
  await a.goto(`/admin/projects/${projectId}`);
  const log = a.getByTestId("shoot-log");
  const qty = log.getByLabel("Item 1: quantity");
  const asked = Number(await qty.inputValue());
  await qty.fill(String(asked + 1)); // one extra reel shot on site
  await log.getByRole("button", { name: "Add an item" }).click();
  await log.getByLabel("Item 2: service").selectOption("photo");
  await log.getByLabel("Item 2: description").fill("Property photos");
  // Items the rate card has no price for yet get a manual price, which needs a reason.
  const lines = log.getByTestId("log-line");
  for (let i = 0; i < (await lines.count()); i++) {
    if (!(await lines.nth(i).getByText("no rate yet").count())) continue;
    await lines.nth(i).getByLabel("Change price").check();
    await log.getByLabel(`Item ${i + 1}: price`).fill("100");
    await log.getByLabel(`Item ${i + 1}: why the price changed`).fill("Agreed on site");
  }
  await log.getByRole("button", { name: "Log it" }).click();
  await expect(log.getByRole("status")).toContainText(/Logged \d+ items\./);
  const items = await c.db.from("line_items").select("qty").eq("project_id", projectId);
  expect(items.data!.length).toBeGreaterThanOrEqual(2);
  expect(items.data!.some((i) => Number(i.qty) === asked + 1)).toBe(true);
  await a.reload();
  // A deliverable per reel (the extra one too) and one for the photos.
  await expect(a.getByTestId("deliverables-admin").getByTestId("deliverable-row")).toHaveCount(
    asked + 2,
  );
});

test("deliver photos, a reel, long-form and a 360 link → the client's grouped cards; a photo revision reaches the admin", async ({
  page,
  browser,
}) => {
  const add = (kind: string, label: string, src: { key?: string; url?: string }) =>
    adminRpc("portal_admin_add_file", {
      p_id: projectId,
      p_delivery_no: 1,
      p_delivery_label: "Delivery 1",
      p_kind: kind,
      p_source: src.key ? "r2" : "link",
      p_url: src.url ?? null,
      p_r2_key: src.key ?? null,
      p_label: label,
      p_bytes: src.key ? 1000 : null,
      p_content_type: src.key ? (kind === "reel" ? "video/mp4" : "image/jpeg") : null,
    });
  for (const [kind, label, src] of [
    ["photos", "IMG_1.jpg", { key: `projects/${ref}/d1/IMG_1.jpg` }],
    ["photos", "IMG_2.jpg", { key: `projects/${ref}/d1/IMG_2.jpg` }],
    ["reel", "Reel 1.mp4", { key: `projects/${ref}/d1/reel-1.mp4` }],
    ["long_form", "Walkthrough", { url: "https://youtu.be/dQw4w9WgXcQ" }],
    ["tour", "360 tour", { url: "https://kuula.co/share/collection/7abcd" }],
  ] as const) {
    const { error } = await add(kind, label, src);
    expect(error, `${kind} ${label}`).toBeNull();
  }
  expect(
    (await adminRpc("portal_admin_publish_delivery", { p_id: projectId, p_delivery_no: 1 })).error,
  ).toBeNull();

  // Publishing marked the photos Delivered by itself (the manual control stays).
  const a = await admin(browser);
  await a.goto(`/admin/projects/${projectId}`);
  await expect(
    a.getByTestId("deliverables-admin").getByLabel("Property photos: status"),
  ).toHaveValue("delivered");

  await signInUI(page, c.email);
  await page.goto(`/portal/shoots/${ref}`);
  const photos = page.getByTestId("deliv-photos");
  await expect(photos).toContainText("Photos (2)");
  await expect(photos.getByRole("button", { name: "Download all" })).toBeVisible();
  await expect(page.getByTestId("deliv-reels")).toBeVisible();
  await expect(page.getByTestId("deliv-long")).toBeVisible();
  const tour = page.getByTestId("deliv-tour");
  await expect(tour.getByRole("link", { name: /Preview/ })).toHaveAttribute(
    "href",
    "https://kuula.co/share/collection/7abcd",
  );
  await expect(tour.getByRole("button", { name: "Copy link" })).toBeVisible();
  // Lightbox.
  await photos.getByRole("button", { name: "Open IMG_1.jpg" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  // A revision on one photo.
  await photos.getByRole("button", { name: "Request revision" }).first().click();
  await photos
    .getByRole("textbox", { name: /What should change/ })
    .fill("Straighten the verticals");
  await photos.getByRole("button", { name: "Send" }).click();
  await expect(photos.getByRole("textbox", { name: /What should change/ })).toHaveCount(0);

  await a.reload();
  const photoRow = a.getByTestId("deliverable-row").filter({
    has: a.getByLabel("Property photos: status"),
  });
  await expect(photoRow.getByTestId("rounds")).toHaveText("Revisions 1 of 2");
});

test("Team: a Production member sees no billing; Finance access shows it", async ({ page }) => {
  const m = await createUser(RUN, "fin");
  await c.db.from("account_invites").insert({ account_id: c.account, email: m, name: "Fin" });
  const M = await signedIn(m);
  await M.rpc("accept_my_invites");
  await signInUI(page, m);
  await page.goto("/portal/billing");
  await expect(page.getByText("Your access doesn’t include billing")).toBeVisible();
  await expect(page.getByText(/AED \d/)).toHaveCount(0);

  // The owner switches them to Finance (Team → access).
  const { data: member } = await M.auth.getUser();
  const { data: row } = await c.db
    .from("account_members")
    .select("access")
    .eq("account_id", c.account)
    .eq("user_id", member.user!.id)
    .single();
  const { error } = await c.db
    .from("account_members")
    .update({ access: { ...(row!.access as object), preset: "finance", billing: true } })
    .eq("account_id", c.account)
    .eq("user_id", member.user!.id);
  expect(error).toBeNull();
  await page.reload();
  await expect(page.getByText("Your access doesn’t include billing")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
});
