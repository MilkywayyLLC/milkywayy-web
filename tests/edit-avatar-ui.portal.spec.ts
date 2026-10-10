import { expect, test } from "@playwright/test";
import { env } from "./helpers/env";
import {
  adminRpc,
  cleanup,
  clientAccount,
  hasPortalAdmin,
  newRun,
  signInUI,
} from "./helpers/portal";

/** The client's side of Phase 11: new batch (links and real uploads), on hold, avatar script approval. */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
let c: Awaited<ReturnType<typeof clientAccount>>;
const r2Keys: string[] = [];
const hasR2 = !!(
  env.R2_ACCOUNT_ID &&
  env.R2_ACCESS_KEY_ID &&
  env.R2_SECRET_ACCESS_KEY &&
  env.R2_BUCKET
);
const ok = async (p: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
};
const projectByTitle = async (title: string) =>
  (await ok(c.db.from("projects").select("id, ref, status").eq("title", title).single())) as {
    id: string;
    ref: string;
    status: string;
  };

test.beforeAll(async () => {
  c = await clientAccount(RUN, "a", "Studio Edits");
});
test.afterAll(async () => {
  // Test uploads leave the dev bucket too.
  if (r2Keys.length && hasR2) {
    for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"])
      process.env[k] = env[k];
    const { deleteObject } = await import("../lib/r2");
    for (const k of r2Keys) await deleteObject(k).catch(() => undefined);
  }
  await cleanup(RUN);
});

test("new batch with links: received, then the batch page shows the brief and the files", async ({
  page,
}) => {
  await signInUI(page, c.email);
  await page.goto("/portal/editing");
  // "Edit my files" opens a modal on the page (owner, 10 Oct 2026).
  await page.getByRole("button", { name: "Edit my files" }).click();
  const m = page.getByTestId("edit-modal");
  await m
    .getByRole("group", { name: "Type of edit" })
    .getByRole("button", { name: "Short form (vertical reels)" })
    .click();
  await m.getByLabel("Title", { exact: true }).fill("Marina reels");
  await m.getByLabel("Quantity").fill("6");
  await m.getByLabel("Notes").fill("Fast cuts, trending audio");
  await m.getByRole("button", { name: "Send files" }).click();
  // Nothing sent: the banner, and the raw-files field's own message.
  await expect(m.getByText("Please fix the highlighted fields")).toBeVisible();
  await expect(m.getByText("Paste a link to the raw files")).toBeVisible();
  await m.getByLabel("Link 1").fill("https://example.com/raw-footage");
  await m.getByRole("button", { name: "Send files" }).click();
  await expect(m.getByText("Files received")).toBeVisible();
  await m.getByRole("link", { name: "Open it" }).click();
  await expect(page.getByRole("heading", { name: "Marina reels" })).toBeVisible();
  await expect(page.getByTestId("files-in")).toContainText("https://example.com/raw-footage");
  await expect(page.getByText("Fast cuts, trending audio")).toBeVisible();
  await expect(page.getByTestId("activity")).toContainText("Submitted");
});

test("on hold: the client sees why and adds the missing file", async ({ page }) => {
  const p = await projectByTitle("Marina reels");
  await ok(
    adminRpc("portal_admin_set_status", {
      p_id: p.id,
      p_status: "on_hold",
      p_note: "The music licence for reel 2",
    }),
  );
  await signInUI(page, c.email);
  await page.goto("/portal/editing");
  await expect(page.getByTestId("projects")).toContainText("On hold: waiting on you");
  await page.goto(`/portal/p/${p.ref}`);
  await expect(page.getByTestId("on-hold")).toContainText("The music licence for reel 2");
  await page.getByTestId("on-hold").getByRole("button", { name: "Add the file" }).click();
  const sheet = page.getByRole("dialog", { name: "Add files" });
  await sheet.getByLabel("Label").fill("Music licence");
  await sheet.getByLabel("Link").fill("https://example.com/licence.pdf");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet.getByRole("status")).toContainText("Added");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("files-in")).toContainText("Music licence");
  await page.goto("/portal");
  await expect(page.getByTestId("attention")).toContainText("On hold: waiting on you");
});

