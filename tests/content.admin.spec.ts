import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { html, onSite, ownerDb, OWNER, RUN } from "./helpers/admin";
import { hasAdminAccounts } from "./helpers/env";

/**
 * One item per content section, through the real UI as the e2e Owner: add as a draft (not on the
 * site), publish (on the site within seconds, no deploy), then delete. Uses the shared database,
 * so every item is tagged with this run's id and cleaned up at the end whatever happens.
 */
test.skip(!hasAdminAccounts, "E2E_* accounts missing from .env.local");
test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER });

const slug = RUN.toLowerCase().replace(/\s+/g, "-");
const uploaded: string[] = [];
let photo: Buffer;

test.beforeAll(async () => {
  // A 3000×2000 photo: bigger than the 2400 px cap, so the resize is tested too.
  const w = 3000,
    h = 2000;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      raw[i] = (x * 255) / w;
      raw[i + 1] = (y * 255) / h;
      raw[i + 2] = 120;
    }
  photo = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
});

test.afterAll(async () => {
  test.setTimeout(150_000);
  const db = await ownerDb();
  for (const [table, col] of [
    ["faqs", "question"],
    ["reviews", "role"],
    ["stats", "label"],
    ["clients", "name"],
    ["avatars", "name"],
    ["before_after", "title"],
    ["portfolio_items", "title"],
    ["case_studies", "title"],
  ])
    await db.from(table).delete().like(col, `${RUN}%`);
  const paths = uploaded.map((u) => u.split("/object/public/media/")[1]).filter(Boolean);
  if (paths.length) await db.storage.from("media").remove(paths);
});

/* ---------- helpers ---------- */

