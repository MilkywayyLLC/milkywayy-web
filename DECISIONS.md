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

## JS budget (owner decision, 30 Sep 2026)
- Guide §12 updated: per page, **our own JS < 35 KB gzipped and total JS < 175 KB gzipped**; Performance ≥ 90 and LCP < 2.5 s unchanged. Reason: Next.js 16 + React 19 alone ship ~131 KB, which left ~19 KB under the old 150 KB total.

## Phase 3 — Production, Property shoots, /book, booking builder
- **Builder logic is pure and separate** (`lib/booking/index.ts`): typed state (`BookingState` → one object per property, ready to POST to the booking API later), a reducer, and rule functions. `normalize()` runs after every change so the state can't hold an invalid combination.
- **Rules as built:** locked commercial services (price `null`, e.g. Basic long-form/360) are forced off and their cards read "Not in {tier}"; turning Videography on selects Short-form; turning both formats off turns Videography off; twilight needs Photography; night or day + night long-form (apartments/villas) forces the Evening slot and disables the others; changing type resets size to that type's default (1 Bed, 2 Bed, Essential).
- **Default state:** one 1 Bed apartment with Photography only (AED 500) and an empty location with example placeholders. The mockup's demo pre-filled Marina Heights and video; pre-filled values would get sent by people who don't notice them, and a preselected AED 1,400 first estimate undercuts "from AED 450".
- **Validation on send:** each property needs a service, a community/area and a building (unit optional). The first invalid card opens and its field gets focus; errors clear as they're fixed.
- **Dates:** next 5 dates (settings `booking.daysAhead`) from tomorrow in Dubai time, skipping Sundays (as in the mockup). Computed on the server; the builder pages revalidate hourly.
- **Reference:** the preview shows "Ref #MW-···· (added when you send)". Sending uses a provisional client-side `MW-####` until Phase 6 saves the lead and returns the server ref. The on-page confirmation keeps a "WhatsApp didn't open? Open it here" link and disappears if the booking is edited.
- **Message wording:** summary lists the unit as "1205, Marina Heights, Dubai Marina"; the WhatsApp message says "Unit 1205, …" (guide §8.4). Dates use the real calendar (the guide's "Thu 2 Oct" example is 2025's).
- **Samples tabs** only show tabs with content; the 360° tour tab appears once 360 samples are placed.
- **Accessibility:** the "Most popular" badge now follows the tier name in the DOM so the card's accessible name starts with "Essential" (found by the e2e tests).
- **Tests:** Playwright 1.63 using the installed Google Chrome (`channel: "chrome"`, no browser download). `npm test` builds and runs everything; `npm run test:logic` runs the 15 rule tests without a server (every price cell in §8.3, twilight, evening lock, Basic lock, multi-property, exact §8.4 message, dates). 34 tests pass, desktop and Pixel 7.
- **Styleguide** now renders the live `BookingBuilder`; the static `BookingDemo` is gone.
- **Measured on staging (Lighthouse mobile ×2):** Home 98–99 / LCP 2.0–2.4 s, Production 99 / 2.3 s, Property shoots 98 / 2.3 s; CLS 0 everywhere. Our JS per route: Home 18.3 KB, Production 17.5 KB, Property shoots 22.5 KB (framework ~131 KB). Home's transfer total (158 KB) includes Next prefetching the Production route's chunk in the background.

