# milkywayy.com

The new Milkywayy website. Brief: `MILKYWAYY_BUILD_GUIDE.md` (v3). Approved design: `reference/site-mockup.html`.

## Run locally

```bash
cp .env.example .env.local   # then set NEXT_PUBLIC_SITE_ENV=development
npm install
npm run dev                  # http://localhost:3000
```

Scripts: `lint`, `typecheck`, `format`, `build`, `test`, `test:logic`, `test:staging`, `db:seed:sql`, `db:parity`.

After changing content directly in the database, refresh the site with `POST /api/revalidate` (header `x-revalidate-secret`, optional body `{"tags":["faqs"]}`); the admin panel will do this on save.

## Where things live

- `content/` — seed data. The live content is in Supabase; these files fill a fresh database and are the fallback if it can't be reached.
- `supabase/migrations/` — schema and access rules. `npm run db:seed:sql` writes `supabase/seed.sql` from `content/`; `npm run db:parity` checks the database matches `content/`.
- `lib/data/` — the only way pages read editable content.
- `app/(dark)` / `app/(light)` — page tone per route (guide §3).
- `DECISIONS.md` — choices not covered by the guide. `LAUNCH.md` — the one launch runbook: content still to supply, production setup, launch day, rollback, and running the site day to day (it replaced `LAUNCH_BLOCKERS.md`, `PORTAL_CHECKLIST.md` and `HANDOVER.md`).

## Leads

Forms and the booking builder POST to `/api/lead`, which saves through the database function
`submit_lead()` (needs `LEAD_SECRET`; no service-role key) and emails new leads via Resend when
`RESEND_API_KEY` is set. Leads appear in `/admin/leads`. See DECISIONS.md "Phase 6".

## Admin

`/admin` (Supabase Auth, password + authenticator code for Owners). Saving refreshes the site by
itself; Preview shows drafts on the real pages. See DECISIONS.md "Phase 5B".

Tests: `npm test` runs everything locally (public pages, the database-failure fallback, then the
admin as three test accounts whose credentials live only in `.env.local`). `npm run test:staging`
runs the same against staging.

Tests in Safari (WebKit, iPhone 14): `npm run test:ios` (once: `npx playwright install webkit`).
