import { expect, test } from "@playwright/test";
import { portfolioMedia } from "@/lib/admin/validate";
import { instagramShortcode, isInstagramUrl } from "@/lib/instagram-link";
import { exportSize, kindOf, MEDIA, photosOf, sizeWarnings } from "@/lib/media-config";
import { tourEmbed } from "@/lib/tours";
import { usedOn, type UsageItem } from "@/lib/used-on";
import { targetBitrate } from "@/lib/video-compress";
import { embedUrl } from "@/lib/video";

/** Portfolio media formats (owner, 7 Oct 2026): one config, read by the site and the admin. */

test("each format has the agreed ratio, export size and click behaviour", () => {
  const want = {
    photo: ["3:2", "2400×1600", "lightbox"],
    reel: ["9:16", "1080×1920", "reel"],
    "long-form": ["16:9", "1920×1080", "video"],
    "360": ["16:9", "1920×1080", "tour"],
    "before-after": ["3:2", "2400×1600", "slider"],
    "ai-avatar": ["9:16", "1080×1920", "reel"],
    showreel: ["16:9", "1920×1080", "in-place"],
  } as const;
  for (const [k, [ratio, size, opens]] of Object.entries(want)) {
    const kind = k as keyof typeof want;
    expect(MEDIA[kind].ratioLabel, k).toBe(ratio);
    expect(exportSize(kind), k).toBe(size);
    expect(MEDIA[kind].opens, k).toBe(opens);
  }
  expect(kindOf({ category: "ai-avatar", format: "photo" })).toBe("ai-avatar");
  expect(kindOf({ category: "property", format: "360" })).toBe("360");
});

test("upload warnings: smaller than recommended, or far off the ratio (warn, never block)", () => {
  expect(sizeWarnings("photo", 2400, 1600)).toEqual([]);
  expect(sizeWarnings("photo", 1200, 800)[0]).toContain("smaller than the recommended 2400×1600");
  expect(sizeWarnings("reel", 1920, 1080).join(" ")).toContain("far from 9:16");
  expect(sizeWarnings("photo", 2400, 1700)).toEqual([]); // close enough to 3:2
});

test("old single-photo items count as a set of one", () => {
  expect(photosOf({ src: "/a.webp", alt: "A" })).toHaveLength(1);
  expect(photosOf({ alt: "none" })).toEqual([]);
});

test("360 tours: only Matterport, Panoee and Kuula, turned into embeddable links", () => {
  expect(tourEmbed("https://my.matterport.com/show/?m=SxQL3iGyoDo")).toEqual({
    host: "matterport",
    embed: "https://my.matterport.com/show/?m=SxQL3iGyoDo&play=1&qs=1",
  });
  expect(tourEmbed("https://tour.panoee.net/marina-2br")?.host).toBe("panoee");
  expect(tourEmbed("https://panoee.com/tour/abc123")?.embed).toBe("https://panoee.com/tour/abc123");
  expect(tourEmbed("https://kuula.co/post/7lBXk")?.embed).toBe(
    "https://kuula.co/share/7lBXk?logo=1&info=1&fs=1&vr=0&thumbs=1",
  );
  expect(tourEmbed("https://kuula.co/share/collection/7Fx3q")?.embed).toContain(
    "/share/collection/7Fx3q",
  );
  for (const bad of [
    "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    "https://my.matterport.com/show/",
    "https://my.matterport.com.evil.com/show/?m=SxQL3iGyoDo",
    "https://kuula.co/profile/someone",
    "https://panoee.com/",
    "https://example.com/tour",
    "not a link",
  ])
    expect(tourEmbed(bad), bad).toBeNull();
});

test("long-form: YouTube and Vimeo links play in a lazy embed", () => {
  expect(embedUrl("https://www.youtube.com/watch?v=aqz-KE-bpKQ")).toContain(
    "youtube-nocookie.com/embed/aqz-KE-bpKQ",
  );
  expect(embedUrl("https://youtu.be/aqz-KE-bpKQ")).toContain("/embed/aqz-KE-bpKQ");
  expect(embedUrl("https://vimeo.com/76979871")).toContain("player.vimeo.com/video/76979871");
  expect(embedUrl("https://www.instagram.com/reel/MWOKREEL01/")).toBeNull();
});

test("Instagram links: reels and posts are recognised; the shortcode is read", () => {
  expect(instagramShortcode("https://www.instagram.com/reel/MWOKREEL01/?igsh=abc")).toBe(
    "MWOKREEL01",
  );
  expect(instagramShortcode("https://instagram.com/milkywayy.media/reel/C9xYz_1-ab/")).toBe(
    "C9xYz_1-ab",
  );
  expect(instagramShortcode("https://www.instagram.com/p/MWPOST0001/")).toBe("MWPOST0001");
  expect(instagramShortcode("https://www.instagram.com/milkywayy.media/")).toBeNull();
  expect(isInstagramUrl("https://www.instagram.com/p/x/")).toBe(true);
  expect(isInstagramUrl("https://vimeo.com/1")).toBe(false);
});

