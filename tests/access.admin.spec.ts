import { expect, test } from "@playwright/test";
import { dbAs, EDITOR, enterCode, signInWithPassword, STRANGER } from "./helpers/admin";
import { env, hasAdminAccounts } from "./helpers/env";
import { savedSecret } from "./helpers/totp";

/**
 * Who can reach what. Every admin page (and the upload and preview endpoints) is checked signed
 * out, as a signed-in non-admin, and as an Editor; the database is checked directly too, because
 * the UI is not the gate: row-level security is.
 */
test.skip(!hasAdminAccounts, "E2E_* accounts missing from .env.local");

const PAGES = [
  "/admin",
  "/admin/leads",
  "/admin/portfolio",
  "/admin/portfolio/new",
  "/admin/portfolio/item-1",
  "/admin/case-studies",
  "/admin/case-studies/sample-brokerage-monthly",
  "/admin/before-after",
  "/admin/before-after/sky",
  "/admin/avatars",
  "/admin/avatar-hero",
  "/admin/reviews",
  "/admin/faqs",
  "/admin/faqs/home-1",
  "/admin/stats",
  "/admin/clients",
  "/admin/pricing",
  "/admin/pricing/other",
  "/admin/settings",
  "/admin/admins",
];
const OWNER_ONLY = [
  "/admin/leads",
  "/admin/pricing",
  "/admin/pricing/other",
  "/admin/settings",
  "/admin/admins",
];

test.describe("signed out", () => {
  test("every admin page sends you to sign in, and shows nothing", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/admin\/login$/);
      await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
    }
  });

  test("preview and upload refuse", async ({ page, request }) => {
    await page.goto("/admin/preview?path=/");
    await expect(page).toHaveURL(/\/admin\/login$/);
    const res = await request.post("/admin/upload", {
      multipart: { file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") } },
    });
    expect(res.status()).toBe(401);
  });

  test("admin pages are noindex; robots.txt and the site never link to them", async ({
    request,
  }) => {
    const res = await request.get("/admin/login");
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
    expect(await res.text()).toMatch(/<meta name="robots" content="noindex, nofollow/);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \/(admin)?\s*$/m);
    const home = await (await request.get("/")).text();
    expect(home).not.toContain('href="/admin');
  });

  test("wrong password is refused", async ({ page }) => {
    await page.goto("/admin/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(env.E2E_EDITOR_EMAIL);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Wrong email or password." }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("the Owner needs a code after the password, and a wrong code is refused", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signInWithPassword(page, "OWNER");
    await expect(page).toHaveURL(/\/admin\/two-factor$/);
    await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
    // Password alone is not enough to open anything.
    await page.goto("/admin/pricing");
    await expect(page).toHaveURL(/\/admin\/two-factor$/);
    await page.getByLabel("Six-digit code").fill("000000");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "didn't work" })).toBeVisible();
    await enterCode(page, savedSecret());
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });
});

test.describe("signed in, not an admin", () => {
  test.use({ storageState: STRANGER });

  test("every admin page shows No access, and nothing else", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/admin\/no-access$/);
      await expect(page.getByRole("heading", { name: "No access" })).toBeVisible();
      await expect(page.locator("nav")).toHaveCount(0);
    }
  });

  test("upload and preview refuse", async ({ page }) => {
    await page.goto("/admin/no-access");
    const status = await page.evaluate(async () => {
      const f = new FormData();
      f.append("file", new Blob(["x"], { type: "image/png" }), "a.png");
      return (await fetch("/admin/upload", { method: "POST", body: f })).status;
    });
    expect(status).toBe(401);
    await page.goto("/admin/preview?path=/");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});

test.describe("Editor", () => {
  test.use({ storageState: EDITOR });

  test("edits content but can't open prices, settings, leads or admins", async ({ page }) => {
    await page.goto("/admin/faqs");
    await expect(page.getByRole("heading", { name: "FAQs" })).toBeVisible();
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "FAQs", exact: true })).toBeVisible();
    for (const name of ["Leads", "Property shoots", "Other prices", "Site settings", "Admins"])
      await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
    for (const path of OWNER_ONLY) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/admin\?owner-only=1$/);
      await expect(page.getByText("That section is for the Owner.")).toBeVisible();
    }
  });
});

test.describe("the database itself (row-level security)", () => {
  test("a non-admin can read only what the public sees and change nothing", async () => {
    const db = await dbAs("STRANGER");
    const upd = await db.from("faqs").update({ answer: "hacked" }).eq("id", "home-1").select();
    expect(upd.data ?? []).toHaveLength(0);
    const ins = await db
      .from("faqs")
      .insert({ id: "e2e-hack", page: "home", question: "x", answer: "x" });
    expect(ins.error).not.toBeNull();
    const price = await db
      .from("pricing_property")
      .update({ price: 1 })
      .eq("type", "apartment")
      .select();
    expect(price.data ?? []).toHaveLength(0);
    const leads = await db.from("leads").select("id");
    expect(leads.data ?? []).toHaveLength(0);
    const up = await db.storage.from("media").upload(`e2e/${Date.now()}.txt`, "x");
    expect(up.error).not.toBeNull();
  });

  test("an Editor can't change prices or settings; the Owner can't either without the code", async () => {
    for (const who of ["EDITOR", "OWNER"] as const) {
      const db = await dbAs(who); // password only (no code)
      const price = await db
        .from("pricing_property")
        .update({ price: 1 })
        .eq("type", "apartment")
        .select();
      expect(price.data ?? [], who).toHaveLength(0);
      const site = await db.from("site_settings").update({ value: {} }).eq("key", "site").select();
      expect(site.data ?? [], who).toHaveLength(0);
      const rpc = await db.rpc("publish_property_pricing", {
        sizes: [],
        tiers: [],
        twilight: [],
        meta: {},
        summary: "x",
        details: [],
      });
      expect(rpc.error, who).not.toBeNull();
    }
  });

  test("the change log can't be written in someone else's name", async () => {
    const db = await dbAs("EDITOR");
    const forged = await db.from("change_log").insert({
      entity: "x",
      action: "update",
      summary: "forged",
      admin_email: "hello@milkywayy.com",
    });
    expect(forged.error).not.toBeNull();
  });
});
