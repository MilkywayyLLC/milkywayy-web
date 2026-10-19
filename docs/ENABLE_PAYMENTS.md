# Turning on card payments (Stripe)

Launched without Stripe: `PAYMENTS_ENABLED=false` in Vercel Production hides "Pay now" and shows
"Payment details will be sent by email" on online-pay accounts. Bank-transfer accounts are unchanged.

1. Stripe → Developers → API keys: copy the **live** secret key. Add it in Vercel Production as `STRIPE_SECRET_KEY`.
2. Run `scripts/stripe-live-webhook.mts` (LAUNCH.md §7). It creates the live webhook and stores `STRIPE_WEBHOOK_SECRET`.
3. Delete `PAYMENTS_ENABLED` in Vercel Production (or set it to `true`), then redeploy.
4. Admin → Billing → Settings should say "Set up". Pay one small real invoice and refund it.
5. Live keys are refused anywhere but production (`lib/stripe.ts`); previews only ever get test keys.
