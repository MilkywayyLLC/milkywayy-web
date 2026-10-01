import { expect, test, type Page } from "@playwright/test";
import { EDITOR, html, onSite, OWNER, ownerDb } from "./helpers/admin";
import { env, hasAdminAccounts } from "./helpers/env";

/**
 * Prices and settings: nothing goes live without a confirmation listing every change old → new;
 * Cancel changes nothing; confirmed changes reach the site within seconds and are logged with
 * who, when, old → new. Every test puts the original value back.
 */
test.skip(!hasAdminAccounts, "E2E_* accounts missing from .env.local");
test.describe.configure({ mode: "serial" });

/* Safety net: whatever happens in a test, the live prices and settings end as they started. */
type Snap = {
  settings: { key: string; value: unknown }[];
  other: { key: string; value: unknown }[];
  prices: { type: string; size_index: number; service: string; price: number }[];
};
let snap: Snap;
test.beforeAll(async () => {
  test.setTimeout(150_000);
  const db = await ownerDb();
  const [settings, other, prices] = await Promise.all([
    db.from("site_settings").select("key, value"),
    db.from("pricing_other").select("key, value"),
    db.from("pricing_property").select("type, size_index, service, price"),
  ]);
  snap = { settings: settings.data!, other: other.data!, prices: prices.data! };
});
test.afterAll(async ({ baseURL }) => {
  test.setTimeout(150_000);
  const db = await ownerDb();
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  let restored = false;
  for (const [table, rows] of [
    ["site_settings", snap.settings],
    ["pricing_other", snap.other],
  ] as const) {
    const { data } = await db.from(table).select("key, value");
    for (const r of rows)
      if (!same(data?.find((d) => d.key === r.key)?.value, r.value)) {
        await db.from(table).update({ value: r.value }).eq("key", r.key);
        restored = true;
      }
  }
  const { data: now } = await db
    .from("pricing_property")
    .select("type, size_index, service, price");
  for (const r of snap.prices) {
    const cur = now?.find(
      (n) => n.type === r.type && n.size_index === r.size_index && n.service === r.service,
    );
    if (cur?.price !== r.price) {
      await db
        .from("pricing_property")
        .update({ price: r.price })
        .match({ type: r.type, size_index: r.size_index, service: r.service });
      restored = true;
    }
  }
  await db
    .from("drafts")
    .delete()
    .in("key", ["pricing_property", "pricing_other", "site", "avatar_hero"]);
  if (restored)
    await fetch(new URL("/api/revalidate", baseURL), {
      method: "POST",
      headers: { "x-revalidate-secret": env.REVALIDATE_SECRET },
    });
});

const text = (h: string) => h.replaceAll("<!-- -->", "");
const ONE_BED = "Apartment 1 Bed Photography";

async function setPrice(page: Page, value: string) {
  await page.goto("/admin/pricing");
  await page.getByRole("tab", { name: "Apartments" }).click();
  await page.getByLabel(ONE_BED).fill(value);
}