test("uploads go straight to storage (single and multipart) and download again", async ({
  page,
}) => {
  test.skip(!hasR2, "R2 not in .env.local");
  test.setTimeout(120_000);
  await signInUI(page, c.email);
  await page.goto("/portal/editing?new=edit");
  const m = page.getByTestId("edit-modal");
  await m
    .getByRole("group", { name: "Type of edit" })
    .getByRole("button", { name: "HDR photos" })
    .click();
  await m.getByLabel("Title", { exact: true }).fill("Upload test");
  await m
    .getByRole("group", { name: "How to send files" })
    .getByRole("button", { name: "Upload" })
    .click();
  const big = Buffer.alloc(17 * 1024 * 1024, 7); // > 16 MB: two parts
  await page.getByLabel("Choose files").setInputFiles([
    { name: "small.txt", mimeType: "text/plain", buffer: Buffer.from("hello raw file") },
    { name: "big.bin", mimeType: "application/octet-stream", buffer: big },
  ]);
  await m.getByRole("button", { name: "Send files" }).click();
  await expect(m.getByText("Files received")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("uploads")).toContainText("small.txt");
  await expect(page.getByText("Some files didn’t upload")).toHaveCount(0);
  await expect(page.getByTestId("uploads").getByText(/· Done/)).toHaveCount(2);

  const p = await projectByTitle("Upload test");
  const files = (await ok(
    c.db.from("project_files").select("id, label, r2_key, bytes").eq("project_id", p.id),
  )) as { id: string; label: string; r2_key: string; bytes: number }[];
  r2Keys.push(...files.map((f) => f.r2_key));
  expect(files.map((f) => [f.label, f.bytes]).sort()).toEqual([
    ["big.bin", big.length],
    ["small.txt", 14],
  ]);
  for (const f of files) expect(f.r2_key).toMatch(new RegExp(`^projects/${p.ref}/in/`));

  await page.getByRole("link", { name: "Open the batch" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download small.txt" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("small.txt");

  // Completed: raw uploads show when they will be deleted, in the future tense.
  await ok(adminRpc("portal_admin_set_status", { p_id: p.id, p_status: "completed" }));
  await page.reload();
  await expect(page.getByTestId("files-in")).toContainText(/deletes on \d{1,2} \w{3} \d{4}/);
  await expect(page.getByTestId("files-in")).not.toContainText("deleted ");
});

test("avatar video: brief, then approve the script; production starts", async ({ page }) => {
  await signInUI(page, c.email);
  await page.goto("/portal/avatars");
  await page.getByRole("button", { name: "AI avatar video" }).click();
  const m = page.getByTestId("avatar-modal");
  await m
    .getByRole("group", { name: "Format" })
    .getByRole("button", { name: "Short form (Instagram reels, 9:16)" })
    .click();
  await m.getByLabel("Title", { exact: true }).fill("Launch presenter");
  await m.getByRole("button", { name: "I’ll send it" }).click();
  await m.getByLabel("Brief").fill("Script: Welcome to JVC Heights…");
  await m.getByRole("button", { name: "Send brief" }).click();
  await expect(m.getByText("Brief received", { exact: true })).toBeVisible();

  const p = await projectByTitle("Launch presenter");
  // Its own "brief received" email, not the batch one (owner QA, 3 Oct 2026).
  const detail = (await ok(adminRpc("portal_admin_project", { p_id: p.id }))) as {
    notifications: { template: string }[];
  };
  expect(detail.notifications.map((n) => n.template)).toContain("avatar_received");
  expect(detail.notifications.map((n) => n.template)).not.toContain("batch_received");
  await ok(
    adminRpc("portal_admin_post_script", {
      p_id: p.id,
      p_body: "Welcome to JVC Heights. v1",
      p_length: "about 25 seconds",
    }),
  );
  await page.goto("/portal");
  await expect(page.getByTestId("attention")).toContainText("Approve the script");
  await page
    .getByTestId("attention")
    .getByRole("link", { name: /Approve the script/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/portal/avatars/${p.ref}$`));
  const script = page.getByTestId("script");
  await expect(script).toContainText("Welcome to JVC Heights. v1");
  await script.getByRole("button", { name: "Ask for changes" }).click();
  await script.getByLabel("What should change?").fill("Say the phone number at the end");
  await script.getByRole("button", { name: "Send changes" }).click();
  await expect(script.getByRole("status")).toContainText("Changes sent");
  // "We'll post the next version here" once, not twice.
  await expect(script.getByText("We’ll post the next version here")).toHaveCount(1);

  await ok(
    adminRpc("portal_admin_post_script", {
      p_id: p.id,
      p_body: "Welcome to JVC Heights. Call us. v2",
    }),
  );
  await page.reload();
  await expect(page.getByTestId("script")).toContainText("v2");
  await page.getByTestId("script").getByRole("button", { name: "Approve script" }).click();
  // A confirmation first, like approving a delivery (owner QA, 3 Oct 2026).
  const confirm = page.getByRole("dialog", { name: "Approve script v2?" });
  await expect(confirm).toContainText("Production starts with this script");
  await confirm.getByRole("button", { name: "Approve and start production" }).click();
  await expect(page.getByTestId("script")).toContainText("Approved");
  await expect(page.getByText("In production").first()).toBeVisible();
  await expect(page.getByTestId("activity")).toContainText("Script v2 approved");
});

test("completed: search past batches and ask about one", async ({ page }) => {
  const p = await projectByTitle("Marina reels");
  await ok(
    adminRpc("portal_admin_add_file", {
      p_id: p.id,
      p_delivery_no: 1,
      p_delivery_label: "Delivery 1",
      p_kind: "zip",
      p_source: "link",
      p_url: "https://example.com/all.zip",
      p_r2_key: null,
      p_label: "All reels (zip)",
      p_bytes: null,
      p_content_type: null,
    }),
  );
  await ok(adminRpc("portal_admin_publish_delivery", { p_id: p.id, p_delivery_no: 1 }));
  await ok(c.db.rpc("approve_project", { p_project: p.id }));

  await signInUI(page, c.email);
  await page.goto("/portal/editing?tab=completed");
  await expect(page.getByTestId("completed")).toContainText("Marina reels");
  await page.getByLabel("Search past projects").fill("nothing-like-this");
  await page.getByLabel("Search past projects").press("Enter");
  await expect(page.getByTestId("completed")).toContainText("Nothing matches");
  await page.getByLabel("Search past projects").fill("marina");
  await page.getByLabel("Search past projects").press("Enter");
  await expect(page.getByTestId("completed")).toContainText("Marina reels");
  await expect(page.getByRole("button", { name: "Download All reels (zip)" })).toBeVisible();
  await page.getByRole("button", { name: "Ask about this project" }).click();
  await page.getByLabel("Your request").fill("Need 3 square versions");
  await page.getByRole("dialog").getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("Sent");
  const msgs = (await ok(c.db.from("project_messages").select("body").eq("project_id", p.id))) as {
    body: string;
  }[];
  expect(msgs.map((m) => m.body)).toContain("Need 3 square versions");
});
