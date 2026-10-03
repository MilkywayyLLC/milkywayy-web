import { expect, test } from "@playwright/test";
import { OWNER } from "./helpers/admin";
import { hasAdminAccounts } from "./helpers/env";
import {
  cleanup,
  clientAccount,
  hasPortalAdmin,
  newProject,
  newRun,
  setProfilePhone,
} from "./helpers/portal";

/** Admin → Projects for Phase 11, as the e2e Owner: batches and avatar videos on their own boards. */
test.skip(
  !hasAdminAccounts || !hasPortalAdmin,
  "needs the e2e admin accounts and PORTAL_ADMIN_SECRET",
);
test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER });

const RUN = newRun();
let batch: { id: string; ref: string };
let video: { id: string; ref: string };
test.beforeAll(async () => {
  const c = await clientAccount(RUN, "a", `E2E Edits ${RUN.slice(-5).toUpperCase()}`);
  await setProfilePhone(c.email, "+971500000004");
  batch = await newProject(c.db, c.account, "edit", "Palm reels", { p_quantity: 4 });
  await c.db.rpc("add_project_file_in", {
    p_project: batch.id,
    p_source: "link",
    p_label: "Raw footage",
    p_url: "https://example.com/raw",
  });
  video = await newProject(c.db, c.account, "avatar", "Presenter intro");
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("Editing board: a new batch waits under Submitted with its files", async ({ page }) => {
  await page.goto(`/admin/projects?type=edit&q=${batch.ref}`);
  await expect(page.getByRole("link", { name: "Editing" })).toHaveAttribute("aria-current", "page");
  const col = page.getByTestId("board").getByRole("region", { name: "Submitted" });
  await expect(col).toContainText(batch.ref);
  await expect(col).toContainText("Short-form · 4 items · 1 file in");
  await col.getByRole("link", { name: new RegExp(batch.ref) }).click();
  await expect(page.getByTestId("files-in")).toContainText("Raw footage");
  await expect(page.getByTestId("files-in").getByRole("button", { name: "Open" })).toBeVisible();
});

test("On hold needs a reason; email ticked; WhatsApp to the person who submitted it", async ({
  page,
}) => {
  await page.goto(`/admin/projects/${batch.id}`);
  const group = page.getByRole("group", { name: `Set status for ${batch.ref}` });
  await group.getByRole("button", { name: "On hold" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox", { name: "Email the client" })).toBeChecked();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Say what you’re waiting for");
  await dialog.getByLabel(/What you’re waiting for/).fill("The logo file");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Saved.");
  const href = decodeURIComponent(
    (await dialog.getByRole("link", { name: "Send on WhatsApp" }).getAttribute("href"))!,
  );
  expect(href).toMatch(/^https:\/\/wa\.me\/971500000004\?text=/);
  expect(href).toContain("on hold until we hear from you: The logo file");
  expect(href).toContain(`/portal/p/${batch.ref}`);
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await expect(page.getByText("Waiting on the client: The logo file")).toBeVisible();
  await expect(page.getByTestId("notifications")).toContainText("status_update");

  await group.getByRole("button", { name: "In editing" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("Saved.");
});

test("Avatar video: production refused until the script is approved; post the script", async ({
  page,
}) => {
  await page.goto(`/admin/projects/${video.id}`);
  const group = page.getByRole("group", { name: `Set status for ${video.ref}` });
  await group.getByRole("button", { name: "In production" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog").locator("p[role=alert]")).toContainText(
    "approves the script first",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  const s = page.getByTestId("scripts");
  await s.getByLabel(/Version 1/).fill("Hi, I'm Adam from Milkywayy…");
  await s.getByLabel("Length note (optional)").fill("about 30 seconds");
  await s.getByRole("button", { name: "Post script" }).click();
  await expect(s.getByRole("status")).toContainText("Script v1 posted");
  await expect(s.getByRole("link", { name: "Send on WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/971500000004\?text=.*script/,
  );
  await page.reload();
  await expect(page.getByTestId("scripts")).toContainText("Waiting for the client");
  await expect(group.getByRole("button", { name: "Script ready" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto(`/admin/projects?type=avatar&q=${video.ref}`);
  await expect(
    page.getByTestId("board").getByRole("region", { name: "Script ready" }),
  ).toContainText("script with client");
});

test("on a phone: Avatars list with one-tap status, nothing sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/admin/projects?type=avatar&q=${video.ref}`);
  const list = page.getByTestId("project-list");
  await expect(list).toContainText(video.ref);
  await expect(
    list
      .getByRole("group", { name: `Set status for ${video.ref}` })
      .getByRole("button", { name: "On hold" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await page.goto(`/admin/projects/${video.id}`);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
});
