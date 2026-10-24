# Payment terms, value packages, cancellations, booking terms — plan

Built on `site-refine` against **portal-dev** (`kebewumaxywroewopssd`). Production (`hyfanoysynsyxkpfqdxi`)
is untouched until Akash says go. One additive migration: `supabase/migrations/20261105090000_payment_terms.sql`
(new columns, tables, functions; widened check constraints; nothing dropped or renamed).

## Decisions I made (say if any is wrong)

1. **Every payment is an invoice.** "Pay AED X now" creates a booking invoice (100% or 50% deposit) and sends the
   client to Stripe Checkout on it. The existing webhook marks it paid; a paid deposit/full invoice confirms the
   booking. One ledger, one PDF, one "Mark as paid".
2. **Stripe off (production today, `PAYMENTS_ENABLED=false`):** 50%/100% clients still get the booking invoice, but the
   button says "Request booking" and the invoice shows bank transfer / Wio / receipt upload. You mark it paid →
   booking confirmed. Turning Stripe on later needs no code change.
3. **Package clients always book like end-of-month** (nothing due at booking; extras go on the month-end invoice),
   whatever their payment term says. The admin shows a note if a package client has another term.
4. **Downloads lock** whenever a project has an unpaid booking invoice (deposit / full / balance) and you haven't
   released it. Locked = no download links, no zip, no full-res view: photos are served through a watermarked
   low-res preview route (sharp, server side); videos show the compressed web copy with a "Preview" overlay and no
   download; link deliveries (Drive/YouTube) are hidden. End-of-month clients are never locked.
5. **50% clients:** balance = final value (logged line items, else the booking estimate) − what's paid, issued and
   published automatically when the shoot is delivered. **100% clients:** if logged items come out higher than what
   was paid, a draft for the difference goes to your invoice queue (doesn't lock files).
6. **Shoot days** (set and shown in full days; stored as half-days so 0.5 is exact): content shoots use the
   slot — Morning/Afternoon = 0.5 day, Full day = 1. Fixed-quantity content shoots count by slot too.
   Property shoots = 0. Edit / AI avatar work counts its value toward the AED allowance only.
7. **Partly over the package:** a booking that crosses the line is split — the part over the AED allowance, or the
   share of its days over what's left (whichever is larger), is an Extra at the client's price.
8. **Late cancel for a package client** uses half a shoot day (0.5). If none is left, the normal fee applies.
9. **Fee = 50% of the booking, minimum AED 250, never more than the booking itself.** Paid − fee is refunded; if
   less was paid than the fee, the rest is invoiced (end-of-month clients: a line on the month-end invoice).
10. **Late reschedule** (under 3h) is allowed from the booking page but charges the same fee (shown first).
11. **Terms checkbox is required on every booking** (unticked each time), so a version bump is re-accepted
    automatically. Version lives in code (`BOOKING_TERMS_VERSION`); acceptance stored per booking.
12. **Cancelled invoices** get a new status `void` ("Cancelled") instead of being deleted, so numbers stay continuous.
13. **Wio link** is one global field in Billing settings (shown on invoices only when set). Stripe on month-end
    invoices reuses the existing per-client "Pay online" switch. Bank details now show on every invoice, Stripe or not.

## Schema (additive)

- `accounts.payment_terms` text `month_end | split | prepay`, default `prepay`.
- `billing_settings`: `wio_link`, `cancel_free_hours` (3), `late_fee_pct` (50), `late_fee_min` (250),
  `work_keep_pct` (50).
- `packages`: `allowance` numeric, `half_day_cap` numeric (shoot days × 2; both set = value model; else the old
  inclusions model keeps working).
- `invoices`: `stage` (`full | deposit | balance | fee`), `refunded` numeric; status adds `void`; category adds `booking`.
- `projects`: `files_released_at`, `released_by`, `cancelled_at`, `cancel_reason`, `cancel_fee`, `fee_waived`,
  `half_days_late` (late-cancel consumption), `prev_status`.
- New `booking_terms_acceptances` (project, account, user, version, accepted_at).
- New `refunds` (project, invoice, amount, method `stripe | bank | wio | manual`, status `pending | due | done | failed`,
  stripe_refund_id) — "Refund due" tasks are the `due` rows.

## Package mapping (existing inclusions → value model)

Every monthly package (template and per-client) has two limits, edited in the admin: AED allowance and shoot
days (full days). Client sees "AED 6,400 of 10,000 · 2.5 of 4 shoot days".

| Where | Package | → Allowance | → Shoot days |
|---|---|---|---|
| Production template | Growth (AED 10,000; 20 short-form + 2 walkthroughs) | AED 10,000 | 4 |
| Production: Milkywayy LLC's copy | Growth | left out (Akash's test account) | — |

Other packages with inclusions (dev only today): allowance = Σ qty × price (never below the package price),
shoot time = reels at 5 per half day, a walkthrough or full day = 1 day, a half day = 0.5.

## Existing accounts → payment terms

| Today | → Term |
|---|---|
| Package or budget plan | End of month |
| Pay-as-you-go, invoiced at month end | End of month |
| Pay-as-you-go, invoiced per project / no plan | 100% before the shoot |

Production today: Milkywayy LLC (package) → end of month; Nanda Krishnan (month-end) → end of month;
dipesh bhanushali, Akash Praseed Demo, Milkywayy LLC #2 → 100% before the shoot.

## Production rollout (after your go)

1. Fill Billing settings (bank, optional Wio link) — invoices show whatever's there.
2. Apply `20261105090000_payment_terms.sql` to production (one transaction; dry-run on a dev reset first).
3. Run the mapping above (in the migration; prints what it changed).
4. Push `site-refine` → PR → merge to `main` (deploys). `PAYMENTS_ENABLED` stays `false`.
5. Smoke test on production with the demo account: book → invoice → mark paid → confirmed.
