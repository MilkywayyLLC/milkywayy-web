# Launch runbook

Step by step, with who does what. **Akash** does anything that needs his logins or a decision;
**Claude** (Claude Code, in this repo) does the rest and reports back. Nothing here runs until
Akash says go.

Current state (2 Oct 2026): the new site runs at https://milkywayy-web.vercel.app as Vercel
project `milkywayy-web` (its "production" deployment is our staging), locked with `noindex`.
The old site is still live on milkywayy.com.

---

## A. One to two weeks before

| # | Step | Who |
|---|---|---|
| A1 | Clear `LAUNCH_BLOCKERS.md` (content, legal review). | Akash, Claude removes the draft labels |
| A2 | **Supabase Pro.** Supabase → Organization "MilkywayyLLC's Org" → Billing → Upgrade to Pro (USD 25/month incl. the project's compute). Gives daily backups (7 days), no free-tier pausing, and leaked-password protection. | Akash (payment) |
| A3 | **Leaked-password protection.** Supabase → Authentication → Sign In / Providers → Email → turn on "Prevent use of leaked passwords". Then confirm the advisor is clean. | Akash, Claude checks |
| A4 | **Sign-ups off and your login.** Authentication → Sign In / Providers → "Allow new users to sign up" off. Confirm you can sign in at `/admin` with your authenticator. | Akash |
| A5 | **e2e test accounts** (decision below). | Akash decides, Claude applies |
| A6 | **Cloudflare TTL.** Note the current DNS records for `milkywayy.com` and `www` (screenshot) and lower their TTL to 5 minutes, so a switch (and a rollback) takes effect fast. Don't touch MX, SPF, DKIM or any email records. | Akash |
| A7 | **Uptime monitor** (see Monitoring). | Akash |
| A8 | **Old links.** Decide what happens to the old client portal (`/dashboard`, `/c/*`, `/l/*` currently go to `/client-login`). If it moves to a subdomain (e.g. `app.milkywayy.com`), tell Claude to point those redirects there. | Akash |

### A5. The e2e test accounts: decision

Three test accounts live in the production database: `e2e-owner@`, `e2e-editor@` and
`e2e-stranger@example.com` (passwords only in Claude's `.env.local`). `e2e-owner` is a second Owner.

**Recommendation:** delete `e2e-owner` at launch and keep the other two.

- After launch, the public and lead tests keep running against the live site. Their leads are
  marked as tests, never email you, and are deleted afterwards.
- The admin tests that need an Owner (editing prices and settings) then run only against a
  separate test database. When you want them, Claude creates a Supabase branch (Pro, billed by
  the hour, a few cents per run) and runs them there.
- Editor and non-admin tests (content editing, access checks) keep working in production with
  `e2e-editor` and `e2e-stranger`. Content tests create items tagged "E2E" and delete them.

The alternatives:
- **Delete all three.** Admin tests then only run on a test database.
- **Keep all three.** The most convenient option, but it leaves a second Owner key on Claude's laptop.

## B. Launch day (about 1 hour, best on a quiet morning)

| # | Step | Who |
|---|---|---|
| B1 | **Freeze.** No admin edits during the switch. | Akash |
| B2 | **Clean up test data.** Delete test leads (e.g. MW-1064 "Jarvis test lead") and any leftover "E2E" items, apply the A5 decision, then reset the reference counter so the first real lead is MW-1001: `alter sequence public.lead_ref_seq restart with 1001;` (only after the test leads are gone, because refs must stay unique). | Claude |
| B3 | **Production env** in Vercel (Production): `NEXT_PUBLIC_SITE_ENV=production` (removes the noindex lock and opens robots.txt) · `NEXT_PUBLIC_SITE_URL=https://milkywayy.com` (already) · `NEXT_PUBLIC_TRACKING=on` (or delete it: production defaults to on) · delete `META_TEST_EVENT_CODE` (test code is ignored outside test mode anyway). Then redeploy. | Claude |
| B4 | **Add the domains in Vercel:** `milkywayy.com` (primary) and `www.milkywayy.com` (redirect 308 → `milkywayy.com`). Vercel shows the DNS records to set. | Claude |
| B5 | **Cloudflare DNS:** for `milkywayy.com` set `A @ 76.76.21.21` and for `www` set `CNAME www cname.vercel-dns.com`, using exactly what Vercel shows in B4. Set both to **DNS only (grey cloud)** so Vercel can issue the SSL certificate. Leave all email records alone. | Akash |
| B6 | **SSL and redirects.** Wait for Vercel to show both domains "Valid Configuration" with a certificate (usually minutes). Check: `https://milkywayy.com` loads; `http://` → `https://`; `www.milkywayy.com` → `milkywayy.com`; old URLs redirect (`/booking`, `/portfolio`, `/privacy-policy`, `/dashboard`). | Claude |
| B7 | **Smoke test on the live domain:** `BASE_URL=https://milkywayy.com npx playwright test --project=desktop --project=mobile` (public, lead and QA tests; test leads are flagged and deleted), plus Lighthouse on Home and Property shoots. | Claude |
| B8 | **WhatsApp numbers check.** Every WhatsApp button and every form hand-off must open **+971 50 726 3306** (business chat). The Twilio API number **+971 50 830 5678** must appear nowhere. Automated: the QA test "every WhatsApp link uses the business chat number" (part of B7). Manual: Akash taps the WhatsApp icon in the header, the mobile bar, a form hand-off and the booking builder on his phone and checks the chat that opens. | Claude + Akash |
| B9 | **Lead end to end.** Akash sends one real request from his phone (Contact, reply by WhatsApp). Check: WhatsApp opens with "Ref #MW-1001", the alert email arrives, it shows in `/admin/leads`. Then mark it Lost or delete it. | Akash |
| B10 | **Tracking live.** Meta Events Manager → Overview (not Test events): PageView, ViewContent, Contact and Lead arrive, and Lead shows Browser + Server deduplicated. GA4 → Reports → Realtime shows page views and `generate_lead`. Clarity shows a recording within ~2 hours. | Akash |
| B11 | **Search Console.** Add a Domain property for `milkywayy.com` (verify with the TXT record it gives you, in Cloudflare). Then Sitemaps → submit `https://milkywayy.com/sitemap.xml`, and URL inspection → request indexing for `/`. Optionally import into Bing Webmaster Tools. | Akash |
| B12 | **Meta domain verification.** Business settings → Brand safety → Domains → add `milkywayy.com`, verify with its DNS TXT record. | Akash |
| B13 | **Supabase Auth URLs.** Authentication → URL Configuration → Site URL `https://milkywayy.com`. | Akash |
| B14 | **Test alert.** Claude sends one (`/api/health?test-alert=1` with the cron secret) to confirm alerts reach you from production. | Claude |

## C. The week after

| # | Step | Who |
|---|---|---|
| C1 | Keep the old site's hosting running for 2 weeks, untouched, for rollback. | Akash |
| C2 | Watch Search Console (Pages, Coverage) and the Monday leads email. | Akash |
| C3 | Raise Cloudflare TTL back to Auto once stable. | Akash |
| C4 | Re-run Lighthouse and the full test suite; fix anything found. | Claude |

## Rollback plan

Pick the smallest step that fixes it:

1. **A bad change after launch:** Vercel → milkywayy-web → Deployments → the last good one →
   **Promote** (instant). Or tell Claude "roll back to the previous deployment".
2. **Content mistake:** fix it in the admin. The dashboard's change log shows who changed what,
   and prices keep old → new history.
3. **Tracking misbehaving:** set `NEXT_PUBLIC_TRACKING=off` in Vercel and redeploy. The site is
   unaffected.
4. **The new site is broken or unreachable:** in Cloudflare, put back the old DNS records from
   the A6 screenshot. With the 5-minute TTL, most visitors are back on the old site within minutes.
   Then tell Claude what happened.
5. **Database problem:** the site keeps showing the last version it loaded (it never shows broken
   or sample content), and you get an alert. Supabase Pro has daily backups to restore from
   (Database → Backups).

## Monitoring (set up in Phase 8)

- **Error alerts** come to `hello@milkywayy.com` from the site itself through Resend. They
  cover server errors, database read failures, a lead that couldn't be saved, and errors in our
  own scripts in visitors' browsers. You get one email per problem per hour. They're active in
  production only (`ALERTS=on` turns them on elsewhere). Send a test with
  `curl -H "Authorization: Bearer $CRON_SECRET" https://milkywayy.com/api/health?test-alert=1`.
- **Uptime:** create a free UptimeRobot account (hello@milkywayy.com) with two HTTP(s)
  monitors, both every 5 minutes, alerting by email and the mobile app:
  `https://milkywayy.com/` and `https://milkywayy.com/api/health` (200 = site and database fine,
  503 = database unreachable).
- **Weekly leads email:** every Monday 09:00 Dubai (Vercel Cron), the past 7 days' leads with
  their status and links, to `LEAD_EMAIL_TO`.
- **Logs:** Vercel → milkywayy-web → Logs. Search `[data]`, `[lead]`, `[capi]` or `[alert]`.
