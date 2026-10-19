import { expect, test } from "@playwright/test";
import {
  adminRpc,
  cleanup,
  clientWithProject,
  hasPortalAdmin,
  newRun,
  signInUI,
} from "./helpers/portal";

/** The client's side of a shoot (Phase 10): list, detail, delivery, message, revision, approve. */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
let c: Awaited<ReturnType<typeof clientWithProject>>;
const ok = async (p: PromiseLike<{ error: { message: string } | null }>) => {
  const { error } = await p;
  if (error) throw new Error(error.message);
};
const addLink = (no: number, label: string, name: string) =>
  ok(
    adminRpc("portal_admin_add_file", {
      p_id: c.id,
      p_delivery_no: no,
      p_delivery_label: label,
      p_kind: "photos",
      p_source: "link",
      p_url: "https://example.com/files",
      p_r2_key: null,
      p_label: name,
      p_bytes: null,
      p_content_type: null,
    }),
  );

test.beforeAll(async () => {
  c = await clientWithProject(RUN, "a");
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("a website booking shows as Requested, with what was booked", async ({ page }) => {
  await signInUI(page, c.email);
  await page.goto("/portal/shoots");
  const card = page.getByTestId("shoots").getByRole("link", { name: new RegExp(c.ref) });
  await expect(card).toContainText("Requested");
  await expect(card).toContainText("Dubai Marina");
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/portal/shoots/${c.ref}$`));
  await expect(page.getByTestId("activity")).toContainText("Requested");
});

test("delivered: the client opens the files, writes, asks for a revision, then approves", async ({
  page,
}) => {
  await ok(
    adminRpc("portal_admin_set_status", {
      p_id: c.id,
      p_status: "confirmed",
      p_date: "2026-11-03",
      p_slot: "Morning",
    }),
  );
  await addLink(1, "Delivery 1", "Edited photos");
  await addLink(2, "Delivery 2", "Draft not published");
  await ok(adminRpc("portal_admin_publish_delivery", { p_id: c.id, p_delivery_no: 1 }));

  await signInUI(page, c.email);
  // The link in emails and WhatsApps lands on the project.
  await page.goto(`/portal/p/${c.ref}`);
  await expect(page).toHaveURL(new RegExp(`/portal/shoots/${c.ref}$`));
  await expect(page.getByTestId("delivery")).toHaveCount(1);
  await expect(page.getByTestId("delivery")).toContainText("Edited photos");
  await expect(page.getByText("Draft not published")).toHaveCount(0);
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open Edited photos" }).click();
  expect((await popup).url()).toContain("example.com/files");

  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Can we get the balcony at sunset next time?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("messages")).toContainText("balcony at sunset");

  await page.getByRole("button", { name: "Request revision (1 of 2)" }).click();
  await page.getByLabel("What should change?").fill("Photo 4: straighten the verticals.");
  await page.getByRole("button", { name: "Send revision request" }).click();
  await expect(page.getByText("Revision requested", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);

  await ok(adminRpc("portal_admin_revision", { p_id: c.id, p_state: "delivered" }));
  await page.reload();
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await page.goto("/portal/shoots");
  await expect(page.getByTestId("completed")).toBeVisible();
});
