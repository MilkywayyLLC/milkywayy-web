/**
 * Production build check (owner, 4 Oct 2026): nothing sample, placeholder or draft goes live.
 *
 *   Runs before every build (package.json "prebuild"). It only checks when
 *   NEXT_PUBLIC_SITE_ENV=production; staging, previews and local builds skip it.
 *   By hand:  NEXT_PUBLIC_SITE_ENV=production node --env-file=.env.local scripts/launch-check.mts
 *
 * It reads the published content the way the site does (the public key, the same "real items
 * first" rule from lib/data/sample.ts) and fails if a public page would still show:
 *   - a sample portfolio item, review, before/after pair, avatar or case study
 *   - fewer than 3 real reviews on Home (the samples and their label would show)
 *   - the showreel placeholder, or Adam's placeholder hero
 *   - a FAQ marked "Wording not final" (or no FAQs, so the draft seed set shows)
 *   - the Privacy/Terms or About draft labels, or unconfirmed stats (content/launch.ts)
 * Each problem says what to do in the admin.
 */
import type { PortfolioCategory, PortfolioFormat } from "../content/types.ts";
import { LAUNCH } from "../content/launch.ts";
import { flags } from "../lib/flags.ts";
import { realFirst, REAL_REVIEWS_NEEDED } from "../lib/data/sample.ts";
import {
  ALL_PLACEMENTS,
  legacyState,
  libFields,
  placementByKey,
  resolve,
  type Mode,
  type Pin,
  type PlacementState,
} from "../lib/placements.ts";
import { postHeroReels } from "../lib/post-hero.ts";

