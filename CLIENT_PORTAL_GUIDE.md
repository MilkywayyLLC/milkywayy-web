# Milkywayy Client Portal: Build Guide

*Version 2 · 3 Oct 2026 · Phases 9–14, which start after the website launches (Phase 8). v2: sign-in and notifications are email only; WhatsApp is sent by hand from the admin (owner, 3 Oct 2026).*

This guide sits next to `MILKYWAYY_BUILD_GUIDE.md`. Everything in that guide still applies here: the stack, the Viewfinder design system, the performance budget, testing, RLS-first security and the "stop for review" rhythm. This file only adds what the portal needs.

---

## 0. What we're building, in one paragraph

Clients get one login at **milkywayy.com/portal**. It's one dashboard that changes with the services the client actually uses, not a separate dashboard per service:
- **Property shoots:** follow each booking from request to delivery, download files, ask for revisions, and turn delivered media into a shareable listing page.
- **Post-production:** submit editing batches (title, notes, reference link, raw files), follow status, download, ask for revisions, and reopen any completed project with a new request.
- **AI avatars:** follow avatar videos from brief to script approval to delivery.

Everyone gets invoices, a monthly running total for pay-as-you-go work, their package (or a suggested one), saved contacts and their team. Akash runs all of it from the existing admin panel. Every status change updates the portal live and emails the client (Resend, from a milkywayy.com address); from the admin, Akash can also send a ready-written WhatsApp from his own phone.

---

## 1. Core decisions (already made — don't revisit)

| # | Decision | Why |
|---|---|---|
| D1 | **One account per client with one dashboard; tabs appear for the services the client uses.** | One client can use shoots, post-production and avatars. Separate logins would mean juggling accounts. |
| D2 | **An account is a client (person or company) that can have several members.** | Brokerages have many agents. This brings over the old portal's agency/agent feature. |
| D3 | **One project engine behind every service.** Shoot, edit batch and avatar video are all *projects*, each type with its own status pipeline. | Statuses, files, revisions, requests, notifications and the admin board are built once and work everywhere. |
| D4 | **Sign-in: email.** A 6-digit code by email (Supabase email OTP) is the main way in; a password is optional. *(v2, owner 3 Oct 2026: replaces WhatsApp OTP, which is built but switched off.)* | Simpler and free: no per-code Twilio cost, no template or language issues, works the same for UAE and overseas clients. |
| D5 | **Raw files: a link first (Drive, Dropbox, OneDrive, WeTransfer, Frame.io); direct upload as a second option.** | Raw footage runs to tens of GB. Links cost nothing and never fail mid-upload. Direct upload is for smaller jobs. |
| D6 | **Files we host go on Cloudflare R2, not Supabase Storage.** | R2 doesn't charge for downloads. Clients downloading 4K videos and full photo sets would cost real money on any storage that charges for downloads. |
| D7 | **No online payment in the portal.** Invoices are shown and downloadable, and marked paid by admin. | Matches the site: pay by invoice after delivery. |
| D8 | **Same Next.js app, same Supabase project, same design system.** The portal is **light tone**. | One codebase, one login system, one admin. Light tone because this is a working tool. |
| D9 | **Revisions: 2 rounds included per project**, shown as "Revision 1 of 2". Admin can grant extra rounds. | Same rule the site already states. |

---

## 2. Where things live

```
milkywayy.com/portal              → client dashboard (signed-in)
milkywayy.com/portal/login        → email code (or optional password)
milkywayy.com/portal/welcome      → first-time onboarding questions
milkywayy.com/l/<slug>            → public listing share page (noindex)
milkywayy.com/c/<slug>            → public collection (several listings, noindex)
milkywayy.com/admin/...           → existing admin, gains Clients, Projects, Billing, Listings
```

The header "Client login" button goes to `/portal/login`, or to `/portal` if already signed in.

