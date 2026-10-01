-- Phase 6: leads intake without a service-role key (owner decision, 1 Oct 2026).
--
-- The website saves leads through one function, public.submit_lead(), that can only insert a
-- lead. It's callable with the public key but refuses unless given the server's LEAD_SECRET
-- (stored here only as a SHA-256 hash), so browsers can't call it directly and skip the spam
-- checks in /api/lead. A leaked secret can add leads; it can't read or change anything.
--
-- The function also issues the reference (MW-1001, MW-1002, …), rate-limits per visitor
-- (hashed IP, never the raw IP) and returns the same ref for an identical repeat within two
-- minutes (double taps).

create extension if not exists pgcrypto with schema extensions;

create table private.app_secrets (
  name text primary key,
  sha256 text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.app_secrets from public, anon, authenticated;

create sequence public.lead_ref_seq start 1001;
revoke all on sequence public.lead_ref_seq from public, anon, authenticated;

alter table public.leads add column ip_hash text;
alter table public.leads add column fingerprint text;
alter table public.leads add column call_booked_at timestamptz;
create index leads_ip_recent_idx on public.leads (ip_hash, created_at desc);
create index leads_status_idx on public.leads (status, created_at desc);

create or replace function public.submit_lead(
  p_secret text,
  p_lead jsonb,
  p_ip_hash text,
  p_limit int default 6,
  p_window_minutes int default 10
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_fp text;
  v_ref text;
  v_recent int;
begin
  select sha256 into v_hash from private.app_secrets where name = 'lead';
  if v_hash is null or v_hash <> encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_lead ->> 'type' not in ('production', 'property', 'post', 'avatars', 'contact', 'free-test') then
    raise exception 'unknown lead type' using errcode = '22023';
  end if;
  if length(p_lead::text) > 60000 then
    raise exception 'lead too large' using errcode = '22023';
  end if;

  -- Same visitor, same request, within two minutes: a double tap. Return the first ref.
  v_fp := encode(extensions.digest(coalesce(p_ip_hash, '') || (p_lead - 'utm' - 'referrer')::text, 'sha256'), 'hex');
  select ref into v_ref from public.leads
    where fingerprint = v_fp and created_at > now() - interval '2 minutes'
    order by created_at desc limit 1;
  if v_ref is not null then
    return jsonb_build_object('ref', v_ref, 'duplicate', true);
  end if;

  select count(*) into v_recent from public.leads
    where ip_hash = p_ip_hash and created_at > now() - make_interval(mins => p_window_minutes);
  if v_recent >= p_limit then
    return jsonb_build_object('rate_limited', true);
  end if;

  v_ref := 'MW-' || nextval('public.lead_ref_seq');
  insert into public.leads (ref, type, name, company, phone, email, preferred_reply, data, page, utm, referrer, ip_hash, fingerprint)
  values (
    v_ref,
    p_lead ->> 'type',
    left(nullif(p_lead ->> 'name', ''), 120),
    left(nullif(p_lead ->> 'company', ''), 120),
    left(nullif(p_lead ->> 'phone', ''), 40),
    left(nullif(lower(p_lead ->> 'email'), ''), 200),
    left(nullif(p_lead ->> 'preferred_reply', ''), 20),
    coalesce(p_lead -> 'data', '{}'),
    left(nullif(p_lead ->> 'page', ''), 200),
    coalesce(p_lead -> 'utm', '{}'),
    left(nullif(p_lead ->> 'referrer', ''), 500),
    p_ip_hash,
    v_fp
  );
  return jsonb_build_object('ref', v_ref);
end $$;
revoke all on function public.submit_lead(text, jsonb, text, int, int) from public;
grant execute on function public.submit_lead(text, jsonb, text, int, int) to anon, authenticated;

-- "Call booked" from the Cal.com embed: same secret, only sets the timestamp on that ref.
create or replace function public.mark_call_booked(p_secret text, p_ref text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  select sha256 into v_hash from private.app_secrets where name = 'lead';
  if v_hash is null or v_hash <> encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.leads set call_booked_at = coalesce(call_booked_at, now()) where ref = p_ref;
end $$;
revoke all on function public.mark_call_booked(text, text) from public;
grant execute on function public.mark_call_booked(text, text) to anon, authenticated;
