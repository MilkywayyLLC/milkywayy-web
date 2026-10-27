# Admin panel audit (27 Oct 2026)

Read-only audit of `app/admin/(panel)/**`, `components/admin/**`, `lib/admin/**`, `lib/portal/admin*.ts` and the RPCs they call. **Scope of every proposal below: presentation only.** No change to business logic, DB tables/relationships, RPC signatures, permissions (owner/editor) or the booking → project sync. Where a dashboard number has no existing query, it's flagged as a gap instead of inventing an API.

Checked on branch `site-refine` (10 ahead of origin). Prod function bodies have drifted from repo files before, so re-check RPC bodies on prod before relying on a column list here.

---

## 1. Current map

21 sidebar items in 5 groups, plus ~15 sub-pages. Owner-only items marked ●.

| Group | Page (route) | What it does | Data / actions it owns |
|---|---|---|---|
| Workspace | **Dashboard** `/admin` | New-leads count, 5 latest leads, 12 recent content changes, quick links, "Refresh site", unpublished drafts note | `leads`, `change_log`, `drafts` (direct table reads). **No portal data at all.** |
| | ● **Website leads** `/admin/leads`, `/leads/[ref]`, `/leads/export` | Form + booking requests; status new→contacted→quoted→won→lost; CSV export | `leads` (status, notes, call_booked_at) via `LeadEditor` |
| Portal | ● **Projects** `/admin/projects` (+ `/calendar`, `/new`, `/[id]`) | Board by status (desktop) / list (phone), tabs Shoots·Editing·Avatars; calendar month grid + ICS feed; project detail: status buttons, propose time, payment, details, files, line items, thread, notes, notifications, activity | `portal_admin_projects`, `portal_admin_project`, `_project_payment`, `_deliverables`, `_project_people`; status / propose-time / payment / change actions |
| | ● **AI characters** `/admin/characters` (+ `/accounts/[id]/characters`) | Character approvals per client | `portal_admin_ai_characters` |
| | ● **Client messages** `/admin/inquiries`, `/[id]` | Client threads, unread first, reply, status | `portal_admin_inquiries`, `_inquiry` |
| | ● **Client accounts** `/admin/accounts`, `/new`, `/[id]`, `/[id]/view`, `/[id]/past` | List + search; client page (16 cards, see §5); view-as-client; add past project | ~10 RPCs (see §5) |
| | ● **Billing** `/admin/billing` + tabs `rates`, `packages`, `refunds`, `settings`, `suggestions`; `/invoices/[id]` (+ `/pdf`) | Invoice queue (draft→approved→published→paid), new invoice from Ledger PDF, generate drafts, receipt review; rate card; package templates + limits + rollover; refunds table; company/VAT/bank/payment settings, backfill, **turnaround times**; package-suggestion engine | `portal_admin_invoice_queue`, `_invoices`, `_invoice`, `_rate_card`, `_packages`, `_refunds`, `_billing_settings`, `_turnaround` |
| | ● **Listings** `/admin/listings` | Client share pages | `portal_admin_shares` |
| Content | **Library** `/admin/library` (+ `/portfolio/*`) | Portfolio media board, categories, Instagram | portfolio tables |
| | **Pages** `/admin/pages` (`/placements` redirects here) | Which items show on which site page | placements |
| | **Case studies, Before/after, Website avatars, Reviews, FAQs, Stats, Client logos** — all `/admin/[section]` via `lib/admin/sections.ts` (`/avatar-hero` is a separate DocEditor) | Generic list + item editor | one table each |
| Pricing | ● **Property shoots** `/admin/pricing` | Public website prices (draft → publish), history | `drafts`/doc `pricing_property` |
| | ● **Other prices** `/admin/pricing/other` | Same for other services | doc `pricing_other` |
| Settings | ● **Site settings** `/admin/settings` | Site doc (contact, socials…) | doc `site` |
| | **SEO** `/admin/seo` | Meta per page | seo doc |
| | ● **Admins** `/admin/admins` | Admin users + roles | admins |

Unused component: `PlanForm` (BillingTools.tsx:1122) and `ProjectStatus` default export are not rendered anywhere.

---

## 2. Problems (ranked by daily impact)

