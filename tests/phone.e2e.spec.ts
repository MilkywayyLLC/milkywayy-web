import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerDb } from "./helpers/admin";
import { env, hasAdminAccounts } from "./helpers/env";
import { markTestLeads } from "./helpers/leads";

/** The country-code picker on every form with a phone field (owner, 2 Oct 2026). */

test("defaults to +971, top choices first, full list searchable, keyboard works @mobile", async ({
  page,
}) => {
  await page.goto("/contact");
  const form = page.getByRole("form", { name: "Send a request" });
  const picker = form.getByRole("button", { name: /^Country code: United Arab Emirates \+971/ });
  await expect(picker).toBeVisible();
  await picker.click();
  const dialog = form.getByRole("dialog", { name: "Choose a country code" });
  await expect(dialog.getByRole("searchbox")).toBeFocused();
  const names = dialog.getByRole("option");
  await expect(names.nth(0)).toContainText("United Arab Emirates");
  expect((await names.locator(".cc-name").allTextContents()).slice(0, 7)).toEqual([
    "United Arab Emirates",
    "Saudi Arabia",
    "United Kingdom",
    "United States",
    "Canada",
    "Australia",
    "India",
  ]);
  await expect.poll(() => names.count()).toBeGreaterThan(230); // the full list loads on open

  // Search by name, then by code; Enter picks the highlighted one.
  await dialog.getByRole("searchbox").fill("germ");
  await expect(names).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(form.getByRole("button", { name: /^Country code: Germany \+49/ })).toBeFocused();
  await form.getByRole("button", { name: /^Country code: Germany/ }).click();
  await dialog.getByRole("searchbox").fill("+353");
  await expect(names.first()).toContainText("Ireland");
  await page.keyboard.press("Escape");
  await expect(form.getByRole("button", { name: /^Country code: Germany/ })).toBeFocused();
  await expect(dialog).toBeHidden();
});

test.describe("saved numbers", () => {
  test.skip(!hasAdminAccounts || !env.LEAD_SECRET, "needs LEAD_SECRET and the e2e accounts");
  let db: SupabaseClient;
  test.beforeAll(async () => {
    test.setTimeout(150_000);
    db = await ownerDb();
  });
  test.afterAll(async () => {
    await db.from("leads").delete().like("name", "E2E Phone %");
  });

  for (const [path, formName, country, typed, stored] of [
    ["/production", "Send a request", "United Kingdom", "07700 900123", "+447700900123"],
    ["/ai-avatars", "Book a demo", "Saudi Arabia", "050 123 4567", "+966501234567"],
    ["/contact", "Send a request", "India", "98765 43210", "+919876543210"],
  ] as const) {
    test(`${formName} on ${path}: ${country} ${typed} → ${stored}`, async ({ page }) => {
      await markTestLeads(page);
      await page.goto(path);
      const form = page.getByRole("form", { name: formName });
      await form.getByLabel("Name").fill(`E2E Phone ${country}`);
      await form.getByRole("button", { name: /^Country code:/ }).click();
      await form.getByRole("searchbox").fill(country);
      await form
        .getByRole("option", { name: new RegExp(country) })
        .first()
        .click();
      await form.getByRole("textbox", { name: /^Phone/ }).fill(typed);
      // Reply by email so no WhatsApp tab opens; the number is still saved.
      await form.getByRole("radio", { name: "Email", exact: true }).check();
      await form.getByRole("textbox", { name: /^Email/ }).fill("e2e-phone@example.com");
      await page.waitForTimeout(2700);
      await form.getByRole("button", { name: /Send request|Book my demo/ }).click();
      const done = page.getByRole("status").filter({ hasText: /Ref #MW-\d+/ });
      await expect(done).toBeVisible();
      const ref = (await done.textContent())!.match(/MW-\d+/)![0];
      const { data } = await db.from("leads").select("phone, data").eq("ref", ref).single();
      expect(data!.phone).toBe(stored);
      expect(data!.phone).not.toMatch(/^\+971/);
      expect(data!.data.phone_country).toBe(
        { "United Kingdom": "GB", "Saudi Arabia": "SA", India: "IN" }[country],
      );
    });
  }

  test("a wrong number for the chosen country is caught before sending", async ({ page }) => {
    await page.goto("/production");
    const form = page.getByRole("form", { name: "Send a request" });
    await form.getByLabel("Name").fill("E2E Phone short");
    await form.getByRole("textbox", { name: /^Phone/ }).fill("123");
    await form.getByRole("button", { name: "Send and open WhatsApp" }).click();
    await expect(form.getByText(/Check the number and the country code/)).toBeVisible();
  });
});