> **⚠ Old share links.** The old portal already hands out links like `milkywayy.com/c/akash-2907`. When the new site takes over the domain at launch, those links break unless we handle them. Phase 8 has to either redirect `/c/*` and `/l/*` to wherever the old portal is hosted, or import the old links (Phase 14). See §11.

---

## 3. Accounts, members, sign-in

### 3.1 Account types
- **Individual**: one member.
- **Company**: company name, what they do (industry: Real estate brokerage / Developer / Holiday homes / Agency / Brand / Creator / Other + text), expected volume (free text), optional TRN for invoices.

### 3.2 Members and roles
| Role | Can |
|---|---|
| **Owner** | Everything, including team, billing, invoices and account details |
| **Admin** | Everything except removing the owner |
| **Member** (agent / editor contact) | Sees projects according to the account setting below; can submit batches and request revisions; no invoices unless granted |

**One account setting, carried over from the old portal:** "Members see only their own projects" or "Members see all company projects". No roles matrix in v1.

Invites: the owner adds a name plus an email (or a WhatsApp number, used when phone sign-in is on). The invitee signs in and lands straight in the account. The inviter sends the ready-made invite message from their own WhatsApp or email.

### 3.3 Sign-in
- **Email code (main):** enter your email, get a 6-digit code by email, enter it. The first time, this creates the account and verifies the email.
- **Password (optional):** set one in Settings, then "Sign in with a password instead". Reset by email.
- Codes and other auth emails go through Resend from a milkywayy.com address (Supabase's mail sender).
- *WhatsApp/SMS codes (Twilio Verify) are built but switched off (`NEXT_PUBLIC_PORTAL_PHONE_SIGNIN`); see DECISIONS.md to bring them back.*
- Sessions last 30 days on a trusted device.

### 3.4 First sign-in (onboarding, a single screen with 3 steps at most)
1. "Are you booking as an individual or a company?"
2. Company: company name, what you do, roughly how much you need each month (free text). Individual: name only.
3. "What are you here for?": Property shoots / Production / Post-production / AI avatars (multi-select). This sets which tabs show before any projects exist.

### 3.5 Claiming earlier bookings
Bookings and leads saved since Phase 6 carry the phone number (E.164) and the email. When someone signs in with a matching **verified** email (or phone, when phone sign-in is on), those bookings attach to their account automatically, and the dashboard shows "We found 3 earlier bookings". Bookings made while signed in attach directly.

---

## 4. The project engine

### 4.1 Project types and status pipelines

**Property shoot** (keeps the old portal's 5 steps, with one added at the front):
`Requested → Confirmed → Shot → Editing → Delivered → Completed`

**Post-production batch:**
`Submitted → Files received → In editing → Delivered → Completed`
(admin can also set *On hold – waiting on client* with a reason the client sees)

**AI avatar video:**
`Brief received → Script ready (client approves) → In production → Delivered → Completed`

**Revisions sit on top of any pipeline:**
`Revision requested → Revision in progress → Revision delivered`, tracked as round 1/2 or 2/2.

**Completed** is set by the client ("Approve") or automatically 7 days after the last delivery. The number of days is a setting.

### 4.2 Every project has
- Title, type, reference number (`MW-…`, the same format the booking flow uses), dates and assigned members.
- **Incoming files**: links and/or uploads with labels.
- **Deliverables**: grouped by delivery ("Delivery 1", "Revision 1"…) so earlier versions stay downloadable.
- **Activity timeline**: every status change, with time and who made it, visible to the client.
- **Request thread**: messages between the client and Milkywayy about this project. Works on completed projects too ("Need 5 more photos in square format").
- **Line items**: what was ordered and its price, which feeds pay-as-you-go totals and invoices.

### 4.3 Live updates
The portal subscribes to the client's own projects with Supabase Realtime, so a status change shows without refreshing. RLS limits the subscription to that account's rows.

---

## 5. What the client sees

### 5.1 Layout
- **Desktop:** a narrow left rail with the tabs. **Phone:** a bottom tab bar with 4 tabs at most, and the rest under "More".
- Top right: account switcher (when someone belongs to several accounts), **plan badge** ("Monthly: Growth" or "Pay as you go") and avatar menu.
- Tabs show only for services the account uses or chose at onboarding.

| Tab | Shows for |
|---|---|
| **Home**: what needs your attention (approve a script, a revision delivered, an invoice due) plus the latest activity | everyone |
| **Shoots** | property shoots / production |
| **Editing**: active batches, plus a Completed sub-tab | post-production |
| **Avatars** | AI avatars |
| **Listings**: share pages and collections | anyone with delivered shoots |
| **Billing**: invoices, this month's running total, plan | owner/admin (members only if granted) |
| **Team · Contacts · Settings** | owner/admin (Contacts: everyone) |

### 5.2 Shoots
- Cards with the status stepper (the old portal's stepper, restyled in Viewfinder).
- Requested / Confirmed: date, slot, address, services, Reschedule (opens WhatsApp with the reference number) and Cancel request.
- Delivered: **Download all** (the full-set zip Akash uploads with each delivery; owner, 3 Oct 2026), download by type (Photos / Reel / Long-form / 360 link), **Request revision**, **Create share link**.
- **Book another shoot** opens `/property-shoots` with contact details filled in.

### 5.3 Editing (post-production)
- **New batch** form: title*, what it is (HDR photos / Short-form / Long-form / Avatar edit / Other), quantity (optional), notes, reference link(s), raw files (paste links **or** upload), deadline wish (optional).
- **Batch card**: status, submitted date, count, latest delivery.
- **Batch page**: files in, deliveries, revision button with notes (the client can attach screenshots or point to timecodes in text), request thread.
- **Completed** sub-tab: past batches with search, downloads still available, and "Ask about this project" on each one.

### 5.4 Avatars
Same as Editing, plus **script approval**: Milkywayy posts a script, and the client either approves it or asks for changes with comments. Production starts only after approval.

### 5.5 Billing
- **Invoices**: number, date, amount, status (Due / Paid / Overdue), PDF download.
- **Pay as you go: this month so far.** A running total of delivered line items this month, marked as an estimate ("final invoice after month end").
- **Plan.** Monthly clients see the package name, what's included, usage this month ("7 of 10 reels"), and renewal date. Pay-as-you-go clients see a **suggested package** when the rules in §7.3 say so: "At your volume, Growth would save you about AED 1,150 a month. Talk to us →" (opens WhatsApp).

### 5.6 Contacts (for listing pages)
Saved points of contact shown as **pills**: name, role, WhatsApp, email, photo (optional), RERA/BRN number (optional). One contact is the default. When creating a share link the client just taps a pill.

### 5.7 Team, Settings
Invite and remove members, set roles, choose the visibility setting. **Email notifications:** each person chooses which events they get emails for; the Owner/Admins can add extra recipients per category (Projects, Billing; e.g. billing to accounts@their-company). Optional password. Company details for invoices.

---

## 6. Listing share pages (property shoots)

This takes the old portal's share flow and makes it better.

### 6.1 Creating one
On a delivered shoot, press **Create share link**. A sheet opens with:
- **Filled in from the booking:** location, property type, bedrooms, the media.
- **Client fills in:** title*, purpose* (Sale / Rent yearly / Holiday home), price* (AED; per year for rent, per night for holiday homes), size (sq ft), bathrooms, furnishing, description, highlights (chips), **DLD advertising permit number + QR** (optional field — *Akash to confirm the current DLD/Trakheesi rule for listing pages*), point of contact (pick pills, up to 2).
- Choose which photos to include and in what order (all by default), plus whether to include the reel, the long-form video and the 360 link.
- The details are saved to the property, so the next share is one tap.

### 6.2 The public page (`/l/<slug>`)
- Mobile-first: hero photo, swipe gallery (full screen), video, 360 button, price, key facts, description, highlights.
- A contact block with WhatsApp and Call buttons for the agent. The WhatsApp message is pre-filled: "Hi, I'm interested in {title} ({url})".
- Footer: **"Media & page by Milkywayy"** with a small CTA, which is the cross-marketing loop.
- `noindex`. Proper OG image and title so WhatsApp shows a rich preview.
- The agent's own branding (company name / logo) is optional.

### 6.3 Collections (`/c/<slug>`)
Select several listings to make one link ("3 homes picked for you"), curated by the agent. This is kept from the old portal.

### 6.4 Controls and stats
- Each link shows views and WhatsApp/Call taps, counted with bots excluded.
- Pause/resume, edit and delete. Expiry date is optional.
- Admin can disable any link (abuse or takedown).

### 6.5 Media for listings
Delivered photos are stored on R2 in full resolution for downloads, plus WebP versions sized for the web, generated on upload for share pages. Videos on share pages stream from Bunny/Mux; downloads come from R2.

---

## 7. Admin panel additions

### 7.1 Clients
- List with search and filters (service, plan, last activity).
- Client page: details, members, services used, **rates for this client** (the rate card by default, with per-client overrides), plan, projects, invoices, listings, notes (admin only), "Sign in as this client" (read-only view, logged).
- Create a client manually and send an invite.

### 7.2 Projects board
- A **board** (columns = statuses) and a **list** view. Filter by service, client and date. On a phone it's a list with one-tap status buttons.
- Project page:
  - status buttons (each one asks "Notify client?" with **email** ticked, and offers **Send on WhatsApp**: opens wa.me/<client's number> with a ready-written message (client name, project ref, portal link), sent by hand from Akash's own WhatsApp)
  - upload deliverables (multi-file, resumable, straight to R2) or paste a delivery link
  - line items, a revision counter (with +1 round), the request thread with reply, internal notes
- Bookings from the site (Phase 6) appear here as *Requested*. Confirming one sets the date and slot and notifies the client.

### 7.3 Billing
- **Invoices**: upload a PDF made in Milkywayy Ledger, enter the number, amount, date and client, and set the status. *(Later: a direct Ledger → portal sync, out of scope here.)*
- **Rate card**: post-production and avatar unit rates per account currency (AED / USD).
- **Packages**: name, monthly price, currency, what's included (e.g. 10 reels + 2 long-form), overage rates. Private to one client by default (v2, owner 3 Oct 2026: priced individually, no public tiers).
- **Suggestion rules** (one form):
  - "Suggest **package X** to pay-as-you-go clients whose average spend over the last **N months** is at least **Y%** of X's price."
  - The suggestion shows the computed saving and only appears when the saving is above **Z**.
  - Admin can hide it for a specific client.

### 7.4 Listings
All share links, with views, a disable switch and a reported/flagged filter.

### 7.5 Notifications
- The email notifications (§8), each with on/off and a preview, and a send log with the delivery status Resend reports.
- Resend button.

---

## 8. Notifications

**Email only, through Resend from a milkywayy.com address** (v2, owner 3 Oct 2026). Each client chooses which events they get emails for, and the Owner/Admins can copy extra people per category. **No WhatsApp templates:** in the admin, every status change and delivery has a "Send on WhatsApp" button that opens wa.me/<client's number> with a ready-written message, sent by hand from Akash's own WhatsApp. The notifications number (+971 50 830 5678) only keeps its automatic reply.

| Event | Client gets | Admin gets |
|---|---|---|
| Booking confirmed (date/slot) | ✓ | |
| Shoot done / editing started | ✓ (optional, off by default) | |
| Files ready / delivered | ✓ with portal link | |
| Batch received | ✓ | ✓ new batch |
| Script ready for approval | ✓ | |
| Revision requested | | ✓ |
| Revision delivered | ✓ | |
| New message on a project | ✓ | ✓ |
| Invoice issued | ✓ | |
| Invite to account | ✓ | |

Links in messages go to the specific project after sign-in. They are never magic links that sign the client in.

---

## 9. Data model (sketch — Claude Code finalises)

```
accounts            id, type(individual|company), name, industry, industry_other,
                    volume_note, trn, currency(AED|USD), member_visibility(own|all),
                    services_interest[], created_at
account_members     account_id, user_id, role(owner|admin|member), invited_by, status
profiles            user_id, full_name, phone_e164, email, avatar_url
contacts            id, account_id, name, role, whatsapp, email, photo_url, brn, is_default
projects            id, account_id, type(shoot|edit|avatar), ref, title, status,
                    created_by, assigned_member_ids[], due_at, delivered_at,
                    completed_at, revision_rounds_allowed(2), revision_rounds_used,
                    meta jsonb  (shoot: address, slot, services; edit: kind, qty…)
project_events      project_id, from_status, to_status, actor, note, notified, at
project_files       id, project_id, direction(in|out), delivery_no, kind,
                    source(link|r2), url_or_key, label, bytes, created_by
project_messages    id, project_id, author_id, is_admin, body, attachments[], at
line_items          id, project_id, account_id, description, qty, unit_price,
                    currency, delivered_month, billed_invoice_id
invoices            id, account_id, number, issued_at, amount, currency,
                    status(due|paid|overdue), pdf_key
packages            id, name, monthly_price, currency, inclusions jsonb,
                    overage jsonb, visible
account_plans       account_id, mode(payg|package), package_id, started_at, renews_at
suggestion_rules    id, package_id, lookback_months, threshold_pct,
                    min_saving, active
listings            id, account_id, project_id, slug, purpose, price, title,
                    facts jsonb, highlights[], permit_no, contact_ids[],
                    media_order[], status(live|paused|disabled), expires_at
collections         id, account_id, slug, title, listing_ids[]
listing_stats       listing_id|collection_id, day, views, wa_taps, call_taps
notification_log    id, account_id, project_id, channel, template, to,
                    provider_id, status, error, at
```

**Rules:**
- RLS on every table, scoped by `account_members`.
- Members with visibility `own` only see projects where they are the creator or an assigned member.
- File downloads use **short-lived signed R2 URLs** issued by the server after an RLS check. Never use public bucket URLs for deliverables.
- Listing media is public only through the listing page, and only while the listing is live.

---

## 10. Phases

Each phase ends the same way: a staging deploy, tests green, a short how-to, and **stop for review**.

### Phase 9: Portal foundation and design pass
1. **Clickable mockup first**, in the repo at `/portal-preview` with fake data, covering phone and desktop for Home, Shoots, Editing (incl. batch page), Billing, Listings sheet and Login/Welcome. Stop for Akash's review before building anything real.
2. Database: accounts, members, profiles, contacts (RLS + tests).
3. Sign-in: email code (Supabase email OTP) with an optional password, the onboarding screen. *(WhatsApp OTP built, then switched off in v2.)*
4. The portal shell: service-aware tabs, account switcher, plan badge (static for now), Team, Contacts, Settings.
5. Claiming earlier bookings by verified email (and phone, if phone sign-in is turned on).
6. Admin: Clients list and page, invite a client, "view as client".

### Phase 10: Project engine and property shoots
1. Database: projects, events, files, messages, line items. Realtime.
2. R2 bucket setup, resumable uploads from admin, signed downloads, zip download.
3. Shoots tab with stepper, downloads, revision requests and the request thread.
4. Admin Projects board (board, list and phone view) and the project page.
5. Site bookings arrive as *Requested* projects, linked by reference number.
6. Notifications: emails (Resend) for the shoot events with the client's choices and extra recipients, a notification log, and "Send on WhatsApp" buttons in the admin.

### Phase 11: Post-production and AI avatars
1. Editing tab: new batch (links + direct upload to R2, 5 GB per file by default, configurable), batch page, Completed sub-tab, "Ask about this project".
2. Avatars tab with script approval.
3. Revision rounds across all types, plus "+1 round" in admin.
4. The matching notifications.

### Phase 12: Billing and plans (built 3 Oct 2026, see DECISIONS.md)
1. Invoices (admin uploads the PDF; the client sees and downloads it). Overdue is automatic after the due date; "New invoice" and "Payment received" emails, each a Settings choice.
2. Rate card, per-client rates, line items (with a kind) feeding the running pay-as-you-go total.
3. Packages (private to one client by default), account plans, usage meter.
4. Suggestion rules plus the suggestion card, off globally by default, hideable per client.

### Phase 13: Listing share pages
1. The create sheet, saved details, contact pills, photo picker.
2. Public `/l/` and `/c/` pages: Viewfinder-light, fast, OG previews, noindex.
3. Stats, pause/expire, admin disable.
4. Performance: the listing page counts as a public page, so it must meet the site's performance budget.

### Phase 14: Migration and switch-off
1. Import from the old portal (needs an export from the old developer): clients, bookings, invoices, delivered file links, share links.
2. Redirect old share-link URLs to the new `/l/` and `/c/` pages.
3. Invite existing clients (from the old portal's client list export: names, phones, emails, companies) with a "Your new Milkywayy portal" email, plus a WhatsApp from the admin if wanted. No old bookings, invoices or share links are imported (owner, 3 Oct 2026).
4. Switch the old portal off.

---

## 11. Bridging launch (Phase 8) to the portal (Phases 9–14)

The new site launches before the portal exists. Until Phase 14:
- **The old portal keeps running on a subdomain** (e.g. `app.milkywayy.com`). Ask the old developer whether it can move there, and what changes for its Twilio/Stripe callback URLs.
- The new site's "Client login" points there.
- `/c/*` and `/l/*` on the new site redirect to the same paths on the subdomain, so links already shared keep working.
- New bookings from the site go into the new database (Phase 6) and get claimed into the portal later (§3.5).

If the old portal *can't* move, the fallback is: "Client login" opens a "Your portal is moving. WhatsApp us for files" page, and Akash sends files by link until Phase 10.

---

## 12. Things Phase 6 must already do (so the portal can attach later)

- Store phone numbers in **E.164** format and emails lower-cased on every lead and booking.
- Generate booking references **on the server** (not in the browser) and keep them unique.
- Store bookings with their property lines as structured data (type, size, services, add-ons, date, slot), not just the WhatsApp text.

---

## 13. Open questions (Akash; defaults shown, used if no answer)

| Question | Default |
|---|---|
| How long are deliverables kept? | **Decided:** 12 months after completion, then deleted with a warning 14 days before. Raw uploads deleted 30 days after completion. Admin can extend per client. |
| Per-file direct upload limit | 5 GB; links for anything bigger |
| Which currencies show in billing | AED for UAE clients, USD for overseas |
| Should members (agents) see prices? | No. Owner/admin only. |
| Does auto-complete after 7 days count as approval? | Yes |
| DLD permit number on listing pages | Optional field until Akash confirms the rule |
| Agent branding on listing pages | Company name + logo optional |
| Referral line on the download screen ("Know an agent? You both get AED 100 off") | Off. Add later if wanted. |

---

## 14. Running costs to expect (check before Phase 10)

- **Supabase Pro**, already planned for launch.
- **Cloudflare R2**: pay per GB stored per month, with free downloads. Small at Milkywayy's volume; deleting old files keeps it small.
- **Resend**: sign-in codes and notification emails (free tier 3,000 emails/month, 100/day; paid plan if volume grows).
- **Twilio**: only the notifications number's automatic reply (Meta's fee plus Twilio's per message). Not used for sign-in or notifications in v2.
- **Bunny/Mux**: video streaming for share pages and the site.
