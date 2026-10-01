/**
 * The only way pages and components get editable content (guide §0, §18).
 *
 * Each getter reads Supabase through `unstable_cache` with a tag (lib/data/tags.ts). Saving in the
 * admin marks those tags stale (lib/data/refresh.ts) and re-renders the affected pages, so the change
 * is live in seconds with no redeploy. Cached results also refresh hourly as a safety net.
 *
 * When a read fails, the loader logs it and throws. Because tags are marked stale (never expired),
 * Next.js then keeps serving the last version that loaded successfully and retries on the next
 * request (tests/fallback.e2e.spec.ts proves this). The seed in content/ is only used when no
 * database is configured at all (local development without .env.local). Never on an error.
 */
import { unstable_cache } from "next/cache";
import { avatarHero as seedAvatarHero, avatars as seedAvatars } from "@/content/avatars";
import { beforeAfter as seedBeforeAfter } from "@/content/beforeAfter";
import { caseStudies as seedCaseStudies } from "@/content/caseStudies";
import { clients as seedClients } from "@/content/clients";
import { faqs as seedFaqs } from "@/content/faqs";
import { portfolio as seedPortfolio } from "@/content/portfolio";
import { otherPricing as seedOther, propertyPricing as seedProperty } from "@/content/pricing";
import { reviews as seedReviews } from "@/content/reviews";
import { siteSettings as seedSite } from "@/content/site";
import { stats as seedStats } from "@/content/stats";
import type {
  AvatarExample,
  AvatarHero,
  BeforeAfterPair,
  CaseStudy,
  Client,
  Faq,
  OtherPricing,
  PageKey,
  PortfolioItem,
  PortfolioPlacement,
  PropertyPricing,
  Publishable,
  Review,
  SiteSettings,
  Stat,
  StatPlacement,
} from "@/content/types";
import { publicDb } from "@/lib/supabase/public";
import { TAGS, type Tag } from "./tags";
import * as map from "./rows";

const HOUR = 3600;

/** Cached read. Seed only without a database; errors propagate so the last good version stays. */
function source<T>(key: string, tags: Tag[], load: () => Promise<T>, seed: () => T) {
  return unstable_cache(
    async (): Promise<T> => {
      if (!publicDb()) return seed();
      try {
        return await load();
      } catch (err) {
        console.error(
          `[data] ${key}: database read failed; still serving the last version that loaded`,
          err,
        );
        throw err;
      }
    },
    ["data", key],
    { tags, revalidate: HOUR },
  );
}

const live = <T extends Publishable>(rows: T[]) =>
  rows.filter((r) => r.published).sort((a, b) => a.sortOrder - b.sortOrder);

/** Select all rows of a table (RLS already limits anon reads to published rows). */
async function rows(table: string, order = "sort_order") {
  const { data, error } = await publicDb()!.from(table).select("*").order(order);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

/** A required key/value row. Missing means the database is broken, not "use the seed". */
function required<T>(table: string, all: { key: string; value: unknown }[], key: string): T {
  const row = all.find((r) => r.key === key);
  if (!row) throw new Error(`${table}: missing "${key}"`);
  return row.value as T;
}

/* ---------- loaders ---------- */

const loadSite = source<SiteSettings>(
  "site",
  [TAGS.site],
  async () => {
    const [settings, proof] = await Promise.all([
      rows("site_settings", "key"),
      rows("proof_strip_pages", "page"),
    ]);
    const site = required<SiteSettings>("site_settings", settings, "site");
    return {
      ...site,
      proofStripPages: proof.filter((p) => p.enabled).map((p) => p.page) as PageKey[],
    };
  },
  () => seedSite,
);

const loadAvatarHero = source<AvatarHero>(
  "avatar-hero",
  [TAGS.avatars],
  async () => {
    return required<AvatarHero>("site_settings", await rows("site_settings", "key"), "avatar_hero");
  },
  () => seedAvatarHero,
);

const loadClients = source<Client[]>(
  "clients",
  [TAGS.clients],
  async () => (await rows("clients")).map(map.client),
  () => live(seedClients),
);
const loadStats = source<Stat[]>(
  "stats",
  [TAGS.stats],
  async () => (await rows("stats")).map(map.stat),
  () => live(seedStats),
);
const loadFaqs = source<Faq[]>(
  "faqs",
  [TAGS.faqs],
  async () => (await rows("faqs")).map(map.faq),
  () => live(seedFaqs),
);
const loadReviews = source<Review[]>(
  "reviews",
  [TAGS.reviews],
  async () => (await rows("reviews")).map(map.review),
  () => live(seedReviews),
);
const loadBeforeAfter = source<BeforeAfterPair[]>(
  "before-after",
  [TAGS.beforeAfter],
  async () => (await rows("before_after")).map(map.beforeAfter),
  () => live(seedBeforeAfter),
);
const loadAvatars = source<AvatarExample[]>(
  "avatars",
  [TAGS.avatars],
  async () => (await rows("avatars")).map(map.avatar),
  () => live(seedAvatars),
);
const loadCaseStudies = source<CaseStudy[]>(
  "case-studies",
  [TAGS.caseStudies],
  async () => (await rows("case_studies")).map(map.caseStudy),
  () => live(seedCaseStudies),
);

const loadPortfolio = source<PortfolioItem[]>(
  "portfolio",
  [TAGS.portfolio],
  async () => {
    const { data, error } = await publicDb()!
      .from("portfolio_items")
      .select("*, portfolio_placements(placement, sort_order)")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []).map(map.portfolioItem);
  },
  () => live(seedPortfolio),
);

