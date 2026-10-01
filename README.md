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
- `DECISIONS.md` — choices not covered by the guide. `CONTENT_TODO.md` — content still to supply.

Full handover docs (editing content, env vars, deploy) come in Phase 8.
