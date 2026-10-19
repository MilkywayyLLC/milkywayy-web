import { expect, test, type Page } from "@playwright/test";
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
 * AI avatar characters (17 Oct 2026), end to end: the client briefs a character, the admin sends
 * 3 variations, the client asks for changes on one, round 2 goes out, the client picks, the admin
 * approves with a name (billing item logged), and an avatar video then names it as presenter.
 */
test.skip(
  !hasAdminAccounts || !hasPortalAdmin,
  "needs the e2e admin accounts and PORTAL_ADMIN_SECRET",
);
test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER });

const RUN = newRun();
const ACCOUNT = `E2E Characters ${RUN.slice(-6).toUpperCase()}`;
let c: Awaited<ReturnType<typeof clientAccount>>;
let client: Page;

// A tiny valid PNG (1×1), named per variation.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const images = (round: number) =>
  [1, 2, 3].map((n) => ({ name: `r${round}-v${n}.png`, mimeType: "image/png", buffer: PNG }));

test.beforeAll(async ({ browser }) => {
  c = await clientAccount(RUN, "c", ACCOUNT);
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  client = await ctx.newPage();
  await signInUI(client, c.email);
});
test.afterAll(async () => {
  await client?.context().close();
  await cleanup(RUN);
});

async function sendRound(page: Page, round: number) {
  await page.goto(`/admin/accounts/${c.account}/characters`);
  const card = page.getByTestId("admin-character").first();
  await card.locator('input[type=file][accept="image/*"]').setInputFiles(images(round));
  await expect(card.getByRole("button", { name: `Send round ${round} to the client` })).toBeEnabled(
    {
      timeout: 30_000,
    },
  );
  await card.getByRole("button", { name: `Send round ${round} to the client` }).click();
  await expect(card.getByRole("status")).toContainText("Sent to the client");
}

test("no approved character: New AI avatar video starts the character brief", async () => {
  await client.goto("/portal/avatars");
  await expect(client.getByRole("button", { name: "Create your AI avatar" })).toBeVisible();
  await client.getByRole("button", { name: "New AI avatar video" }).click();
  const m = client.getByTestId("character-modal");
  await expect(m).toContainText("Create it first");
  await m.getByRole("button", { name: "Send brief" }).click();
  await expect(m.getByRole("alert")).toContainText("Please fix the highlighted fields");
  await m.getByLabel("Your brand and what it does").fill("E2E Realty, villas in Dubai Hills");
  await m
    .getByRole("group", { name: "What it’s for" })
    .getByRole("button", { name: "Ads" })
    .click();
  await m.getByLabel("Look and personality").fill("Early 30s, sharp suit, warm and confident");
  await m.getByLabel("Setting").fill("Dubai outdoor");
  await m.getByRole("button", { name: "Send brief" }).click();
  await expect(m.getByRole("status")).toContainText("Brief received");
  await m.getByRole("button", { name: "Done" }).click();
  await expect(client.getByTestId("characters")).toContainText("Brief received");
});

test("round 1 goes out; the client asks for changes on variation 2", async ({ page }) => {
  await sendRound(page, 1);
  await client.reload();
  await expect(client.getByTestId("characters")).toContainText("Variations ready");
  await client.getByTestId("characters").getByRole("button").first().click();
  const v = client.getByTestId("character-view");
  await expect(v.getByTestId("variations").locator("figure")).toHaveCount(3);
  await v.getByRole("button", { name: "Request changes" }).click();
  await v.getByRole("group", { name: "Which one?" }).getByRole("button", { name: "2" }).click();
  await v.getByLabel("What should change?").fill("Warmer smile, lighter suit");
  await v.getByRole("button", { name: "Send changes" }).click();
  await expect(v).toContainText("Revision requested");
  // The admin sees the note, pointing at the variation.
  await page.goto(`/admin/accounts/${c.account}/characters`);
  await page.getByText(/^Log/).click();
  await expect(page.getByTestId("admin-character")).toContainText(
    "Variation 2 of round 1): “Warmer smile, lighter suit”",
  );
});

test("round 2: the client picks; the admin approves with a name and a billing item", async ({
  page,
}) => {
  await sendRound(page, 2);
  await client.reload();
  await client.getByTestId("characters").getByRole("button").first().click();
  const v = client.getByTestId("character-view");
  await v.getByRole("button", { name: "Pick this one" }).first().click();
  await expect(v).toContainText("Picked");

  await page.goto(`/admin/accounts/${c.account}/characters`);
  const card = page.getByTestId("admin-character").first();
  await expect(card.getByLabel("Image")).not.toHaveValue("");
  await card.getByLabel("Character name").fill("Layla");
  await card.getByLabel("Price (empty: the client’s rate)").fill("500");
  await card.getByRole("button", { name: "Mark approved" }).click();
  await expect(card.getByRole("status")).toContainText("Approved");
  const { data } = await adminRpc("portal_admin_ai_characters", { p_account: c.account });
  const [ch] = data as { status: string; line_item_id: string | null; events: unknown[] }[];
  expect(ch.status).toBe("approved");
  expect(ch.line_item_id).toBeTruthy();
  expect(ch.events.length).toBe(6); // brief, sent, changes, sent, picked, approved
});

test("the approved character presents a new avatar video, and the admin sees it", async ({
  page,
}) => {
  await client.goto("/portal/avatars");
  await expect(client.getByTestId("characters")).toContainText("Layla");
  await client.getByTestId("characters").getByRole("button", { name: /Layla/ }).click();
  await expect(
    client.getByTestId("character-view").getByRole("button", { name: "Download image" }),
  ).toBeVisible();
  await client.keyboard.press("Escape");
  await client.getByRole("button", { name: "New AI avatar video" }).click();
  const m = client.getByTestId("avatar-modal");
  const pick = m
    .getByRole("group", { name: "Your AI avatar" })
    .getByRole("button", { name: "Layla" });
  await expect(pick).toHaveAttribute("aria-pressed", "true");
  await m.getByRole("button", { name: "Send brief" }).click();
  await expect(m.getByRole("status")).toContainText("Brief received");
  const ref = (await m.getByRole("status").locator(".pt-eb").textContent())!.split(" · ")[0];

  const { data } = await c.db.from("projects").select("id").eq("ref", ref).single();
  await page.goto(`/admin/projects/${data!.id}`);
  await expect(page.getByTestId("presenters")).toHaveText("Layla");
});