async function publishConfirmed(page: Page) {
  await page.getByRole("button", { name: "Publish…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Yes, change the prices|Publish/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
}

test.describe("Owner", () => {
  test.use({ storageState: OWNER });

  test("a price change asks for confirmation (old → new), Cancel changes nothing, confirm goes live and is logged", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await setPrice(page, "515");
    await expect(page.getByLabel(ONE_BED).locator("xpath=ancestor::td")).toHaveClass(/ad-changed/);

    await page.getByRole("button", { name: "Publish…" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirm price changes" });
    await expect(dialog).toBeVisible();
    const changes = dialog.getByTestId("changes");
    await expect(changes).toContainText("Apartment · 1 Bed · Photography");
    await expect(changes).toContainText("AED 500");
    await expect(changes).toContainText("AED 515");
    await expect(changes.locator(".ad-change")).toHaveCount(1);

    // Cancel: nothing is published.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    const db = await ownerDb();
    const still = await db
      .from("pricing_property")
      .select("price")
      .match({ type: "apartment", size_index: 1, service: "photo" })
      .single();
    expect(still.data!.price).toBe(500);

    // Confirm: live on the booking builder within seconds.
    await page.getByRole("button", { name: "Publish…" }).click();
    await dialog.getByRole("button", { name: "Yes, change the prices" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published 1 change" })).toBeVisible();
    await onSite(
      baseURL!,
      "/property-shoots",
      (h) => h.includes("AED 515"),
      "new price in the builder",
    );

    // Logged: who, when, old → new.
    const log = await db
      .from("change_log")
      .select("admin_email, at, summary, details")
      .eq("entity", "pricing")
      .order("at", { ascending: false })
      .limit(1)
      .single();
    expect(log.data!.admin_email).toBe("e2e-owner@example.com");
    expect(Date.now() - new Date(log.data!.at).getTime()).toBeLessThan(120_000);
    expect(log.data!.summary).toBe("Property shoot prices: published 1 change");
    expect(log.data!.details).toEqual([
      { label: "Apartment · 1 Bed · Photography", old: "AED 500", new: "AED 515" },
    ]);
    // (The admin's Price history lists real admins' changes; test accounts are left out of it.)
    await page.reload();
    await expect(page.getByRole("region", { name: "Price history" })).toBeVisible();

    // Put it back.
    await setPrice(page, "500");
    await publishConfirmed(page);
    await onSite(
      baseURL!,
      "/property-shoots",
      (h) => h.includes("AED 500") && !h.includes("AED 515"),
      "original price back",
    );
  });

  test("a price draft shows in Preview only; Discard throws it away", async ({ page, baseURL }) => {
    await setPrice(page, "530");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();

    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Preview" }).click();
    const tab = await popup;
    await tab.waitForURL((u) => u.pathname === "/property-shoots");
    await expect(tab.getByRole("status").filter({ hasText: "Preview" })).toBeVisible();
    expect(await tab.content()).toContain("AED 530");
    await tab.close();
    const live = await (
      await fetch(new URL("/property-shoots", baseURL), { cache: "no-store" })
    ).text();
    expect(live).not.toContain("AED 530");

    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft discarded" })).toBeVisible();
    await expect(page.getByLabel(ONE_BED)).toHaveValue("500");
  });

  test("other prices: confirm, live, restore", async ({ page, baseURL }) => {
    await page.goto("/admin/pricing/other");
    await page.getByLabel("Packages from (AED a month)").fill("4100");
    await page.getByRole("button", { name: "Publish…" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirm price changes" });
    await expect(dialog.getByTestId("changes")).toContainText("4000");
    await expect(dialog.getByTestId("changes")).toContainText("4100");
    await dialog.getByRole("button", { name: "Yes, change the prices" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
    await onSite(
      baseURL!,
      "/production",
      (h) => text(h).includes("AED 4,100"),
      "new package price",
    );

    await page.getByLabel("Packages from (AED a month)").fill("4000");
    await publishConfirmed(page);
    await onSite(
      baseURL!,
      "/production",
      (h) => text(h).includes("AED 4,000"),
      "original package price",
    );
  });

  test("site settings: publish the footer line, then restore it", async ({ page, baseURL }) => {
    await page.goto("/admin/settings");
    const field = page.getByLabel("Footer line");
    const original = await field.inputValue();
    const changed = `${original} (e2e)`;
    await field.fill(changed);
    await page.getByRole("button", { name: "Publish…" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("changes")).toContainText("Footer line");
    await dialog.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published 1 change" })).toBeVisible();
    await onSite(baseURL!, "/about", (h) => h.includes(html(changed)), "new footer line");

    await field.fill(original);
    await publishConfirmed(page);
    await onSite(baseURL!, "/about", (h) => !h.includes(html(changed)), "original footer line");
  });
});

test.describe("Editor", () => {
  test.use({ storageState: EDITOR });

  test("can publish the AI avatars hero (content), not settings", async ({ page, baseURL }) => {
    await page.goto("/admin/avatar-hero");
    const field = page.getByLabel("Caption highlight (end of the caption)");
    const original = await field.inputValue();
    await field.fill("for e2e buyers.");
    await publishConfirmed(page);
    await onSite(baseURL!, "/ai-avatars", (h) => h.includes("for e2e buyers."), "new caption");
    await field.fill(original);
    await publishConfirmed(page);
    await onSite(
      baseURL!,
      "/ai-avatars",
      (h) => !h.includes("for e2e buyers."),
      "original caption",
    );
  });
});
