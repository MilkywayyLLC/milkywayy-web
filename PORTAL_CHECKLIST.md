# Portal: before it ships (Phase 14)

Things to do or undo when the portal moves from the `portal` branch and the dev Supabase project
(`milkywayy-portal-dev`) to milkywayy.com. Add to it as the portal grows.

## Twilio (Akash)
- [ ] Delete the two old Verify services **MilkyyWay** and **MilkyWayy**. Keep **Milkywayy** (`VAb74f…`). *(owner, 2 Oct 2026)*
- [ ] Top up the balance and turn on auto-recharge. A zero balance stops sign-in codes **and** today's notifications.
- [ ] Optional: delete the empty duplicate Messaging Service also named "whatsapp_notifications_service" (`MG594f0b…`). The live one is `MG364b…`.

## Cloudflare R2 (Akash, then Claude checks)
- [ ] Production files: bucket `milkywayy-deliverables` (exists) with **its own API token** (Object Read & Write, that bucket only). The preview token covers `milkywayy-portal-dev` only (checked 3 Oct 2026: it gets 403 on `milkywayy-deliverables`); keep it that way.
- [ ] In Vercel → Production: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (Secret) for that token, and `R2_BUCKET=milkywayy-deliverables`. The four `R2_` variables in Preview stay on `milkywayy-portal-dev`.
- [ ] Same CORS rules on `milkywayy-deliverables` as on the dev bucket; Public Development URL stays disabled (downloads use short-lived signed links).
- [ ] Optional: empty and delete `milkywayy-portal-dev` once the dev Supabase project is retired.

## Supabase, production project (`milkywayy-web`)
- [ ] Apply the portal migrations in order: `20261002200000_portal_accounts.sql`, `20261003090000_portal_phone_claims.sql`, `20261004090000_portal_shell_admin.sql` (and any later ones). **Never** apply `supabase/dev/*`.
- [ ] Admin Client accounts: a new `PORTAL_ADMIN_SECRET` in Vercel (Production, Sensitive) and its SHA-256 in `private.app_secrets` under `portal_admin`. (Once admin and clients share one project, these gated functions could become plain RLS for the Owner; not required.)
- [ ] Phone provider: Twilio Verify with the same Account SID, Auth Token and Verify Service SID, **plus** the English sign-in codes: deploy Edge Functions `send-sms` and `otp-feedback` (from `supabase/functions/`, JWT checks off), add their secrets (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `PORTAL_HOOK_SECRET`, `SEND_SMS_HOOK_SECRET`), turn on the Send SMS hook, apply `20261005090000_portal_otp_english.sql`, and add `PORTAL_HOOK_SECRET` to Vercel Production.
- [ ] **No test phone numbers** in production (the dev project has `971500000001=123456`).
- [ ] Raise "Rate limit for sending SMS messages" from 30/hour to what real sign-ins need.
- [ ] Decide on a CAPTCHA for the code request (Cloudflare Turnstile is free; it's a new service, so owner's call). Until then the SMS rate limit, Twilio Fraud Guard and geo permissions are the protection against SMS fraud.
- [ ] Custom SMTP (Resend) for confirmation and password-reset emails; Site URL and Redirect URLs for milkywayy.com.

## App
- [ ] Remove `NEXT_PUBLIC_PORTAL_SUPABASE_URL` / `_ANON_KEY` (the portal then uses the website's project), the `deploy:portal-preview` script and `scripts/deploy-portal-preview.sh`.
- [ ] Delete the mockup (`app/portal-preview`, `components/portal-mock`, `lib/portal-mock`).
- [ ] Point "Client login" and the old `/c/*`, `/l/*` redirects at the portal.
- [ ] Pause or delete `milkywayy-portal-dev` (on Supabase Pro it costs extra compute).
