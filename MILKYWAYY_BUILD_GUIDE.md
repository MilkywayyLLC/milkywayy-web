# Milkywayy Website — Build Guide for Claude Code

Version 3 · 30 Sep 2026 · Owner: Akash Praseed (Milkywayy LLC)

This is the full brief for building the new milkywayy.com. Read it end to end before writing code.

**The approved design is `reference/site-mockup.html`.** Open it in a browser. It is a clickable six-page mockup (Home, Production, Property shoots, Post-production, AI avatars, Contact) with the final layout, copy, colours, type and interactions. Match it closely. Copy in the mockup is final unless it is marked with a dashed "sample" / "draft" label. Where this guide and the mockup disagree, this guide wins.

The mockup is a single hand-written HTML file. Rebuild it properly as a Next.js site; do not paste its HTML/JS into the project.

---

## 0. How to work

- **New repo, from scratch** (`milkywayy-web`). Do not touch the current milkywayy.com codebase. The current site stays live until the owner approves the new one.
- **Work in phases (section 14).** After each phase: run the site, check it at 390 px and 1440 px, commit, then stop with a short summary and wait for the owner's go-ahead.
- **Ask before** adding a paid service, a dependency not listed in section 2, or changing any decision in this guide.
- **Everything the owner may want to change lives in the database and is edited in the admin panel (section 18)**: portfolio, reels, before/after pairs, AI avatar examples, testimonials, FAQs, stats, client names, prices, contact details, SEO text. Components never hard-code these. Typed files under `content/` hold the **seed data** (the mockup's copy and prices) used to fill the database on first run and as a fallback if the database is unreachable. Fixed page copy (headlines, section intros) stays in code.
- **Missing content** gets a clearly marked sample in the UI, a `// TODO(owner):` comment in `content/`, and a line in `CONTENT_TODO.md`. Never ship lorem ipsum.
- Log any decision you make that this guide doesn't cover in `DECISIONS.md`.

---

## 1. The business

Milkywayy LLC is a Dubai content studio (Sharjah Media City free zone licence). Creating content since 2020. Three services:

| Service | Buyer | Where | How they convert | Pricing shown on site |
|---|---|---|---|---|
| **Production** (shoot + edit): monthly packages, and single property shoots | UAE real estate agencies, developers, brands | UAE | Form or booking builder → WhatsApp | Packages "from AED 4,000 a month". Property shoots: full price calculator |
| **Post-production** (remote editing): photo edits, short-form, long-form, AI avatar generation (white-label) | Media companies, agencies, creators worldwide | Global | Qualifying form → 15-min call → free test edit | "Starting from" per-edit rates in USD |
| **AI avatars**: custom AI presenter + monthly videos, optional scripting and strategy | Founders, agents, clinics, brands that don't want to be on camera | Everyone | Demo form → call | Structure only, "launch pricing, set on your demo call" |

The owner prices each client individually. The site's job is to make the right visitor want to talk, not to replace the conversation. **No online payment anywhere on the new site.** Bookings and leads go to WhatsApp / call / email; payment is invoiced after delivery.

---

## 2. Tech stack

| Area | Choice | Notes |
|---|---|---|
| Framework | **Next.js (latest stable, App Router) + TypeScript (strict)** | Static/SSG marketing pages, server-rendered so search engines and AI crawlers see full content |
| Styling | **Tailwind CSS** + CSS variables for the tokens in section 4 | Matches the owner's current stack |
| Fonts | `next/font/google`: **Archivo** (variable, `wdth` and `wght` axes) and **DM Mono** (400, 500) | Self-hosted, no layout shift |
| Forms | `react-hook-form` + `zod` | Shared schemas, client and server |
| Database, auth, files | **Supabase** (Postgres + Auth + Storage, Row-Level Security) | Same stack the owner already planned for Milkywayy Desk. Free tier to start |
| Content | Supabase tables, edited in the admin panel; `content/` seed files | Website reads with cached fetches; saving in admin triggers on-demand revalidation (`revalidateTag`) so changes are live in seconds, no redeploy |
| Video | Upload to **Bunny Stream** (or Mux) from the admin, or paste a YouTube/Vimeo link | Never serve large video files from Supabase Storage or the site itself |
| Images | `next/image`, AVIF/WebP, explicit sizes | Hero media `priority`, rest lazy |
| Video | Click-to-play: poster first, load the player on click | No heavy autoplay. Only exception: a muted hero loop ≤ 1.5 MB |
| Leads | `app/api/lead/route.ts` → Supabase `leads` table + notification webhook (section 11) | Leads also visible in the admin panel |
| Analytics | Meta Pixel + Conversions API, GA4, Microsoft Clarity | Section 13 |
| Lint/format | ESLint + Prettier | |
| Tests | Playwright smoke tests: every page renders, every form and the booking builder produce the right output | |
| Staging | **Vercel**, `noindex` via env | Production hosting (AWS / Cloudflare DNS) decided at launch |

Do not add: UI kits (MUI, Chakra, full shadcn), heavy animation libraries (ask first), jQuery, CMS SDKs.

---

## 3. Routes and page tones

Each page has one tone: **dark** (black) or **light** (gallery white). Dark pages carry the Dubai production work (footage looks best on black, matches the Meta ad creative). Light pages are for editing and AI buyers, who judge detail and want calm and clarity.

| Nav label | Route | Page | Tone |
|---|---|---|---|
| Logo | `/` | Home | dark |
| Production | `/production` | Monthly production packages | dark |
| Property shoots | `/property-shoots` | Property shoots: short hero, booking builder (`#booking`), samples, dashboard, compare, FAQ *(updated 1 Oct 2026)* | dark |
| Post-production | `/post-production` | Global editing | light |
| — | `/post-production/free-test` | Free test form only | light |
| AI avatars | `/ai-avatars` | AI presenter service | light |
| Work | `/work`, `/work/[slug]` | Portfolio + case studies | dark |
| About | `/about` | Founder, story, team | dark |
| Contact (button) | `/contact` | Contact form | light |
| Client login | external `NEXT_PUBLIC_CLIENT_LOGIN_URL` | Existing dashboard | — |
| — | `/privacy`, `/terms` | Legal (TODO owner text) | light |

**No Pricing page and no Pricing nav item** (the owner quotes individually). Blog is phase 2: leave it out, keep the layout ready.

Also: `app/sitemap.ts`, `app/robots.ts`, `public/llms.txt`, `not-found.tsx`. Redirects (301, live now): `/production/property-shoots`, `/book` and `/booking` → `/property-shoots`. At launch also `/dashboard → NEXT_PUBLIC_CLIENT_LOGIN_URL`.

---

## 4. Design system — "Viewfinder"

Bold condensed uppercase headlines, camera-viewfinder corner brackets on media, timecodes and a small blinking red REC dot, monospaced labels, square corners. Production-first, premium, readable. Copy exact values from the mockup's `:root` and `[data-tone]` blocks.

### 4.1 Tone tokens

Set `data-tone="dark|light"` on the page's root layout wrapper (and on header + mobile bar so they match). Components only use tokens.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#111111` | `#F5F4F0` | Page background |
| `--surface` | `#191919` | `#FFFFFF` | Cards, forms |
| `--surface-2` | `#222120` | `#ECE9E2` | Alternate section background (`.alt`) |
| `--line` | `#2E2D2B` | `#DAD6CD` | Borders, dividers |
| `--fg` | `#EDEDEA` | `#111110` | Text |
| `--muted` | `#8E8C87` | `#5F5A52` | Secondary text |
| `--btn` / `--btn-ink` | `#E6D3A3` / `#111111` | `#111110` / `#F5F4F0` | Primary button |
| `--acc` | `#E6D3A3` (champagne) | `#7A5C2E` (brass) | Kickers, links, bullets, active states, focus ring |
| `--hl-bg` / `--hl-fg` | transparent / `#E6D3A3` | `#E6D3A3` / `#111110` | Headline highlight: champagne text on dark, champagne block behind black text on light |
| `--rec` | `#E5484D` | `#E5484D` | REC dot only |

Rules: champagne is never text on light backgrounds. One accent per view. Footer is always dark. Final CTA band: champagne background with black text on dark pages; black background with champagne primary button on light pages. Alternate sections use `--surface-2` for rhythm inside a page.

### 4.2 Typography

| Role | Font | Settings |
|---|---|---|
| Display (h1, h2, h3, prices, stats, tier names) | Archivo | `font-variation-settings: "wdth" 68`, weight 800, uppercase, line-height ~0.95 |
| Sub-display (h3, step titles) | Archivo | `"wdth" 74`, weight 700, uppercase |
| Founder quote, testimonials | Archivo | `"wdth" 86`, weight 600, sentence case |
| Body | Archivo | `"wdth" 100`, 16–18 px, line-height 1.55, max ~60 characters |
| Labels, eyebrows, timecodes, meta, prices in summaries | DM Mono | 500, 11–13 px, uppercase, letter-spacing 0.06–0.1em |

h2: `clamp(2.1rem, 4.6vw, 3.8rem)`. Headings use `text-wrap: balance`.

### 4.3 Hero title rule (important)

**Every page's hero title is exactly two lines on every device.** Each line is its own span that never wraps (`white-space: nowrap`). The font size is fitted so the longest line fills the copy column: implement a small client component that measures the lines after fonts load and on resize, sets the size to `columnWidth / widestLineAt100px * 100 * 0.98`, capped at ~124 px (and roughly `0.16 × viewport height + 40`), min 34 px. Fallback before JS: container query units, `font-size: min(calc(100cqi / (chars × 0.54)), 7.6rem)`. Hero titles:

| Page | Line 1 | Line 2 (highlighted part in bold) |
|---|---|---|
| Home | Content that **sells** | property & brands. |
| Production | Monthly content, | **shot & edited.** |
| Property shoots | Don't just list. | **Dominate.** |
| Post-production | Your remote | **edit team.** |
| AI avatars | Meet Adam. | **He isn't real.** |
| Contact | Tell us what | you need. |

### 4.4 Shape, spacing, motion

- Radius **0** everywhere except the REC dot and the WhatsApp message preview bubble.
- 8 px grid. Section padding `clamp(64px, 9vw, 120px)`. Max width 1200 px, side gutter 24 px (16 px under 400 px).
- 1 px borders. No shadows, no gradients on UI.
- Motion 150–250 ms: buttons lift 1 px, REC dot blinks (1.4 s steps), home hero timecode counts up. Respect `prefers-reduced-motion`.

### 4.5 Components (all shown in the mockup)

`ViewfinderFrame` (media + corner brackets + optional timecode, tag, square play button) · `Button` (primary / ghost / link) · `Eyebrow` (with optional REC dot) · `ProofStrip` (client names in display type + 5.0 Google rating) · `NeedSelector` (home hero "What do you need?" list) · `ServiceRow` (home "doors") · `ReelStrip` (horizontal 9:16 reels, scroll-snap, filter chips) · `StatsBand` · `Steps` (4 or 5 columns) · `FounderBlock` · `Testimonials` · `FAQ` (accordion + FAQPage JSON-LD) · `CTABand` · `IncludedGrid` · `PackagesBand` · `BookingBuilder` (section 8) · `BeforeAfter` (drag slider with tabs above it) · `ServiceCards4` · `RateCards` · `FreeTestForm` (3 steps) · `LeadForm` · `AvatarReveal` · `DashboardPreview` · `CompareTable` · `Header` (sticky, tone-aware, mobile full-screen menu) · `MobileActionBar` (WhatsApp + page CTA, fixed bottom on phones) · `Footer`.

Build a `/styleguide` route (noindex, not in sitemap) showing every token and component in both tones: this is the Phase 1 review page.

---

## 5. Global elements

- **Header** (tone of the page): logo "MILKYWAYY" with blinking REC dot · Production · Property shoots · Post-production · AI avatars · Work · About · Client login · WhatsApp icon · **Get a quote** button (→ /contact). No dropdown. Mobile: logo, Get a quote, menu → full-screen menu with the same six items, Get a quote, Client login, WhatsApp. While the menu is open, fixed bottom bars are hidden and the booking sheet closes.
- **Mobile action bar** (phones only): WhatsApp icon + the page's main action: Home "Get a quote" · Production "Get your package" · Post-production "Book a free test" · AI avatars "Book a demo". On `/property-shoots` it is replaced by the booking bar (property count, estimated total, **Review & send** → bottom sheet with the full summary, WhatsApp preview and send button).
- **WhatsApp links**: `https://wa.me/971507263306?text=` + encoded "Hi Milkywayy, I came from the {page} page." Fire `Contact` event.
- **Footer** (always dark): logo + "A Dubai content studio. Production in the UAE, editing and AI presenters worldwide." · Services (incl. Book property shoot) · Studio (Work, About, Contact) · Follow (Instagram @milkywayy_com, LinkedIn milkywayy-com, Client login) · "© {year} Milkywayy LLC · Sharjah Media City".
- **Proof strip** is on Home and Production (owner, 1 Oct 2026). The owner will decide per page: an on/off toggle per page in the admin panel.

---

## 6. Page specifications

Follow the mockup section by section. Summary:

### 6.1 Home (dark)
1. Hero: eyebrow "Dubai content studio · Clients worldwide", two-line title, lede, **NeedSelector** ("What do you need?" → UAE: Content shot and edited for me / GLOBAL: An editor for my own shoots / ANYONE: A presenter without filming), showreel ViewfinderFrame with running timecode.
2. Proof strip.
3. "Three services. One studio." Three service rows, each with copy, a price line and three thumbnails: Production (Packages from AED 4,000 / month · Shoots from AED 450) · Post-production (Edits from $0.80 per photo · Free test edit) · AI avatars (Launch pricing · Book a demo).
4. "Made for the feed." ReelStrip with filter chips.
5. Stats band (from `content/stats.ts`): 2020 Creating content since · 1,000+ Properties shot in Dubai · 100+ Brands worked with · 5,000+ Videos edited. **TODO(owner): confirm each number is defensible before launch.**
6. "Brief to delivery." 4 steps.
7. Founder block: real photo (`reference/founder.webp`), quote: "After years of creating content, we know where production slows down: the follow-ups, the revisions, the back-and-forth. So we're building systems that take them out. You book, we shoot, you download." — Akash Praseed, Founder, Milkywayy.
8. Testimonials: 3 cards, **sample** until the owner supplies real Google reviews.
9. FAQ (draft placeholder, section 10).
10. CTA band "Tell us what you're working on."

### 6.2 Production (dark)
1. Hero: two-line title, lede, Get your package (→ form) · WhatsApp us, anchor line "Packages from AED 4,000/mo · Single shoots from AED 450", three staggered 9:16 frames.
2. Proof strip.
3. "Every month, or one listing." Two path cards (monthly packages ↓ / single property shoot → property page).
4. "Everything, one invoice." IncludedGrid: Shoot (4-hour half days or full days) · Short-form · Long-form · Revisions · Delivery (client dashboard) · Transparency (monthly statement of every shoot and edit and what it cost).
5. **PackagesBand**: "Packages from AED 4,000 a month." + short copy + static chips (Shoot days, Edited reels, Long-form video, Photography, 360 tours) + Get your package / WhatsApp us. **No tiers, no calculator, no discount mentions.**
6. "Your first month." 4 steps: Onboarding · Book shoot days · Shoot and edit · Statement.
7. FAQ (draft).
8. "Get your package." LeadForm (service = production).
9. CTA band.

### 6.3 Property shoots (dark) — `/property-shoots`
*(Updated 1 Oct 2026: one page; `/production/property-shoots` and `/book` redirect here with 301.)*
1. Short hero: "Don't just list. Dominate.", lede, Price my shoot (→ `#booking`) · WhatsApp us, anchor "Photos from AED 450 · Delivered in 24h · Dubai-wide", a smaller photo frame, so the builder starts in the first screen.
2. **BookingBuilder** (section 8), `#booking`, "Build your booking."
3. "What you'll get." Tabs Photo · Video · 360° tour, fixed-ratio gallery with crossfade.
4. "Everything in one dashboard." DashboardPreview + Client login.
5. "No more chasing." CompareTable.
6. FAQ (draft).
7. CTA band "Your next listing, shot this week." (Price my shoot → `#booking`).

Title: `Real Estate Photography & Video in Dubai | Property Shoots | Milkywayy`. On phones the booking bar replaces the mobile action bar.

### 6.4 Post-production (light)
1. Hero: two-line title, lede "Photo, video and AI avatar editing for media companies, agencies and creators. We run our own productions, so we edit like people who've been on set.", three checks (Photo edits, short-form, long-form and AI avatars · Your style saved and matched on every batch · One point of contact, from brief to delivery), Book a free test edit · See our work (→ the before/after gallery), three staggered frames like the Production hero, each labelled: HDR photo edit · Vertical reel · Long-form still. (The before/after slider lives in the gallery below.)
2. Proof strip.
3. "Editors who also produce." 3 columns.
4. "Anything on your plate." 4 service cards: Photo edits (from $0.80 / HDR photo) · Short-form, social media reels (from $50 / reel) · Long-form, YouTube and walkthroughs (from $150 / video) · AI avatars, white-label (→ /ai-avatars).
5. "Drag to compare." BeforeAfter with **tabs above the slider** (Sky · Twilight · HDR) and text beside it.
6. "Price per edit." RateCards in USD: Photo edits $0.80 / HDR photo · Short-form $50 / reel (up to 60 s) · Long-form $150 / video (up to 10 min), each "starting from", note "Rates in USD. Your final quote depends on volume, style and turnaround, and we can quote in your currency on the call." CTA Get a custom quote. **No currency switcher, no packages.**
7. "Work we've delivered." Stats band (same numbers as home).
8. "Send. Edit. Done." 5 steps.
9. FAQ (draft).
10. "See the quality first." FreeTestForm (section 9.3). Left column: Test size "1 listing (up to 10 photos) or 1 reel" · Commitment "None". No turnaround promise.
11. CTA band "Try us on one project."

Tone rules for this page: no country-specific claims, no "overnight / you sleep" lines, no guarantees, not property-only language.

### 6.5 AI avatars (light)
1. Hero: "Meet Adam. He isn't real.", lede, Book a demo call · **Show me the reveal** (overlay "100% AI · Face, voice and gestures generated · edited by Milkywayy"), line "Clients shown Adam didn't spot he was AI", Adam frame with caption.
2. "Video, without the filming." 3 problem → answer cards.
3. "Built for your audience." 4 avatar styles (Adam, Clinic host, Finance explainer, Coach) — placeholders until real examples.
4. "Live in a week." 5 steps.
5. "Three ways in." Avatar setup (one-off) · Videos (monthly) · Videos + strategy (monthly), "Launch pricing · set on your demo call", "Each extra avatar is added with its own setup fee."
6. "What it's for." 4 use cases.
7. FAQ (draft).
8. Demo form: name, company, email, phone, What's it for? (Real estate / Clinic / Personal brand / **Other → reveals a text field**), preferred reply (Book a call / WhatsApp / Email).
9. CTA band.

### 6.6 Contact (light)
Two-line title, lede, direct details (WhatsApp +971 50 726 3306 · hello@milkywayy.com · Dubai, UAE · Sharjah Media City), LeadForm with service cards (Production / Post-production / AI avatars) and preferred reply.

### 6.7 Work, About (dark) — not in the mockup; build in the same system
- **Work**: title + filter chips (Property · Brand · AI avatar · Editing · Short-form · Long-form · Photo) → grid from `content/work.ts` (thumbnails, play on click) → case study cards. `/work/[slug]`: client, brief, what we did, results, quote, related work.
- **About**: founder story, founder photo, team (shooters, editors), how we work, licence, client names, CTA.

---

## 7. Copy rules
- Plain, confident, short. Write from the client's side ("Get your package").
- Headlines are uppercase via CSS; write them in sentence case in content files.
- No stock phrases ("elevate", "seamless", "cutting-edge"), no emoji, no bragging lines, no guarantees that imply mistakes.
- Production pages in AED; post-production rates in USD.

---

## 8. Booking builder (property shoots) — exact logic

Match the mockup's behaviour. All prices in `content/pricing.ts`.

### 8.1 Structure
- A list of **property cards**. The open card shows the full form; the others collapse to one line: number · title · building, area · services · subtotal. Click a header to open/collapse.
- Per card footer: **Duplicate** (copies the card, clears unit number) · **Remove** (when more than one) · Subtotal.
- **+ Add another property** (new card copies the previous card's area, date and slot).
- Under the list: "Shooting more than one property on the same day or in the same area? We'll send you a better price for the whole booking in the same chat."
- Sticky summary on the right on desktop; on phones and tablets (≤ 900 px) a sticky bottom bar (count · estimated total · Review & send) opens it as a bottom sheet: each property with services, date, slot and subtotal · Estimated total · WhatsApp message preview · **Send request on WhatsApp** · "No payment now. We confirm your slot, shoot, deliver, then invoice. Media is licensed for your marketing use."

### 8.2 Fields per property
1. **Property type**: Apartment · Villa / townhouse · Commercial, always one row of three ("Villa" on small screens).
2. **Size**: Apartment Studio–5 Bed (default 1 Bed) · Villa 2–7 Bed · Commercial = four **scale cards** (Basic "Small spaces", Essential "Most offices" with a "Most popular" badge, Premium "Large commercial spaces", Executive "HQ / warehouses") plus an inclusions strip for the selected tier (table below). Layout: one row on desktop (and tablet when it fits); on phones sizes go 3 per row and commercial tiers 2 × 2, with text wrapping inside the cards.
3. **Services** (toggle cards): Photography (delivery 24h) · Videography (short-form, long-form or both) · 360° tour (delivery 48–72h). On phones (< 768 px) cards toggle and each selected card's options open directly under it. From 768 px only one options panel shows at a time, below the row with a pointer to its card: clicking a card selects it and opens its panel (closing the other); clicking a selected card reopens its panel without deselecting; deselect with the ✓ corner (✕ on hover, labelled "Remove …") or the "Remove" link in the panel. Selected cards show a one-line summary of their options ("+ 5 twilight", "Short-form + Long-form (day)").
   - Photography → **Add twilight images** checkbox (edited from daylight shots) → 5 / 10 / 20 images, with "AED X per image. You save AED Y." note.
   - Videography → Short-form (social media reels, 24–48h) and/or Long-form (YouTube walkthrough, 24–48h). Turning Videography on selects Short-form by default.
   - Long-form (apartments and villas) → **Lighting**: Daylight · Night · Day + night. Night or Day + night forces the **Evening** slot (other slots disabled) with the note "Night footage needs an evening slot, so we'll book you in the evening." Commercial long-form has no lighting option (daylight price).
   - **Commercial Basic: Long-form and 360° tour are disabled** and show "Not in Basic".
4. **Location**: Community / area · Building / tower · Unit number (optional).
5. **Preferred date and time**: inline month calendar filling the card (time slots in a column beside it on wide cards, below it on narrow ones; Monday first; past days, off days and days beyond the booking window disabled; previous/next month; keyboard accessible) with Morning / Afternoon / Evening below it. Off days, time slots and the booking window are site settings (admin).

### 8.3 Prices (AED)

Apartments:

| Size | Photo | Short-form | LF day | LF night | LF day+night | 360 tour |
|---|---|---|---|---|---|---|
| Studio | 450 | 300 | 500 | 600 | 800 | 500 |
| 1 Bed | 500 | 300 | 600 | 700 | 950 | 600 |
| 2 Bed | 550 | 350 | 700 | 800 | 1,100 | 700 |
| 3 Bed | 650 | 400 | 800 | 900 | 1,200 | 800 |
| 4 Bed | 750 | 400 | 900 | 1,000 | 1,350 | 900 |
| 5 Bed | 850 | 450 | 1,000 | 1,200 | 1,500 | 1,000 |

Villas / townhouses:

| Size | Photo | Short-form | LF day | LF night | LF day+night | 360 tour |
|---|---|---|---|---|---|---|
| 2 Bed | 700 | 400 | 900 | 1,000 | 1,250 | 900 |
| 3 Bed | 800 | 450 | 950 | 1,100 | 1,400 | 950 |
| 4 Bed | 900 | 550 | 1,050 | 1,200 | 1,500 | 1,100 |
| 5 Bed | 1,100 | 650 | 1,150 | 1,300 | 1,600 | 1,250 |
| 6 Bed | 1,200 | 750 | 1,250 | 1,400 | 1,800 | 1,400 |
| 7 Bed | 1,400 | 800 | 1,350 | 1,600 | 2,000 | 1,500 |

Commercial:

| Tier | Photo | Short-form | Long-form | 360 tour | Includes |
|---|---|---|---|---|---|
| Basic | 450 | 300 | not available | not available | Photos up to 15 · Reel 30–45 s |
| Essential | 550 | 350 | 600 | 600 | Photos up to 20 · Reel 45–60 s · Walkthrough 3–5 min · 360 8–10 hotspots |
| Premium | 700 | 450 | 800 | 800 | Photos up to 30 · Reel 60–75 s · Walkthrough 5–10 min · 360 up to 15 hotspots |
| Executive | 850 | 500 | 1,000 | 1,000 | Photos up to 40 · Reel 60–90 s · Walkthrough 8–15 min · 360 up to 20 hotspots |

Twilight add-on (flat, not by size):

| Images | Apartment / commercial | Villa / townhouse |
|---|---|---|
| 5 | 120 | 150 |
| 10 | 220 | 275 |
| 20 | 400 | 500 |

### 8.4 WhatsApp message (no prices in the message)
```
Ref #MW-1042
Hi Milkywayy,
I'd like to book 2 properties:
1. 1 Bed apartment — Photography + 10 twilight + Short-form video + Long-form video (day + night).
Unit 1205, Marina Heights, Dubai Marina · Thu 2 Oct, evening
2. 2 Bed apartment — Photography.
Marina Gate 1, Dubai Marina · Thu 2 Oct, morning
```
Single property: "I'd like to book:" and no numbering. Commercial titles read "Premium commercial". Flow: validate → save lead (section 11) with the full builder state and the estimate → open WhatsApp with the message → show on-page confirmation with the ref.

Keep the builder state in one typed object so it can later be posted to the existing booking API.

---

## 9. Forms

### 9.1 LeadForm (Production, Contact)
Name* · Company · Phone (with country code) · Email (phone or email required) · Brief · Preferred reply* (WhatsApp / Email / Call) · Contact page adds Service cards (Production / Post-production / AI avatars) · hidden: page, UTM params (captured on first visit into sessionStorage), referrer.

### 9.2 AI demo form
As 6.5 item 8. "Other" reveals `use_other` text input (required when shown). Preferred reply defaults to Book a call.

### 9.3 FreeTestForm (Post-production), 3 steps
1. **Your volume**: What do you need edited? (multi-select cards: Photo edits "Listing and property photos" · Short-form "Social media reels" · Long-form "YouTube videos") · How much per month? (textarea, placeholder "Around 100–200 listing photos + 30 reels + 10 long-form") · Who edits for you now? (In-house / Freelancer / Nobody yet) → Continue.
2. **Details**: name, company, email*, country, link to a recent listing or video → Choose a call time · Back · "Prefer email? Send your requirements instead" (skips the calendar, confirmation message).
3. **Book**: 15-minute call via `NEXT_PUBLIC_CAL_LINK` (Cal.com embed) → confirmation. No package recommendations anywhere in this flow.

### 9.4 On submit (all forms)
Validate (zod, inline errors that say how to fix) → `POST /api/lead` → ref `MW-` + digits → LeadStore.save → Meta CAPI `Lead` → respond `{ ref }` → Pixel `Lead` with the same `event_id` → hand off by preferred reply (WhatsApp opens with a client-side message that starts with the ref / email confirmation / calendar) → on-page confirmation with ref. Spam protection: honeypot, time-to-submit check, per-IP rate limit.

---

## 10. FAQs and other owner content

All of this is managed in the admin panel (section 18); seed it from the mockup.

- Every FAQ section currently shows **draft questions**. The owner will add the final questions and answers in the admin. A FAQ marked draft shows a small "draft" label (or is hidden, per admin setting); FAQPage JSON-LD only includes published ones.
- Testimonials: sample until real Google reviews (name, role, company) are supplied.
- Portfolio media, before/after pairs, avatar examples, showreel: placeholders until supplied (list them in `CONTENT_TODO.md`).
- Stats numbers: owner to confirm.

---

## 11. Leads backend

```ts
interface LeadStore { save(lead: Lead): Promise<{ ref: string }> }
```
Default: `SupabaseLeadStore` (writes to the `leads` table) plus an optional notification POST to `LEAD_WEBHOOK_URL` (e.g. n8n/Make → WhatsApp/email alert to the owner). `ConsoleLeadStore` for local dev. Select with `LEAD_STORE`. Leads show in the admin panel's Leads inbox. Syncing leads or bookings into the existing booking backend on AWS is a launch-time decision with the owner's developer. Lead shape includes: ref, type (production / property / post / avatars / contact / free-test), all form fields, builder state + estimate, preferred reply, page, UTM, referrer, timestamp.

---

## 12. SEO and AI search

- **Metadata** per page. Titles:
  - Home: `Milkywayy | Content Production Studio in Dubai`
  - Production: `Content Production Packages in Dubai | Milkywayy`
  - Property shoots: `Real Estate Photography & Video in Dubai | Property Shoots | Milkywayy`
  - Post-production: `Photo & Video Editing Services for Agencies | Milkywayy`
  - AI avatars: `Custom AI Avatar Videos for Brands | Milkywayy`
  - Others: `{Page} | Milkywayy`. Descriptions 140–160 characters with service, place and one proof point.
- One H1 per page (the two-line hero title). Logical heading order.
- **JSON-LD**: Organization + LocalBusiness/ProfessionalService (name, logo, Dubai, phone, sameAs Instagram/LinkedIn/Google profile, aggregateRating when review count is confirmed) in the root layout · Service with `offers` (starting prices) on service pages · FAQPage (final FAQs only) · VideoObject · BreadcrumbList.
- `sitemap.ts`, `robots.ts`, canonical URLs from `NEXT_PUBLIC_SITE_URL`, OG images per page (1200×630, in the design style).
- **Staging lock**: when `NEXT_PUBLIC_SITE_ENV !== "production"`, robots disallow all and every page is `noindex, nofollow`.
- `public/llms.txt`: plain summary of Milkywayy, the three services, starting prices, service areas and contact.
- Real alt text on every image.
- Performance (mobile Lighthouse): Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO 100. LCP < 2.5 s, CLS < 0.1. JavaScript per page (gzipped): our own code < 35 KB and total (including the Next.js/React framework, ~131 KB) < 175 KB. *(Updated 30 Sep 2026: the original 150 KB total left no room above the framework baseline.)*

---

## 13. Tracking

| Event | When | Pixel | CAPI | GA4 |
|---|---|---|---|---|
| PageView | every page | ✓ | — | page_view |
| ViewContent | service page view (content_name = service) | ✓ | — | view_item |
| InitiateCheckout | booking builder shows a total | ✓ | — | begin_checkout |
| Lead | lead saved | ✓ | ✓ (same event_id) | generate_lead |
| Contact | any WhatsApp button | ✓ | — | contact |
| Schedule | call booked | ✓ | ✓ | schedule |

Consent banner (Accept / Reject) before loading tags. CAPI hashes email/phone (SHA-256, normalised), passes fbp/fbc, IP, user agent, `action_source: "website"`. IDs from env; a missing ID means that tag isn't loaded. Microsoft Clarity for heatmaps.

---

## 14. Build phases (stop for review after each)

| Phase | Deliverable | Done when |
|---|---|---|
| 0 · Setup | Repo, Next.js + TS + Tailwind, fonts, lint, `.env.example`, `content/` scaffolding, staging deploy with noindex | Blank site live on staging |
| 1 · Design system | Tokens (both tones), type, hero title fitter, all components, `/styleguide` | Owner approves styleguide on phone and desktop |
| 2 · Shell + Home | Header (tone-aware, mobile menu), mobile action bar, footer, CTA band, Home complete | Home matches the mockup; Lighthouse budget met |
| 3 · Production + Property shoots | Both pages, full BookingBuilder with section 8 logic (now one page, `/property-shoots`) | Builder matches every rule and price; Playwright tests for multi-property, twilight, lighting/evening lock, Commercial Basic lock, WhatsApp message |
| 4 · Post-production + AI avatars | Both pages, BeforeAfter, RateCards, AvatarReveal, forms UI | Match the mockup |
| 5 · Contact, Work, About, legal, 404 | All routes | All pages live |
| 5A · Database + content wiring | Supabase project, schema (section 18.4), RLS, seed script from `content/`, website reads everything editable from the database with cached fetches + tag revalidation | Site looks identical to before, now driven by the database |
| 5B · Admin panel | `/admin` with login, every section in 18.2, uploads, drag-to-reorder, draft/publish, preview, Leads inbox | Owner can change a portfolio item, FAQ, review or price and see it live on staging within seconds, without a deploy |
| 6 · Leads | `/api/lead`, LeadStore adapters, all form flows, calendar, spam protection | Every form saves a lead and hands off correctly (tests) |
| 7 · SEO + tracking | Metadata, JSON-LD, sitemap, robots, llms.txt, OG, consent, Pixel + CAPI + GA4 + Clarity | Events verified in Meta test mode; Rich Results test passes |
| 8 · QA + handover | Cross-browser (iOS Safari, Android Chrome, desktop), a11y pass, performance, `CONTENT_TODO.md`, `README.md` (edit content, env, deploy) | Owner sign-off |

## 15. Launch checklist (with the owner's developer)
1. The new site and admin **replace** the old website and old admin completely; the owner will shut the old ones down after launch. The new admin is the only source of prices and content. Before shutdown, confirm what replaces the old system's client dashboard, bookings, invoices and time-slot management (see 18.5).
2. Choose production hosting; point Cloudflare DNS for milkywayy.com.
3. `NEXT_PUBLIC_SITE_ENV=production`; confirm robots allows crawling.
4. Redirects from old URLs.
5. Submit sitemap in Search Console; verify domain in Meta Business Manager.
6. Watch Search Console, leads and Clarity for a week; keep the old build ready for rollback.

## 16. Environment variables (`.env.example`)
```
NEXT_PUBLIC_SITE_URL=https://milkywayy.com
NEXT_PUBLIC_SITE_ENV=staging
NEXT_PUBLIC_WHATSAPP_NUMBER=971507263306
NEXT_PUBLIC_CLIENT_LOGIN_URL=https://milkywayy.com/dashboard
NEXT_PUBLIC_CAL_LINK=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
REVALIDATE_SECRET=
BUNNY_STREAM_LIBRARY_ID=
BUNNY_STREAM_API_KEY=
ADMIN_ALLOWED_EMAILS=hello@milkywayy.com
LEAD_STORE=supabase
LEAD_WEBHOOK_URL=
NEXT_PUBLIC_META_PIXEL_ID=
META_CAPI_TOKEN=
NEXT_PUBLIC_GA4_ID=
NEXT_PUBLIC_CLARITY_ID=
```

## 17. Definition of done (every page)
- Works at 360, 390, 768, 1024, 1440 px with no horizontal scroll; hero title is two lines at every width.
- Keyboard reachable, visible focus ring, skip link; real alt text; posters on videos.
- No console errors, no layout shift from fonts or images.
- All copy and prices come from `content/`.
- Lighthouse budget met on mobile.


---

## 18. Admin panel (content management)

**Goal:** the owner updates everything that changes over time (portfolio, reels, before/after pairs, AI avatar examples, Google reviews, FAQs, stats, prices, contact details, SEO text) from a login-protected admin, and the website updates within seconds. No code change, no redeploy.

### 18.1 Where and how
- Lives in the same Next.js app at **`/admin`** (noindex, excluded from sitemap and robots-disallowed). Can move to `admin.milkywayy.com` later.
- **Auth:** Supabase Auth, email + password or magic link, allowed emails from `ADMIN_ALLOWED_EMAILS`. Roles: **Owner** (everything) and **Editor** (content only: no prices, no settings, no leads export). RLS on every table: public can only read published rows; only authenticated admins can write.
- **Design:** clean dark admin UI, same fonts as the site, sidebar layout like the owner's current booking-portal admin (Workspace · Content · Pricing · Settings). Functional over flashy. Must work on a phone (the owner will update "on the go").
- **Saving** writes to Supabase and calls the revalidation route (`/api/revalidate` with `REVALIDATE_SECRET`) for the affected tags (e.g. `portfolio`, `faqs:post-production`, `pricing`). Change is live on the next page load.
- **Every list** supports: add, edit, delete (with confirmation inside the UI), **drag to reorder**, **Published / Draft** toggle, and a **"Where it shows"** field (placements, below). A **Preview** button opens the affected page.
- **Uploads:** images go to Supabase Storage (auto-converted/resized for web by `next/image` on the site; reject files over 15 MB; require alt text). Videos upload to Bunny Stream (direct upload from the browser via a signed URL) or accept a YouTube/Vimeo link; always require a poster image. Show upload progress.

### 18.2 Sidebar sections (each maps to where it appears on the site)

| Section | Fields | Appears on |
|---|---|---|
| **Dashboard** | New leads this week, latest 5 leads, last content changes, quick links | — |
| **Leads** | Table of all form + booking leads: ref, type, name, contact, preferred reply, summary, page, UTM, date, status (New / Contacted / Quoted / Won / Lost), notes; filter, search, CSV export (Owner only) | — |
| **Portfolio** | Title, client (optional), category (Property · Brand · AI avatar · Editing), format (Photo · Reel 9:16 · Long-form 16:9 · 360), media (image or video + poster), duration label (e.g. 0:30), tag text, alt text, **placements** (multi-select: Home reel strip · Home service row: Production / Post-production / AI avatars · Production hero frames · Property shoots hero · Property shoots gallery: Photo / Video / 360 tab · Post-production service cards · Work page), featured, order, published | Home, Production, Property shoots, Post-production, Work |
| **Case studies** | Client, title, brief, what we did, results (label + value pairs), quote, media gallery, related portfolio items, slug | `/work/[slug]`, Home teaser |
| **Before / after** | Tab (Sky · Twilight · HDR · add more), title, description, before image, after image, show in hero (one pair), order, published | Post-production hero + "Drag to compare" |
| **AI avatars** | Name, niche line (e.g. "Real estate · market updates"), poster, clip, order, published; plus the hero Adam video, caption line and reveal text | AI avatars page, Home service row |
| **Reviews** | Reviewer name, role, company, rating (1–5), review text, source (Google / other) + link, photo (optional), placements (Home · Production · Post-production · AI avatars), order, published; plus global **Google rating** value and review count | Testimonials sections, proof strip rating, JSON-LD aggregateRating |
| **FAQs** | Page (Home · Production · Property shoots · Post-production · AI avatars · Contact), question, answer (rich text: bold, links, lists), order, published | Every FAQ section + FAQPage JSON-LD |
| **Stats** | Value (e.g. "1,000+"), label, placements (Home · Post-production), order | Stats bands |
| **Clients** | Client name (and optional logo), order, published; per-page proof-strip toggles | Proof strips |
| **Pricing: property shoots** | Editable tables exactly like the owner's current portal admin: tabs Apartments / Villas / Commercial; rows = sizes/tiers, columns = Photography · Short-form · LF day · LF night · LF day+night · 360 tour (commercial: Photography · Short-form · Long-form · 360 tour). Commercial tiers also carry description, "most popular" flag and inclusions (photos, reel length, walkthrough length, 360 hotspots, or "not included" which disables that service in the builder). Twilight add-on table (5 / 10 / 20 for Apartment+Commercial and Villa). Size lists editable (add/remove a size) | Booking builder, "from AED 450" lines |
| **Pricing: other** | Production "Packages from" amount and included-item chips · Post-production starting rates (photo / reel / long-form, value + unit + note) · AI avatar tier names, bullets and "launch pricing" line | Production, Post-production, AI avatars, Home service rows |
| **Site settings** | WhatsApp number, email, phone, address line, licence line, social links, client login URL, calendar link, showreel (video + poster), founder photo + quote + name, booking off days, time slots and booking window (days ahead), "multi-property" note text | Global |
| **SEO** | Per page: title, meta description, OG image | `<head>` of each page |
| **Admins** (Owner only) | Invite/remove admins, set role | — |

### 18.3 Rules
- The website must never break if a list is empty: sections with no published items hide themselves (except FAQs, which fall back to seed data until the first real ones are published).
- Price changes apply to the booking builder immediately; the saved lead stores the prices at the time of the request.
- Keep a simple **change log** table (who changed what, when) shown on the Dashboard.
- Images: show the crop the site will use (e.g. 9:16 for reels, 4:3 for gallery) in the upload preview.

### 18.4 Database tables (Supabase)
`portfolio_items`, `portfolio_placements`, `case_studies`, `before_after`, `avatars`, `reviews`, `faqs`, `stats`, `clients`, `proof_strip_pages`, `pricing_property` (type, size_index, size_label, service, price), `pricing_commercial_tiers` (tier, description, popular, photos, reel, walkthrough, tour_hotspots), `pricing_twilight` (group, qty, price), `pricing_other` (key/value JSON), `site_settings` (key/value JSON), `seo_pages`, `leads`, `admins`, `change_log`. Every content table has `published boolean`, `sort_order int`, `created_at`, `updated_at`. Storage buckets: `media` (public read), `private` (admin only).

### 18.5 Reference
The owner's current booking-portal admin (sidebar: Dashboard, Bookings, Calendar, Customers, Invoices, Reports, Promotions, Time Slots, Pricing, Portfolio, Reviews) is the model for layout and the pricing-table editor. This build covers website content and leads. The old system also runs the client dashboard, bookings, customers, invoices and time slots; since the old system will be shut down after launch, those need a replacement (a later phase of this admin, or the owner's separate tools such as Milkywayy Ledger for invoicing). Do not build them now, but keep the schema open for a `bookings` table linked to `leads`.
