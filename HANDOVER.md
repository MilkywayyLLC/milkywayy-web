# Handover: milkywayy.com

How to run the new site day to day. Written for Akash; nothing here needs code.

- **Site:** https://milkywayy.com after launch (staging today: https://milkywayy-web.vercel.app)
- **Admin:** `/admin` (password plus your authenticator app)
- **Launch steps:** `LAUNCH.md` · **Still to supply:** `LAUNCH_BLOCKERS.md` · **Why things are the way they are:** `DECISIONS.md`

---

## 1. Editing content in the admin

Everything you save goes live on the site within a few seconds, with no deploy. Drafts and
unpublished items never show to visitors. **Preview** shows the real pages with your drafts in
them, under a yellow bar; "Exit preview" leaves.

| Section | What you do there |
|---|---|
| **Dashboard** | New leads this week, latest leads, unpublished drafts, recent changes, "Refresh the whole site". |
| **Leads** | Every form and booking request. Search, filter by type or status, open one to see everything they sent (bookings include the estimate at the time). Set the status (New → Contacted → Quoted → Won/Lost), keep private notes, tap WhatsApp/Email/Call. **Export CSV** downloads the current filter. |
| **Portfolio** | Add item → upload the image (or the video's poster) → tap the focal point → alt text → video link if any → tick **Where it shows** → **Save & publish**. Filter by placement and drag to reorder that placement. |
| **Case studies** | Same flow. "Web address" becomes `/work/…`. The two-line headline is up to 18 characters a line. |
| **Before / after** | Two uploads, same framing. "Show in the Post-production hero" moves the hero pair to this one. |
| **AI avatars** | Example list (poster + clip link), plus **Edit the hero** for Adam (draft → preview → publish). |
| **Reviews** | Text, name/role/company, rating, link, and the pages it shows on. The Google rating and count live in Site settings. |
| **FAQs** | Filter by page, drag to reorder. "Wording not final" keeps a small draft note on the site and leaves it out of Google's FAQ results; untick it when final. |
| **Stats** | Value + label; optional different label on Post-production; drag to reorder per page. |
| **Clients** | Names (logos optional) and which pages show the proof strip (live immediately). |
| **Pricing: Property shoots** | The full price tables. Edited cells turn gold. **Publish…** lists every change old → new and asks you to confirm. History is below the tables. |
| **Pricing: Other prices** | Production "from" price, Post-production rates, AI avatar tiers. Same confirm step. |
| **Site settings** | WhatsApp number, email, address, licence, footer line, Google rating, founder, showreel, booking days/slots/window. Same draft → preview → publish flow. |
| **SEO** | Per page: the title and description Google shows, and the share image used on WhatsApp/LinkedIn/Facebook. Leave empty to use the built-in ones (shown in grey). |
| **Admins** | Who can sign in (Owner only). |

**Images:** upload straight from your phone. They're shrunk and converted to WebP
automatically (max 15 MB). Always tap the focal point (the face or key detail) and write a
short description (alt text).
**Videos:** paste a Bunny, Mux, YouTube or Vimeo link; the image is the poster.
**Phone use:** every screen works one-handed; Save/Publish sit in a bar at the bottom.

## 2. Adding an editor

Editors can change content (portfolio, case studies, before/after, AI avatars, reviews, FAQs,
stats, clients, SEO) but not prices, settings, leads or admins. They don't need two-factor.

1. Admin → **Admins** → add their email, role **Editor**.
2. Supabase → project `milkywayy-web` → Authentication → Users → **Add user** → Create new user:
   their email, a temporary password, tick **Auto Confirm User**.
3. Send them the address `/admin` and the password privately (not in the same message).

To remove someone, delete them in Admin → Admins (they lose access at once), then delete the
user in Supabase. To make someone an **Owner**, choose Owner in step 1. They'll set up an
authenticator app on first sign-in.

## 3. Leads, alerts and emails

- **New lead:** an email to hello@milkywayy.com with everything they sent (reply goes to them).
  Visitors who chose "Email" get a short confirmation from the site.
- **Every Monday 09:00 (Dubai):** a summary of the week's leads.
- **Something broken:** an alert email titled "⚠ Website …" (server errors, database
  problems, a lead that couldn't be saved, script errors in visitors' browsers). You get one per
  problem per hour. Forward it to Claude Code (see 5).
- **Uptime:** UptimeRobot emails/app alerts if the site or its database stops answering
  (set up in `LAUNCH.md`).
- **WhatsApp numbers:** every WhatsApp button uses **+971 50 726 3306** from Site settings. The
  Twilio number **+971 50 830 5678** is for notifications only; the admin refuses it as the chat
  number and a test checks every page.
- **Messages to +971 50 830 5678:** the sender gets one automatic reply a day pointing to the chat
  number, and every message is emailed to you ("WhatsApp to the updates number from …") with a
  link to reply from your phone.

## 4. Where every account and key lives (names only)

| Service | What it's for | Account | Where the keys are |
|---|---|---|---|
| **Vercel** | Hosting, deploys, logs, cron | hello@milkywayy.com, team `milkywayy1`, project `milkywayy-web` | Project → Settings → Environment Variables |
| **GitHub** | Code | org `MilkywayyLLC`, repo `milkywayy-web` | — |
| **Supabase** | Database, admin logins, image storage | org "MilkywayyLLC's Org" (hello@milkywayy.com), project `milkywayy-web` (`hyfanoysynsyxkpfqdxi`, Mumbai) | The site uses the public key only. Server secrets are stored there as hashes only (`private.app_secrets`) |
| **Resend** | Lead emails, alerts, weekly summary | hello@milkywayy.com | `RESEND_API_KEY` in Vercel |
| **Meta** | Pixel + Conversions API | Business Manager, Events Manager pixel | `NEXT_PUBLIC_META_PIXEL_ID`, `META_CAPI_TOKEN` (and `META_TEST_EVENT_CODE` only for testing) |
| **Google Analytics 4** | Analytics, key events | GA4 property for milkywayy.com | `NEXT_PUBLIC_GA4_ID` |
| **Microsoft Clarity** | Heatmaps, recordings | Clarity project | `NEXT_PUBLIC_CLARITY_ID` |
| **Cloudflare** | DNS for milkywayy.com | Akash | — |
| **Cal.com** | 15-minute call booking (pending) | to create | `NEXT_PUBLIC_CAL_LINK` |
| **UptimeRobot** | Uptime checks | to create (`LAUNCH.md`) | — |
| **Twilio** | WhatsApp notifications number: auto-reply + forwarding (and portal sign-in codes, later) | Akash | `TWILIO_AUTH_TOKEN` in Vercel |

**Environment variables** (Vercel → Settings → Environment Variables; a copy for development lives
in Claude Code's `.env.local`, never committed):

- **Public settings:** `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_ENV` (`staging` = noindex lock, `production` = live), `NEXT_PUBLIC_CLIENT_LOGIN_URL`, `NEXT_PUBLIC_CAL_LINK`, `NEXT_PUBLIC_TRACKING` (`on`/`test`/`off`), `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_CLARITY_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the public key).
- **Secrets** (marked Sensitive in Vercel): `LEAD_SECRET` (saving leads, alert de-duplication), `REPORT_SECRET` (weekly leads read), `CRON_SECRET` (Vercel Cron, test alert), `REVALIDATE_SECRET` (outside refresh calls), `RESEND_API_KEY`, `META_CAPI_TOKEN`, `TWILIO_AUTH_TOKEN` (checks WhatsApp webhooks come from Twilio).
- **Email:** `LEAD_EMAIL_TO`, `LEAD_EMAIL_FROM`, `ALERT_EMAIL_TO`, `WHATSAPP_FORWARD_TO` (optional; messages to the notifications number, default `LEAD_EMAIL_TO`).
- **Behaviour:** `LEAD_STORE` (`supabase`), `LEAD_RATE_LIMIT`, `ALERTS`, `META_TEST_EVENT_CODE`.

No service-role (master) key is used anywhere.

## 5. Asking Claude Code for changes later

1. Open Claude Code in the folder `Documents/milkywayy-web`. It reads `CLAUDE.md`/`AGENTS.md`,
   and should read `DECISIONS.md` before changing anything.
2. Say what you want in plain words, the way you've been doing. Mention the page and, if you
   have one, a screenshot. Examples:
   - "Add a 'Drone' tab to the Property shoots gallery and a Drone option in the booking builder at AED 300."
   - "The alert email says 'database read failed: faqs'. Find out why and fix it."
   - "Move the testimonials above the FAQs on Home, phone and desktop."
   - "Point Client login and /c/* links at app.milkywayy.com."
3. Ask it to **run the tests** (`npm test`; on Safari `npm run test:ios`) and to **deploy to
   staging first**. Review on your phone, then say "ship it".
4. Things it must never do without you: change prices or content in the database (that's your
   admin), switch DNS, upgrade paid plans, or handle your passwords.

Routine jobs Claude can do on request: rotate a secret (new value in Vercel + `.env.local`,
hash in Supabase), reset the reference counter, export or clean leads, add a page, re-run
Lighthouse.

## 6. Later: client portal (Phases 9–14)

See `CLIENT_PORTAL_GUIDE.md`. Already in place for it: leads with E.164 phones and lower-case
emails, server-issued unique refs, and one structured row per booked property
(`booking_properties`).

**Done (3 Oct 2026):** the automatic reply and email forwarding on the notifications number
(see §3). Twilio's incoming-message webhook for Messaging Service "whatsapp_notifications_service"
points at `/api/whatsapp/inbound`; it needs `TWILIO_AUTH_TOKEN` in Vercel.
