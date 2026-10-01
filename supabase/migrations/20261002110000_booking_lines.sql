-- So the client portal (CLIENT_PORTAL_GUIDE.md §12) can attach to bookings later:
-- 1. Phones are E.164 and emails lower-case on every lead (enforced here, not only in the app).
-- 2. Refs are issued by the database (sequence, unique) — already the case since leads_intake.
-- 3. Each property in a booking is its own structured row, not just the WhatsApp text.

alter table public.leads
  add constraint leads_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  add constraint leads_email_lower check (email is null or email = lower(email));

create table public.booking_properties (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  line_no int not null check (line_no between 1 and 20),
  property_type text not null check (property_type in ('apartment', 'villa', 'commercial')),
  size_index int not null,
  size_label text not null,
  services text[] not null check (services <@ array['photo', 'short', 'long', 'tour']),
  long_lighting text check (long_lighting in ('day', 'night', 'dayNight')),
  add_ons jsonb not null default '[]',       -- e.g. [{"key":"twilight","qty":10}]
  area text not null,
  building text not null,
  unit text,
  shoot_date date not null,
  slot text not null,
  subtotal int not null check (subtotal >= 0),  -- AED, prices at the time of the request
  price_lines jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (lead_id, line_no)
);
create index booking_properties_lead_idx on public.booking_properties (lead_id);
create index booking_properties_date_idx on public.booking_properties (shoot_date);
alter table public.booking_properties enable row level security;
-- Written only by submit_lead(); read by the Owner (like leads).
create policy "owner reads booking properties" on public.booking_properties
  for select to authenticated using ((select public.is_owner()));
create policy "owner deletes booking properties" on public.booking_properties
  for delete to authenticated using ((select public.is_owner()));

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
  v_id uuid;
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
  if p_lead ->> 'type' = 'property' and jsonb_array_length(coalesce(p_lead -> 'lines', '[]')) = 0 then
    raise exception 'a booking needs its property lines' using errcode = '22023';
  end if;

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
    nullif(p_lead ->> 'phone', ''),
    left(nullif(lower(p_lead ->> 'email'), ''), 200),
    left(nullif(p_lead ->> 'preferred_reply', ''), 20),
    replace(coalesce(p_lead -> 'data', '{}')::text, '{{REF}}', v_ref)::jsonb,
    left(nullif(p_lead ->> 'page', ''), 200),
    coalesce(p_lead -> 'utm', '{}'),
    left(nullif(p_lead ->> 'referrer', ''), 500),
    p_ip_hash,
    v_fp
  )
  returning id into v_id;

  insert into public.booking_properties (lead_id, line_no, property_type, size_index, size_label, services,
    long_lighting, add_ons, area, building, unit, shoot_date, slot, subtotal, price_lines)
  select v_id, x.line_no, x.property_type, x.size_index, left(x.size_label, 40), x.services,
    x.long_lighting, coalesce(x.add_ons, '[]'), left(x.area, 120), left(x.building, 120), left(nullif(x.unit, ''), 40),
    x.shoot_date, left(x.slot, 30), x.subtotal, coalesce(x.price_lines, '[]')
  from jsonb_to_recordset(coalesce(p_lead -> 'lines', '[]')) as x(
    line_no int, property_type text, size_index int, size_label text, services text[], long_lighting text,
    add_ons jsonb, area text, building text, unit text, shoot_date date, slot text, subtotal int, price_lines jsonb);

  return jsonb_build_object('ref', v_ref);
end $$;
