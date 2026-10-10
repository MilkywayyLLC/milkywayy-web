# Launch runbook: milkywayy.com

The one document for launching and running the new site and client portal. It replaces
`LAUNCH_BLOCKERS.md`, `PORTAL_CHECKLIST.md` and `HANDOVER.md` (merged here on 4 Oct 2026).
Work top to bottom; tick each box. **Akash** does anything that needs his logins, payments or
decisions. **Claude** (Claude Code in this repo) does the rest and reports back. Nothing here
touches production until Akash says go.

**Where things stand (4 Oct 2026)**
- Staging: https://milkywayy-web.vercel.app (Vercel project `milkywayy-web`, branch `main`,
  `noindex`). The old site is still live on milkywayy.com.
- Everything since `main` (portal Phases 9–13, the billing add-on, launch prep) is on branch
  `site-refine`, open as a pull request into `main`, **not merged**. Previews use the dev portal
  database (`milkywayy-portal-dev`) and the dev R2 bucket.
- In production, the website and the portal share **one** Supabase project, `milkywayy-web`
  (`hyfanoysynsyxkpfqdxi`, Mumbai). It has the website migrations; the portal migrations are
  applied at launch (section 2).
- Old portal: **nothing is imported and nothing redirects to it.** Clients are created in the
  admin and invited by email; their earlier work is added as past projects (section 3).

---

## 0. Before the merge

- [ ] **Claude** — PR `site-refine` → `main` is open with the full summary. Tests green, Lighthouse on Home unchanged.
- [ ] **Akash** — review the PR and the latest preview; say "merge". Merging deploys `main` to staging only (still `noindex`, still the website content database). The production content check (section 1) doesn't run yet: it only runs once `NEXT_PUBLIC_SITE_ENV=production`.

## 1. Content (Akash, in the production admin, after the merge)

Real content goes in **before** launch: a production build refuses to finish while anything
sample, placeholder or draft would show on a public page (`scripts/launch-check.mts`, run
automatically before every build when `NEXT_PUBLIC_SITE_ENV=production`; Claude can run it any
time against the live content). Samples step aside by themselves: a list shows its real items as
soon as there is one (reviews: three), so you never have to delete a sample first.

What it found on 4 Oct 2026 (every item below must be cleared):

- [ ] **Reviews:** 3+ real Google reviews in Admin → Reviews (name, role, company, text, rating, link, "Home"). The 3 samples and the "Sample text" label disappear at 3 real ones. Also the Google rating, review count and profile link in Site settings.
- [ ] **Showreel:** Admin → Site settings → Showreel (video link + poster, ~30–60 s). The "Placeholder · showreel coming" label goes once it's set.
- [ ] **Portfolio** (Admin → Portfolio; image or poster, video link, title, category, **format**, and where it shows). Each placement needs at least one real item:
  - [ ] Home: reels strip (6), Production row (3), Post-production row (3), AI avatars row (3)
  - [ ] Production hero (3) · Property shoots hero (1) · Property gallery: photos (5+), videos (3) · Post-production hero (3) and service cards (3)
  - [ ] Work grid (all real work)
- [ ] **Before / after** pairs (Sky, Twilight, HDR): same framing, before + after.
- [ ] **AI avatars:** Adam's hero (Edit the hero: poster 9:16 + clip) and the examples (or unpublish the ones you don't have).
- [ ] **Case studies:** 1–3 real ones (client permission, brief, what you did, results, quote, cover + gallery). The sample one disappears (and its page 404s) once a real one is published.
- [ ] **FAQs** on Home, Production, Property shoots, Post-production, AI avatars: final wording, then untick "Wording not final" (20 are still draft).
- [ ] **Stats:** check every number is defensible (Admin → Stats). Then tell Claude: it sets `LAUNCH.statsConfirmed` in `content/launch.ts`.
- [ ] **About story:** confirm or edit. Claude then sets `LAUNCH.aboutConfirmed` (removes "Draft · owner to confirm").
- [ ] **Privacy and Terms:** legal review (ideally a UAE lawyer). Claude then sets `LAUNCH.legalReviewed` (removes "Draft · to be reviewed before launch").
- [ ] Should fix: client names in the proof strip (permission; logos optional) · Cal.com link (`NEXT_PUBLIC_CAL_LINK`, 15-minute call) · booking slots/window confirmed · post-production starting rates · AI avatar tiers wording.

