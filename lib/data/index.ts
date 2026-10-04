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
import type { SupabaseClient } from "@supabase/supabase-js";
import { draftMode } from "next/headers";
import { cache } from "react";
import { alert } from "@/lib/monitoring/alert";
import { publicDb } from "@/lib/supabase/public";
import { TAGS, type Tag } from "./tags";
import * as map from "./rows";
import { realFirst, REAL_REVIEWS_NEEDED } from "./sample";

const HOUR = 3600;

/** Unsaved-to-the-site versions of the single documents, edited in the admin (table `drafts`). */
type Drafts = Map<string, unknown>;

/**
 * A data source: a cached public read, or, in preview (Next.js Draft Mode, switched on from the
 * admin), an uncached read as the signed-in admin, so unpublished rows and drafts show.
 */
function source<T>(
  key: string,
  tags: Tag[],
  load: (db: SupabaseClient, drafts: Drafts) => Promise<T>,
  seed: () => T,
) {
  const cached = unstable_cache(
    async (): Promise<T> => {
      const db = publicDb();
      if (!db) return seed();
      try {
        return await load(db, new Map());
      } catch (err) {
        console.error(
          `[data] ${key}: database read failed; still serving the last version that loaded`,
          err,
        );
        void alert({
          kind: "database read failed",
          message: `${key}: ${err instanceof Error ? err.message : String(err)}`,
          where: "site data (the site keeps showing the last good version)",
        });
        throw err;
      }
    },
    ["data", key],
    { tags, revalidate: HOUR },
  );
  // One result per render: every component on a page that reads this source gets the same
  // promise, so a refresh can never leave one part of the page on older data than another.
  return cache(async (): Promise<T> => {
    const preview = await previewDb();
    return preview ? load(preview.db, await preview.drafts()) : cached();
  });
}

/** The admin's session client when Draft Mode is on, else null (also outside a request). */
const previewDb = cache(async () => {
  try {
    if (!(await draftMode()).isEnabled) return null;
  } catch {
    return null;
  }
  const { sessionDb } = await import("@/lib/supabase/server");
  const db = await sessionDb();
  if (!db) return null;
  const drafts = cache(async (): Promise<Drafts> => {
    const { data } = await db.from("drafts").select("key, value");
    return new Map((data ?? []).map((d) => [d.key, d.value]));
  });
  return { db, drafts };
});

const live = <T extends Publishable>(rows: T[]) =>
  rows.filter((r) => r.published).sort((a, b) => a.sortOrder - b.sortOrder);

