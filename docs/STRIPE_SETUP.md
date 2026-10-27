# Stripe setup (phase 1, 27 Oct 2026)

Stripe is the main way clients pay. Checkout happens **on milkywayy.com** (Stripe Embedded Checkout
inside `/portal/pay/<invoice>`); card details go straight to Stripe and never touch our servers.
Bank transfer + receipt upload stays as a second option per client (Admin → client → Bank transfer).

Everything is behind `PAYMENTS_ENABLED`. Production runs with `PAYMENTS_ENABLED=false` until you add
live keys, so nothing changes for clients until you switch it on.

## 1. Keys and env vars

| Variable | Test (Preview + `.env.local`) | Live (Production only) | Where to find it |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` | `sk_live_…` | Stripe → Developers → API keys → Secret key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` | `pk_live_…` | Same page → Publishable key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (preview endpoint) | `whsec_…` (live endpoint) | Created by the scripts in §2 |
| `PAYMENTS_ENABLED` | unset (on) | `false` until go-live, then delete it | — |

Rules the code enforces (`lib/stripe.ts`):
- A **live** secret or publishable key is ignored anywhere but production
  (`VERCEL_ENV=production` and `NEXT_PUBLIC_SITE_ENV=production`), so previews can only ever take test payments.
- The publishable key must be the same mode as the secret key, or it's ignored.
- No publishable key → "Pay now" still works, but sends the client to Stripe's hosted page instead of
  the embedded form. Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to keep checkout on our site.
- `NEXT_PUBLIC_…` values are baked in at build time: **redeploy** after adding or changing it.

Never paste keys into chat, code or commits. Add them in Vercel → Project `milkywayy-web` →
Settings → Environment Variables (pick the right environment), or `vercel env add NAME production`.

## 2. Webhook

Endpoint URL: `https://milkywayy.com/api/stripe/webhook` (live) · previews: the preview URL + the
Vercel bypass (the script adds it).

Events to send:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `setup_intent.succeeded`
- `refund.created`, `refund.updated`, `refund.failed`

Create it with the scripts (they set the events above and store the signing secret in Vercel without
printing it):

```bash
node --env-file=.env.local scripts/stripe-preview-webhook.mts https://<preview>.vercel.app
```

```bash
node --env-file=.env.local scripts/stripe-live-webhook.mts
```

An existing endpoint made before 27 Oct 2026 lacks the three new events: run the script again, or add
them in Stripe → Developers → Webhooks → the endpoint → Update events.

Local testing without a public URL: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
(Stripe CLI), and put the `whsec_…` it prints in `.env.local` as `STRIPE_WEBHOOK_SECRET`.

## 3. What happens

- **Booking on 50% / 100% terms:** the invoice is issued, the client goes to `/portal/pay/<id>`
  (summary + "Your preferred date and time are subject to availability…"), pays, and lands on the
  thank-you page. The booking shows **Pending confirmation**. You get an email to confirm it.
  - Confirm: Admin → project → Status → Confirmed (date + arrival time).
  - Or **Propose a new time**: the client accepts (confirmed) or declines (cancelled, **full refund**
    to the card automatically).
  - Admin cancel with reason "Milkywayy" = full refund automatically.
- **Teammates without billing access:** "Pay myself" (own card) or "Send to company for payment"
  (owner/admins get an email + the bell; the booking shows **Awaiting company payment**).
- **Billing:** "Pay now" on every open invoice. Save a card (Stripe Customer + Checkout in setup
  mode), replace or remove it, and opt in to **"Pay invoices automatically with this card"**:
  month-end invoices are charged off-session on their due date by the daily cron
  (`/api/portal/housekeeping`), up to 3 tries a day apart. Each failure emails the company's billing
  people and Milkywayy.
- **Refunds:** cancellations refund card payments through Stripe; the `refund.*` events update the
  refund row and the client's Billing.

## 4. Going live (checklist)

1. Stripe account activated (business details, bank account for payouts, AED enabled).
2. Vercel → Production: add `STRIPE_SECRET_KEY` (live) and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (live).
3. Run `scripts/stripe-live-webhook.mts` → creates the live endpoint with the events in §2 and stores
   `STRIPE_WEBHOOK_SECRET` in Production.
4. Delete `PAYMENTS_ENABLED` in Production (or set it to `true`) and **redeploy**.
5. Admin → Billing → Settings should say "Set up".
6. Pay one small real invoice on your own test account, check it turns Paid and the booking shows
   Pending confirmation, then cancel with reason "Milkywayy" and check the refund lands.
7. Decide per client whether bank transfer stays on (Admin → client → Bank transfer).

To switch card payments off again: set `PAYMENTS_ENABLED=false` in Production and redeploy. Bank
transfer keeps working.
