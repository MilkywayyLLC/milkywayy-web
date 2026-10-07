-- Instagram reels on the website (owner, 7 Oct 2026): our reels on @milkywayy.media play in our
-- own player through the Instagram API (Instagram API with Instagram Login, instagram_business_basic).
-- The long-lived token (60 days) starts in the INSTAGRAM_ACCESS_TOKEN env var; the daily cron
-- refreshes it and keeps the newest one here, server-side only. Rows are keyed by a hash of the
-- env token they came from, so pasting a new token in Vercel starts a fresh chain and a test
-- run's token can never stand in for the real one. Only our server can reach it (the
-- PORTAL_ADMIN_SECRET gate); no table access for anon or signed-in users.

create table if not exists private.instagram_tokens (
  seed text primary key,
  token text not null,
  expires_at timestamptz,
  refreshed_at timestamptz not null default now()
);
revoke all on private.instagram_tokens from public, anon, authenticated;

create or replace function public.site_instagram_token(p_secret text, p_seed text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, 'site');
  return (
    select jsonb_build_object('token', t.token, 'expires_at', t.expires_at, 'refreshed_at', t.refreshed_at)
    from private.instagram_tokens t where t.seed = p_seed
  );
end $$;

create or replace function public.site_instagram_token_save(
  p_secret text, p_seed text, p_token text, p_expires_at timestamptz
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, 'site');
  if coalesce(btrim(p_token), '') = '' or coalesce(btrim(p_seed), '') = '' then
    raise exception 'token and seed are required' using errcode = '22023';
  end if;
  insert into private.instagram_tokens (seed, token, expires_at, refreshed_at)
  values (p_seed, p_token, p_expires_at, now())
  on conflict (seed) do update
    set token = excluded.token, expires_at = excluded.expires_at, refreshed_at = now();
end $$;

revoke all on function public.site_instagram_token(text, text) from public, anon, authenticated;
revoke all on function public.site_instagram_token_save(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.site_instagram_token(text, text) to anon, authenticated;
grant execute on function public.site_instagram_token_save(text, text, text, timestamptz)
  to anon, authenticated;
