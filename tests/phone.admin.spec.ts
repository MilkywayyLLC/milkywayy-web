import { expect, test } from "@playwright/test";
import { OWNER, ownerDb, RUN } from "./helpers/admin";
import { hasAdminAccounts } from "./helpers/env";

/** The admin on a phone (Pixel 7): menu, editing with the sticky save bar, no sideways scroll. */
test.skip(!hasAdminAccounts, "E2E_* accounts missing from .env.local");
test.use({ storageState: OWNER });

test("menu, add and delete an FAQ, and no page scrolls sideways @phone", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation").getByRole("link", { name: "FAQs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "FAQs" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  await page.getByRole("link", { name: "Add FAQ" }).click();
  await page.getByLabel("Question").fill(`${RUN} phone question?`);
  await page.getByLabel("Answer").fill("Typed on a phone.");
  const save = page.getByRole("button", { name: "Save draft" });
  // The save bar stays in reach at the bottom of the screen.
  const box = (await save.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await save.click();
  await expect(page).toHaveURL(/created=1$/);
  await page.getByRole("button", { name: "Delete FAQ" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/admin\/faqs\?deleted=1$/);

  for (const path of [
    "/admin",
    "/admin/portfolio",
    "/admin/portfolio/item-7",
    "/admin/pricing",
    "/admin/settings",
    "/admin/leads",
    "/admin/case-studies/sample-brokerage-monthly",
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test.afterAll(async () => {
  const db = await ownerDb();
  await db.from("faqs").delete().like("question", `${RUN}%`);
});
