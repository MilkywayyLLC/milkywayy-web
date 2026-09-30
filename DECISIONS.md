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
