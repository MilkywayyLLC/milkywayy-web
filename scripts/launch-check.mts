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
import { LAUNCH } from "../content/launch.ts";
import { realFirst, REAL_REVIEWS_NEEDED } from "../lib/data/sample.ts";

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

const [portfolio, reviews, beforeAfter, avatars, caseStudies, faqs, settings] = await Promise.all([
  read("portfolio_items?select=id,title,sample,published,portfolio_placements(placement)"),
  read("reviews?select=id,name,sample,published,placements"),
  read("before_after?select=id,title,sample,published"),
  read("avatars?select=id,name,sample,published"),
  read("case_studies?select=id,slug,sample,published"),
  read("faqs?select=id,page,question,draft,published"),
  read("site_settings?select=key,value"),
]);
const live = (rows: Row[]) => rows.filter((r) => r.published);
const shownSamples = (rows: Row[], min = 1) => realFirst(live(rows), min).filter((r) => r.sample);

// Portfolio: every placement a page uses (lib/data getPortfolio).
const PLACEMENTS = [
  "home-reels",
  "home-row-production",
  "home-row-post",
  "home-row-avatars",
  "production-hero",
  "property-hero",
  "property-gallery-photo",
  "property-gallery-video",
  "post-hero",
  "post-service-cards",
  "work",
];
for (const p of PLACEMENTS) {
  const inPlacement = portfolio.filter((r) =>
    ((r.portfolio_placements as { placement: string }[]) ?? []).some((x) => x.placement === p),
  );
  const s = shownSamples(inPlacement);
  if (s.length)
    problems.push(
      `Portfolio "${p}": ${s.length} sample item(s) would show. Add real work for this placement in Admin → Portfolio (samples hide by themselves once there is one), or unpublish them.`,
    );
}

const home = reviews.filter((r) => ((r.placements as string[]) ?? []).includes("home"));
const realHome = live(home).filter((r) => !r.sample).length;
if (realHome < REAL_REVIEWS_NEEDED)
  problems.push(
    `Reviews on Home: ${realHome} real, ${REAL_REVIEWS_NEEDED} needed. Add real Google reviews in Admin → Reviews; the samples and their "Sample text" label disappear at ${REAL_REVIEWS_NEEDED}.`,
  );

for (const [rows, what, where] of [
  [beforeAfter, "before/after pair(s)", "Admin → Before / after"],
  [avatars, "avatar example(s)", "Admin → AI avatars"],
  [caseStudies, "case stud(ies)", "Admin → Case studies"],
] as const) {
  const s = shownSamples(rows as Row[]);
  if (s.length)
    problems.push(
      `${s.length} sample ${what} would show: add real ones in ${where}, or unpublish them.`,
    );
}

const setting = (k: string) => settings.find((s) => s.key === k)?.value as Record<string, unknown>;
const site = setting("site");
if (!(site?.showreel as { video?: string } | undefined)?.video)
  problems.push(
    'Home showreel: not set, so the "Placeholder · showreel coming" label shows. Admin → Site settings → Showreel (video link + poster).',
  );
if ((setting("avatar_hero") as { sample?: boolean } | undefined)?.sample)
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