## Phase 3 review changes (owner, 30 Sep 2026)
- **Calendar replaces date chips:** inline month calendar (`components/booking/MonthCalendar.tsx`, helpers in `lib/booking/dates.ts`). Monday-first; days before tomorrow, off days and days past the window are `aria-disabled` (still focusable so arrow keys can cross them); prev/next month limited to the window; arrows / Home / End / Page Up / Page Down; 44 px day cells (40 px under 400 px). Time slots sit below as one row of three; the night long-form Evening lock is unchanged, with a short "Evening only" note under the slots.
- **Booking settings** (`site.booking`, admin Site settings in 5B): `slots`, `closedWeekdays`, `windowDays` (60). **Off days are unconfirmed**: the owner's answer arrived as an unfilled template, so Sunday stays off as in the mockup. `[]` = 7 days a week.
- **Property type** is always one row of three; "Villa / townhouse" shows as "Villa" under 560 px (full name kept as the accessible name).
- **Sizes** are one row on desktop/tablet, 3 per row under 560 px. **Commercial tiers** one row, 2 × 2 under 560 px. The overflow bug was an inline `--cols: 4` overriding the responsive rule; choice-card grids now use classes (`cards cols-2|3|4`) and card text wraps.
- **Service options open under their card** (`.svc-grid`): cards share row 1 on desktop and open panels span the rows below with a pointer at the parent card's centre; under 600 px everything stacks in DOM order (card, its panel, next card). Cards carry `aria-controls` to their panel.
- **Mobile summary:** on `/book` at ≤ 900 px a fixed bar (count · estimated total · Review & send) replaces the page's mobile action bar and opens the full summary in a native `<dialog>` bottom sheet (focus trap, Escape, backdrop tap to close, page scroll locked). A failed send from the sheet closes it and focuses the first invalid field. Desktop keeps the sticky side summary. The styleguide renders the builder with `mobileBar={false}`.
- **Builder only on `/book`:** H1 "Build your booking.", own title/description. Property shoots gets a price overview computed from the pricing config (so admin price changes flow through) and every "Price my shoot" / "Build your booking" goes to `/book`. "Book a shoot" is in the header Production dropdown, the mobile menu and the footer.
- **Production dropdown:** the "Production" link still goes to `/production`; a chevron button (keyboard/touch) or hover opens Monthly packages · Property shoots · Book a shoot. Escape or choosing a page closes it and suppresses hover until the pointer leaves (found by tests: hover kept it open after Escape).
- **Samples gallery:** fixed-ratio stage (8:3 desktop, 2:3 phones) with count-aware layouts for 1–5 items; all tab panels rendered stacked and crossfaded (inactive ones `aria-hidden` + `inert`); the global reduced-motion rule removes the fade.
- **Guide updated** (§3, §5, §6.3, §8.1, §8.2, §18.2) to match.
- **Measured on staging:** `/book` Performance 97–99, LCP 2.0–2.4 s (2.6 s once on a cold cache right after deploy), CLS 0, own JS 17.2 KB; Property shoots 97–98, LCP 2.3–2.4 s, own JS 17.6 KB, total 166 KB (includes Next prefetching `/book`). Tests: 43 passing (16 logic, builder flows, phone layout and sheet, navigation, tab height).

## Phase 3 final review (owner, 30 Sep 2026)
- **Calendar fills the card:** `.when` is a size container; when the card is ≥ 560 px wide the calendar stretches and the slots stack in a column beside it, the "Time" label taking the month-header row so the slots line up with the weekdays. Narrower cards keep calendar then a row of three slots. (A container query can't style the container itself, so the grid sits on the inner `.when-in`.)
- **One options panel at a time from 768 px:** per-property UI state `active` (photo / video / none; starts on photo). Clicking a card selects it if needed and shows its panel; clicking a selected card never deselects; 360 has no panel and closes the open one. Deselect with the ✓ corner (`.sc-x`, a sibling button since buttons can't nest; "Remove Photography" etc.; ✕ on hover/focus) or the "Remove …" link inside the panel. All selected panels are rendered and CSS hides the inactive ones from 768 px, so phones (< 768 px, previously < 600 px) keep every panel under its own card with a plain toggle. Cards expose `aria-expanded` for their panel.
- **Option summaries on selected cards:** Photography "+ N twilight" or "No add-ons"; Videography "Short-form + Long-form (day)". Videography's price line shows its running total once selected (was "Choose below").
- **"Book property shoot"** everywhere in navigation (dropdown, mobile menu, footer); `/book` title "Book a Property Shoot in Dubai | Milkywayy" with matching description.
- **Off days confirmed:** Sunday only (default `closedWeekdays: [0]`).
- Tests: 47 passing (adds single-panel behaviour, ✓ corner and Remove link, summaries, 768 px tablet, calendar-beside-slots on desktop and below on phones, phone toggle).