### P1 — hits every working day
1. **Dashboard ignores the business.** It shows content edits and leads, nothing about shoots, confirmations, deliveries, invoices or messages. Daily ops means opening Projects, Billing, Messages separately.
2. **Client page: same field, two controls.** `accounts.payg_invoicing` is set by *Plan → Invoice timing* (`setPayg` → `portal_admin_set_billing_switches`) **and** by *Billing → Pay-as-you-go invoices* (`BillingSwitches`, same RPC). Option order is reversed between them. Last save wins silently.
3. **Client page: three "how they pay" controls with near-identical labels**, each a different column:
   - *Payment terms → "How this client pays"* → `accounts.payment_terms` (month_end / 50% split / 100% upfront)
   - *Bank transfer* card → `accounts.bank_transfer` (bank as 2nd option on every invoice)
   - *Advanced → "How they pay"* → `accounts.pay_online` (card vs bank on month-end invoices; auto by currency)
   The Payment terms help text says "change it with *Pay online* under Billing below" — that control is actually labelled "How they pay" and hidden inside the collapsed *Advanced* details.
4. **Client page: two price editors writing the same table.** *Client price list* (`saveClientPrices`) and *Advanced → Rate history* (`setClientRate`) both insert into `client_rates`; one is "from today", the other dated. Two places to answer "what does this client pay for X?".
5. **Client page is 16 stacked cards with no grouping** (Services, Price list, Payment terms, Bank transfer, Plan, Value card, Rollover, Details, Billing and notes, Billing · AED, Projects, Members, Invite, Bookings, Contacts, Admin history). "Billing" appears as three different headings ("Billing and notes" = currency + notes, "Billing · AED" = usage/statements, and a "Billing" select inside Plan = bill in advance). Six separate Save buttons.
6. **`bill_in_advance` has three writers**: Plan (package), BudgetPanel (budget), and the `p_advance` arg of billing switches (passed `null` from UI today, so harmless — but the RPC accepts it).
7. **Projects board has no time or location on the card for non-shoots, and no "next action".** Shoot cards show date+time, but not area; nothing says *what I need to do next* (confirm, upload, chase payment, reply to revision). Board caps at 12/column, so busy columns hide work.
8. **Website bookings live in two places.** A booking is a *lead* (Leads, status new/contacted/…) and a *project* (Projects, status Requested). Client page → Bookings links to the lead, not the project. Easy to update one and forget the other.

### P2 — weekly friction
9. **Prices split across three systems with no cross-links**: Pricing → Property shoots (website doc; also the default for `prop_photo_*` on client price lists via `siteDefault`), Billing → Rate card (`rate_card`, everything else), per-client price list. Nothing tells you which one a given price comes from.
10. **"Settings" twice**: Billing → *Settings* (company, TRN, bank, payment rules, backfill, **turnaround times**) and Settings → *Site settings*. Turnaround isn't billing.
11. **Sidebar is flat and long** (21 items); Content alone is 9. Portal ops items sit next to "AI characters" and "Listings" which are occasional.
12. **Billing tabs as 6 buttons with an "Advanced: suggestions" tab** next to daily tabs; filters on the queue are another 8 chips → two rows of identical-looking buttons.
13. **Budget mode is half-alive**: `BudgetPanel` only renders when a client is already on budget; Plan warns "saving a plan here replaces it". No path in, but a live path out.

### P3 — polish / consistency
14. **Inconsistent type**: 20+ distinct font sizes in `admin.css` (10, 11, 12, 12.5, 13, 13.5, 14, 15, 16, 18, 24, 28, 32, 36 px). `ad-h3` is used once and is defined once; elsewhere "h3" is faked with `ad-h2 style={{fontSize:15}}`.
15. **187 inline `style={{…}}`** in admin TSX (margins, gaps, `justifyContent`). Spacing drifts page to page.
16. **Status pills reused for unrelated meanings**: `ad-pill live` = "Owner" role on members, `draft` = "Member"/"booking ref". Projects have no status pills at all (text only).
17. **Mixed systems on one page**: client page imports `portal.css` and renders a `.pt[data-tone=light]` portal card (`ValuePackageCard`) inside the square-cornered admin.
18. **Button hierarchy unclear**: primary `ad-btn` used for both "Save terms" (local) and "New project" (page-level); `ghost` vs `quiet` vs `small` combos chosen ad hoc.
19. **Dashboard shows operational warnings as prose** (the PORTAL_ADMIN_SECRET text names DB tables) — fine for you, unreadable for a future admin hire.
20. **Help text everywhere is long** (package rules paragraph, payment-terms help) — accurate but dense; key facts aren't scannable.

---

## 3. Proposed navigation