/** Select all rows of a table (for the public client RLS limits this to published rows). */
async function rows(db: SupabaseClient, table: string, order = "sort_order") {
  const { data, error } = await db.from(table).select("*").order(order);
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
  async (db, drafts) => {
    const [settings, proof] = await Promise.all([
      rows(db, "site_settings", "key"),
      rows(db, "proof_strip_pages", "page"),
    ]);
    const site =
      (drafts.get("site") as SiteSettings | undefined) ??
      required<SiteSettings>("site_settings", settings, "site");
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
  async (db, drafts) =>
    (drafts.get("avatar_hero") as AvatarHero | undefined) ??
    required<AvatarHero>("site_settings", await rows(db, "site_settings", "key"), "avatar_hero"),
  () => seedAvatarHero,
);

const loadClients = source<Client[]>(
  "clients",
  [TAGS.clients],
  async (db) => (await rows(db, "clients")).map(map.client),
  () => live(seedClients),
);
const loadStats = source<Stat[]>(
  "stats",
  [TAGS.stats],
  async (db) => (await rows(db, "stats")).map(map.stat),
  () => live(seedStats),
);
const loadFaqs = source<Faq[]>(
  "faqs",
  [TAGS.faqs],
  async (db) => (await rows(db, "faqs")).map(map.faq),
  () => live(seedFaqs),
);
const loadReviews = source<Review[]>(
  "reviews",
  [TAGS.reviews],
  async (db) => (await rows(db, "reviews")).map(map.review),
  () => live(seedReviews),
);
const loadBeforeAfter = source<BeforeAfterPair[]>(
  "before-after",
  [TAGS.beforeAfter],
  async (db) => (await rows(db, "before_after")).map(map.beforeAfter),
  () => live(seedBeforeAfter),
);
const loadAvatars = source<AvatarExample[]>(
  "avatars",
  [TAGS.avatars],
  async (db) => (await rows(db, "avatars")).map(map.avatar),
  () => live(seedAvatars),
);
const loadCaseStudies = source<CaseStudy[]>(
  "case-studies",
  [TAGS.caseStudies],
  async (db) => (await rows(db, "case_studies")).map(map.caseStudy),
  () => live(seedCaseStudies),
);

const loadPortfolio = source<PortfolioItem[]>(
  "portfolio",
  [TAGS.portfolio],
  async (db) => {
    const { data, error } = await db
      .from("portfolio_items")
      .select("*, portfolio_placements(placement, sort_order)")
      .order("sort_order");
    if (error) throw new Error(`portfolio_items: ${error.message}`);
    return (data ?? []).map(map.portfolioItem);
  },
  () => live(seedPortfolio),
);

const loadPropertyPricing = source<PropertyPricing>(
  "pricing-property",
  [TAGS.pricing],
  async (db, drafts) => {
    const draft = drafts.get("pricing_property") as PropertyPricing | undefined;
    if (draft) return draft;
    const [sizes, tiers, twilight, other] = await Promise.all([
      rows(db, "pricing_property", "size_index"),
      rows(db, "pricing_commercial_tiers", "tier_index"),
      rows(db, "pricing_twilight", "qty"),
      rows(db, "pricing_other", "key"),
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
  async (db, drafts) => {
    const draft = drafts.get("pricing_other") as OtherPricing | undefined;
    if (draft) return draft;
    const other = await rows(db, "pricing_other", "key");
    return {
      production: required<OtherPricing["production"]>("pricing_other", other, "production"),
      postProduction: required<OtherPricing["postProduction"]>(
        "pricing_other",
        other,
        "post_production",
      ),
      aiAvatars: required<OtherPricing["aiAvatars"]>("pricing_other", other, "ai_avatars"),
    };
  },
  () => seedOther,
);

export type SeoOverride = { title?: string; description?: string; ogImage?: string };
const loadSeo = source<Record<string, SeoOverride>>(
  "seo",
  [TAGS.seo],
  async (db) =>
    Object.fromEntries(
      (await rows(db, "seo_pages", "page")).map((r) => [
        r.page,
        {
          title: r.title || undefined,
          description: r.description || undefined,
          ogImage: r.og_image || undefined,
        },
      ]),
    ),
  () => ({}),
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
  return realFirst(
    (await loadReviews()).filter((r) => r.placements.includes(page)),
    REAL_REVIEWS_NEEDED,
  );
}

export async function getPortfolio(placement?: PortfolioPlacement) {
  const rowsAll = await loadPortfolio();
  if (!placement) return realFirst(rowsAll);
  const pos = (p: PortfolioItem) => p.placementOrder?.[placement] ?? p.sortOrder;
  return realFirst(
    rowsAll.filter((p) => p.placements.includes(placement)).sort((a, b) => pos(a) - pos(b)),
  );
}

export async function getBeforeAfter() {
  return realFirst(await loadBeforeAfter());
}

export async function getAvatarHero() {
  return loadAvatarHero();
}

export async function getAvatars() {
  return realFirst(await loadAvatars());
}

export async function getPropertyPricing() {
  return loadPropertyPricing();
}

export async function getOtherPricing() {
  return loadOtherPricing();
}

export async function getCaseStudies() {
  return realFirst(await loadCaseStudies());
}

/** A sample case study stops existing (404) once a real one is published. */
export async function getCaseStudy(slug: string) {
  return (await getCaseStudies()).find((c) => c.slug === slug) ?? null;
}

/** Admin overrides for a page's title, description and share image (seo_pages). */
export async function getSeoOverride(key: string): Promise<SeoOverride> {
  return (await loadSeo())[key] ?? {};
}
