#!/usr/bin/env bash
# Portal preview (Phase 9): a Vercel *preview* deployment wired to the dev Supabase project
# (milkywayy-portal-dev). Never production. Values come from .env.local, so no secret is
# committed: the public URL/key are build-time, PORTAL_ADMIN_SECRET is runtime-only for
# the admin's Client accounts. Website bookings go to the dev project too (LEADS_DB=portal), so the
# shoot flow can be tested end to end; the dev project accepts the same LEAD_SECRET.
set -euo pipefail
cd "$(dirname "$0")/.."
get() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2-; }
URL=$(get NEXT_PUBLIC_PORTAL_SUPABASE_URL)
KEY=$(get NEXT_PUBLIC_PORTAL_SUPABASE_ANON_KEY)
ADMIN=$(get PORTAL_ADMIN_SECRET)
HOOK=$(get PORTAL_HOOK_SECRET)
LEAD=$(get LEAD_SECRET)
[ -n "$URL" ] && [ -n "$KEY" ] && [ -n "$ADMIN" ] && [ -n "$HOOK" ] && [ -n "$LEAD" ] || { echo "Portal values missing from .env.local" >&2; exit 1; }
exec npx vercel deploy --yes \
  --build-env NEXT_PUBLIC_PORTAL_SUPABASE_URL="$URL" \
  --build-env NEXT_PUBLIC_PORTAL_SUPABASE_ANON_KEY="$KEY" \
  --env NEXT_PUBLIC_PORTAL_SUPABASE_URL="$URL" \
  --env NEXT_PUBLIC_PORTAL_SUPABASE_ANON_KEY="$KEY" \
  --env PORTAL_ADMIN_SECRET="$ADMIN" \
  --env PORTAL_HOOK_SECRET="$HOOK" \
  --env LEADS_DB=portal \
  --env LEAD_SECRET="$LEAD"
