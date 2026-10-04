# Client portal (Phases 9–13), billing, website refinement and launch prep

**Do not merge until Akash says go.** Merging deploys `main` to staging (still `noindex`); production stays untouched until the steps in `LAUNCH.md`.

Everything since `main` (77027fb), 28 commits, 283 files.

## Client portal (`/portal`)
- **Accounts and sign-in (Phase 9):** companies and individuals with Owner / Admin / Member roles, email-code sign-in (6 digits, password optional), first-run onboarding, claiming earlier bookings, Team, Contacts, Settings, per-person email notification choices. Admin → Client accounts with "View as client". (WhatsApp sign-in is built and switched off.)
- **Shoots, deliveries, revisions (Phase 10):** one project engine with status steppers, deliveries straight to R2 (resumable uploads, signed downloads, photo previews), two revision rounds, messages, auto-complete after 7 days, retention with deletion warnings; admin Projects board/list with status emails and "Send on WhatsApp". Website bookings arrive as Requested projects and attach to the account of the email.
- **Editing batches and AI avatar videos (Phase 11):** client uploads or links, script approval, the matching emails.
- **Billing (Phase 12 + add-on):** invoices from Milkywayy Ledger (PDF, Overdue automatically), rate card with per-client rates, line items, private packages and internal templates (AED/USD, overage, 6-month discount), a package suggestion engine (last 3 complete months, minimum saving, pinned offers), calendar-month packages with a pro-rated first month, month-end statements frozen on the 1st (optional VAT) that prefill invoices, Stripe "Pay now" (card, non-AED) and bank transfer with proof → confirm/reject. Clients see money only on invoices (each with its statement breakdown); Members never see prices.
- **Listing share pages (Phase 13):** `/l/<slug>` and `/c/<slug>` from delivered or past shoots: photos (web versions), reel, video, 360, DLD permit + QR, contacts with WhatsApp/Call, OG previews, noindex, views/taps without bots, pause/expiry, admin takedown and reports.
- **Onboarding without an import (Phase 14 replaced):** create clients in the admin and email "Your Milkywayy portal is ready" (resend, sent date); add their earlier work as past projects (Completed, original date, files kept from the day added, no email unless ticked).

## Website
- Refinement pass: logo, homepage structure, stat count-up, dashboard showcase (no overlap between screens; month-end sample invoices), reviews marquee, portfolio formats, AI avatar plans, booking fixes (send disabled until a property has a service).
- Old site paths: `/client-login`, `/login`, `/dashboard`, `/portal-login` → `/portal/login`; `/book`, `/book-now`, `/booking` → `/property-shoots#booking` (301). The old portal is not redirected to; the `/portal-preview` mockup is removed.
- **No sample can ship:** sample items hide themselves once real ones exist (reviews: 3), and a production build (`NEXT_PUBLIC_SITE_ENV=production`) fails while anything sample, placeholder or draft would show (`scripts/launch-check.mts`, `content/launch.ts`). It currently lists 25 content items for Akash (see `LAUNCH.md` → Content).

## Database
16 portal migrations (`20261002200000` … `20261017090000`), applied to the dev project only; production gets them at launch, in order (`LAUNCH.md` → section 2). Nothing in `supabase/dev/` ever goes to production.

## Launch
`LAUNCH.md` is now the single runbook (replaces `LAUNCH_BLOCKERS.md`, `PORTAL_CHECKLIST.md`, `HANDOVER.md`): content, production Supabase/R2/Vercel env (names only), launch day and domain switch, Stripe live (`scripts/stripe-live-webhook.mts`, after the switch), smoke tests, rollback, cleanup.

## Checks
Lint, typecheck and build pass. Playwright: 271/271 public + admin + portal-admin, portal suite green (rate-limited files rerun). Homepage Lighthouse 96 (unchanged). A real Stripe test-mode payment went through end to end on the preview webhook. Latest preview: https://milkywayy-n0gl4chk3-milkywayy1.vercel.app

🤖 Generated with [Claude Code](https://claude.com/claude-code)
