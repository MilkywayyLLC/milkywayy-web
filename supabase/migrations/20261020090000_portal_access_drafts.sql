-- Client portal refinement (owner, 10 Oct 2026):
-- * Per-member access instead of the account-wide "What members see": each member has an access
--   set (presets Admin / Finance / Production / Custom). Owner and Admins have everything.
--   Enforced here: billing tables and functions follow "billing", project lists follow the area
--   (shoots / editing / avatars) and "all_projects", team management follows "team".
-- * Invites carry the access they grant and expire after 14 days.
-- * Drafts: listing, booking, editing and avatar forms autosave per person and account.
-- * Turnaround texts per service, edited in the admin and shown in the request forms.
-- * Rate card: reel and long-form shot+edited, half-day and full-day shoots, avatar video lengths.
-- * Booking in the portal is for every client (not only packages), with the new shoot types.
-- Additive: member_visibility stays (unused) so older code keeps working until it's dropped.

-- ---------- per-member access ----------
alter table public.account_members add column if not exists access jsonb not null default '{}'::jsonb;

-- Members keep what they had: every service, no prices, projects as the account switch said.
update public.account_members m set access = jsonb_build_object(
    'preset', 'production', 'shoots', true, 'editing', true, 'avatars', true, 'listings', true,
    'billing', false, 'all_projects', a.member_visibility = 'all', 'team', false)
  from public.accounts a
  where a.id = m.account_id and m.role = 'member' and m.access = '{}'::jsonb;

-- Owner and Admins can do everything; a member what their access says.
create or replace function private.member_can(p_role text, p_access jsonb, p_perm text) returns boolean
language sql immutable set search_path = '' as $$
  select p_role in ('owner', 'admin') or coalesce((p_access ->> p_perm)::boolean, false)
$$;

-- The role money checks use: a member with "Billing and prices" counts as an Admin for billing
-- (every billing function asks account_role(...) in ('owner', 'admin')). Team management uses
-- my_admin_account_ids() below, so this grants no team rights.
create or replace function private.account_role(p_account uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when m.role = 'member' and private.member_can(m.role, m.access, 'billing') then 'admin'
    else m.role end
  from public.account_members m
  where m.account_id = p_account and m.user_id = auth.uid()
$$;

-- Accounts where I manage the team and company details.
create or replace function private.my_admin_account_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.account_id from public.account_members m
  where m.user_id = auth.uid() and private.member_can(m.role, m.access, 'team')
$$;

-- Accounts where I see billing and prices.
create or replace function private.my_billing_account_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.account_id from public.account_members m
  where m.user_id = auth.uid() and private.member_can(m.role, m.access, 'billing')
$$;

-- Accounts where I see every project (not only my own).
create or replace function private.my_open_account_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.account_id from public.account_members m
  where m.user_id = auth.uid() and private.member_can(m.role, m.access, 'all_projects')
$$;

-- Whether I work in this area of the account (shoots, editing, avatars, listings).
create or replace function private.sees_area(p_account uuid, p_type text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.account_members m
    where m.account_id = p_account and m.user_id = auth.uid()
      and private.member_can(m.role, m.access, case p_type
        when 'shoot' then 'shoots' when 'edit' then 'editing' when 'avatar' then 'avatars'
        else p_type end))
$$;

revoke all on function private.member_can(text, jsonb, text), private.my_billing_account_ids(),
  private.sees_area(uuid, text) from public, anon;
grant execute on function private.member_can(text, jsonb, text), private.my_billing_account_ids(),
  private.sees_area(uuid, text) to authenticated;

-- Projects, share pages and inquiries: all of the account's when allowed, else your own.
create or replace function private.sees_project(p_account uuid, p_created uuid, p_requested uuid, p_assigned uuid[])
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_account is not null and (
    p_account in (select private.my_open_account_ids())
    or (p_account in (select private.my_account_ids())
      and (auth.uid() = p_created or auth.uid() = p_requested or auth.uid() = any (p_assigned)))), false)