8 top-level items (from 21), grouped by job. Routes stay the same — only the sidebar and tab bars change, so links, tests and bookmarks keep working.

```
Today                     /admin                       (new dashboard, §4)
Work
  Projects                /admin/projects              tabs: Board · List · Calendar ; type filter Shoots/Editing/Avatars
  Messages                /admin/inquiries             (was "Client messages"; unread badge)
Clients
  Clients                 /admin/accounts              client page tabs (§5)
  Leads                   /admin/leads                 (was "Website leads"; badge = status new)
Money
  Invoices                /admin/billing               (was "Billing → Invoice queue"; badge = drafts + receipts)
  Prices & packages       /admin/billing/rates, /packages, /admin/pricing, /pricing/other   one tab bar
  Refunds                 /admin/billing/refunds
Website                   (collapsed group)
  Library, Pages, Case studies, Before/after, Avatars, Reviews, FAQs, Stats, Logos, SEO
Settings
  Business & billing      /admin/billing/settings      (company, VAT, bank, payment rules)
  Operations              turnaround form (moved from billing settings), backfill tool
  Site settings           /admin/settings
  Admins                  /admin/admins
  Advanced                /admin/billing/suggestions
```

| Existing | Moves to |
|---|---|
| Dashboard | Today (rebuilt) |
| Website leads | Clients → Leads |
| Projects (+calendar) | Work → Projects, calendar becomes a tab |
| AI characters (global) | Clients page → "AI characters" tab; global list kept as Work → Projects → Avatars filter link |
| Client messages | Work → Messages |
| Client accounts | Clients → Clients |
| Billing → Invoice queue | Money → Invoices |
| Billing → Rate card, Packages + Pricing → Property shoots, Other prices | Money → Prices & packages (4 tabs: Website prices · Other website prices · Portal rate card · Packages) |
| Billing → Refunds | Money → Refunds |
| Billing → Settings | Settings → Business & billing (turnaround → Operations) |
| Billing → Suggestions | Settings → Advanced |
| Listings | Clients page → "Share pages" tab (link already exists); global list stays reachable from Clients list header |
| Content (9) + SEO | Website (collapsed by default) |
| Site settings, Admins | Settings |

Editors (non-owner) see only Today (content part) + Website + SEO — same permissions as now, just grouped.

---

## 4. Dashboard spec — "Today"

Owner view. Order = order of urgency. Every tile links to the filtered page that resolves it. Editor view keeps today's content cards.

