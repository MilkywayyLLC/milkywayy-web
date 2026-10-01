/**
 * Database rows (snake_case, nullable) → the typed content shapes components use (content/types.ts).
 * The inverse of scripts/seed.mts.
 */
import type {
  AvatarExample,
  BeforeAfterPair,
  CaseStudy,
  Client,
  CommercialTier,
  Faq,
  Lighting,
  PortfolioItem,
  PortfolioPlacement,
  PropertyPricing,
  ResidentialSize,
  Review,
  Stat,
  TwilightQty,
} from "@/content/types";

// Supabase returns untyped JSON rows; each mapper reads the columns it knows.
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const opt = <T>(v: T | null | undefined) => (v === null ? undefined : v);
const base = (r: Row) => ({
  id: String(r.id),
  published: !!r.published,
  sortOrder: Number(r.sort_order ?? 0),
  sample: r.sample ? true : undefined,
});

export const client = (r: Row): Client => ({ ...base(r), name: r.name, logo: opt(r.logo) });

export const stat = (r: Row): Stat => ({
  ...base(r),
  value: r.value,
  label: r.label,
  labelByPlacement: r.label_by_placement ?? {},
  placementOrder: r.placement_order ?? {},
  placements: r.placements ?? [],
});

export const faq = (r: Row): Faq => ({
  ...base(r),
  page: r.page,
  question: r.question,
  answer: r.answer,
  draft: !!r.draft,
});

export const review = (r: Row): Review => ({
  ...base(r),
  name: opt(r.name),
  role: r.role,
  company: opt(r.company),
  rating: Number(r.rating ?? 5),
  text: r.text,
  source: r.source,
  link: opt(r.link),
  placements: r.placements ?? [],
});

export const beforeAfter = (r: Row): BeforeAfterPair => ({
  ...base(r),
  tab: r.tab,
  title: r.title,
  description: r.description,
  before: r.before,
  after: r.after,
  placeholderBeforeFilter: opt(r.placeholder_before_filter),
  inHero: !!r.in_hero,
});

export const avatar = (r: Row): AvatarExample => ({
  ...base(r),
  name: r.name,
  niche: r.niche,
  poster: r.poster,
  clip: opt(r.clip),
});

export const caseStudy = (r: Row): CaseStudy => ({
  ...base(r),
  slug: r.slug,
  client: r.client,
  title: r.title,
  heroLines: r.hero_lines?.length === 2 ? [r.hero_lines[0], r.hero_lines[1]] : undefined,
  summary: r.summary,
  brief: r.brief,
  whatWeDid: r.what_we_did ?? [],
  results: r.results ?? [],
  quote: opt(r.quote),
  cover: r.cover,
  gallery: r.gallery ?? [],
  related: r.related ?? [],
  category: r.category,
});

export const portfolioItem = (r: Row): PortfolioItem => {
  const placements = (r.portfolio_placements ?? []) as {
    placement: PortfolioPlacement;
    sort_order: number;
  }[];
  return {
    ...base(r),
    title: r.title,
    client: opt(r.client),
    category: r.category,
    format: r.format,
    media: r.media,
    duration: opt(r.duration),
    tag: opt(r.tag),
    meta: opt(r.meta),
    featured: !!r.featured,
    placements: placements.map((p) => p.placement),
    placementOrder: Object.fromEntries(placements.map((p) => [p.placement, p.sort_order])),
  };
};

const LONG: Record<string, Lighting> = {
  lf_day: "day",
  lf_night: "night",
  lf_day_night: "dayNight",
};

/** pricing_property + pricing_commercial_tiers + pricing_twilight + property_meta → PropertyPricing. */
export function propertyPricing(
  sizeRows: Row[],
  tierRows: Row[],
  twilightRows: Row[],
  meta: Row,
): PropertyPricing {
  const sizes = (type: "apartment" | "villa"): ResidentialSize[] => {
    const byIndex = new Map<number, ResidentialSize>();
    for (const r of sizeRows.filter((x) => x.type === type)) {
      const s =
        byIndex.get(r.size_index) ??
        ({
          label: r.size_label,
          photo: 0,
          short: 0,
          long: { day: 0, night: 0, dayNight: 0 },
          tour: 0,
        } as ResidentialSize);
      if (r.service in LONG) s.long[LONG[r.service]] = r.price;
      else if (r.service === "photo" || r.service === "short" || r.service === "tour")
        s[r.service as "photo" | "short" | "tour"] = r.price;
      byIndex.set(r.size_index, s);
    }
    return [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
  };
  const tiers: CommercialTier[] = tierRows.map((t) => ({
    label: t.label,
    description: t.description,
    popular: t.popular ? true : undefined,
    photo: t.photo,
    short: t.short,
    long: t.long,
    tour: t.tour,
    includes: {
      photos: t.photos,
      reel: t.reel,
      walkthrough: t.walkthrough,
      tourHotspots: t.tour_hotspots,
    },
  }));
  const twilight = (grp: "standard" | "villa") =>
    Object.fromEntries(
      twilightRows.filter((r) => r.grp === grp).map((r) => [r.qty, r.price]),
    ) as Record<TwilightQty, number>;

  const apartment = sizes("apartment");
  const villa = sizes("villa");
  return {
    currency: "AED",
    apartment: {
      label: meta.apartment.label,
      defaultSize: Math.min(meta.apartment.defaultSize, apartment.length - 1),
      sizes: apartment,
    },
    villa: {
      label: meta.villa.label,
      defaultSize: Math.min(meta.villa.defaultSize, villa.length - 1),
      sizes: villa,
    },
    commercial: {
      label: meta.commercial.label,
      defaultTier: Math.min(meta.commercial.defaultTier, tiers.length - 1),
      tiers,
    },
    twilight: { standard: twilight("standard"), villa: twilight("villa") },
    delivery: meta.delivery,
  };
}
