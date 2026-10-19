-- Client portal, Phase 9 step 2 (CLIENT_PORTAL_GUIDE.md §3, §9): accounts, members, profiles,
-- contacts, invites, and claimed bookings.
--
-- Additive only: new tables and functions. No existing table, policy or function changes, and
-- the website never reads any of this.
--
-- Rules, enforced here and not only in the app:
-- 1. Everything is scoped by membership (account_members). Nobody sees another account's rows.
-- 2. Accounts and memberships are created only through create_my_account() (and invites), so
--    nobody can add themselves to someone else's account.
-- 3. Earlier bookings attach only by a VERIFIED email (auth.users.email_confirmed_at), through
--    claim_my_bookings(). Leads stay Owner-only; clients read their claimed bookings through
--    account_bookings(), which leaves prices out for Members (§13).
-- 4. Billing fields a client mustn't change (currency) aren't updatable by clients at all.

-- ---------- tables ----------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('individual', 'company')),
  name text not null check (length(btrim(name)) between 1 and 120),
  industry text check (industry in
    ('real-estate-brokerage', 'developer', 'holiday-homes', 'agency', 'brand', 'creator', 'other')),
  industry_other text check (length(industry_other) <= 120),
  volume_note text check (length(volume_note) <= 500),
  trn text check (trn ~ '^[0-9]{15}$'),
  currency text not null default 'AED' check (currency in ('AED', 'USD')),
  member_visibility text not null default 'own' check (member_visibility in ('own', 'all')),
  services_interest text[] not null default '{}'
    check (services_interest <@ array['shoots', 'production', 'post', 'avatars']::text[]),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (industry is distinct from 'other' or industry_other is not null)
);

create table public.account_members (
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index account_members_user_idx on public.account_members (user_id);
create unique index account_members_one_owner on public.account_members (account_id) where role = 'owner';

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (length(full_name) <= 120),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email = lower(email)),
  avatar_url text check (length(avatar_url) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  role text check (length(role) <= 80),
  whatsapp text check (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email = lower(email) and length(email) <= 200),
  photo_url text check (length(photo_url) <= 500),
  brn text check (length(brn) <= 40),
  is_default boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_account_idx on public.contacts (account_id);
create unique index contacts_one_default on public.contacts (account_id) where is_default;

create table public.account_invites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text check (length(name) <= 120),
  email text check (email = lower(email) and length(email) <= 200),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  check (email is not null or phone_e164 is not null)
);
create index account_invites_account_idx on public.account_invites (account_id);
create index account_invites_email_idx on public.account_invites (email) where accepted_at is null;
create unique index account_invites_open_email on public.account_invites (account_id, email)
  where accepted_at is null and email is not null;
create unique index account_invites_open_phone on public.account_invites (account_id, phone_e164)
  where accepted_at is null and phone_e164 is not null;

