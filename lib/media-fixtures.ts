import type { PortfolioItem } from "@/content/types";

/**
 * One item per format and source, for the styleguide's "Media formats" section and the tests
 * (tests/media.e2e.spec.ts). Images are tiny local files (public/fixtures). The Instagram ids
 * match the test mock of the Instagram API (tests/mocks/instagram.mjs); anywhere else they
 * simply fall back to "View on Instagram ↗", which is the behaviour being shown.
 */
const base: Pick<PortfolioItem, "published" | "sortOrder" | "placements" | "sample"> = {
  published: true,
  sortOrder: 0,
  placements: [],
  sample: true,
};

const photos = [1, 2, 3, 4, 5].map((n) => ({
  src: `/fixtures/photo-${n}.webp`,
  alt: `Fixture photo ${n}`,
  width: 1200,
  height: 800,
}));

export const IG_FIXTURE = { ok: "17900000000000001", broken: "17900000000000002" } as const;

export const MEDIA_FIXTURES: PortfolioItem[] = [
  {
    ...base,
    id: "fx-photos",
    title: "Fixture villa, 5 photos",
    category: "property",
    format: "photo",
    media: { ...photos[1], photos, focus: "50% 50%" },
  },
  {
    ...base,
    id: "fx-reel-upload",
    title: "Fixture reel, uploaded",
    category: "property",
    format: "reel",
    media: {
      src: "/fixtures/reel.webp",
      alt: "Fixture reel poster",
      source: "upload",
      video: "r2:site/reels/fixture.mp4",
    },
  },
  {
    ...base,
    id: "fx-reel-ig",
    title: "Fixture reel, our Instagram",
    category: "brand",
    format: "reel",
    media: {
      src: "/fixtures/reel.webp",
      alt: "Fixture Instagram reel poster",
      source: "instagram",
      instagram: {
        url: "https://www.instagram.com/reel/MWOKREEL01/",
        shortcode: "MWOKREEL01",
        id: IG_FIXTURE.ok,
      },
    },
  },
  {
    ...base,
    id: "fx-reel-ig-broken",
    title: "Fixture reel, Instagram unavailable",
    category: "brand",
    format: "reel",
    media: {
      src: "/fixtures/reel.webp",
      alt: "Fixture broken Instagram reel poster",
      source: "instagram",
      instagram: {
        url: "https://www.instagram.com/reel/MWBROKEN01/",
        shortcode: "MWBROKEN01",
        id: IG_FIXTURE.broken,
      },
    },
  },
  {
    ...base,
    id: "fx-reel-other",
    title: "Fixture reel, another account",
    category: "brand",
    format: "reel",
    media: {
      src: "/fixtures/reel.webp",
      alt: "Fixture link-only reel poster",
      source: "instagram",
      instagram: { url: "https://www.instagram.com/reel/OTHER0001/", shortcode: "OTHER0001" },
    },
  },
  {
    ...base,
    id: "fx-youtube",
    title: "Fixture walkthrough, YouTube",
    category: "property",
    format: "long-form",
    media: {
      src: "/fixtures/wide.webp",
      alt: "Fixture YouTube poster",
      video: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    },
  },
  {
    ...base,
    id: "fx-vimeo",
    title: "Fixture walkthrough, Vimeo",
    category: "property",
    format: "long-form",
    media: {
      src: "/fixtures/wide.webp",
      alt: "Fixture Vimeo poster",
      video: "https://vimeo.com/76979871",
    },
  },
  {
    ...base,
    id: "fx-matterport",
    title: "Fixture tour, Matterport",
    category: "property",
    format: "360",
    media: {
      src: "/fixtures/wide.webp",
      alt: "Fixture Matterport cover",
      tour: "https://my.matterport.com/show/?m=SxQL3iGyoDo",
    },
  },
  {
    ...base,
    id: "fx-avatar",
    title: "Fixture AI avatar",
    category: "ai-avatar",
    format: "reel",
    media: {
      src: "/fixtures/reel.webp",
      alt: "Fixture AI avatar poster",
      video: "r2:site/avatars/fixture.mp4",
      instagramUrl: "https://www.instagram.com/p/MWPOST0001/",
    },
  },
];