| Block | Shows | Source (existing) | Notes |
|---|---|---|---|
| **Action items** (top strip, counts) | Requests to confirm · receipts to check · drafts to approve · unread messages · new leads · revisions requested · on hold | Derived from the rows below | Each count is a link; zero = hidden |
| **Pending confirmations** | Shoots in `requested` (ref, client, date + start time, area, paid/unpaid), and proposals waiting on client (`meta.proposal`) | `portal_admin_projects` (`p_type:'shoot', p_status:'requested'`) — has `shoot_date`, `slot`, `meta.start_time`, `meta.area`, `meta.proposal` | Paid-and-waiting needs `portal_admin_project_payment` per row → **too heavy for N rows**; show "paid" only if it's in `meta`, else link through |
| **Upcoming shoots** | Today + rest of week, grouped by day: time · area · client · services | Same call as calendar: `portal_admin_projects` `{p_type:'shoot'}`, filter `confirmed` + date in range, `projectWhen()` / `startOf()` for time | One call, filter client-side |
| **Projects by stage** | Count per status per type (Shoots / Editing / Avatars), bar or number row | `portal_admin_projects` `{p_type: null}` → group by `type,status` | **One call for all types** — the RPC runs `sync_booking_projects` + `link_claimed_projects` on every call, so don't call it 3× |
| **Deliveries awaiting approval** | `delivered` (client hasn't approved; auto-complete exists) with days since `delivered_at` | same rows | |
| **Revisions** | `revision_state` in (`requested`,`in_progress`) with rounds used/allowed | same rows | |
| **Invoices** | Drafts to approve · receipts uploaded · outstanding (published, unpaid) total · overdue list (client, amount, days late) | `portal_admin_invoice_queue` `{p_status:null}` → `status`, `shown_status`, `payment_state`, `amount`, `due_on` | Currency-split totals (AED/USD) |
| **Revenue this month** | Sum of invoices paid this month, per currency | ⚠ **Gap**: queue rows have no `paid_at`. Options: (a) approximate by `status='paid'` + `issued_on` this month (label it "invoiced & paid, issued this month"); (b) later, a read-only RPC. Recommend (a) now | |
| **Messages** | Unread threads (client, subject, age) | `portal_admin_inquiries` `{p_status:null}` → `admin_unread` | |
| **New leads** | Status `new`, last 7 days | current `leads` query (already on dashboard) | |
| **System** | Unpublished drafts; billing settings incomplete (company/TRN/bank empty); portal key error | `drafts` (existing), `portal_admin_billing_settings` | Short one-line warnings, details on click |
| Recent changes | Moved to bottom, collapsed | `change_log` (existing) | |

Load: 4 RPCs + 2 table reads in one `Promise.all`; wrap each in try/catch so one failure blanks one card, not the page.

---

## 5. Client account page simplification

Turn 16 stacked cards into a header + 5 tabs (query-param tabs, same page, same components re-ordered — no new actions):

**Header**: name, type/industry, currency, since · status chips (Plan: "Growth · AED 10,000/mo" / "Pay as you go"; Terms: "End of month") · buttons: New project, View as client.

**Tabs**: Overview · **Billing & payment** · Projects · People · History.

### Billing & payment — one section, fields after merging duplicates

| Sub-block | Field (label) | Column | What it affects |
|---|---|---|---|
| **How they pay** | Payment terms — *End of month / 50% at booking / 100% at booking* | `accounts.payment_terms` | Booking flow ("Request booking" vs pay first), deposit/balance invoices, when files unlock. Ignored while on a monthly package (show that inline) |
| | Card on month-end invoices — *Auto (by currency) / Card / Bank transfer* (was "How they pay" in Advanced) | `accounts.pay_online` | Whether month-end invoices show Stripe "Pay now" |
| | Allow bank transfer as a second option (was the "Bank transfer" card) | `accounts.bank_transfer` | Bank + receipt upload on every invoice; off = card only |
| | Billing currency (was in "Billing and notes") | `accounts.currency` | Every price and invoice |
| | TRN, billing address (read-only, client-owned) | `accounts.trn`, `billing_address` | Invoice header |
| **Plan** | Plan type — *Pay as you go / Monthly package* (Budget shown read-only if active) | `account_plans.mode` | Which engine builds the month-end draft |
| | PAYG: Invoice timing — *One per delivery / One at month end* — **single control** (delete the copy in Billing switches) | `accounts.payg_invoicing` | Per-project vs monthly drafts |
| | Package: name, monthly amount, term, starts, ends, template | `account_plans` + `packages` | Package invoice |
| | Package: Bill in advance — *At month end / On the 1st* (one control; BudgetPanel's copy shown only for legacy budget) | `account_plans.bill_in_advance` | When package invoice is drafted |
| | Package: Monthly allowance, Shoot days | `packages.allowance`, `half_day_cap` | When extras start |
| | Rollover rule (shown only on package) | via `portal_admin_rollover` | Carry-over credit |
| **This month** (read-only) | Value card / usage meters / PAYG estimate, statements, "Invoices (n)" link | existing RPCs | — |
| **Prices** | Client price list, with "history" expander per row (merge `ClientRateHistory` into the same table) | `client_rates` | Every line item for this client |
| **Client sees** | Show budget & activity — *Auto / On / Off* | `accounts.show_budget` | Portal Billing page |
| | Package suggestions: pinned offer + "never suggest" | `accounts.pinned_package_id`, `hide_suggestions` | Suggestion card (keep under "Advanced" expander) |

Result: 1 section, 5 sub-blocks, one sticky **Save billing** bar per sub-block (still the same server actions underneath — each sub-block calls the action it calls today). `payg_invoicing` and `bill_in_advance` each get exactly one control.

Other tabs: **Overview** = services enabled, details, notes, retention, contacts. **Projects** = existing Projects + Bookings cards (bookings link to the *project*, lead as secondary). **People** = members + invites + invite form. **History** = admin log.

---

## 6. Projects view redesign

Default **List** (desktop and phone), Board as a toggle, Calendar as third tab. Same `portal_admin_projects` call.

List columns: **Ref · Name** (title, short address) · **Client** · **When** (`Wed 29 Oct · 10:15` for shoots; due date for edit/avatar) · **Stage** (pill) · **Next action** · ›

"Next action" is a pure function of fields already on the row (no new data):

| Condition | Next action |
|---|---|
| shoot `requested` | Confirm or propose time |
| `meta.proposal` pending | Waiting on client (time) |
| `confirmed`, date today | Shoot today · {time} |
| `confirmed`, date past | Mark shot |
| `shot` / `editing` / `in_editing` | Upload delivery |
| edit `submitted`, `files_in = 0` | Waiting on files |
| avatar `script_status = pending/changes_requested` | Script with client / Revise script |
| `revision_state = requested` | Start revision |
| `delivered` | Waiting on client approval ({n} days) |
| `on_hold` | Waiting: {status_note} |

Default sort: next action urgency, then date. Quick filters as chips: *Needs me · This week · Waiting on client · All*. Board: same cards + stage colour + next action line; replace the 12-card cap with a scrollable column. Keep `StatusButtons` on the row (phones) — same component.

---

## 7. Design system

**Recommendation: keep admin light.** It's an all-day data tool (tables, numbers, forms), it should never be mistaken for the client view during "View as client", and it's already light. Align the *shapes and type* with portal V2, not the tone.

| Token | Value |
|---|---|
| Fonts | Archivo condensed headings, Archivo body, DM Mono labels (as V2) |
| Type scale | 12 mono label · 13 meta · 15 body · 17 section title (h3) · 20 card title (h2) · 28 page title (h1). Drop 10/11/12.5/13.5/14/16/18/24/32/36 |
| Spacing | 4-pt scale: 4 · 8 · 12 · 16 · 24 · 32. Page gutter 16 (phone) / 32 (desktop). Card padding 16/20. Replace inline `style` gaps with `.ad-stack-{8,12,16}` |
| Radius | 10 (inputs, pills, buttons) · 14 (cards), matching `--pt-r-sm` / `--pt-r` |
| Cards | `--surface` bg, 1px `--line`, no shadow; header row = title left, actions right |
| Tables | 44px rows, mono header 12px uppercase, numbers right-aligned tabular, row hover, whole row clickable |
| Status pills | One component `<Pill tone>`: neutral (draft/requested), info (confirmed/in progress), warn (receipt, on hold, revision), danger (overdue, cancelled), ok (paid, delivered, completed), accent (champagne `--pt-gold`, "needs me"). Roles use a separate quiet tag, not status pills |
| Buttons | Primary (one per page/section: the main save or create) · Secondary (outline) · Quiet (text) · Danger. Sizes: default 44px, small 36px |
| Help text | Max 1 line under a field; longer rules behind an "ⓘ How this works" expander |
| Accent | Champagne only for "needs action"; green/red only for money states |

Rename tokens in `admin.css` rather than adding a third stylesheet; once done, the client page no longer needs to import `portal.css` (render `ValuePackageCard` through an admin wrapper).

---

## 8. Implementation plan

Every phase: no migrations, no RPC/action changes, no permission changes. Each ends with `npm run typecheck`, `npm run lint`, `npm run test:portal` (portal + portal-admin projects) and `playwright --project=admin`, then a `deploy:portal-preview` check on phone + desktop before merging.

| # | Phase | Files touched | Risk | How it's tested |
|---|---|---|---|---|
| 0 | **Baseline**: screenshots of every admin page (desktop + phone) via Playwright, so later diffs are visual | new `tests/admin-visual.spec.ts` | None | Snapshots committed |
| 1 | **Tokens & primitives**: type scale, spacing utilities, radius, `<Pill>`, button variants in `admin.css`; no page changes yet | `app/admin/admin.css`, new `components/admin/ui/Pill.tsx` | Low | Visual diff, nothing else changes |
| 2 | **Sidebar regroup** + labels (Today, Messages, Leads, Invoices…) | `components/admin/AdminNav.tsx`, `BillingNav.tsx` | Low (routes unchanged) | `access.admin`, `phone.admin` specs; check `getByRole('link', {name})` selectors and update labels in tests |
| 3 | **Client page: remove duplicate controls** — drop the PAYG select from `BillingSwitches` (keep the switch for show-budget), move "How they pay" (`pay_online`) out of Advanced next to Payment terms, fix help text | `app/admin/(panel)/accounts/[id]/page.tsx`, `BudgetTools.tsx`, `BillingTools.tsx`, `PaymentAdmin.tsx` | **Medium** — `billing.portaladmin.spec.ts` touches these forms | Run billing/retainer/rollover/onboarding portaladmin specs; manually set PAYG timing → confirm `accounts.payg_invoicing` on dev DB |
| 4 | **Client page tabs** (Overview / Billing & payment / Projects / People / History) — same components re-ordered under `?tab=` | `accounts/[id]/page.tsx` only | Medium (test selectors by `data-testid` survive; visibility changes) | portaladmin specs with `?tab=` added where needed |
| 5 | **Merge price list + rate history** into one table with per-row history expander | `ClientSetup.tsx` (PriceList), `BudgetTools.tsx` (ClientRateHistory) | Medium | Save a price, save a dated price → both appear; `billing-plus` + `billing.portaladmin` specs |
| 6 | **Today dashboard** — new owner blocks from existing RPCs, each in its own try/catch | `app/admin/(panel)/page.tsx`, new `components/admin/TodayBlocks.tsx` | Low–Medium (read only; watch load time — the projects RPC syncs on read) | New spec seeding a requested shoot, a draft invoice, an unread inquiry on dev DB; check counts + links. Time the page on the preview |
| 7 | **Projects list with Next action** + chips, board without cap, calendar as tab | `projects/page.tsx`, new `lib/portal/next-action.ts` (pure) | Low–Medium | Unit-test `nextAction()` in `test:logic`; `projects*.portaladmin` specs |
| 8 | **Prices & packages tab bar** joining website prices + rate card + packages; Settings split (turnaround → Operations) | `BillingNav.tsx`, `pricing/*.tsx`, `billing/settings/page.tsx`, new `settings/operations` page reusing `TurnaroundForm` | Low | `pricing.admin`, billing settings specs |
| 9 | **Sweep**: replace inline styles + ad-hoc h3s page by page; Pill everywhere | all admin pages, a few per PR | Low per PR | Visual diff vs Phase 0 |
| 10 | Remove dead code (`PlanForm`, unused exports) | `BillingTools.tsx`, `ProjectStatus.tsx` | Low | typecheck |

Order matters: 3 before 4 (fewer cards to move), 1 before everything visual. Phases 3, 6, 7 deliver most of the daily value.

---

## Top 20 recommendations

| # | Area | Problem | Fix | Effort | Risk |
|---|---|---|---|---|---|
| 1 | Dashboard | No ops data; daily work spread over 3 pages | "Today" view: confirmations, this week's shoots, stages, deliveries, invoices, messages | M | Low |
| 2 | Client page | PAYG invoice timing set in two places (`payg_invoicing`), opposite option order | Keep one control in Plan; remove from Billing switches | S | Med |
| 3 | Client page | 3 "how they pay" controls, misleading help text, one hidden in Advanced | One "How they pay" block: terms · card on month-end · allow bank | S | Med |
| 4 | Client page | 16 ungrouped cards, 3 "Billing" headings, 6 save buttons | Header + 5 tabs; one Billing & payment tab | M | Med |
| 5 | Projects | No "what do I do next" | Next-action column from existing fields | M | Low |
| 6 | Projects | List lacks time/area; board caps at 12 | List default: name, client, date+time, area, stage, next action | M | Low |
| 7 | Client page | Two editors write `client_rates` | One price table with per-row history | M | Med |
| 8 | Nav | 21 flat items | 8 grouped items, Website collapsed | S | Low |
| 9 | Leads/Projects | Booking lives as lead + project; client page links to lead | Link to project first, lead as secondary; show lead status on project | S | Low |
| 10 | Pricing | Prices in 3 systems with no pointers | One "Prices & packages" tab bar; label source on each client price row | S | Low |
| 11 | Billing | Queue filters + tabs = two rows of same buttons | Tabs as nav, filters as chips with counts | S | Low |
| 12 | Settings | Two "Settings"; turnaround under billing | Business & billing / Operations / Site / Admins | S | Low |
| 13 | Design | 20+ font sizes | 6-step type scale | S | Low |
| 14 | Design | 187 inline styles | Spacing utilities, sweep per page | M | Low |
| 15 | Design | Pills reused for roles; projects have none | One `<Pill tone>` with status map | S | Low |
| 16 | Design | Square admin vs rounded V2; portal.css imported in admin | V2 radius + type, light tone; admin wrapper for ValuePackageCard | M | Low |
| 17 | Buttons | Primary used everywhere | One primary per section; secondary/quiet/danger | S | Low |
| 18 | Client page | Budget mode: no way in, silent way out | Show legacy budget read-only; hide budget controls otherwise | S | Low |
| 19 | Dashboard | Setup warnings name DB internals | One-line warning + "how to fix" link to docs | S | Low |
| 20 | Code | Dead `PlanForm`, unused exports | Delete after phases land | S | Low |