$$;
create or replace function private.sees_share(p_account uuid, p_created uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_account in (select private.my_open_account_ids())
    or (p_account in (select private.my_account_ids()) and auth.uid() = p_created), false)
$$;
create or replace function private.sees_inquiry(p_account uuid, p_created uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_account in (select private.my_open_account_ids())
    or (p_account in (select private.my_account_ids()) and auth.uid() = p_created), false)
$$;

drop policy if exists "members read their projects" on public.projects;
create policy "members read their projects" on public.projects
  for select to authenticated
  using ((select private.sees_project(account_id, created_by, requested_by, assigned_member_ids))
    and (select private.sees_area(account_id, type)));

-- Billing tables follow "Billing and prices".
drop policy if exists "managers read published invoices" on public.invoices;
create policy "managers read published invoices" on public.invoices
  for select to authenticated using (status in ('due', 'paid', 'overdue')
    and account_id in (select private.my_billing_account_ids()));
drop policy if exists "managers read their plan" on public.account_plans;
create policy "managers read their plan" on public.account_plans
  for select to authenticated using (account_id in (select private.my_billing_account_ids()));
drop policy if exists "managers read their package" on public.packages;
create policy "managers read their package" on public.packages
  for select to authenticated using (id in (select package_id from public.account_plans
    where account_id in (select private.my_billing_account_ids())));
drop policy if exists "managers read statements" on public.statements;
create policy "managers read statements" on public.statements
  for select to authenticated using (account_id in (select private.my_billing_account_ids()));
drop policy if exists "managers read payment proofs" on public.payment_proofs;
create policy "managers read payment proofs" on public.payment_proofs
  for select to authenticated using (account_id in (select private.my_billing_account_ids()));
drop policy if exists "admins read line items" on public.line_items;
create policy "admins read line items" on public.line_items
  for select to authenticated using (account_id in (select private.my_billing_account_ids()));

-- Owners and team managers change a member's role and access; nobody changes their own.
grant update (role, access) on public.account_members to authenticated;
create or replace function private.guard_member_access() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and new.user_id = auth.uid()
     and (new.role is distinct from old.role or new.access is distinct from old.access) then
    raise exception 'you can''t change your own access' using errcode = '42501';
  end if;
  if new.access is distinct from old.access and jsonb_typeof(new.access) <> 'object' then
    raise exception 'access must be an object' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists account_members_guard on public.account_members;
create trigger account_members_guard before update on public.account_members
  for each row execute function private.guard_member_access();

-- ---------- invites: the access they grant, 14 days to accept ----------
-- Default: Production (every service, no prices, all company projects), as members had before.
alter table public.account_invites
  add column if not exists access jsonb not null default '{"preset": "production", "shoots": true,
    "editing": true, "avatars": true, "listings": true, "billing": false, "all_projects": true,
    "team": false}'::jsonb,
  add column if not exists expires_at timestamptz not null default now() + interval '14 days';
update public.account_invites set expires_at = created_at + interval '14 days'
  where accepted_at is null and created_at + interval '14 days' > now();
grant insert (account_id, name, email, phone_e164, role, access) on public.account_invites to authenticated;
grant update (name, email, phone_e164, role, access, expires_at, last_sent_at) on public.account_invites to authenticated;
drop policy if exists "admins update open invites" on public.account_invites;
create policy "admins update open invites" on public.account_invites
  for update to authenticated
  using (account_id in (select private.my_admin_account_ids()) and accepted_at is null)
  with check (account_id in (select private.my_admin_account_ids()) and role in ('admin', 'member'));

create or replace function public.accept_my_invites() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := private.my_verified_email();
  v_phone text := private.my_verified_phone();
  v_n int := 0;
  v_role text;
  v_name text;
  r record;
