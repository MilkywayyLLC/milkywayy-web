import { expect, test } from "@playwright/test";
import { OWNER } from "./helpers/admin";
import { env } from "./helpers/env";
import { hasAdminAccounts } from "./helpers/env";
import {
  addBooking,
  adminRpc,
  cleanup,
  clientAccount,
  hasPortalAdmin,
  newRun,
  signInUI,
} from "./helpers/portal";

/**
 * Fixes from the owner's QA (3 Oct 2026), as the e2e Owner: attach website bookings to a client,
 * create projects for clients, a member's WhatsApp number, confirmed removal from a published
 * delivery, photo previews, and the board opening a project on click.
 */
test.skip(
  !hasAdminAccounts || !hasPortalAdmin,
  "needs the e2e admin accounts and PORTAL_ADMIN_SECRET",
);
test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER });

const RUN = newRun();
const NAME = `E2E QA ${RUN.slice(-5).toUpperCase()}`;
const hasR2 = !!(
  env.R2_ACCOUNT_ID &&
  env.R2_ACCESS_KEY_ID &&
  env.R2_SECRET_ACCESS_KEY &&
  env.R2_BUCKET
);
const r2Keys: string[] = [];
let c: Awaited<ReturnType<typeof clientAccount>>;
let created = "";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.beforeAll(async () => {
  c = await clientAccount(RUN, "owner", NAME);
});
test.afterAll(async () => {
  if (r2Keys.length && hasR2) {
    for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"])
      process.env[k] = env[k];
    const { deleteObject } = await import("../lib/r2");
    for (const k of r2Keys) await deleteObject(k).catch(() => undefined);
  }
  await cleanup(RUN);
});

test("attach a website booking by its ref, from the client's page", async ({ page }) => {
  const ref = await addBooking(`${RUN}-walkin@example.com`); // booked without an account
  await page.goto(`/admin/accounts/${c.account}`);
  await page.getByLabel("Attach a website booking (ref)").fill("MW-999999");
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "No booking MW-999999" })).toBeVisible();
  await page.getByLabel("Attach a website booking (ref)").fill(ref.toLowerCase());
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: `${ref} attached (1 project)` }),
  ).toBeVisible();
  const { data } = await c.db.from("projects").select("ref").eq("ref", ref);
  expect(data).toHaveLength(1); // the client sees it now
});