Portal and billing set-up in the admin (no build check; do before inviting clients):
- [ ] **Rate card** (Admin → Billing → Rate card): real AED and USD prices; the seeded AED values are USD × 3.67 placeholders.
- [ ] **Template packages** (Admin → Billing → Packages, client "Template"): AED + USD prices, inclusions, overage rates, 6-month discount % (default 10). Internal only.
- [ ] **Suggestions** (Admin → Billing → Suggestions): on by default; minimum saving AED 500 / USD 135 a month.
- [ ] **Bank details and VAT** (Admin → Billing → Settings): account name, bank, IBAN, SWIFT. Tick "VAT registered" only once Milkywayy is.
- [ ] Each client's **currency** (AED for UAE, USD overseas) and, if different, retention period.

## 2. Production Supabase (`milkywayy-web`)

- [ ] **Akash** — **Pro plan**: Supabase → Organization "MilkywayyLLC's Org" → Billing → Pro (USD 25/month incl. compute): daily backups, no pausing, leaked-password protection.
- [ ] **Akash** — Authentication → Sign In / Providers → Email → **Prevent use of leaked passwords** on. Claude confirms the advisor is clean.
- [ ] **Akash** — **Allow new users to sign up: ON.** (Changed from the website-only plan: portal clients get their account by signing in with an email code. The admin stays limited to the emails in Admin → Admins, with two-factor for Owners.)
- [ ] **Akash** — Phone provider **off**; no test phone numbers. (WhatsApp sign-in is built but switched off; see "If phone sign-in comes back" in section 12.)
- [ ] **Akash** — Custom SMTP: Resend, sender `portal@milkywayy.com` (name "Milkywayy"), host `smtp.resend.com`, port 465, user `resend`, password = a Resend API key. Raise the email rate limit from the built-in default to what SMTP allows. Other rate limits stay at their defaults.
- [ ] **Akash + Claude** — Email templates, same as the dev project: **Magic Link** and **Confirm signup** send the 6-digit code `{{ .Token }}` (subject "Your Milkywayy sign-in code"); OTP length 6; OTP expiry 1 hour. Claude checks them against dev.
- [ ] **Akash** — URL configuration: Site URL `https://milkywayy.com`; Redirect URLs `https://milkywayy.com/portal/auth/callback`, `https://milkywayy.com/**` (and the staging URL while it's used).
- [ ] **Claude** — apply the portal migrations **in this order** (never anything in `supabase/dev/`):
  1. `20261002200000_portal_accounts.sql`
  2. `20261003090000_portal_phone_claims.sql`
  3. `20261004090000_portal_shell_admin.sql`
  4. `20261005090000_portal_otp_english.sql` *(harmless while phone sign-in is off; its hook stays unused)*
  5. `20261006090000_portal_email_notifications.sql`
  6. `20261007090000_portal_projects.sql`
  7. `20261008090000_portal_edit_avatar.sql`
  8. `20261009090000_portal_qa_fixes.sql`
  9. `20261010090000_booking_attach_by_email.sql`
  10. `20261011090000_booking_email_flag.sql`
  11. `20261012090000_portal_billing.sql`
  12. `20261013090000_portal_listings.sql`
  13. `20261014090000_portal_billing_plus.sql`
  14. `20261015090000_portal_billing_calendar.sql`
  15. `20261016090000_portal_billing_client_view.sql`
  16. `20261017090000_portal_launch_prep.sql`
  17. `20261018090000_site_instagram.sql` *(the website's Instagram token store)*
  18. `20261019090000_portal_budget_bookings.sql` *(budget packages, portal booking, deliverables, inquiries, invoice drafts)*
  19. `20261020090000_portal_access_drafts.sql` *(per-member access, invites with access and 14-day expiry, drafts, turnaround texts, new rate-card items, booking for every client, listing contacts and photo order)*
  20. `20261021090000_portal_booking_changes.sql` *(clients edit or cancel a shoot before it's shot; Cancelled status; cancelled shoots drop their unbilled line items)*
- [ ] **Claude** — a new `PORTAL_ADMIN_SECRET`: added to Vercel Production by CLI (never printed) and its SHA-256 stored in `private.app_secrets` under `portal_admin`. Then the security advisor.
- [ ] **Claude** — data hygiene check (read-only): no `e2e-portal-%` users, no "E2E …" or "Milkywayy Demo Realty" accounts, no "Sample: …" listings, no test invoices. No script can create them in production: the sample-listing script refuses anything but the dev project, the Stripe preview script takes test keys only, the e2e helpers need functions that exist only in dev (`supabase/dev/`), and `supabase/seed.sql` only fills empty content tables ("on conflict do nothing").
- [ ] **Akash decides, Claude applies** — the website's e2e test accounts (`e2e-owner@`, `e2e-editor@`, `e2e-stranger@example.com`). Recommendation: delete `e2e-owner` (a second Owner key on Claude's laptop), keep the other two for the public/editor tests; Owner-level admin tests then run on a temporary Supabase branch when needed.
- [ ] **Claude** — on launch day, after the test leads are deleted: `alter sequence public.lead_ref_seq restart with 1001;` (first real ref MW-1001).

## 3. Clients (after the portal is live)

- [ ] **Akash** — Admin → Client accounts → **New client** for each client (company or individual, contact name, email, WhatsApp, currency). "Email the contact 'Your Milkywayy portal is ready'" is ticked by default; it links to `/portal/login` with their email filled in. **Resend invite** on the client page if needed.
- [ ] **Akash** — their earlier work: client page → **Add past project** (shoot, editing batch or avatar video; title, property details or notes, original date). Upload the files or paste links, then publish: it stays Completed, nobody is emailed unless you tick "Notify client", and files are kept for the client's retention period (12 months by default) from that day. Past shoots can make listing share pages.

## 4. Production R2 (files)

- [ ] **Akash** — bucket `milkywayy-deliverables` (exists) with **its own API token**: Object Read & Write, that bucket only. The preview token stays on `milkywayy-portal-dev` (it already gets 403 on production).
- [ ] **Akash** — CORS on `milkywayy-deliverables`: AllowedOrigins `https://milkywayy.com` (and `https://www.milkywayy.com`), methods GET and PUT, AllowedHeaders `*`, ExposeHeaders `ETag`, MaxAge 3600. GET is also what “Download all” uses: the client’s browser fetches each delivered photo or reel and zips it locally, so the rule must include the portal’s origin. That one rule covers everything the browser uploads and zips: deliveries and web versions (admin), raw files, invoice PDFs, bank-transfer proofs, permit QRs, contact photos and logos (clients). Public development URL stays **off** (downloads and share pages use short-lived signed links).
- [ ] **Claude** — after the env vars are in (section 5): upload, download and delete one test file from the admin on production; then check one share-page image and one invoice PDF.
- [ ] **Akash** — the website's own videos (reel uploads, AI avatar clips, the showreel if uploaded) live in the same bucket under `site/`, served through `/media/file/…` with signed links. Upload them **on production** after launch: a video uploaded on a preview goes to the dev bucket and won't play on milkywayy.com.

## 4b. Instagram (reels from @milkywayy.media)

Reels on our own Instagram play in the site's player through the official Instagram API. Until
this is done they show their cover with "View on Instagram ↗". Development mode is enough: the
app only ever reads our own account.

- [ ] **Akash** — make sure @milkywayy.media is a **Professional** account (Instagram → Settings → Account type and tools → Business or Creator).
- [ ] **Akash** — [developers.facebook.com](https://developers.facebook.com) → My Apps → **Create app** → use case **"Manage messaging & content on Instagram"** → app name "Milkywayy Website" → create. Leave it in **Development** mode (no app review needed for our own account).
- [ ] **Akash** — in the app: **Instagram → API setup with Instagram login** → step 1 **Generate access tokens** → **Add account** → sign in as @milkywayy.media and allow (it asks only for basic profile and media, `instagram_business_basic`). If Instagram shows a tester invite, accept it in Instagram → Settings → Website permissions → Apps and websites → Tester invites.
- [ ] **Akash** — click **Generate token** next to @milkywayy.media and copy it (a long-lived token, 60 days). Don't paste it anywhere else.
- [ ] **Akash** — Vercel → `milkywayy-web` → Settings → Environment Variables → `INSTAGRAM_ACCESS_TOKEN` = that token, **Sensitive**, for **Production** and **Preview**. Redeploy (or ask Claude to). No app secret or app id is needed.
- [ ] **Claude** — check Admin → Portfolio shows "Instagram: Connected as @milkywayy.media". The daily cron renews the token every week and keeps it in the database (migration 17), so it never runs out. If Instagram ever refuses it, the admin says so; generate a new one (steps above) and replace the env var.

## 4c. Google Maps (Book a shoot's location)

The portal's "Book a shoot" finds the address with Google Places (UAE only) and shows a map with a
pin the client can drag. Without a key it falls back to a plain address field, so nothing breaks.

- [ ] **Akash** — Google Cloud console → a project for Milkywayy → **APIs & Services → Library**: enable **Maps JavaScript API** and **Places API (New)**. (Not the old "Places API": new projects can't use it, and the portal doesn't.) Billing must be on for the project; Google's monthly free usage covers a portal this size.
- [ ] **Akash** — **Credentials → Create credentials → API key**. Restrict it: *Application restrictions* → **Websites**: `https://milkywayy.com/*`, `https://www.milkywayy.com/*`, `https://*.vercel.app/*` (previews; remove after launch if you like) and `http://localhost:3000/*`; *API restrictions* → those two APIs only.
- [ ] **Akash** — Vercel → Environment Variables → `NEXT_PUBLIC_GOOGLE_MAPS_KEY` for Production and Preview (it's a browser key, protected by the restrictions above, so it isn't "Sensitive"). Redeploy.
- [ ] Optional — **Map Management → Create Map ID** (JavaScript, vector) and set `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`; until then the map uses Google's demo map style.

## 5. Vercel Production environment

Names only; values are never written down here. **Akash** adds the ones marked (A); **Claude**
adds the rest by CLI without printing them.

**Switch at launch (Claude):**
- `NEXT_PUBLIC_SITE_ENV=production` (removes `noindex`, opens robots.txt, turns on the content check) · `NEXT_PUBLIC_SITE_URL=https://milkywayy.com` · `NEXT_PUBLIC_CLIENT_LOGIN_URL=/portal/login` (or delete it: that's the default) · `NEXT_PUBLIC_TRACKING=on` (or delete it) · delete `META_TEST_EVENT_CODE`.

**Already set (check only):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_CLARITY_ID`, `LEAD_SECRET`, `REPORT_SECRET`, `CRON_SECRET`, `REVALIDATE_SECRET`, `RESEND_API_KEY`, `META_CAPI_TOKEN`, `LEAD_EMAIL_TO`, `LEAD_EMAIL_FROM`, `ALERT_EMAIL_TO`, `LEAD_STORE=supabase`, `LEAD_RATE_LIMIT`, `ALERTS`.

**New for the portal:**
- `PORTAL_ADMIN_SECRET` (Claude, section 2) · `PORTAL_EMAIL_FROM=Milkywayy <portal@milkywayy.com>` (Claude)
- (A) `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` for the production token · `R2_BUCKET=milkywayy-deliverables` (Claude)
- (A) `STRIPE_SECRET_KEY` = the **live** secret key (Stripe → Developers → API keys) · `STRIPE_WEBHOOK_SECRET` is stored by the live webhook script (section 7)
- (A) `INSTAGRAM_ACCESS_TOKEN` (section 4b)
- (A) `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (section 4c) · optional `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`
- Optional: `NEXT_PUBLIC_CAL_LINK`, `PORTAL_UPLOAD_MAX_GB` (default 5), `LEAD_WEBHOOK_URL`, `SUPABASE_SERVER_URL`.

**Must NOT be set in Production:** `LEADS_DB`, `NEXT_PUBLIC_PORTAL_SUPABASE_URL`, `NEXT_PUBLIC_PORTAL_SUPABASE_ANON_KEY` (the portal then uses the website's project), `SHARE_DEV_MEDIA_ORIGIN`, `INSTAGRAM_GRAPH_URL` (tests only), `META_TEST_EVENT_CODE`, any `E2E_*`, `NEXT_PUBLIC_PORTAL_PHONE_SIGNIN` (unless phone sign-in comes back), any `sk_test_…` key. Live Stripe keys are refused anywhere but production (`lib/stripe.ts`), and previews only ever get test keys (`scripts/deploy-portal-preview.sh`).

**Crons** (in `vercel.json`, already scheduled, use `CRON_SECRET`): weekly leads email (Mon 09:00 Dubai) and portal housekeeping daily at 06:00 Dubai (auto-complete, retention deletes, expiry warnings, Overdue invoices, last month's statements, the weekly Instagram token renewal; from the 25th, month-end invoice drafts for review; approved invoices published on their date with the "New invoice" email).

## 6. Launch day (about an hour, a quiet morning)

- [ ] **Akash** — freeze: no admin edits during the switch. A day before, lower the Cloudflare TTL of the `milkywayy.com` and `www` records to 5 minutes and **screenshot the current DNS records** (for rollback). Don't touch MX, SPF, DKIM or other email records.
- [ ] **Claude** — clean test data (test leads such as MW-1064, leftover "E2E" content), apply the e2e-accounts decision, reset the lead counter (section 2).
- [ ] **Claude** — set the production env (section 5) and redeploy. The build runs the content check: if it lists anything, fix it in the admin (section 1) and redeploy.
- [ ] **Claude** — Vercel → `milkywayy-web` → Settings → Domains: add `milkywayy.com` (primary) and `www.milkywayy.com` (redirect 308 → `milkywayy.com`). Vercel shows the exact records.
- [ ] **Akash** — Cloudflare DNS for `milkywayy.com`: `A @ 76.76.21.21` and `CNAME www cname.vercel-dns.com` (exactly what Vercel shows), both **DNS only (grey cloud)** so Vercel can issue the certificate.
- [ ] **Claude** — SSL check: both domains "Valid Configuration" with a certificate; `https://milkywayy.com` loads; `http://` → `https://`; `www` → apex; old paths redirect for good (`/booking`, `/book-now` → `/property-shoots#booking`; `/client-login`, `/login`, `/dashboard`, `/portal-login` → `/portal/login`; `/portfolio`, `/privacy-policy`).
- [ ] **Akash** — Supabase Site URL `https://milkywayy.com` (section 2) if not done.
- [ ] **Akash + Claude** — Stripe live (section 7).
- [ ] **Akash** — Google Search Console: Domain property for `milkywayy.com` (TXT record in Cloudflare) → Sitemaps → `https://milkywayy.com/sitemap.xml` → URL inspection → request indexing for `/`. Optional: Bing Webmaster Tools import. Meta → Business settings → Domains → verify `milkywayy.com`.
- [ ] **Claude** — post-launch smoke tests (section 8).

## 7. Stripe live

- [ ] **Akash** — Stripe account activated for live payments (business details, bank account for payouts). Card payments show for USD clients and any client switched to "Card" on their page.
- [ ] **Akash** — put the live secret key in Vercel Production as `STRIPE_SECRET_KEY` (section 5), and, for one run only, in `.env.local` as `STRIPE_LIVE_SECRET_KEY`.
- [ ] **Claude** — only after the domain switch: `node --env-file=.env.local scripts/stripe-live-webhook.mts --confirm`. It refuses unless the key is live and `https://milkywayy.com/api/stripe/webhook` is our site; creates the live endpoint for `checkout.session.completed` and `checkout.session.async_payment_succeeded`; stores its signing secret in Vercel Production as `STRIPE_WEBHOOK_SECRET` without printing it. Then redeploy production.
- [ ] **Akash** — remove `STRIPE_LIVE_SECRET_KEY` from `.env.local`.
- [ ] **Akash** — one real payment: a small USD test invoice to yourself, Pay now with your own card, check it flips to Paid with the "Payment received" email; refund it in Stripe.

## 8. Post-launch smoke tests

**Claude:**
- [ ] `BASE_URL=https://milkywayy.com npx playwright test --project=desktop --project=mobile` (public, lead and QA tests; test leads are flagged and deleted). Includes "every WhatsApp link uses the business chat number": every button opens **+971 50 726 3306**; the Twilio number **+971 50 830 5678** appears nowhere.
- [ ] Lighthouse mobile on Home, Property shoots and one live listing page.
- [ ] `/api/health` returns 200; send a test alert: `curl -H "Authorization: Bearer $CRON_SECRET" https://milkywayy.com/api/health?test-alert=1`.
- [ ] The portal on production: sign in with a test email code, create a test client in the admin, invite email arrives (in the inbox, not spam), add a past project with one file, download it as the client, make a share page and open it signed out, then delete the test client.

**Akash, on his phone:**
- [ ] Tap WhatsApp in the header, the mobile bar, a form hand-off and the booking builder; each opens the business chat.
- [ ] Send one real request (Contact, reply by WhatsApp): "Ref #MW-1001", the alert email arrives, it's in Admin → Leads. Then mark it Lost or delete it.
- [ ] Tracking: Meta Events Manager → Overview shows PageView, ViewContent, Contact, Lead (Browser + Server, deduplicated); GA4 Realtime shows page views and `generate_lead`; Clarity shows a recording within ~2 hours.
- [ ] Open one live listing link in WhatsApp and check the preview card.
- [ ] Check the housekeeping cron ran (Vercel → Cron Jobs) the day after; on the 1st, check last month's statements froze.

## 9. Rollback

Pick the smallest step that fixes it:
1. **A bad deploy:** Vercel → `milkywayy-web` → Deployments → the last good one → **Promote** (instant), or tell Claude "roll back to the previous deployment".
2. **Content mistake:** fix it in the admin; the dashboard's change log shows who changed what; prices keep old → new history.
3. **Tracking misbehaving:** `NEXT_PUBLIC_TRACKING=off` in Vercel, redeploy.
4. **Card payments misbehaving:** delete `STRIPE_SECRET_KEY` in Vercel Production and redeploy: "Pay now" disappears, bank transfer and manual "mark paid" keep working. Disable the endpoint in Stripe if needed.
5. **The site is broken or unreachable:** in Cloudflare, put back the old DNS records from the launch-day screenshot. With the 5-minute TTL most visitors are back on the old site within minutes. (The portal then isn't reachable; its data stays safe in Supabase.) Tell Claude what happened.
6. **Database problem:** the website keeps showing the last version it loaded and you get an alert; restore from Supabase → Database → Backups (Pro, daily, 7 days).

## 10. The week after

- [ ] **Akash** — keep the old site's hosting running for 2 weeks, untouched, for rollback.
- [ ] **Akash** — watch Search Console (Pages, Coverage) and the Monday leads email.
- [ ] **Akash** — raise the Cloudflare TTL back to Auto once stable.
- [ ] **Claude** — re-run Lighthouse and the full test suite; fix anything found.

## 11. Akash-only cleanup

- [ ] **Twilio:** delete the two old Verify services **MilkyyWay** and **MilkyWayy** (keep **Milkywayy**, `VAb74f…`). Optionally delete the empty duplicate Messaging Service "whatsapp_notifications_service" (`MG594f0b…`; the live one is `MG364b…`). Keep the balance topped up with auto-recharge if Twilio notifications are used.
- [ ] **Old portal and hosting:** after the 2-week rollback window, switch off the old portal and the old site's hosting (and their domains/subdomains). Nothing on the new site points to them.
- [ ] **Dev project:** once nothing needs it, pause or delete `milkywayy-portal-dev` (it costs extra compute on Pro) and empty/delete the `milkywayy-portal-dev` R2 bucket. Before that, keep `NEXT_PUBLIC_PORTAL_SUPABASE_URL` in `.env.local` pointing at dev, so tests never touch production.
- [ ] **Code (Claude, when the dev project goes):** remove `scripts/deploy-portal-preview.sh` and the `deploy:portal-preview` script, `scripts/stripe-preview-webhook.mts`, and the `LEADS_DB`/`NEXT_PUBLIC_PORTAL_*` branches.

## 12. Running the site day to day

**Admin:** `/admin` (password plus your authenticator app). Everything you save is live in
seconds, no deploy. Drafts and unpublished items never show; **Preview** shows real pages with
your drafts under a yellow bar.

| Section | What you do there |
|---|---|
| Dashboard | New leads, latest leads, unpublished drafts, recent changes, "Refresh the whole site". |
| Leads | Every form and booking. Search, filter, status (New → Contacted → Quoted → Won/Lost), private notes, WhatsApp/Email/Call, **Export CSV**. |
| Portfolio | Add item → upload image/poster → focal point → alt text → video link → **Where it shows** and format → **Save & publish**. Drag to reorder per placement. |
| Case studies · Before/after · AI avatars · Reviews · FAQs · Stats · Clients | Same flow. FAQs: untick "Wording not final" when final. |
| Pricing | Property tables and other prices; **Publish…** shows every change old → new and asks to confirm. |
| Site settings · SEO | WhatsApp number, email, address, licence, Google rating, showreel, booking days/slots; per-page titles, descriptions and share images. |
| Projects | The board and list; each project: status buttons (email the client, or "Send on WhatsApp"), deliveries (upload or link, publish), line items, messages, revisions. |
| Client accounts | New client + invite email, Resend invite, Add past project, plan and billing, statements, rates, share pages, "View as client". |
| Billing | Invoices (Ledger PDF upload, statement prefill, bank-transfer proofs to confirm/reject), Rate card, Packages (templates), Suggestions, Settings (bank details, VAT). |
| Listings | Every client share page and collection with views and taps; Reported filter; turn a page off with a reason. |
| Admins | Who can sign in (Owner only). |

Images upload from your phone and become WebP automatically (max 15 MB); always set the focal
point and alt text. Videos: paste a Bunny, Mux, YouTube or Vimeo link; the image is the poster.

**Adding an editor:** Admin → Admins → their email, role Editor; they sign in with an email code
or password (sign-ups are on for the portal, but only emails in Admins reach the admin). Owners
set up an authenticator app on first sign-in. Remove someone in Admin → Admins.

**Emails and alerts:** new leads to hello@milkywayy.com; Monday leads summary; "⚠ Website …"
alerts (one per problem per hour; forward them to Claude); portal emails to clients from
`portal@milkywayy.com` (status changes, deliveries, invoices, payments, invites), each a choice in
their Settings. **WhatsApp:** every button uses **+971 50 726 3306**; the Twilio number
+971 50 830 5678 is for notifications only (the admin refuses it as the chat number).

**Monitoring:** UptimeRobot (free, hello@milkywayy.com): `https://milkywayy.com/` and
`https://milkywayy.com/api/health` every 5 minutes. Logs: Vercel → Logs, search `[data]`,
`[lead]`, `[capi]`, `[alert]`, `[portal]`, `[stripe]`.

**Accounts (names only):** Vercel (hello@milkywayy.com, team `milkywayy1`, project
`milkywayy-web`) · GitHub (`MilkywayyLLC/milkywayy-web`) · Supabase (org "MilkywayyLLC's Org",
project `milkywayy-web`) · Cloudflare (DNS; R2 buckets) · Resend · Stripe · Meta Business ·
GA4 · Clarity · Cal.com (pending) · UptimeRobot · Twilio (notifications only). Secrets live in
Vercel (and Claude's `.env.local` for development, never committed); server secrets are stored
in Supabase as hashes only; no service-role key is used anywhere.

**Asking Claude Code for changes:** open Claude Code in `Documents/milkywayy-web`, say what you
want in plain words (page, screenshot if you have one). Ask it to run the tests and deploy a
preview first; review on your phone; then "ship it". It never changes prices or content in the
database, switches DNS, upgrades paid plans or handles your passwords without you.

**If phone sign-in comes back** (`NEXT_PUBLIC_PORTAL_PHONE_SIGNIN=on`): Supabase Phone provider
with Twilio Verify (Account SID, Auth Token, Verify Service SID), deploy Edge Functions
`send-sms` and `otp-feedback` (JWT checks off) with their secrets (`TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `PORTAL_HOOK_SECRET`, `SEND_SMS_HOOK_SECRET`),
turn on the Send SMS hook, add `PORTAL_HOOK_SECRET` to Vercel, raise the SMS rate limit, and
decide on a CAPTCHA (Cloudflare Turnstile).