begin
  if v_uid is null or (v_email is null and v_phone is null) then
    return 0;
  end if;
  for r in
    select * from public.account_invites
    where accepted_at is null and expires_at > now()
      and ((v_email is not null and email = v_email) or (v_phone is not null and phone_e164 = v_phone))
    order by created_at
    for update
  loop
    v_role := r.role;
    if v_role = 'owner' and exists (
      select 1 from public.account_members where account_id = r.account_id and role = 'owner'
    ) then
      v_role := 'admin';
    end if;
    -- Already a member (an existing account): linked, access unchanged.
    insert into public.account_members (account_id, user_id, role, invited_by, access)
      values (r.account_id, v_uid, v_role, r.invited_by,
        case when v_role = 'member' then coalesce(r.access, '{}'::jsonb) else '{}'::jsonb end)
      on conflict (account_id, user_id) do nothing;
    update public.account_invites set accepted_at = now(), accepted_by = v_uid where id = r.id;
    v_name := coalesce(v_name, nullif(btrim(r.name), ''));
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    insert into public.profiles (user_id, full_name, email, phone_e164) values (v_uid, v_name, v_email, v_phone)
      on conflict (user_id) do update set
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        email = coalesce(excluded.email, public.profiles.email),
        phone_e164 = coalesce(excluded.phone_e164, public.profiles.phone_e164);
  end if;
  return v_n;
end $$;
revoke all on function public.accept_my_invites() from public, anon;
grant execute on function public.accept_my_invites() to authenticated;

-- ---------- drafts ----------
create table if not exists public.portal_drafts (
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('listing', 'booking', 'edit', 'avatar')),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 200000),
  updated_at timestamptz not null default now(),
  primary key (account_id, user_id, kind)
);
create index if not exists portal_drafts_user_idx on public.portal_drafts (user_id);
alter table public.portal_drafts enable row level security;
drop policy if exists "your own drafts" on public.portal_drafts;
create policy "your own drafts" on public.portal_drafts
  for all to authenticated
  using (user_id = (select auth.uid()) and account_id in (select private.my_account_ids()))
  with check (user_id = (select auth.uid()) and account_id in (select private.my_account_ids()));
grant select, insert, update, delete on public.portal_drafts to authenticated;