-- A booking from the website (a lead) attached to an account. One account per booking.
create table public.lead_claims (
  lead_id uuid primary key references public.leads (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  claimed_by uuid references auth.users (id) on delete set null,
  via text not null check (via in ('email', 'phone', 'signed-in')),
  claimed_at timestamptz not null default now()
);
create index lead_claims_account_idx on public.lead_claims (account_id);

-- Who-did-it columns: indexed so deleting a user doesn't scan these tables.
create index accounts_created_by_idx on public.accounts (created_by);
create index account_members_invited_by_idx on public.account_members (invited_by);
create index contacts_created_by_idx on public.contacts (created_by);
create index account_invites_invited_by_idx on public.account_invites (invited_by);
create index account_invites_accepted_by_idx on public.account_invites (accepted_by);
create index lead_claims_claimed_by_idx on public.lead_claims (claimed_by);

create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------- membership helpers (private schema: not callable over the API) ----------
create or replace function private.account_role(p_account uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.account_members m
  where m.account_id = p_account and m.user_id = auth.uid()
$$;

create or replace function private.my_account_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.account_id from public.account_members m where m.user_id = auth.uid()
$$;

create or replace function private.my_admin_account_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.account_id from public.account_members m
  where m.user_id = auth.uid() and m.role in ('owner', 'admin')
$$;

-- Accounts whose members may see every project (member_visibility = 'all'), among mine.
create or replace function private.my_open_account_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.id from public.accounts a
  join public.account_members m on m.account_id = a.id and m.user_id = auth.uid()
  where a.member_visibility = 'all'
$$;

-- People I manage: members of accounts where I'm owner/admin.
create or replace function private.my_managed_user_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.account_members m
  where m.account_id in (select private.my_admin_account_ids())
$$;

-- The caller's verified email (lower-case), or null.
create or replace function private.my_verified_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u
  where u.id = auth.uid() and u.email is not null and u.email_confirmed_at is not null
$$;

revoke all on function private.account_role(uuid), private.my_account_ids(),
  private.my_admin_account_ids(), private.my_open_account_ids(), private.my_managed_user_ids(),
  private.my_verified_email() from public, anon;
grant execute on function private.account_role(uuid), private.my_account_ids(),
  private.my_admin_account_ids(), private.my_open_account_ids(), private.my_managed_user_ids(),
  private.my_verified_email() to authenticated;

-- ---------- privileges: nothing for anon; clients read, and update only safe columns ----------
revoke all on public.accounts, public.account_members, public.profiles, public.contacts,
  public.account_invites, public.lead_claims from anon, authenticated;
grant select on public.accounts, public.account_members, public.profiles, public.contacts,
  public.account_invites, public.lead_claims to authenticated;
grant update (name, industry, industry_other, volume_note, trn, member_visibility, services_interest)
  on public.accounts to authenticated;
grant update (role) on public.account_members to authenticated;
grant delete on public.account_members to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant insert (account_id, name, role, whatsapp, email, photo_url, brn, is_default) on public.contacts to authenticated;
grant update (name, role, whatsapp, email, photo_url, brn, is_default) on public.contacts to authenticated;
grant delete on public.contacts to authenticated;
grant insert (account_id, name, email, phone_e164, role) on public.account_invites to authenticated;
grant delete on public.account_invites to authenticated;

-- ---------- row level security ----------
alter table public.accounts enable row level security;
alter table public.account_members enable row level security;
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.account_invites enable row level security;
alter table public.lead_claims enable row level security;

create policy "members read their accounts" on public.accounts
  for select to authenticated using (id in (select private.my_account_ids()));
create policy "owner and admins update the account" on public.accounts
  for update to authenticated
  using (id in (select private.my_admin_account_ids()))
  with check (id in (select private.my_admin_account_ids()));

-- Members see their own membership; owner/admins see the whole team.
create policy "read own membership, admins read the team" on public.account_members
  for select to authenticated
  using (user_id = (select auth.uid()) or account_id in (select private.my_admin_account_ids()));
-- Owner/admins change roles of non-owners (never to owner).
create policy "admins change roles of non-owners" on public.account_members
  for update to authenticated
  using (role <> 'owner' and account_id in (select private.my_admin_account_ids()))
  with check (role in ('admin', 'member') and account_id in (select private.my_admin_account_ids()));
-- Owner/admins remove non-owners; anyone but the owner can leave.
create policy "admins remove non-owners, members leave" on public.account_members
  for delete to authenticated
  using (role <> 'owner' and (user_id = (select auth.uid()) or account_id in (select private.my_admin_account_ids())));

create policy "read own profile and the team's" on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or user_id in (select private.my_managed_user_ids()));
create policy "update own profile" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Contacts tab is for everyone: members add contacts and edit their own; admins edit all.
create policy "members read contacts" on public.contacts
  for select to authenticated using (account_id in (select private.my_account_ids()));
create policy "members add contacts" on public.contacts
  for insert to authenticated
  with check (account_id in (select private.my_account_ids()) and created_by = (select auth.uid()));
create policy "admins and authors edit contacts" on public.contacts
  for update to authenticated
  using (account_id in (select private.my_admin_account_ids())
    or (created_by = (select auth.uid()) and account_id in (select private.my_account_ids())))
  with check (account_id in (select private.my_account_ids()));
create policy "admins and authors delete contacts" on public.contacts
  for delete to authenticated
  using (account_id in (select private.my_admin_account_ids())
    or (created_by = (select auth.uid()) and account_id in (select private.my_account_ids())));

create policy "admins read invites" on public.account_invites
  for select to authenticated using (account_id in (select private.my_admin_account_ids()));
create policy "admins invite" on public.account_invites
  for insert to authenticated
  with check (account_id in (select private.my_admin_account_ids()) and invited_by = (select auth.uid()));
create policy "admins cancel invites" on public.account_invites
  for delete to authenticated
  using (account_id in (select private.my_admin_account_ids()) and accepted_at is null);

-- Owner/admins see every claimed booking; members see their own, or all if the account allows.
create policy "read claimed bookings" on public.lead_claims
  for select to authenticated
  using (account_id in (select private.my_admin_account_ids())
    or account_id in (select private.my_open_account_ids())
    or (claimed_by = (select auth.uid()) and account_id in (select private.my_account_ids())));

-- ---------- one default contact per account ----------
create or replace function private.contacts_one_default() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_default then
    update public.contacts set is_default = false
      where account_id = new.account_id and id <> new.id and is_default;
  end if;
  return new;
end $$;
revoke all on function private.contacts_one_default() from public, anon, authenticated;
create trigger contacts_one_default before insert or update of is_default on public.contacts
  for each row execute function private.contacts_one_default();

-- ---------- onboarding: create my account (§3.4) ----------
create or replace function public.create_my_account(
  p_type text,
  p_name text,
  p_full_name text default null,
  p_industry text default null,
  p_industry_other text default null,
  p_volume_note text default null,
  p_services text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_user auth.users%rowtype;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if exists (select 1 from public.account_members where user_id = v_uid and role = 'owner') then
    raise exception 'you already have an account' using errcode = '23505';
  end if;
  select * into v_user from auth.users where id = v_uid;

  insert into public.accounts (type, name, industry, industry_other, volume_note, services_interest, created_by)
  values (
    p_type,
    btrim(p_name),
    case when p_type = 'company' then p_industry end,
    case when p_type = 'company' and p_industry = 'other' then nullif(btrim(p_industry_other), '') end,
    case when p_type = 'company' then nullif(btrim(p_volume_note), '') end,
    coalesce(p_services, '{}'),
    v_uid
  )
  returning id into v_id;
  insert into public.account_members (account_id, user_id, role) values (v_id, v_uid, 'owner');

  insert into public.profiles (user_id, full_name, email, phone_e164)
  values (
    v_uid,
    nullif(btrim(coalesce(p_full_name, case when p_type = 'individual' then p_name end)), ''),
    case when v_user.email_confirmed_at is not null then lower(v_user.email) end,
    case when v_user.phone_confirmed_at is not null and v_user.phone <> '' then '+' || v_user.phone end
  )
  on conflict (user_id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email = coalesce(excluded.email, public.profiles.email),
    phone_e164 = coalesce(excluded.phone_e164, public.profiles.phone_e164);
  return v_id;
end $$;

-- ---------- invites: join accounts I was invited to by my verified email (§3.2) ----------
create or replace function public.accept_my_invites() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := private.my_verified_email();
  v_n int := 0;
  r record;
begin
  if v_uid is null or v_email is null then
    return 0;
  end if;
  for r in
    select * from public.account_invites
    where email = v_email and accepted_at is null
    order by created_at
    for update
  loop
    insert into public.account_members (account_id, user_id, role, invited_by)
      values (r.account_id, v_uid, r.role, r.invited_by)
      on conflict (account_id, user_id) do nothing;
    update public.account_invites set accepted_at = now(), accepted_by = v_uid where id = r.id;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    insert into public.profiles (user_id, email) values (v_uid, v_email)
      on conflict (user_id) do update set email = excluded.email;
  end if;
  return v_n;
end $$;

-- ---------- claiming earlier bookings by verified email (§3.5) ----------
-- Attaches the caller's unclaimed website bookings (type 'property' with property lines) whose
-- email matches their verified email. Into p_account if given (must be a member), otherwise the
-- account they own, otherwise their earliest membership. Returns the refs claimed, plus how many
-- are waiting when there's no account yet (the welcome screen says "We found 2 earlier bookings").
create or replace function public.claim_my_bookings(p_account uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := private.my_verified_email();
  v_account uuid := p_account;
  v_refs text[];
  v_pending int;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if v_email is null then
    return jsonb_build_object('claimed', '[]'::jsonb, 'pending', 0);
  end if;
  if v_account is not null and private.account_role(v_account) is null then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  if v_account is null then
    select m.account_id into v_account from public.account_members m
    where m.user_id = v_uid
    order by (m.role = 'owner') desc, m.created_at
    limit 1;
  end if;

  if v_account is null then
    select count(*) into v_pending from public.leads l
    where l.email = v_email and l.type = 'property'
      and exists (select 1 from public.booking_properties b where b.lead_id = l.id)
      and not exists (select 1 from public.lead_claims c where c.lead_id = l.id);
    return jsonb_build_object('claimed', '[]'::jsonb, 'pending', v_pending);
  end if;

  with claimed as (
    insert into public.lead_claims (lead_id, account_id, claimed_by, via)
    select l.id, v_account, v_uid, 'email' from public.leads l
    where l.email = v_email and l.type = 'property'
      and exists (select 1 from public.booking_properties b where b.lead_id = l.id)
    on conflict (lead_id) do nothing
    returning lead_id
  )
  select coalesce(array_agg(l.ref order by l.created_at), '{}') into v_refs
  from claimed c join public.leads l on l.id = c.lead_id;

  return jsonb_build_object('claimed', to_jsonb(v_refs), 'pending', 0, 'account', v_account);
end $$;

-- ---------- reading claimed bookings ----------
-- Leads stay Owner-only; this returns just what a client should see. Members get no prices.
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
      and (v_role in ('owner', 'admin') or c.claimed_by = auth.uid()
        or exists (select 1 from public.accounts a where a.id = p_account and a.member_visibility = 'all'))
    order by l.created_at desc;
end $$;

revoke all on function public.create_my_account(text, text, text, text, text, text, text[]),
  public.accept_my_invites(), public.claim_my_bookings(uuid), public.account_bookings(uuid)
  from public, anon;
grant execute on function public.create_my_account(text, text, text, text, text, text, text[]),
  public.accept_my_invites(), public.claim_my_bookings(uuid), public.account_bookings(uuid)
  to authenticated;