test("an unclaimed booking's project: attach it to a client from the project page", async ({
  page,
}) => {
  const ref = await addBooking(`${RUN}-phone@example.com`);
  const list = await adminRpc("portal_admin_projects", { p_q: ref });
  const id = (list.data as { id: string }[])[0].id;
  await page.goto(`/admin/projects/${id}`);
  const box = page.getByRole("region", { name: "Attach to a client" });
  await expect(box).toContainText(`Booking ${ref} isn’t linked`);
  await box.getByLabel("Client").selectOption({ label: NAME });
  await box.getByRole("button", { name: "Attach" }).click();
  // Attached: the box goes and the project shows its client.
  await expect(page.getByRole("region", { name: "Attach to a client" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Attach to a client" })).toHaveCount(0);
  await expect(page.getByText(NAME).first()).toBeVisible();
});

test("new project for a client (a WhatsApp booking): it opens, and the client sees it", async ({
  page,
}) => {
  await page.goto(`/admin/accounts/${c.account}`);
  await page.getByRole("link", { name: "New project for this client" }).click();
  await expect(page.getByLabel("Client", { exact: true })).toHaveValue(c.account);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("status")).toContainText("Give it a title");
  await page.getByLabel("Title (the client sees this)").fill("Villa 12, Arabian Ranches");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("status")).toContainText("Add the building and the area");
  await page.getByLabel("Community / area").fill("Arabian Ranches");
  await page.getByLabel("Building / tower").fill("Villa 12");
  await page.getByRole("checkbox", { name: "360 tour" }).check();
  await page.getByLabel(/Agreed price/).fill("1800");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Villa 12, Arabian Ranches" })).toBeVisible();
  await expect(page.getByText("AED 1,800")).toBeVisible();
  created = page.url().split("/").pop()!;
  const { data } = await c.db.from("projects").select("status, meta").eq("id", created).single();
  expect(data).toMatchObject({ status: "requested", meta: { services: ["photo", "tour"] } });
});

test("a member's WhatsApp number makes Send on WhatsApp work", async ({ page }) => {
  await page.goto(`/admin/projects/${created}`);
  await expect(page.getByText("No WhatsApp number on file.").first()).toBeVisible();
  await page.goto(`/admin/accounts/${c.account}`);
  await page.getByRole("button", { name: "Add WhatsApp" }).click();
  const form = page.getByRole("form", { name: /WhatsApp number for/ });
  await form.getByLabel(/WhatsApp number \(UAE/).fill("050 000 0006");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "WhatsApp number saved." }),
  ).toBeVisible();
  await page.goto(`/admin/projects/${created}`);
  await expect(page.getByRole("link", { name: "WhatsApp the client" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/971500000006\?text=/,
  );
});

test("photo upload makes a preview; removing a published file asks first", async ({
  page,
  browser,
}) => {
  test.skip(!hasR2, "R2 not in .env.local");
  test.setTimeout(90_000);
  await page.goto(`/admin/projects/${created}`);
  const d = page.getByTestId("deliveries");
  await d.getByRole("button", { name: "Start Delivery 1" }).click();
  await d
    .getByLabel(/Upload files/)
    .setInputFiles([{ name: "living.png", mimeType: "image/png", buffer: PNG }]);
  await expect(d.getByText(/living\.png · .* · Done/)).toBeVisible({ timeout: 30_000 });
  await d.getByRole("button", { name: "Publish Delivery 1" }).click();
  await expect(d.getByRole("status").filter({ hasText: "Delivery 1 published" })).toBeVisible();

  const files = (
    (await adminRpc("portal_admin_project", { p_id: created })).data as {
      files: { r2_key: string | null; thumb_key: string | null }[];
    }
  ).files;
  const f = files.find((x) => x.r2_key)!;
  r2Keys.push(f.r2_key!, `${f.r2_key}.thumb.webp`);
  expect(f.thumb_key).toBe(`${f.r2_key}.thumb.webp`);

  // The client sees the photo as a tile.
  const cl = await browser.newContext({ storageState: undefined });
  const p = await cl.newPage();
  await signInUI(p, c.email);
  const { data: proj } = await c.db.from("projects").select("ref").eq("id", created).single();
  await p.goto(`/portal/shoots/${proj!.ref}`);
  const tile = p
    .getByRole("list", { name: "Photos" })
    .getByRole("img", { name: "living.png", exact: true });
  await expect(tile).toBeVisible();
  const src = (await tile.getAttribute("src"))!;
  expect(src).toContain(".thumb.webp");
  const res = await p.request.get(src);
  expect(res.status(), "the signed preview link loads").toBe(200);
  expect(res.headers()["content-type"]).toContain("image/webp");
  await expect
    .poll(() => tile.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
    .toBe(true);
  await cl.close();

  // Removing it after publishing needs a confirmation.
  await page.reload();
  await page.getByTestId("deliveries").getByRole("button", { name: "Remove" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove “living.png”?" });
  await expect(dialog).toContainText("already published");
  await dialog.getByRole("button", { name: "Remove it" }).click();
  await expect(page.getByTestId("deliveries")).not.toContainText("living.png");
});

test("clicking a card on the board opens the project", async ({ page }) => {
  await page.goto(`/admin/projects?q=${encodeURIComponent(NAME)}`);
  await page
    .getByTestId("board")
    .getByRole("link", { name: /Villa 12, Arabian Ranches/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/admin/projects/${created}$`));
  await expect(page.getByRole("heading", { name: "Villa 12, Arabian Ranches" })).toBeVisible();
});