test("videos stay under 40 MB: 5 Mbps, lower for long clips", () => {
  expect(targetBitrate(30)).toBe(5_000_000);
  expect(targetBitrate(120)).toBeLessThan(5_000_000);
  expect((targetBitrate(120) + 128_000) * 120).toBeLessThanOrEqual(40 * 1024 * 1024 * 8);
});

const item = (id: string, over: Partial<UsageItem> = {}): UsageItem => ({
  id,
  format: "photo",
  category: "property",
  placements: [],
  placementOrder: {},
  sortOrder: 1,
  sample: false,
  published: true,
  ...over,
});

test("“Used on” lists exactly where an item shows", () => {
  const me = item("me", { placements: ["home-row-production", "work"], sortOrder: 0 });
  expect(usedOn(me, [me])).toEqual(["Home → Services row (Production)", "/work → Photos tab"]);
  // Second in a one-item row: not shown there.
  const first = item("first", { placements: ["home-row-production"], sortOrder: -1 });
  expect(usedOn(me, [first, me])).toEqual(["/work → Photos tab"]);
  // A sample hides once real work exists in the same place.
  const sample = item("s", { placements: ["work"], sample: true });
  expect(usedOn(sample, [sample, me])).toEqual([]);
  // Post-production rows take the first item of each format.
  const reel = item("r", { format: "reel", placements: ["post-service-cards"] });
  expect(usedOn(reel, [reel])).toEqual([
    "Post-production → Services row (Short-form reels)",
    "Post-production → Work we've delivered (Reels)",
  ]);
  // Property shoots samples, by tab; 360 tours on /work too.
  const tour = item("t", { format: "360", placements: ["property-gallery-360", "work"] });
  expect(usedOn(tour, [tour])).toEqual([
    "Property shoots → Samples (360° tours)",
    "/work → 360° tours tab",
  ]);
  expect(usedOn(item("x"), [])).toEqual([]);
});

test("server check keeps only what the format uses and moves stray Instagram links", () => {
  const photo = portfolioMedia(
    {
      alt: "Cover",
      src: "/fixtures/photo-2.webp",
      photos: [{ src: "/fixtures/photo-1.webp" }, { src: "/fixtures/photo-2.webp", alt: "Two" }],
      video: "https://vimeo.com/1",
      tour: "https://kuula.co/post/abc",
    },
    { format: "photo", category: "property" },
  );
  expect(photo.value).toMatchObject({ src: "/fixtures/photo-2.webp", alt: "Cover" });
  expect(photo.value?.photos).toHaveLength(2);
  expect(photo.value).not.toHaveProperty("video");
  expect(photo.value).not.toHaveProperty("tour");

  const tour = portfolioMedia(
    { alt: "Cover", src: "/fixtures/wide.webp", tour: "https://www.instagram.com/p/MWPOST0001/" },
    { format: "360", category: "property" },
  );
  expect(tour.error).toContain("Paste the 360 tour link");
  const tour2 = portfolioMedia(
    {
      alt: "Cover",
      src: "/fixtures/wide.webp",
      tour: "https://my.matterport.com/show/?m=SxQL3iGyoDo",
      instagramUrl: "https://www.instagram.com/p/MWPOST0001/",
    },
    { format: "360", category: "property" },
  );
  expect(tour2.value).toMatchObject({ instagramUrl: "https://www.instagram.com/p/MWPOST0001/" });
  expect(
    portfolioMedia(
      { alt: "C", src: "/fixtures/wide.webp", tour: "https://youtube.com/watch?v=aqz-KE-bpKQ" },
      { format: "360", category: "property" },
    ).error,
  ).toContain("Matterport, Panoee or Kuula");

  const long = portfolioMedia(
    { alt: "C", src: "/fixtures/wide.webp", video: "https://www.instagram.com/reel/MWOKREEL01/" },
    { format: "long-form", category: "property" },
  );
  expect(long.value).toMatchObject({ instagramUrl: "https://www.instagram.com/reel/MWOKREEL01/" });
  expect(long.value).not.toHaveProperty("video");

  const upload = portfolioMedia(
    { alt: "C", src: "/fixtures/reel.webp", source: "upload", video: "r2:projects/x/secret.mp4" },
    { format: "reel", category: "brand" },
  );
  expect(upload.error).toBe("Upload the reel’s video.");
  const ig = portfolioMedia(
    {
      alt: "C",
      src: "/fixtures/reel.webp",
      source: "instagram",
      instagram: { url: "https://www.instagram.com/reel/OTHER0001/", shortcode: "OTHER0001" },
    },
    { format: "reel", category: "brand" },
  );
  expect(ig.value?.instagram).toEqual({
    url: "https://www.instagram.com/reel/OTHER0001/",
    shortcode: "OTHER0001",
  });
  expect(portfolioMedia({ alt: "C" }, { format: "reel", category: "brand" }).error).toBe(
    "Add the cover image.",
  );
});
