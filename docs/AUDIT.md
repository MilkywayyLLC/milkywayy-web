# Pre-launch audit — site-refine (17 Oct 2026)

Review only: no code, DB or settings were changed. Sources: the code on `site-refine` and localhost:3000 (public pages only; I didn't sign in to the portal or admin).

## 1. Booking redesign: what it touches

**Booking (`components/portal/BookingModal.tsx`, `lib/portal/booking.ts`)**: remove `ShootMode`, `MODE_LABEL` and the mode seg. Services become `photos` (the property builder, photos only) plus `videos` with `by: "count" | "time"`, `short`, `long`, `long_minutes?`, `day?`, `raw?` and `note`. `PropertyOptions` loses the Videography card in the portal and on the website showcase.
**Pricing logic**: `estimateLines`, `serviceKey`, `logPrefill`, `servicesFromLog` and `deliverablesFrom` all branch on `mode`/`day` today. Replace them with: by count → qty × `reel_shoot` / `long_form_shoot` + extra minutes × `long_form_extra_min`. By time + edited → "from" the day rate. By time + raw → the flat day rate.
**Price list (admin `ClientSetup` and rate card)**: retire `prop_short`, `prop_long` (and `prop_raw`, already retired). Add the extra-minute row. The "Website list (by size)" default text goes.
**Estimate**: by-time edited bookings can only show "From AED 1,200". The real figure is known after delivery, so the copy has to say so.
**Invoices**: per-video lines at the client's rates, plus one **"Minimum charge top-up"** line when the sum is under the day rate (min − sum). Use a top-up line, not a swap to a day line, so the per-video breakdown stays auditable.
**Package usage**: the `apply_inclusions` trigger works per line, so it can't do "whichever is higher". Videos draw `reel_shoot` / `long_form_shoot` inclusions. **Package clients get no top-up**, or included videos (price 0) would trigger a 1,200 charge.

**Migrations (additive only)**
1. `rate_card` insert `long_form_extra_min` (grp production, unit minute, AED 100).
2. Set `amount_aed` defaults on `reel_shoot` / `long_form_shoot`. **They're NULL today**, so every video estimate reads "priced on confirmation".
3. Insert a `day_minimum` key with grp null for the top-up line, so it never matches an inclusion.
4. `create or replace` on the portal booking RPC and validator to accept the new services shape, still reading the old one.
5. Retire `prop_short` / `prop_long` with the UI `RETIRED` set (like `prop_raw`). Don't drop any rows.

**Existing data**: no rewrite. `projects.meta.services` keeps the old shape; renderers must keep reading `mode`/`day`/`property.short|long` (map `mode:"raw"` → `by:"time", raw:true`). Logged `line_items` keep their stored `unit_price`, so nothing re-prices. Package inclusions keyed `shoot` used to cover photo+video bundles. From now on, video counts against video keys, so **existing package clients lose video coverage mid-term** unless their packages get video inclusions or are grandfathered.

**Edge cases**: photos + half-day videos on the same date (one visit or two charges?). Full day forces the `full_day` slot, so it clashes with a morning photo slot. Night/day+night long-form (evening slot, `needsEvening`) disappears with flat video, so decide whether evening is a surcharge or dropped. Commercial tiers (Basic has no long-form or 360; tier `includes` lists reel lengths) go stale. A client overrides the extra minute but not the base rate. Rounding: billing per started minute or rounded up? Over-length short-form (61–90s): who decides it's two reels? A mid-month rate change on a by-time booking. A by-time booking with zero finished videos (cancelled on site).

**What I'd do differently**
- **Raw vs edited minimum at the same rate is broken.** Half day raw = 1,200 and half day edited minimum = 1,200, so raw is strictly worse value. Either price raw lower (separate `half_day_raw`/`full_day_raw` keys) or give raw files free on by-time edited bookings. I'd split the keys.
- **Flat video loses the villa premium.** A 7-bed villa walkthrough becomes the studio price. The extra-minute rate partly fixes this (bigger home → longer video), so it's OK, but set the long-form default at the villa-average level, not the apartment level.
- **Don't call it "Short-form" for agents.** Use "Reel (up to 60s)" and "Walkthrough (up to 5 min)". Post-production on the site sells long-form as "up to 10 minutes" (USD, remote), and clients will cross-read.
- **"Not sure how many?"** belongs as a link under the counters, not a toggle. Keep counts as the default path.

## 2. Simplification audit

| # | Area | Problem (1 line) | Fix (1 line) | Effort | Risk | Launch-blocker? |
|---|------|------------------|--------------|--------|------|-----------------|
| 1 | Booking | "Shot & edited / Shoot only" toggle + Videography by size confuse every client | Ship the redesign above (with split raw keys) | L | M (pricing, packages) | Y |
| 2 | Rate card | `reel_shoot` / `long_form_shoot` default to NULL, so estimates say "priced on confirmation" | Set AED defaults in the rate card before launch | S | L | Y |
| 3 | Packages | Videos move off the `shoot` key, so existing packages silently lose video coverage | Add video inclusions to live packages or grandfather them | M | H (billing) | Y |
| 4 | Website | Property page booking demo shows Videography AED 300/600 by size | Rebuild the showcase step from the new booking UI | M | L | Y |
| 5 | Website | Property FAQ shows "Draft questions · final list and answers to come" | Publish final FAQs (clear the draft flag in admin) | S | L | Y |
| 6 | Website | Video delivery says 24–48h in Services, "videos in 48–72" in How it works | Pull Steps copy from `pricing.delivery` | S | L | Y |
| 7 | Admin › client page | ~16 stacked blocks (prices, plan, budget, offers, statements, members, bookings, history…) | Tabs: Overview · Prices & plan · People · Activity | M | L | N |
| 8 | Admin › price list | ~30 rows incl. 12 photo-size rows, mostly blank | Show overrides only + "Show all" toggle | S | L | N |
| 9 | Admin › nav | "Clients" (logo strip) sits next to "Client accounts" | Rename to "Client logos" | S | L | N |
| 10 | Admin › nav | "AI characters" (portal) vs "AI avatars" (website) | Fold the website one into Library; keep "AI characters" | S | L | N |
| 11 | Admin › nav | Leads vs Inquiries isn't self-explanatory | "Website leads" / "Client messages" | S | L | N |
| 12 | Admin › content | Before/after and AI avatars are separate sections of what are just media items | Fold into Library as filters | M | M (placements) | N |
| 13 | Admin › pricing | Prices live in three places: Property shoots, Other prices, Billing › Rate card | One "Prices" group: Website list + Rate card | M | L | N |
| 14 | Admin › billing | Suggestions, pinned offers, hide-suggestions, 6-month term, budget packages, dated rate history | Hide behind "Advanced"; leave suggestions off at launch | S | L | N |
| 15 | Portal › nav | Team and Contacts are two tabs for people (contacts can link to logins) | One "People" tab: Team (logins) + Listing contacts | M | M (RLS, invites) | N |
| 16 | Portal › access | 5 presets; invite default unclear; Agent/Share with start empty | Default invite = Agent (agencies) / Production (brands); Agent = booker's own contact; Share with = empty | S | L | N |
| 17 | Rate card | Dead keys: `shoot_day`, `avatar_video`, `prop_raw`; `shoot` means "property shoot" but is unlisted | Retire (hide) `shoot_day`/`avatar_video`; relabel `shoot` "Photo shoot" | S | L | N |
| 18 | Dead code | `KINDS`/`kindLabel` in `lib/portal/billing.ts` is stale and imported nowhere | Delete | S | L | N |
| 19 | Booking logic | `logPrefill` still adds a day fee for "older shot & edited bookings" | Keep the read path, drop the write path with the redesign | S | M | N |
| 20 | Pricing model | Long-form night / day+night prices + commercial tiers' reel lengths go stale with flat video | Drop lighting columns from the editor; tiers = photos + 360 only | M | M | N |
| 21 | Website | "Sign in with your email" but portal also supports phone OTP | "Sign in, pick the services…" | S | L | N |
| 22 | Website / portal | Mock says "Book media", portal button says "Book a shoot" | Use "Book a shoot" everywhere | S | L | N |
| 23 | Website | Hero "Photos from AED 450" (Studio) while builder opens on 1 Bed at AED 500 | Fine, but make "from" use the same min as booking after overrides | S | L | N |
| 24 | Copy | Post-production "Long-form up to 10 min" (USD) vs Dubai "up to 5 min" | Different offers: name Dubai's "Walkthrough (up to 5 min)" | S | L | N |

**Recommend removing**
- Mode toggle, `MODE_LABEL`, `MODE_HINT`, "Videography by size" (portal and website showcase)
- Rate rows `prop_short`, `prop_long`, `shoot_day`, `avatar_video` (hide, don't drop)
- `KINDS` / `kindLabel` in `lib/portal/billing.ts`
- Long-form lighting (day/night/day+night) prices, unless evening becomes a paid add-on
- Billing suggestions/offers UI at launch (keep the tables)

**Leave as is**
- **Listings stay their own tab, not under Shoots.** They're for selling, with share links, stats and contacts, and some don't come from a shoot. Add "Create listing" on delivered shoots instead.
- **Case studies stay separate from Library.** They're long-form pages, not media items.
- Twilight packs (5/10/20) and 360 as add-ons to photos, by size
- Slots and start-time windows (`SLOT_HOURS`)
- Dated client rates (`client_rates.effective_from`): already correct for "applies from today"
- Agent preset scoping in RLS: it works, it only needs better defaults
