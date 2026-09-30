# milkywayy.com

The new Milkywayy website. Brief: `MILKYWAYY_BUILD_GUIDE.md` (v3). Approved design: `reference/site-mockup.html`.

## Run locally

```bash
cp .env.example .env.local   # then set NEXT_PUBLIC_SITE_ENV=development
npm install
npm run dev                  # http://localhost:3000
```

Scripts: `lint`, `typecheck`, `format`, `build`.

## Where things live

- `content/` — seed data (prices, FAQs, stats, reviews, portfolio …). Moves to Supabase in Phase 5A; these files stay as the fallback.
- `lib/data/` — the only way pages read editable content.
- `app/(dark)` / `app/(light)` — page tone per route (guide §3).
- `DECISIONS.md` — choices not covered by the guide. `CONTENT_TODO.md` — content still to supply.

Full handover docs (editing content, env vars, deploy) come in Phase 8.
