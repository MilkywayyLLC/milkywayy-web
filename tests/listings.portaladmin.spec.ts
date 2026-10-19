import { expect, test } from "@playwright/test";
import { OWNER } from "./helpers/admin";
import { env, hasAdminAccounts } from "./helpers/env";
import {
  adminRpc,
  cleanup,
  clientAccount,
  deliveredShoot,
  hasPortalAdmin,
  newRun,
  PHONE_UA,
} from "./helpers/portal";

/** Admin → Listings (Phase 13 §7.4), as the e2e Owner: reports, turning a page off and on. */
test.skip(
  !hasAdminAccounts || !hasPortalAdmin,
  "needs the e2e admin accounts and PORTAL_ADMIN_SECRET",
);
test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER });

const RUN = newRun();
const NAME = `E2E Share ${RUN.slice(-5).toUpperCase()}`;
const TITLE = `Marina loft ${RUN.slice(-4)}`;
const hasR2 = !!(
  env.R2_ACCOUNT_ID &&
  env.R2_ACCESS_KEY_ID &&
  env.R2_SECRET_ACCESS_KEY &&
  env.R2_BUCKET
);
let slug = "";
const ok = async <T = unknown>(
  p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};

test.beforeAll(async () => {
  const c = await clientAccount(RUN, "owner", NAME);
  const shoot = await deliveredShoot(c.account, "Loft, Marina Gate", 2);
  const [contact] = await ok<{ id: string }[]>(
    c.db
      .from("contacts")
      .insert({ account_id: c.account, name: "Omar Said", whatsapp: "+971501112233" })
      .select("id"),
  );
  const r = await ok<{ slug: string }>(
    c.db.rpc("save_listing", {
      p_id: null,
      p_project: shoot.id,
      p: {
        title: TITLE,
        purpose: "rent",
        price: "185000",
        contact_ids: [contact.id],
        photo_ids: shoot.photos,
        highlights: [],
        show_brand: true,
      },
    }),
  );
  slug = r.slug;
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("a visitor reports a page; it shows under Reported; turned off with a reason, then back on", async ({
  page,
  browser,
}) => {
  const visitor = await browser.newContext({ userAgent: PHONE_UA, storageState: undefined });
  const pub = await visitor.newPage();
  await pub.goto(`/l/${slug}`);
  await expect(pub.getByText("AED 185,000 / year")).toBeVisible();
  await pub.getByText("Report this page").click();
  await pub.getByLabel("What’s wrong with it?").fill("This flat is already rented.");
  await pub.getByRole("button", { name: "Send report" }).click();
  await expect(pub.getByRole("status")).toContainText("Thanks");

  await page.goto("/admin/listings?filter=reported");
  const row = page.getByTestId("shares").getByRole("group", { name: TITLE, exact: true });
  await expect(row).toContainText("1 report");
  await expect(row).toContainText("This flat is already rented.");
  await expect(row).toContainText(NAME);
  await row.getByRole("button", { name: `Turn off ${TITLE}` }).click();
  await row.getByLabel(`Reason for turning off ${TITLE}`).fill("Already rented (reported)");
  await row.getByRole("button", { name: "Turn off", exact: true }).click();
  // Turning it off clears its reports, so it leaves the Reported list.
  await expect(row).toHaveCount(0);

  await pub.reload();
  await expect(pub.getByRole("heading", { level: 1 })).toHaveText("This listing isn’t available");

  await page.goto("/admin/listings?filter=disabled");
  const off = page.getByTestId("shares").getByRole("group", { name: TITLE, exact: true });
  await expect(off).toContainText("Reason: Already rented (reported)");
  await off.getByRole("button", { name: "Turn back on" }).click();
  // Back on: it leaves the "Turned off" list.
  await expect(off).toHaveCount(0);
  await pub.reload();
  await expect(pub.getByRole("heading", { level: 1 })).toHaveText(TITLE);
  // Reports were cleared when it was turned off.
  await page.goto("/admin/listings?filter=reported");
  await expect(
    page.getByTestId("shares").getByRole("group", { name: TITLE, exact: true }),
  ).toHaveCount(0);
  await visitor.close();
});

test("a photo uploaded in the admin gets its web versions, and the share page shows it", async ({
  page,
}) => {
  test.skip(!hasR2, "R2 not in .env.local");
  test.setTimeout(120_000);
  const c = await clientAccount(RUN, "media", `${NAME} M`);
  const p = await ok<{ id: string; ref: string }>(
    adminRpc("portal_admin_create_project", {
      p_account: c.account,
      p_type: "shoot",
      p_title: "Media test",
      p_area: "JLT",
      p_building: "Lake Terrace",
    }),
  );
  await page.goto(`/admin/projects/${p.id}`);
  await page.getByRole("button", { name: /Start Delivery 1/ }).click();
  // A real (tiny) JPEG made by the browser itself.
  const jpeg = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 1000;
    const x = c.getContext("2d")!;
    x.fillStyle = "#7a5c2e";
    x.fillRect(0, 0, 1600, 1000);
    const b = await new Promise<Blob>((r) => c.toBlob((v) => r(v!), "image/jpeg", 0.8));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  await page
    .getByLabel("Upload files (up to 5 GB each)")
    .setInputFiles({ name: "IMG_9.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg) });
  await expect(page.getByText(/IMG_9\.jpg .* Done/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Publish Delivery 1" }).click();
  await expect(page.getByText("Make web versions for share pages")).toHaveCount(0);
  // The client only sees published files: wait for the publish to land.
  const files = () =>
    ok<{ id: string; web_key: string; og_key: string }[]>(
      c.db.from("project_files").select("id, web_key, og_key").eq("project_id", p.id),
    );
  await expect.poll(async () => (await files()).length, { timeout: 15_000 }).toBe(1);
  const [file] = await files();
  expect(file.web_key).toBe(`projects/${p.id}/web/${file.id}.webp`);
  expect(file.og_key).toBe(`projects/${p.id}/web/${file.id}.og.jpg`);
});