-- ---------- turnaround per service ----------
create table if not exists public.service_turnaround (
  key text primary key check (key in ('property_shoot', 'reels', 'long_form', 'hdr_edit', 'short_edit',
    'long_edit', 'avatar_short', 'avatar_long')),
  label text not null,
  text text not null check (length(btrim(text)) between 1 and 120),
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.service_turnaround (key, label, text, sort) values
  ('property_shoot', 'Property shoot', 'Photos in 24 hours, videos in 48–72 hours', 10),
  ('reels', 'Agent / social reels', '48–72 hours after the shoot', 20),
  ('long_form', 'Long-form walkthrough', '3–5 working days after the shoot', 30),
  ('hdr_edit', 'HDR photo editing', '24 hours', 40),
  ('short_edit', 'Short-form editing', '48 hours', 50),
  ('long_edit', 'Long-form editing', '3–5 working days', 60),
  ('avatar_short', 'AI avatar, short form', '2–3 working days after the script is approved', 70),
  ('avatar_long', 'AI avatar, long form', '3–5 working days after the script is approved', 80)
on conflict (key) do nothing;
alter table public.service_turnaround enable row level security;
drop policy if exists "signed-in clients read turnaround" on public.service_turnaround;
create policy "signed-in clients read turnaround" on public.service_turnaround
  for select to authenticated using (true);
grant select on public.service_turnaround to authenticated;

create or replace function public.portal_admin_set_turnaround(p_secret text, p_actor text, p_items jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  for r in select * from jsonb_each_text(coalesce(p_items, '{}'::jsonb)) loop
    if length(btrim(r.value)) not between 1 and 120 then
      raise exception 'each turnaround needs a short text (120 characters at most)' using errcode = '22023';
    end if;
    update public.service_turnaround set text = btrim(r.value), updated_at = now() where key = r.key;
  end loop;
  insert into private.portal_admin_log (actor, action, detail) values (p_actor, 'update', 'Turnaround texts updated');
end $$;
revoke all on function public.portal_admin_set_turnaround(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.portal_admin_set_turnaround(text, text, jsonb) to anon, authenticated;

-- ---------- rate card: what the booking and avatar forms price ----------
insert into public.rate_card (key, label, unit, amount_aed, amount_usd, sort) values
  ('reel_shoot', 'Reel, shot and edited', 'reel', null, null, 41),
  ('long_form_shoot', 'Long-form video, shot and edited', 'video', null, null, 51),
  ('half_day', 'Half-day shoot', 'half day', null, null, 21),
  ('full_day', 'Full-day shoot', 'day', null, null, 22),
  ('avatar_short', 'AI avatar short form (per 30 seconds)', '30 seconds', null, null, 61),
  ('avatar_long', 'AI avatar long form (per minute)', 'minute', null, null, 62)
on conflict (key) do nothing;

-- ---------- booking in the portal: every client, with the new shoot types ----------
-- What the booking and avatar forms may show: the client's own rates for an estimate, to those
-- who see prices only; for package clients the amount only with "Show budget and activity" on.
create or replace function public.my_booking_options(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_role text := private.account_role(p_account); pl public.account_plans%rowtype; a public.accounts%rowtype;
  v_today date := (now() at time zone 'Asia/Dubai')::date; v_mode text; v_money boolean;
begin
  if v_role is null then raise exception 'not a member of that account' using errcode = '42501'; end if;
  select * into pl from public.account_plans where account_id = p_account;
  select * into a from public.accounts where id = p_account;
  v_mode := coalesce(pl.mode, 'payg');
  v_money := v_role in ('owner', 'admin');
  return jsonb_build_object(
    'can_book', private.sees_area(p_account, 'shoot'),
    'mode', v_mode,
    'currency', a.currency,
    'sees_prices', v_money,
    'show_amount', v_money and (v_mode = 'payg' or private.shows_budget(p_account)),
    'rates', (case when v_money then jsonb_build_object(
      'reel', private.rate_on(p_account, 'reel', v_today),
      'long_form', private.rate_on(p_account, 'long_form', v_today),
      'reel_shoot', private.rate_on(p_account, 'reel_shoot', v_today),
      'long_form_shoot', private.rate_on(p_account, 'long_form_shoot', v_today),
      'half_day', private.rate_on(p_account, 'half_day', v_today),
      'full_day', private.rate_on(p_account, 'full_day', v_today),
      'avatar_short', private.rate_on(p_account, 'avatar_short', v_today),
      'avatar_long', private.rate_on(p_account, 'avatar_long', v_today)) end));
end $$;

create or replace function public.book_shoot(p_account uuid, p_date date, p_slot text, p_location jsonb,
  p_services jsonb, p_note text default null, p_estimate numeric default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_ref text; s jsonb; v_addr text; v_title text;
  v_slot text := case p_slot when 'morning' then 'Morning' when 'afternoon' then 'Afternoon'
    when 'full_day' then 'Full day' when 'flexible' then 'Flexible' end;
begin
  if v_uid is null or private.account_role(p_account) is null then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  if not private.sees_area(p_account, 'shoot') then
    raise exception 'your access doesn''t include shoots' using errcode = '42501';
  end if;
  if p_date is null or p_date < (now() at time zone 'Asia/Dubai')::date then
    raise exception 'choose a date from today' using errcode = '22023';
  end if;
  if v_slot is null then raise exception 'choose a time slot' using errcode = '22023'; end if;
  v_addr := btrim(coalesce(p_location ->> 'address', ''));
  if length(v_addr) not between 3 and 300 then raise exception 'add the location' using errcode = '22023'; end if;
  if (p_location ? 'lat' and (p_location ->> 'lat')::numeric not between 22 and 27)
    or (p_location ? 'lng' and (p_location ->> 'lng')::numeric not between 51 and 57) then
    raise exception 'the pin must be in the UAE' using errcode = '22023';
  end if;
  if length(coalesce(p_location ->> 'unit', '')) > 200 or length(coalesce(p_location ->> 'access', '')) > 1000 then
    raise exception 'location details too long' using errcode = '22023';
  end if;
  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) not between 1 and 6 then
    raise exception 'add at least one service' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(p_services) loop
    if s ->> 'service' not in ('reels', 'long_form', 'property') then
      raise exception 'unknown service' using errcode = '22023';
    end if;
    if s ->> 'service' <> 'property' and coalesce((s ->> 'qty')::int, 0) not between 1 and 100 then
      raise exception 'quantity between 1 and 100' using errcode = '22023';
    end if;
    if s ? 'day' and s ->> 'day' not in ('half', 'full') then
      raise exception 'choose half day or full day' using errcode = '22023';
    end if;
    if s ->> 'service' = 'property' and jsonb_typeof(s -> 'property') <> 'object' then
      raise exception 'choose the property details' using errcode = '22023';
    end if;
    if length(coalesce(s ->> 'notes', '')) > 1000 then raise exception 'notes too long' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements_text(coalesce(s -> 'links', '[]'::jsonb)) l
        where l !~ '^https://\S+$' or length(l) > 2000) or jsonb_array_length(coalesce(s -> 'links', '[]'::jsonb)) > 5 then
      raise exception 'reference links must be https:// links (5 at most)' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from public.projects where account_id = p_account and created_at > now() - interval '1 day'
      and created_by is not null) >= 30 then
    raise exception 'too many new projects today' using errcode = '22023';
  end if;
  v_title := 'Shoot · ' || left(split_part(v_addr, ',', 1), 120);
  v_ref := 'MW-' || nextval('public.lead_ref_seq');
  insert into public.projects (account_id, type, ref, title, status, shoot_date, slot, meta, created_by, requested_by)
  values (p_account, 'shoot', v_ref, v_title, 'requested', p_date, v_slot,
    jsonb_build_object('source', 'portal', 'booking', jsonb_strip_nulls(jsonb_build_object(
      'location', jsonb_strip_nulls(jsonb_build_object('address', v_addr,
        'lat', p_location -> 'lat', 'lng', p_location -> 'lng', 'place_id', p_location ->> 'place_id',
        'unit', nullif(btrim(coalesce(p_location ->> 'unit', '')), ''),
        'access', nullif(btrim(coalesce(p_location ->> 'access', '')), ''))),
      'services', p_services, 'slot', p_slot,
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'estimate', p_estimate))),
    v_uid, v_uid)
  returning id into v_id;
  insert into public.project_events (project_id, kind, to_status, actor_name)
    values (v_id, 'created', 'requested', private.my_name());
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;

-- Services changed on the day (reels added on site): the booking's list follows what was logged.
create or replace function public.portal_admin_set_booking_services(p_secret text, p_actor text,
  p_id uuid, p_services jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) > 12 then
    raise exception 'services must be a list' using errcode = '22023';
  end if;
  update public.projects
    set meta = jsonb_set(jsonb_set(meta, '{booking}', coalesce(meta -> 'booking', '{}'::jsonb)),
      '{booking,services}', p_services), updated_at = now()
    where id = p_id and type = 'shoot';
  if not found then raise exception 'no such shoot' using errcode = '22023'; end if;
  insert into private.portal_admin_log (actor, action, detail)
    values (p_actor, 'update', 'Booking services updated on ' || p_id::text);
end $$;
revoke all on function public.portal_admin_set_booking_services(text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.portal_admin_set_booking_services(text, text, uuid, jsonb) to anon, authenticated;

create or replace function public.portal_admin_turnaround(p_secret text, p_actor text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object('key', t.key, 'label', t.label, 'text', t.text)
    order by t.sort) from public.service_turnaround t), '[]'::jsonb);
end $$;
revoke all on function public.portal_admin_turnaround(text, text) from public, anon, authenticated;
grant execute on function public.portal_admin_turnaround(text, text) to anon, authenticated;

-- ---------- listings: contacts made inline, each with a "Show WhatsApp button" switch ----------
alter table public.contacts add column if not exists show_whatsapp boolean not null default true;
grant insert (show_whatsapp) on public.contacts to authenticated;
grant update (show_whatsapp) on public.contacts to authenticated;

create or replace function private.share_contacts(p_account uuid, p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_agg(jsonb_build_object('name', c.name, 'role', c.role, 'whatsapp', c.whatsapp,
        'email', c.email, 'brn', c.brn, 'photo', c.photo_url, 'show_whatsapp', c.show_whatsapp) order by u.ord)
      from unnest(p_ids) with ordinality u(id, ord) join public.contacts c on c.id = u.id and c.account_id = p_account),
    -- Contacts deleted since: fall back to the account's default one.
    (select jsonb_agg(jsonb_build_object('name', c.name, 'role', c.role, 'whatsapp', c.whatsapp,
        'email', c.email, 'brn', c.brn, 'photo', c.photo_url, 'show_whatsapp', c.show_whatsapp))
      from public.contacts c where c.account_id = p_account and c.is_default),
    '[]'::jsonb)
