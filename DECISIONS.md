# Decisions log

Choices not spelled out in `MILKYWAYY_BUILD_GUIDE.md` (v3), or owner answers that change it. Newest last.

## 30 Sep 2026 — kickoff answers from the owner
- **Binghatti removed** from the client list. The work came through an agent; Milkywayy never invoiced Binghatti directly.
- **Reel turnaround is 24–48h everywhere**, including Home step 03 ("Photos in 24 hours, reels in 24–48") and FAQs. "Usually back in hours" is removed from post-production step 04.
- **Draft FAQ edits:** removed "every service page shows … a builder" (Home) and "retainer clients can pay by card automatically" (Post-production); the site has no online payment.
- **Stats** get a per-placement label override (`labelByPlacement`), e.g. "Properties produced" on Post-production.
- **Mockup leftovers ignored:** currency switcher, package tiers, guarantee seal, time-zone band CSS/JS in the mockup are from older versions. Work and About nav go to `/work` and `/about`.
- **Name:** Akash Praseed on the site; legal pages use Milkywayy LLC.
- **Supabase (Phase 5A):** a new project for the website, separate from Milkywayy Desk, under hello@milkywayy.com.
- **Vercel:** staging project under the hello@milkywayy.com account (personal team).

## Pre-launch decisions (must be settled before go-live)
- **Client dashboard.** Production ("Delivery: client dashboard", revisions "inside the dashboard") and Property shoots ("Everything in one dashboard", Client login) promise a dashboard. Guide §15 shuts the old system down after launch with no replacement decided. Either keep the old dashboard running, ship a replacement, or change that copy before launch.

## Build choices
- **Tone via route groups.** `app/(dark)/layout.tsx` and `app/(light)/layout.tsx` set `data-tone` on a wrapper; URLs are unaffected. The header and mobile bar sit inside that wrapper so they inherit the tone.
- **Data access through `lib/data`.** Components never import `content/` directly. Getters return seed data now and become cached Supabase reads with seed fallback in 5A, same signatures.
- **Content types mirror §18.4 tables** (`published`, `sortOrder`, `placements`, `sample`) so the seed can be inserted as-is.
- **No `cacheComponents` yet.** Pages are plain SSG now; the caching model (`"use cache"` + `cacheTag` vs `unstable_cache`) is chosen in 5A when there's a database to cache.
- **Staging lock is double:** metadata `robots: noindex, nofollow` on every page plus an `X-Robots-Tag` header from `next.config.ts`, both off only when `NEXT_PUBLIC_SITE_ENV=production`.
- **Dependencies added in Phase 0:** Prettier (+ tailwind plugin, eslint-config-prettier) only. react-hook-form + zod arrive with the forms, Supabase in 5A, Playwright with the first tests.
- **Radius tokens reset** in Tailwind (`--radius-*: initial`) so nothing can accidentally round a corner; only `rounded-full` (REC dot) remains.

## Phase 1 — design system
- **Component CSS is ported from the mockup** into `app/styles/components.css` (in `@layer components`), keeping the mockup's class names so the two can be compared side by side. React components wrap those classes; Tailwind is for one-off layout. Faster and closer to the approved design than re-expressing every rule as utilities.
- **Class names that collide with Tailwind utilities are banned.** `inline` and `static` were overridden by Tailwind's `display:inline` / `position:static`; renamed to `mbar-inline` and `hdr-static`. Avoid bare utility names (`hidden`, `block`, `flex`, `grid`, `static`, `fixed`, `inline`, `table`, `contents`) as component classes.
- **Hero fitter measures content width, not the line's box.** The mockup measured `scrollWidth` of block-level lines, which equals the column width whenever a line is shorter than the column, so titles never grew past ~98px. `HeroTitle` measures each line at `width: max-content`.
- **`.stack > * { min-width: 0 }`** added so a scroll strip inside a grid can't widen the page (found at 390px).
- **Testimonials use the quote face** (Archivo 600, wdth 86, sentence case) per guide §4.2; the mockup used plain body text.
- **List bullets use `--acc`** (brass on light, champagne on dark) per guide §4.1 "bullets"; the mockup's rate cards used `--fg`.
- **Commercial "Most popular" and featured cards** keep the mockup styling (acc badge, 2px fg border on the featured rate card).
- **Styleguide shows later-phase components statically:** booking builder (open/close only), forms (step switching only, no submit). Logic lands in Phases 3 and 6.
- **Placeholder media** keyed by `PlaceholderKey` in `app/styles/placeholders.css`; every placeholder item is `sample: true` in the seed.
- **Portfolio ordering per placement** (e.g. the Production home row shows the penthouse first rather than the mockup's Marina 2BR) is left to the `portfolio_placements.sort_order` column in 5A.

## Phase 1 review fixes (30 Sep 2026)
- **Headline highlight has no padding on dark** (text-colour only, so both hero lines share a left edge); light keeps `0 0.12em` for the champagne block.
- **In-page anchors are handled in JS** (`components/layout/AnchorScroll.tsx`, mounted in the root layout): smooth scroll offset by the measured sticky header + 16px, hash pushed to history, focus moved to the target, an instant-jump fallback if smooth scrolling stalls, and correct positioning when a page opens with a hash. `scroll-padding-top: 88px` on `html` covers the no-JS case. Reduced motion jumps instantly.

## Phase 2 — shell + Home
- **Shell per tone:** `SiteShell` (header → main → footer → mobile bar) is used by the `(dark)` and `(light)` route-group layouts. The mobile bar's label and target come from `lib/pages.ts` by route; in-page targets use stable section ids (`#get-your-package`, `#build-your-booking`, `#free-test`, `#demo`, `#contact-form`) that Phases 3–5 give their sections.
- **Hero titles are sized on the server.** `lib/heroFit.ts` holds Archivo's measured glyph widths; `HeroTitle` passes the widest line's width in em to CSS (`--em-d`, `--em-l` for light tone, which adds the highlight padding), so the first paint is already fitted and the client only refines it. CLS went from 0.026 to 0.
- **Timecode writes to the DOM directly** and starts on idle; it no longer re-renders React 25×/s.
- **Click-to-play video:** `LiteVideo` embeds YouTube (nocookie), Vimeo (dnt) or Bunny Stream only after a click. Without a playable video it shows a dimmed, non-interactive play mark, never a dead button.
- **Reel filter chips only show categories that have items** (Home shows All / Property / Brand / AI avatar until an editing reel is placed there).
- **Placeholder showreel** carries a visible "Placeholder · showreel coming" label (guide §0).
- **Per-placement ordering** added now (`placementOrder`, mirrors `portfolio_placements.sort_order`) so the Production home row matches the mockup.
- **Performance, measured on Vercel staging (Lighthouse mobile ×3):** Performance 98–99, Accessibility 100, Best Practices 96, LCP 1.9–2.3 s, CLS 0, TBT 10 ms. SEO is 69 on staging only because of the noindex lock; 100 with `NEXT_PUBLIC_SITE_ENV=production`. Best Practices loses points for 404 prefetches of pages not built yet (`/production`, `/contact`, …); clears as those pages land.
- **JS budget is tight:** ~150 KB gzipped per page, of which ~131 KB is the Next.js 16 + React 19 framework baseline; our code is ~19 KB. Open question for the owner (see Phase 2 summary).