async function addDraft(page: Page, section: string, fill: () => Promise<void>) {
  await page.goto(`/admin/${section}/new`);
  await fill();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/${section}/(?!new)[\\w-]+\\?created=1$`));
  await expect(page.locator(".ad-head .ad-pill")).toHaveText("Draft");
  return page.url().split("/").pop()!.split("?")[0];
}

async function publish(page: Page) {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
  await expect(page.locator(".ad-head .ad-pill")).toHaveText("Live");
}

async function remove(page: Page, section: string, singular: string) {
  await page.getByRole("button", { name: `Delete ${singular}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/${section}\\?deleted=1$`));
}

async function upload(page: Page, group: string, alt: string) {
  const box = page.getByRole("group", { name: group, exact: true });
  await box
    .locator('input[type="file"]')
    .setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: photo });
  const img = box.locator(".ad-focal img");
  await expect(img).toBeVisible({ timeout: 30_000 });
  await box.getByLabel("Describe the image (alt text)").fill(alt);
  const src = (await img.getAttribute("src"))!;
  uploaded.push(src);
  return src;
}

/** Proof that drafts stay off the site: the page has been re-rendered since, and it isn't there. */
async function notOnSite(baseURL: string, path: string, text: string) {
  await new Promise((r) => setTimeout(r, 3000));
  const res = await fetch(new URL(path, baseURL), { cache: "no-store" });
  expect(await res.text(), `${text} must not be on ${path} yet`).not.toContain(text);
}

/* ---------- sections ---------- */

test("FAQs: draft, preview, publish, delete", async ({ page, baseURL }) => {
  const q = `${RUN} is this live?`;
  const id = await addDraft(page, "faqs", async () => {
    await page.getByLabel("Page").selectOption("home");
    await page.getByLabel("Question").fill(q);
    await page.getByLabel("Answer").fill("Only after publishing.");
  });
  expect(id).toMatch(/^faq-/);
  await notOnSite(baseURL!, "/", html(q));

  // Preview: the same page with the draft in it, for this admin only.
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Preview" }).click();
  const tab = await popup;
  await tab.waitForURL((u) => u.pathname === "/");
  await expect(tab.getByRole("status").filter({ hasText: "Preview" })).toBeVisible();
  await expect(tab.getByText(q)).toBeVisible();
  await tab.getByRole("button", { name: "Exit preview" }).click();
  await expect(tab.getByText(q)).toHaveCount(0);
  await tab.close();

  await publish(page);
  await onSite(baseURL!, "/", (h) => h.includes(html(q)), "published FAQ");
  await remove(page, "faqs", "FAQ");
  await onSite(baseURL!, "/", (h) => !h.includes(html(q)), "deleted FAQ gone");
});

test("FAQs: reorder with the keyboard, then put it back", async ({ page }) => {
  await page.goto("/admin/faqs?show=home");
  const titles = page.locator(".ad-row-title");
  const before = await titles.allTextContents();
  await page
    .getByRole("button", { name: `Move “${before[0]}”. Use the arrow keys.` })
    .press("ArrowDown");
  await expect(page.getByRole("status").filter({ hasText: "Order saved" })).toBeVisible();
  await page.reload();
  expect((await titles.allTextContents()).slice(0, 2)).toEqual([before[1], before[0]]);
  await page
    .getByRole("button", { name: `Move “${before[0]}”. Use the arrow keys.` })
    .press("ArrowUp");
  await expect(page.getByRole("status").filter({ hasText: "Order saved" })).toBeVisible();
  await page.reload();
  expect(await titles.allTextContents()).toEqual(before);
});

test("Reviews", async ({ page, baseURL }) => {
  const text = `${RUN} review: booked on Monday, photos by Tuesday.`;
  await addDraft(page, "reviews", async () => {
    await page.getByLabel("Role").fill(`${RUN} Agent`);
    await page.getByLabel("Review", { exact: true }).fill(text);
  });
  await notOnSite(baseURL!, "/", html(text));
  await publish(page);
  await onSite(baseURL!, "/", (h) => h.includes(html(text)), "published review");
  await remove(page, "reviews", "review");
});

test("Stats", async ({ page, baseURL }) => {
  const label = `${RUN} stat`;
  await addDraft(page, "stats", async () => {
    await page.getByLabel("Value", { exact: true }).fill("42");
    await page.getByLabel("Label", { exact: true }).fill(label);
  });
  await notOnSite(baseURL!, "/", label);
  await publish(page);
  await onSite(baseURL!, "/", (h) => h.includes(label), "published stat");
  await remove(page, "stats", "stat");
});

test("Clients (proof strip)", async ({ page, baseURL }) => {
  const name = `${RUN} Client`;
  await addDraft(page, "clients", async () => {
    await page.getByLabel("Client name").fill(name);
  });
  await notOnSite(baseURL!, "/", name);
  await publish(page);
  await onSite(baseURL!, "/", (h) => h.includes(name), "published client");
  await remove(page, "clients", "client");
});

test("AI avatars, with an upload: WebP, resized, focal point kept", async ({ page, baseURL }) => {
  const name = `${RUN} Avatar`;
  let src = "";
  const id = await addDraft(page, "avatars", async () => {
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Niche line").fill("Testing · uploads");
    src = await upload(page, "Poster", `${RUN} avatar poster`);
    // Focal point: tap at 20% across, 30% down; every crop preview follows it.
    const picker = page.getByRole("slider", { name: /Focal point/ });
    const box = (await picker.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3);
    await expect(picker).toHaveAttribute("aria-valuetext", "20% across, 30% down");
    await expect(page.locator(".ad-crop img").first()).toHaveCSS("object-position", "20% 30%");
  });

  // Stored in Supabase Storage as WebP, capped at 2400 px.
  expect(src).toMatch(/\/storage\/v1\/object\/public\/media\/uploads\/\d{4}\/\d{2}\/[\w-]+\.webp$/);
  const file = await fetch(src);
  expect(file.headers.get("content-type")).toBe("image/webp");
  const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
  expect(meta.format).toBe("webp");
  expect(Math.max(meta.width!, meta.height!)).toBe(2400);

  // The focal point was saved with the item.
  await page.goto(`/admin/avatars/${id}`);
  await expect(page.getByRole("slider", { name: /Focal point/ })).toHaveAttribute(
    "aria-valuetext",
    "20% across, 30% down",
  );

  await notOnSite(baseURL!, "/ai-avatars", name);
  await publish(page);
  const live = await onSite(baseURL!, "/ai-avatars", (h) => h.includes(name), "published avatar");
  expect(live).toContain(html(`${RUN} avatar poster`));
  expect(live).toContain("object-position:20% 30%");
  await remove(page, "avatars", "avatar example");
});

test("Before / after", async ({ page, baseURL }) => {
  const title = `${RUN} pair`;
  await addDraft(page, "before-after", async () => {
    await page.getByLabel("Tab").fill("E2E");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Before and after, from the test suite.");
    await upload(page, "Before", `${RUN} before`);
    await upload(page, "After", `${RUN} after`);
  });
  await notOnSite(baseURL!, "/post-production", title);
  await publish(page);
  await onSite(baseURL!, "/post-production", (h) => h.includes(title), "published pair");
  await remove(page, "before-after", "before / after pair");
});

test("Portfolio", async ({ page, baseURL }) => {
  const alt = `${RUN} portfolio photo`;
  await addDraft(page, "portfolio", async () => {
    await page.getByLabel("Title").fill(`${RUN} portfolio`);
    await page.getByLabel("Format").selectOption("photo");
    await upload(page, "Image or video poster", alt);
    await page.getByRole("checkbox", { name: "Work page" }).check();
  });
  await notOnSite(baseURL!, "/work", html(alt));
  await publish(page);
  await onSite(baseURL!, "/work", (h) => h.includes(html(alt)), "published portfolio item");
  await remove(page, "portfolio", "portfolio item");
});

test("Case studies", async ({ page, baseURL }) => {
  const title = `${RUN} case study`;
  await addDraft(page, "case-studies", async () => {
    await page.getByLabel("Client", { exact: true }).fill(`${RUN} client`);
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("Web address").fill(slug);
    await page.getByLabel("One-line summary (cards)").fill("A test case study.");
    await page.getByLabel("The brief").fill("Check that publishing works end to end.");
    await upload(page, "Cover", `${RUN} cover`);
  });
  await notOnSite(baseURL!, "/work", title);
  await publish(page);
  await onSite(baseURL!, "/work", (h) => h.includes(title), "case study card");
  await onSite(
    baseURL!,
    `/work/${slug}`,
    (h, s) => s === 200 && h.includes(title),
    "case study page",
  );
  await remove(page, "case-studies", "case study");
});

test("validation: required fields and bad links are refused on the server", async ({ page }) => {
  await page.goto("/admin/faqs/new");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Required.").first()).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/faqs\/new$/);
  await page.goto("/admin/avatars/new");
  await page
    .getByLabel("Clip (Bunny, Mux, YouTube or Vimeo link)")
    .fill("https://example.com/video.mp4");
  await expect(page.getByText("Link not recognised").first()).toBeVisible();
});
