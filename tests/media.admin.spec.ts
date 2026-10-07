import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { ownerDb, OWNER, RUN } from "./helpers/admin";
import { hasAdminAccounts } from "./helpers/env";

/**
 * The admin's portfolio media editor (owner, 7 Oct 2026): fields by format, photo sets, the
 * "Shown at / Recommended export / Used on" box, Instagram reels (the API is the local mock,
 * tests/mocks/instagram.mjs), video uploads optimised in the browser with ffmpeg.wasm (storage
 * is the dev media origin, answered here), 360 tours and long-form links. Items are drafts
 * tagged with this run and deleted at the end.
 */
test.skip(!hasAdminAccounts, "E2E_* accounts missing from .env.local");
test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER });

const DEV_MEDIA = "http://127.0.0.1:3299";
const uploaded: string[] = [];

async function jpeg(w: number, h: number, color: string) {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

test.afterAll(async () => {
  test.setTimeout(120_000);
  const db = await ownerDb();
  await db.from("portfolio_items").delete().like("title", `${RUN}%`);
  const paths = uploaded.map((u) => u.split("/object/public/media/")[1]).filter(Boolean);
  if (paths.length) await db.storage.from("media").remove(paths);
});

async function newItem(page: Page, title: string, format: string, category = "property") {
  await page.goto("/admin/portfolio/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category").selectOption(category);
  await page.getByLabel("Format").selectOption(format);
}

async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/admin\/portfolio\/(?!new)[\w-]+\?created=1$/);
  return page.url().split("/").pop()!.split("?")[0];
}

async function row(id: string) {
  const db = await ownerDb();
  const { data } = await db.from("portfolio_items").select("*").eq("id", id).single();
  return data as { media: Record<string, unknown> & { photos?: { src: string }[] } };
}

async function coverUpload(page: Page, alt: string) {
  const box = page.getByRole("group", { name: "Cover image", exact: true });
  await box.locator('input[type="file"]').setInputFiles({
    name: "cover.jpg",
    mimeType: "image/jpeg",
    buffer: await jpeg(1080, 1920, "#334455"),
  });
  await expect(box.locator(".ad-focal img")).toBeVisible({ timeout: 30_000 });
  uploaded.push((await box.locator(".ad-focal img").getAttribute("src"))!);
  await box.getByLabel("Describe the image (alt text)").fill(alt);
}

/** A short clip recorded in the page (MP4 where Chrome can, else WebM). */
async function recordClip(page: Page, width: number, height: number) {
  const r = await page.evaluate(
    async ({ width, height }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;
      const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp8", "video/webm"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      )!;
      const rec = new MediaRecorder(c.captureStream(25), {
        mimeType: mime,
        videoBitsPerSecond: 4e6,
      });
      const parts: Blob[] = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      let f = 0;
      const tick = setInterval(() => {
        ctx.fillStyle = `hsl(${(f * 9) % 360} 60% 45%)`;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#fff";
        ctx.fillRect((f * 12) % width, (f * 7) % height, 90, 90);
        f++;
      }, 40);
      rec.start();
      await new Promise((res) => setTimeout(res, 1500));
      rec.stop();
      await new Promise((res) => (rec.onstop = res));
      clearInterval(tick);
      return { bytes: Array.from(new Uint8Array(await new Blob(parts).arrayBuffer())), mime };
    },
    { width, height },
  );
  const mp4 = r.mime.startsWith("video/mp4");
  return {
    name: mp4 ? "clip.mp4" : "clip.webm",
    mimeType: mp4 ? "video/mp4" : "video/webm",
    buffer: Buffer.from(r.bytes),
  };
}

/** Stand in for R2: accept the presigned PUT and keep what was sent. */
async function fakeStorage(page: Page) {
  const puts: Buffer[] = [];
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "PUT, GET, OPTIONS",
    "access-control-allow-headers": "*",
  };
  // Both the dev media origin and R2 itself (when .env.local has R2): nothing is really stored.
  const storage = (u: URL) =>
    u.origin === DEV_MEDIA || u.hostname.endsWith(".r2.cloudflarestorage.com");
  await page.route(storage, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (req.method() === "PUT") puts.push(req.postDataBuffer() ?? Buffer.alloc(0));
    return route.fulfill({ status: 200, headers: { ...cors, etag: '"x"' }, body: "" });
  });
  return puts;
}

