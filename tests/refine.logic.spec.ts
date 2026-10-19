import { expect, test } from "@playwright/test";
import { formatFromSize } from "@/lib/admin/sections";
import { oneFormat } from "@/lib/media";
import type { PortfolioItem } from "@/content/types";

/** Site refinement (3 Oct 2026): format defaults and one-format collages. */
test("an upload's shape sets the portfolio format", () => {
  expect(formatFromSize(1920, 1080)).toBe("long-form"); // 16:9
  expect(formatFromSize(1080, 1920)).toBe("reel"); // 9:16
  expect(formatFromSize(3000, 2000)).toBe("photo"); // 3:2
  expect(formatFromSize(2000, 2000)).toBe("photo"); // square → photo
  expect(formatFromSize(1080, 1350)).toBe("reel"); // 4:5 counts as portrait
});

const item = (id: string, format: PortfolioItem["format"]) =>
  ({
    id,
    format,
    title: id,
    category: "property",
    media: { alt: id },
    placements: [],
  }) as unknown as PortfolioItem;

test("hero collages never mix formats: three reels, else one frame", () => {
  expect(oneFormat([item("a", "reel"), item("b", "reel"), item("c", "reel")]).items).toHaveLength(
    3,
  );
  const mixed = oneFormat([item("a", "photo"), item("b", "reel"), item("c", "long-form")]);
  expect(mixed).toMatchObject({ format: "photo" });
  expect(mixed.items.map((i) => i.id)).toEqual(["a"]);
  expect(oneFormat([item("a", "reel"), item("b", "photo")]).items.map((i) => i.id)).toEqual(["a"]);
  expect(oneFormat([]).items).toEqual([]);
});
