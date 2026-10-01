/**
 * Checks the database holds exactly what content/ holds: reads every table with the public key,
 * maps rows the way the site does (lib/data/rows.ts) and deep-compares with the seed.
 *
 *   node --env-file=.env.local scripts/db-parity.mts
 */
import { createClient } from "@supabase/supabase-js";
import { isDeepStrictEqual } from "node:util";
import { avatarHero, avatars } from "../content/avatars.ts";
import { beforeAfter } from "../content/beforeAfter.ts";
import { caseStudies } from "../content/caseStudies.ts";
import { clients } from "../content/clients.ts";
import { faqs } from "../content/faqs.ts";
import { portfolio } from "../content/portfolio.ts";
import { otherPricing, propertyPricing } from "../content/pricing.ts";
import { reviews } from "../content/reviews.ts";
import { siteSettings } from "../content/site.ts";
import { stats } from "../content/stats.ts";
import * as map from "../lib/data/rows.ts";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false },
});
const rows = async (table: string, select = "*", order = "sort_order") => {
  const { data, error } = await db.from(table).select(select).order(order);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
};
// JSON round-trip drops undefined keys, so optional fields compare equal whether absent or undefined.
const norm = (v: unknown) => JSON.parse(JSON.stringify(v));
const live = <T extends { published: boolean; sortOrder: number }>(r: T[]) =>
  r.filter((x) => x.published).sort((a, b) => a.sortOrder - b.sortOrder);
const placementsSorted = <T extends { placements: string[] }>(r: T[]) =>
  r.map((x) => ({ ...x, placements: [...x.placements].sort() }));

/** Prints every path where the database and the seed disagree. */
const diff = (a: unknown, b: unknown, path: string): void => {
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
      diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
  } else if (!isDeepStrictEqual(a, b))
    console.log(`  ${path}: db=${JSON.stringify(a)} seed=${JSON.stringify(b)}`);
};

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = isDeepStrictEqual(norm(got), norm(want));
  if (!ok) {
    failed++;
    console.log(`✗ ${name}`);
    diff(norm(got), norm(want), name);
  } else console.log(`✓ ${name}`);
};

check("clients", (await rows("clients")).map(map.client), live(clients));
check("stats", (await rows("stats")).map(map.stat), live(stats).map((s) => ({ labelByPlacement: {}, placementOrder: {}, ...s })));
check("faqs", (await rows("faqs")).map(map.faq), live(faqs));
check("reviews", (await rows("reviews")).map(map.review), live(reviews));
check("before-after", (await rows("before_after")).map(map.beforeAfter), live(beforeAfter).map((b) => ({ ...b, inHero: !!b.inHero })));
check("avatars", (await rows("avatars")).map(map.avatar), live(avatars));
check("case-studies", (await rows("case_studies")).map(map.caseStudy), live(caseStudies));
check(
  "portfolio",
  placementsSorted((await rows("portfolio_items", "*, portfolio_placements(placement, sort_order)")).map(map.portfolioItem)),
  placementsSorted(
    live(portfolio).map((p) => ({
      ...p,
      featured: !!p.featured,
      placementOrder: Object.fromEntries(p.placements.map((pl) => [pl, p.placementOrder?.[pl] ?? p.sortOrder])),
    })),
  ),
);
const other = await rows("pricing_other", "*", "key");
check(
  "pricing-property",
  map.propertyPricing(
    await rows("pricing_property", "*", "size_index"),
    await rows("pricing_commercial_tiers", "*", "tier_index"),
    await rows("pricing_twilight", "*", "qty"),
    other.find((r) => r.key === "property_meta")?.value,
  ),
  propertyPricing,
);
check(
  "pricing-other",
  {
    production: other.find((r) => r.key === "production")?.value,
    postProduction: other.find((r) => r.key === "post_production")?.value,
    aiAvatars: other.find((r) => r.key === "ai_avatars")?.value,
  },
  otherPricing,
);
const settings = await rows("site_settings", "*", "key");
check("site", settings.find((r) => r.key === "site")?.value, siteSettings);
check("avatar-hero", settings.find((r) => r.key === "avatar_hero")?.value, avatarHero);
const proof = await rows("proof_strip_pages", "*", "page");
check("proof-strip", proof.filter((p) => p.enabled).map((p) => p.page).sort(), [...siteSettings.proofStripPages].sort());

if (failed) {
  console.log(`\n${failed} mismatch(es)`);
  process.exit(1);
}
console.log("\nDatabase matches content/.");