const loadPropertyPricing = source<PropertyPricing>(
  "pricing-property",
  [TAGS.pricing],
  async () => {
    const [sizes, tiers, twilight, other] = await Promise.all([
      rows("pricing_property", "size_index"),
      rows("pricing_commercial_tiers", "tier_index"),
      rows("pricing_twilight", "qty"),
      rows("pricing_other", "key"),
    ]);
    if (!sizes.length || !tiers.length || !twilight.length)
      throw new Error("pricing: property, commercial or twilight table is empty");
    const meta = required<Record<string, unknown>>("pricing_other", other, "property_meta");
    return map.propertyPricing(sizes, tiers, twilight, meta);
  },
  () => seedProperty,
);

const loadOtherPricing = source<OtherPricing>(
  "pricing-other",
  [TAGS.pricing],
  async () => {
    const other = await rows("pricing_other", "key");
    return {
      production: required<OtherPricing["production"]>("pricing_other", other, "production"),
      postProduction: required<OtherPricing["postProduction"]>("pricing_other", other, "post_production"),
      aiAvatars: required<OtherPricing["aiAvatars"]>("pricing_other", other, "ai_avatars"),
    };
  },
  () => seedOther,
);

/* ---------- public getters (signatures unchanged since Phase 0) ---------- */

export async function getSiteSettings() {
  return loadSite();
}

export async function getClients() {
  return loadClients();
}

export async function showsProofStrip(page: PageKey) {
  return (await loadSite()).proofStripPages.includes(page);
}

export async function getStats(placement: StatPlacement) {
  const pos = (s: Stat) => s.placementOrder?.[placement] ?? s.sortOrder;
  return (await loadStats())
    .filter((s) => s.placements.includes(placement))
    .sort((a, b) => pos(a) - pos(b))
    .map((s) => ({ ...s, label: s.labelByPlacement?.[placement] ?? s.label }));
}

export async function getFaqs(page: PageKey) {
  const all = await loadFaqs();
  const forPage = all.filter((f) => f.page === page);
  // FAQs fall back to the seed until the first real ones exist for a page (guide §18.3).
  return forPage.length ? forPage : live(seedFaqs).filter((f) => f.page === page);
}

export async function getReviews(page: PageKey) {
  return (await loadReviews()).filter((r) => r.placements.includes(page));
}

export async function getPortfolio(placement?: PortfolioPlacement) {
  const rowsAll = await loadPortfolio();
  if (!placement) return rowsAll;
  const pos = (p: PortfolioItem) => p.placementOrder?.[placement] ?? p.sortOrder;
  return rowsAll.filter((p) => p.placements.includes(placement)).sort((a, b) => pos(a) - pos(b));
}

export async function getBeforeAfter() {
  return loadBeforeAfter();
}

export async function getAvatarHero() {
  return loadAvatarHero();
}

export async function getAvatars() {
  return loadAvatars();
}

export async function getPropertyPricing() {
  return loadPropertyPricing();
}

export async function getOtherPricing() {
  return loadOtherPricing();
}

export async function getCaseStudies() {
  return loadCaseStudies();
}

export async function getCaseStudy(slug: string) {
  return (await loadCaseStudies()).find((c) => c.slug === slug) ?? null;
}