test("photo set: multi-upload, reorder (buttons and drag), star the cover, delete; facts and “Used on”", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await newItem(page, `${RUN} photo set`, "photo");
  const set = page.getByTestId("photo-set");
  // Only the photo fields show.
  await expect(page.getByTestId("reel-source")).toHaveCount(0);
  await expect(page.getByLabel("Duration label")).toHaveCount(0);
  const facts = set.getByTestId("media-facts");
  await expect(facts).toContainText("Shown at: 3:2");
  await expect(facts).toContainText("Recommended export: 2400×1600");
  await expect(facts.getByTestId("used-on")).toContainText("not shown anywhere yet");

  const files = await Promise.all(
    ["#aa3333", "#33aa33", "#3333aa"].map(async (c, i) => ({
      name: `p${i + 1}.jpg`,
      mimeType: "image/jpeg",
      buffer: await jpeg(2400, 1600, c),
    })),
  );
  await set.getByTestId("photos-file").setInputFiles(files);
  const items = set.getByTestId("photo-item");
  await expect(items).toHaveCount(3, { timeout: 60_000 });
  const src = await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-src")!));
  uploaded.push(...src);
  // The first is the cover by default.
  await expect(set.getByRole("button", { name: "Photo 1 is the cover" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // "Used on" follows the placements as they're ticked and unticked.
  await page.getByRole("checkbox", { name: "Work page" }).check();
  await expect(facts.getByTestId("used-on")).toContainText("/work → Photos tab");
  await page.getByRole("checkbox", { name: "Home · Production row" }).check();
  await expect(facts.getByTestId("used-on")).toContainText("Home → Services row (Production)");
  await page.getByRole("checkbox", { name: "Home · Production row" }).uncheck();
  await expect(facts.getByTestId("used-on")).not.toContainText("Home →");

  // Reorder: photo 3 earlier (button), then drag the first to the end.
  await set.getByRole("button", { name: "Move photo 3 earlier" }).click();
  let order = await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-src")));
  expect(order).toEqual([src[0], src[2], src[1]]);
  await items.nth(0).dragTo(items.nth(2), {
    sourcePosition: { x: 20, y: 20 },
    targetPosition: { x: 20, y: 20 },
    timeout: 15_000,
  });
  order = await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-src")));
  expect(order).toEqual([src[2], src[1], src[0]]);

  // Star the second as the cover; give one an alt text; delete one.
  await set.getByRole("button", { name: "Make photo 2 the cover" }).click();
  await expect(set.getByRole("button", { name: "Photo 2 is the cover" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await set.getByLabel("Photo 1 alt text (optional)").fill("Blue room");
  await set.getByRole("button", { name: "Delete photo 3" }).click();
  await expect(items).toHaveCount(2);
  await set.getByLabel("Describe the cover (alt text)").fill(`${RUN} cover`);
  await expect(set.getByTestId("crop-preview")).toContainText("3:2");

  const id = await saveDraft(page);
  const { media } = await row(id);
  expect(media.photos!.map((p) => p.src)).toEqual([src[2], src[1]]);
  expect(media.src).toBe(src[1]);
  expect(media.photos![0]).toMatchObject({ alt: "Blue room", width: 2400, height: 1600 });
});

test("a small or off-ratio image gets a warning, not a block", async ({ page }) => {
  await newItem(page, `${RUN} small`, "photo");
  await page.getByTestId("photos-file").setInputFiles({
    name: "small.jpg",
    mimeType: "image/jpeg",
    buffer: await jpeg(800, 800, "#555"),
  });
  await expect(page.getByTestId("photo-item")).toHaveCount(1, { timeout: 30_000 });
  uploaded.push((await page.getByTestId("photo-item").getAttribute("data-src"))!);
  const warn = page.getByTestId("photo-set").locator(".ad-warn");
  await expect(warn).toContainText("smaller than the recommended 2400×1600");
  await expect(warn).toContainText("far from 3:2");
});

test("labels on other uploads: ratio, export size and where they're used", async ({ page }) => {
  await page.goto("/admin/before-after/new");
  const before = page
    .getByRole("group", { name: "Before", exact: true })
    .getByTestId("media-facts");
  await expect(before).toContainText("Shown at: 3:2");
  await expect(before).toContainText("Recommended export: 2400×1600");
  await expect(before).toContainText("Used on: Post-production → Before / after");
  await page.goto("/admin/avatars/new");
  const poster = page
    .getByRole("group", { name: "Cover image", exact: true })
    .getByTestId("media-facts");
  await expect(poster).toContainText("Shown at: 9:16");
  await expect(poster).toContainText("Recommended export: 1080×1920");
  await expect(poster).toContainText("AI avatars → Avatar styles");
  await page.goto("/admin/case-studies/new");
  await expect(
    page.getByRole("group", { name: "Cover image", exact: true }).getByTestId("media-facts"),
  ).toContainText("Shown at: 16:9");
});

test("Instagram reel: ours plays (id saved, cover copied); another account's is link-only; broken ones are flagged", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Ours.
  await newItem(page, `${RUN} ig ours`, "reel", "brand");
  await expect(page.getByRole("textbox", { name: "Instagram reel link" })).toBeVisible(); // the default source
  await expect(page.getByText(/A reel from another account can’t play here/)).toBeVisible();
  await page
    .getByRole("textbox", { name: "Instagram reel link" })
    .fill("https://www.instagram.com/reel/MWOKREEL01/?igsh=x");
  await expect(page.getByTestId("ig-status")).toContainText("Found on @milkywayy.media");
  await page.getByRole("button", { name: "Use the reel’s cover" }).click();
  const cover = page.getByRole("group", { name: "Cover image", exact: true });
  await expect(cover.locator(".ad-focal img")).toBeVisible({ timeout: 30_000 });
  uploaded.push((await cover.locator(".ad-focal img").getAttribute("src"))!);
  await cover.getByLabel("Describe the image (alt text)").fill(`${RUN} reel cover`);
  await expect(cover.getByTestId("media-facts")).toContainText("Shown at: 9:16");
  const ours = await saveDraft(page);
  expect((await row(ours)).media.instagram).toEqual({
    url: "https://www.instagram.com/reel/MWOKREEL01/?igsh=x",
    shortcode: "MWOKREEL01",
    id: "17900000000000001",
  });

  // Another account's.
  await newItem(page, `${RUN} ig other`, "reel", "brand");
  await page
    .getByRole("textbox", { name: "Instagram reel link" })
    .fill("https://www.instagram.com/reel/OTHER0001/");
  await expect(page.getByTestId("ig-status")).toContainText("isn’t on @milkywayy.media");
  await coverUpload(page, `${RUN} other cover`);
  const other = await saveDraft(page);
  expect((await row(other)).media.instagram).toEqual({
    url: "https://www.instagram.com/reel/OTHER0001/",
    shortcode: "OTHER0001",
  });

  // Ours, but Instagram won't serve it.
  await newItem(page, `${RUN} ig broken`, "reel", "brand");
  await page
    .getByRole("textbox", { name: "Instagram reel link" })
    .fill("https://www.instagram.com/reel/MWBROKEN01/");
  await expect(page.getByTestId("ig-status")).toContainText("Found on");
  await coverUpload(page, `${RUN} broken cover`);
  await saveDraft(page);

  await page.goto("/admin/portfolio");
  await expect(page.getByTestId("instagram-status")).toContainText("Connected as @milkywayy.media");
  const rowOf = (t: string) => page.locator(".ad-row").filter({ hasText: t }).first();
  await expect(rowOf(`${RUN} ig other`).getByTestId("row-flag")).toContainText(
    "Instagram link only",
  );
  await expect(rowOf(`${RUN} ig broken`).getByTestId("row-flag")).toContainText(
    "Instagram reel unavailable",
  );
  await expect(rowOf(`${RUN} ig ours`).getByTestId("row-flag")).toHaveCount(0);
});

test("reel upload: optimised in the browser, then straight to storage; vertical warning", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const puts = await fakeStorage(page);
  await newItem(page, `${RUN} upload`, "reel", "brand");
  await page.getByRole("radio", { name: "Upload video" }).check();
  const clip = await recordClip(page, 640, 360); // landscape on purpose
  await page.getByTestId("video-file-reels").setInputFiles(clip);
  const status = page.getByTestId("reel-source").getByRole("status").first();
  await expect(status).toContainText(/Optimising video… \d+%/, { timeout: 60_000 });
  await expect(page.getByTestId("reel-source")).toContainText(/Optimised: [\d.]+ MB → [\d.]+ MB/, {
    timeout: 120_000,
  });
  await expect(page.getByTestId("video-stored")).toContainText("Uploaded video");
  await expect(page.getByTestId("reel-source")).toContainText("isn’t vertical");
  // What went to storage is the web version: an MP4 (ftyp box), not the original.
  expect(puts).toHaveLength(1);
  expect(puts[0].subarray(4, 8).toString()).toBe("ftyp");
  await coverUpload(page, `${RUN} upload cover`);
  const id = await saveDraft(page);
  const { media } = await row(id);
  expect(media.source).toBe("upload");
  expect(media.video).toMatch(/^r2:site\/reels\/[0-9a-f-]{36}\.mp4$/);
  expect(media.file).toMatchObject({ optimised: true });
});

test("reel upload: if optimising fails, the original goes up with a warning", async ({ page }) => {
  test.setTimeout(120_000);
  const puts = await fakeStorage(page);
  await newItem(page, `${RUN} fallback`, "reel", "brand");
  await page.getByRole("radio", { name: "Upload video" }).check();
  const junk = Buffer.alloc(300 * 1024, 3);
  await page
    .getByTestId("video-file-reels")
    .setInputFiles({ name: "broken.mp4", mimeType: "video/mp4", buffer: junk });
  await expect(page.getByTestId("reel-source")).toContainText(
    "This file is large and may load slowly.",
    { timeout: 90_000 },
  );
  await expect(page.getByTestId("reel-source")).toContainText("Uploaded (", { timeout: 30_000 });
  expect(puts).toHaveLength(1);
  expect(puts[0].length).toBe(junk.length);
});

test("360 tour: only Matterport, Panoee or Kuula; an Instagram link moves to its own field", async ({
  page,
}) => {
  await newItem(page, `${RUN} tour`, "360");
  const tour = page.getByLabel("360 tour link");
  await expect(
    page.getByText("Matterport, Panoee or Kuula link.", { exact: false }).first(),
  ).toBeVisible();
  await tour.fill("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  await expect(
    page.getByText("Link not recognised. Use a Matterport, Panoee or Kuula link."),
  ).toBeVisible();
  await tour.fill("https://www.instagram.com/p/MWPOST0001/");
  await expect(page.getByText("went to “Instagram post link”")).toBeVisible();
  await expect(page.getByLabel("Instagram post link (optional)")).toHaveValue(
    "https://www.instagram.com/p/MWPOST0001/",
  );
  for (const ok of [
    "https://kuula.co/post/7lBXk",
    "https://tour.panoee.net/marina-2br",
    "https://my.matterport.com/show/?m=SxQL3iGyoDo",
  ]) {
    await tour.fill(ok);
    await expect(page.getByText("Link not recognised")).toHaveCount(0);
  }
  const cover = page.getByRole("group", { name: "Cover image", exact: true });
  await expect(cover.getByTestId("media-facts")).toContainText("Shown at: 16:9");
  await coverUpload(page, `${RUN} tour cover`);
  const id = await saveDraft(page);
  expect((await row(id)).media).toMatchObject({
    tour: "https://my.matterport.com/show/?m=SxQL3iGyoDo",
    instagramUrl: "https://www.instagram.com/p/MWPOST0001/",
  });
});

test("long-form: YouTube or Vimeo link (Bunny/Mux not offered); anything else refused", async ({
  page,
}) => {
  await newItem(page, `${RUN} long`, "long-form");
  const link = page.getByLabel("Video link (optional)");
  await expect(link).toHaveAttribute("placeholder", "YouTube or Vimeo link (unlisted is fine)");
  await expect(page.getByText(/Bunny|Mux/)).toHaveCount(0);
  await link.fill("https://example.com/video.mp4");
  await expect(page.getByText("Link not recognised. Use a YouTube or Vimeo link.")).toBeVisible();
  await link.fill("https://vimeo.com/76979871");
  await expect(page.getByText("Link not recognised")).toHaveCount(0);
  await link.fill("https://youtu.be/aqz-KE-bpKQ");
  await expect(page.getByText("Link not recognised")).toHaveCount(0);
  await expect(page.getByLabel("Duration label")).toBeVisible();
});