if (process.env.NEXT_PUBLIC_SITE_ENV !== "production") {
  console.log("[launch-check] not a production build: skipped");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const problems: string[] = [];
if (!url || !key) {
  console.error("[launch-check] production needs NEXT_PUBLIC_SUPABASE_URL and _ANON_KEY");
  process.exit(1);
}

type Row = Record<string, unknown> & { sample?: boolean; published?: boolean };
async function read(path: string): Promise<Row[]> {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key!, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return (await r.json()) as Row[];
}

/** Pins and modes (media library). Null before that migration: the old placements stand in. */
async function readPlacements(): Promise<PlacementState | null> {
  try {
    const [pins, modes] = await Promise.all([
      read("placement_pins?select=section,slot,item_id"),
      read("placement_modes?select=section,mode"),
    ]);
    return {
      pins: pins as unknown as Pin[],
      modes: Object.fromEntries(modes.map((m) => [m.section as string, m.mode as Mode])),
    };
  } catch (e) {
    if (/PGRST205|42P01|could not find the table/i.test(String(e))) return null;
    throw e;
  }
}

const [portfolio, reviews, beforeAfter, avatars, caseStudies, faqs, settings, placed] =
  await Promise.all([
    read("portfolio_items?select=*,portfolio_placements(placement,sort_order)&order=sort_order"),
    read("reviews?select=id,name,sample,published,placements"),
    read("before_after?select=id,title,sample,published"),
    read("avatars?select=id,name,sample,published"),
    read("case_studies?select=id,slug,sample,published"),
    read("faqs?select=id,page,question,draft,published"),
    read("site_settings?select=key,value"),
    readPlacements(),
  ]);
const live = (rows: Row[]) => rows.filter((r) => r.published);
const shownSamples = (rows: Row[], min = 1) => realFirst(live(rows), min).filter((r) => r.sample);

// Portfolio: every section a page shows, resolved the way the pages do (lib/data getPortfolio /
// getPlaced: media-library pins and automatic rules; older keys keep their placement rows).
type PlacementRow = { placement: string; sort_order: number };
const items = portfolio.map((r) => {
  const rows = (r.portfolio_placements as PlacementRow[]) ?? [];
  return {
    id: String(r.id),
    title: String(r.title ?? r.id),
    published: !!r.published,
    sortOrder: Number(r.sort_order ?? 0),
    format: r.format as PortfolioFormat,
    category: r.category as PortfolioCategory,
    media: r.media as { video?: string } | undefined,
    placements: rows.map((p) => p.placement),
    placementOrder: Object.fromEntries(rows.map((p) => [p.placement, p.sort_order])),
    ...libFields(r),
  };
});
const state = placed ?? legacyState(items);
const portfolioProblem = (where: string, n: number) =>
  problems.push(
    `Portfolio "${where}": ${n} sample item(s) would show. Add real work for it in Admin → Portfolio / Placements (samples hide by themselves once there is one), or unpublish them.`,
  );
const resolvedSamples = (key: string) => {
  const def = placementByKey(key)!;
  const r = resolve(def, items, state);
  return { legacy: r.legacy, samples: r.items.filter((x) => x.sample) };
};
for (const def of ALL_PLACEMENTS) {
  // Covered below: the before/after check, the showreel and Adam's hero settings.
  if (def.source === "before-after" || def.key === "post-hero-reels") continue;
  const { legacy, samples } = resolvedSamples(def.key);
  if (!legacy && samples.length) portfolioProblem(def.key, samples.length);
}
// Post-production hero: its reels first, then any published reel (lib/post-hero).
const postHero = postHeroReels(
  resolve(placementByKey("post-hero-reels")!, items, state).items,
  realFirst(items.filter((x) => x.published).sort((a, b) => a.sortOrder - b.sortOrder)),
).filter((x) => x.sample);
if (postHero.length) portfolioProblem("post-hero-reels", postHero.length);
// Property shoots hero still reads its placement rows.
const propHero = shownSamples(items.filter((x) => x.placements.includes("property-hero")));
if (propHero.length) portfolioProblem("property-hero", propHero.length);

const home = reviews.filter((r) => ((r.placements as string[]) ?? []).includes("home"));
const realHome = live(home).filter((r) => !r.sample).length;
if (realHome < REAL_REVIEWS_NEEDED)
  problems.push(
    `Reviews on Home: ${realHome} real, ${REAL_REVIEWS_NEEDED} needed. Add real Google reviews in Admin → Reviews; the samples and their "Sample text" label disappear at ${REAL_REVIEWS_NEEDED}.`,
  );

for (const [rows, what, where] of [
  [beforeAfter, "before/after pair(s)", "Admin → Before / after"],
  [avatars, "avatar example(s)", "Admin → AI avatars"],
  // Hidden while the flag is off (lib/flags): /work/<slug> 404s, so nothing shows.
  [flags.caseStudies ? caseStudies : [], "case stud(ies)", "Admin → Case studies"],
] as const) {
  const s = shownSamples(rows as Row[]);
  if (s.length)
    problems.push(
      `${s.length} sample ${what} would show: add real ones in ${where}, or unpublish them.`,
    );
}

const setting = (k: string) => settings.find((s) => s.key === k)?.value as Record<string, unknown>;
const site = setting("site");
// A pinned library video takes over from Site settings (lib/data getShowreel / avatarHeroPlaced).
const pinnedShowreel = resolve(placementByKey("home-showreel")!, items, state).items[0];
const showreelVideo = pinnedShowreel
  ? pinnedShowreel.media?.video
  : (site?.showreel as { video?: string } | undefined)?.video;
if (!showreelVideo)
  problems.push(
    'Home showreel: not set, so the "Placeholder · showreel coming" label shows. Admin → Site settings → Showreel (video link + poster).',
  );
const pinnedAvatarHero = resolve(placementByKey("avatars-hero")!, items, state).items[0];
if (
  pinnedAvatarHero
    ? pinnedAvatarHero.sample
    : (setting("avatar_hero") as { sample?: boolean } | undefined)?.sample
)
  problems.push(
    "AI avatars hero (Adam): still the placeholder. Admin → AI avatars → Edit the hero.",
  );

for (const page of ["home", "production", "property-shoots", "post-production", "ai-avatars"]) {
  const forPage = live(faqs).filter((f) => f.page === page);
  if (!forPage.length)
    problems.push(
      `FAQs on ${page}: none published, so the draft seed questions show. Add them in Admin → FAQs.`,
    );
  else if (forPage.some((f) => f.draft))
    problems.push(
      `FAQs on ${page}: ${forPage.filter((f) => f.draft).length} still "Wording not final". Finalise and untick it in Admin → FAQs.`,
    );
}

if (!LAUNCH.legalReviewed)
  problems.push(
    'Privacy and Terms still show "Draft · to be reviewed". After the review, set LAUNCH.legalReviewed (content/launch.ts).',
  );
if (!LAUNCH.aboutConfirmed)
  problems.push(
    'About still shows "Draft · owner to confirm". Once confirmed, set LAUNCH.aboutConfirmed.',
  );
if (!LAUNCH.statsConfirmed)
  problems.push(
    "Stats not confirmed. Check every number in Admin → Stats, then set LAUNCH.statsConfirmed.",
  );

if (problems.length) {
  console.error(
    `\n[launch-check] ${problems.length} thing(s) would show as sample or draft on milkywayy.com:\n`,
  );
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("\nFix them (see LAUNCH.md → Content), then build again.\n");
  process.exit(1);
}
console.log("[launch-check] production content is all real: OK");