$$;

-- ---------- the account-wide switch's last readers: claimed bookings and project emails ----------
create or replace function public.account_bookings(p_account uuid)
returns table (ref text, booked_at timestamptz, claimed_at timestamptz, properties jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text := private.account_role(p_account);
begin
  if v_role is null then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  return query
    select l.ref, l.created_at, c.claimed_at,
      coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'line', b.line_no, 'type', b.property_type, 'size', b.size_label, 'services', b.services,
          'lighting', b.long_lighting, 'area', b.area, 'building', b.building, 'unit', b.unit,
          'date', b.shoot_date, 'slot', b.slot,
          'subtotal', case when v_role in ('owner', 'admin') then b.subtotal end
        )) order by b.line_no)
        from public.booking_properties b where b.lead_id = l.id
      ), '[]'::jsonb)
    from public.lead_claims c
    join public.leads l on l.id = c.lead_id
    where c.account_id = p_account
      and (p_account in (select private.my_open_account_ids()) or c.claimed_by = auth.uid())
    order by l.created_at desc;
end $$;

create or replace function private.event_recipients(p_project uuid, p_event text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cat text := case when p_event = 'invoice_issued' then 'billing' else 'projects' end;
  v jsonb;
begin
  with p as (select * from public.projects where id = p_project),
  a as (select acc.* from public.accounts acc join p on acc.id = p.account_id),
  people as (
    select distinct lower(coalesce(pr.email, u.email)) as email, coalesce(pr.full_name, '') as name
    from p
    join public.account_members m on m.account_id = p.account_id
    join auth.users u on u.id = m.user_id
    left join public.profiles pr on pr.user_id = m.user_id
    where coalesce(pr.email, u.email) is not null
      and coalesce((pr.notification_prefs -> p_event ->> 'email')::boolean,
        p_event not in ('shoot_done')) -- the defaults: everything on except "shoot done"
      and (v_cat <> 'billing' or private.member_can(m.role, m.access, 'billing'))
      -- Only members whose access covers this area, and this project (all, or their own).
      and private.member_can(m.role, m.access, case p.type when 'shoot' then 'shoots'
        when 'edit' then 'editing' else 'avatars' end)
      and (private.member_can(m.role, m.access, 'all_projects')
        or m.user_id in (p.created_by, p.requested_by) or m.user_id = any (p.assigned_member_ids))
  ),
  extra as (
    select lower(x) as email, '' as name
    from a, jsonb_array_elements_text(coalesce(a.notify_cc -> v_cat, '[]'::jsonb)) x
  )
  select coalesce(jsonb_agg(distinct jsonb_build_object('email', email, 'name', name)), '[]'::jsonb)
  into v from (select * from people union select * from extra) r;
  return v;
end $$;
revoke all on function private.event_recipients(uuid, text) from public, anon, authenticated;
