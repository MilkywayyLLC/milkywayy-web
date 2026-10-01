-- Phase 8 monitoring, still without a service-role key.
--
-- 1. Error alerts are de-duplicated here, so one problem sends one email per hour, not one per
--    request: record_alert() says whether this fingerprint was already alerted recently.
--    Gated by LEAD_SECRET (the server's write secret); it can only touch the alerts table.
-- 2. The weekly leads email reads the last week's leads through leads_since(), gated by a
--    separate REPORT_SECRET (hash under name 'report'), so the lead-writing secret can't read.

create table private.alert_log (
  fingerprint text primary key,
  last_sent timestamptz not null,
  count int not null default 1
);
revoke all on private.alert_log from public, anon, authenticated;

create or replace function public.record_alert(p_secret text, p_fingerprint text, p_minutes int default 60)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_last timestamptz;
begin
  select sha256 into v_hash from private.app_secrets where name = 'lead';
  if v_hash is null or v_hash <> encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select last_sent into v_last from private.alert_log where fingerprint = left(p_fingerprint, 200);
  if v_last is not null and v_last > now() - make_interval(mins => p_minutes) then
    update private.alert_log set count = count + 1 where fingerprint = left(p_fingerprint, 200);
    return false;
  end if;
  insert into private.alert_log (fingerprint, last_sent) values (left(p_fingerprint, 200), now())
    on conflict (fingerprint) do update set last_sent = now(), count = 1;
  return true;
end $$;
revoke all on function public.record_alert(text, text, int) from public;
grant execute on function public.record_alert(text, text, int) to anon, authenticated;

create or replace function public.leads_since(p_secret text, p_since timestamptz)
returns table (ref text, type text, name text, company text, phone text, email text,
  preferred_reply text, status text, page text, call_booked_at timestamptz, created_at timestamptz, summary text)
language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  select s.sha256 into v_hash from private.app_secrets s where s.name = 'report';
  if v_hash is null or v_hash <> encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select l.ref, l.type, l.name, l.company, l.phone, l.email, l.preferred_reply, l.status, l.page,
      l.call_booked_at, l.created_at,
      coalesce(l.data ->> 'brief', l.data ->> 'volume', l.data ->> 'use', '')::text
    from public.leads l
    where l.created_at >= p_since and coalesce(l.data ->> 'test', 'false') <> 'true'
    order by l.created_at desc
    limit 500;
end $$;
revoke all on function public.leads_since(text, timestamptz) from public;
grant execute on function public.leads_since(text, timestamptz) to anon, authenticated;
