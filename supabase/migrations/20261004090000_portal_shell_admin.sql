-- Client portal, Phase 9 steps 4 and 6: the portal shell (Team, Contacts, Settings) and the
-- admin's Client accounts.
--
-- Additive to the portal's own tables (nothing on the website changes):
-- 1. profiles.notification_prefs: WhatsApp / email per event (§5.7, §8).
-- 2. accounts.billing_address for invoices (company details, §5.7).
-- 3. Invites can be for the Owner, but only Milkywayy creates those (a client set up by admin,
--    §7.1); clients still invite admins and members only. On accepting an Owner invite for an
--    account that already has an Owner, the person joins as an Admin instead.
-- 4. Client accounts for the admin, through functions gated by PORTAL_ADMIN_SECRET (hash under
--    'portal_admin'). The server only calls them for a signed-in Owner (two-factor) and passes
--    who it was, so every view and change lands in private.portal_admin_log. Notes about a
--    client live in private.client_notes, which no client role can read.

-- ---------- 1, 2: new columns ----------
alter table public.profiles add column notification_prefs jsonb not null default '{}'
  check (jsonb_typeof(notification_prefs) = 'object' and length(notification_prefs::text) <= 4000);
grant update (notification_prefs) on public.profiles to authenticated;

alter table public.accounts add column billing_address text check (length(billing_address) <= 300);
grant update (billing_address) on public.accounts to authenticated;

-- ---------- 3: owner invites (admin only) ----------
alter table public.account_invites drop constraint account_invites_role_check;
alter table public.account_invites add constraint account_invites_role_check
  check (role in ('owner', 'admin', 'member'));
drop policy "admins invite" on public.account_invites;
create policy "admins invite" on public.account_invites
  for insert to authenticated
  with check (account_id in (select private.my_admin_account_ids())
    and invited_by = (select auth.uid()) and role in ('admin', 'member'));

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
    where accepted_at is null
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
    insert into public.account_members (account_id, user_id, role, invited_by)
      values (r.account_id, v_uid, v_role, r.invited_by)
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

-- ---------- 4: admin Client accounts ----------
create table private.client_notes (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  notes text not null default '' check (length(notes) <= 8000),
  updated_by text,
  updated_at timestamptz not null default now()
);
create table private.portal_admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null check (action in ('view', 'view_as', 'create', 'update', 'invite', 'cancel_invite')),
  account_id uuid references public.accounts (id) on delete set null,
  detail text
);
create index portal_admin_log_account_idx on private.portal_admin_log (account_id, at desc);
revoke all on private.client_notes, private.portal_admin_log from public, anon, authenticated;

create or replace function private.portal_admin_gate(p_secret text, p_actor text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  select sha256 into v_hash from private.app_secrets where name = 'portal_admin';
  if v_hash is null or v_hash <> encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(btrim(p_actor), '') = '' then
    raise exception 'who is acting?' using errcode = '22023';
  end if;
end $$;
revoke all on function private.portal_admin_gate(text, text) from public, anon, authenticated;

-- List with search (name, a member's or invitee's email/phone) and filters (service, type).
create or replace function public.portal_admin_clients(
  p_secret text, p_actor text, p_q text default null, p_service text default null, p_type text default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.last_activity desc)
    from (
      select a.id, a.type, a.name, a.industry, a.industry_other, a.currency, a.services_interest,
        a.created_at,
        (select count(*) from public.account_members m where m.account_id = a.id) as members,
        (select count(*) from public.account_invites i where i.account_id = a.id and i.accepted_at is null) as open_invites,
        (select count(*) from public.lead_claims c where c.account_id = a.id) as bookings,
        (select coalesce(p.full_name, p.email, p.phone_e164) from public.account_members m
          left join public.profiles p on p.user_id = m.user_id
          where m.account_id = a.id and m.role = 'owner') as owner,
        greatest(a.updated_at,
          coalesce((select max(m.created_at) from public.account_members m where m.account_id = a.id), a.created_at),
          coalesce((select max(c.claimed_at) from public.lead_claims c where c.account_id = a.id), a.created_at)
        ) as last_activity
      from public.accounts a
      where (p_type is null or a.type = p_type)
        and (p_service is null or p_service = any (a.services_interest))
        and (v_q is null
          or lower(a.name) like '%' || v_q || '%'
          or exists (select 1 from public.account_members m join public.profiles p on p.user_id = m.user_id
            where m.account_id = a.id and (lower(coalesce(p.email, '')) like '%' || v_q || '%'
              or coalesce(p.phone_e164, '') like '%' || replace(v_q, ' ', '') || '%'
              or lower(coalesce(p.full_name, '')) like '%' || v_q || '%'))
          or exists (select 1 from public.account_invites i where i.account_id = a.id
            and (coalesce(i.email, '') like '%' || v_q || '%' or coalesce(i.phone_e164, '') like '%' || replace(v_q, ' ', '') || '%')))
      limit 500
    ) x
  ), '[]'::jsonb);
end $$;

-- One client. p_view_as = the read-only client view: logged as such, and without admin notes.
create or replace function public.portal_admin_client(
  p_secret text, p_actor text, p_id uuid, p_view_as boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if not exists (select 1 from public.accounts where id = p_id) then
    return null;
  end if;
  insert into private.portal_admin_log (actor, action, account_id)
    values (p_actor, case when p_view_as then 'view_as' else 'view' end, p_id);
  select jsonb_build_object(
    'account', (select to_jsonb(a) from public.accounts a where a.id = p_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'joined', m.created_at,
        'name', p.full_name, 'email', coalesce(p.email, u.email), 'phone',
        coalesce(p.phone_e164, case when coalesce(u.phone, '') <> '' then '+' || u.phone end),
        'last_sign_in', u.last_sign_in_at) order by (m.role = 'owner') desc, m.created_at)
      from public.account_members m
      left join public.profiles p on p.user_id = m.user_id
      left join auth.users u on u.id = m.user_id
      where m.account_id = p_id), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'email', i.email, 'phone', i.phone_e164,
        'role', i.role, 'created_at', i.created_at) order by i.created_at)
      from public.account_invites i where i.account_id = p_id and i.accepted_at is null), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'role', c.role, 'whatsapp', c.whatsapp,
        'email', c.email, 'brn', c.brn, 'is_default', c.is_default) order by c.is_default desc, c.name)
      from public.contacts c where c.account_id = p_id), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object('ref', l.ref, 'booked_at', l.created_at, 'via', c.via,
        'claimed_at', c.claimed_at,
        'properties', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('type', b.property_type,
          'size', b.size_label, 'services', b.services, 'area', b.area, 'building', b.building, 'unit', b.unit,
          'date', b.shoot_date, 'slot', b.slot, 'subtotal', b.subtotal)) order by b.line_no), '[]'::jsonb)
          from public.booking_properties b where b.lead_id = l.id)) order by l.created_at desc)
      from public.lead_claims c join public.leads l on l.id = c.lead_id where c.account_id = p_id), '[]'::jsonb),
    'notes', case when p_view_as then null else (select n.notes from private.client_notes n where n.account_id = p_id) end,
    'notes_updated', case when p_view_as then null else
      (select jsonb_build_object('by', n.updated_by, 'at', n.updated_at) from private.client_notes n where n.account_id = p_id) end,
    'log', case when p_view_as then null else coalesce((
      select jsonb_agg(jsonb_build_object('at', g.at, 'actor', g.actor, 'action', g.action, 'detail', g.detail) order by g.at desc)
      from (select * from private.portal_admin_log where account_id = p_id order by at desc limit 20) g), '[]'::jsonb) end
  ) into v;
  return v;
end $$;

-- Create a client by hand: the account, plus an Owner invite for its contact person.
create or replace function public.portal_admin_create_client(
  p_secret text, p_actor text, p_type text, p_name text, p_industry text, p_industry_other text,
  p_currency text, p_services text[], p_contact_name text, p_contact_email text, p_contact_phone text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if nullif(btrim(coalesce(p_contact_email, '')), '') is null and nullif(btrim(coalesce(p_contact_phone, '')), '') is null then
    raise exception 'add the contact''s email or WhatsApp number' using errcode = '22023';
  end if;
  insert into public.accounts (type, name, industry, industry_other, currency, services_interest)
  values (p_type, btrim(p_name),
    case when p_type = 'company' then p_industry end,
    case when p_type = 'company' and p_industry = 'other' then nullif(btrim(p_industry_other), '') end,
    coalesce(p_currency, 'AED'), coalesce(p_services, '{}'))
  returning id into v_id;
  insert into public.account_invites (account_id, name, email, phone_e164, role, invited_by)
  values (v_id, nullif(btrim(p_contact_name), ''), nullif(lower(btrim(coalesce(p_contact_email, ''))), ''),
    nullif(btrim(coalesce(p_contact_phone, '')), ''), 'owner', null);
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'create', v_id, 'Created with an Owner invite for ' ||
      coalesce(nullif(btrim(p_contact_name), ''), nullif(p_contact_email, ''), p_contact_phone));
  return v_id;
end $$;

-- Billing currency (admin-only field) and private notes.
create or replace function public.portal_admin_update_client(
  p_secret text, p_actor text, p_id uuid, p_currency text default null, p_notes text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_currency is not null then
    update public.accounts set currency = p_currency where id = p_id and currency is distinct from p_currency;
    if found then
      insert into private.portal_admin_log (actor, action, account_id, detail)
        values (p_actor, 'update', p_id, 'Currency set to ' || p_currency);
    end if;
  end if;
  if p_notes is not null then
    insert into private.client_notes (account_id, notes, updated_by, updated_at)
      values (p_id, btrim(p_notes), p_actor, now())
      on conflict (account_id) do update set notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now();
    insert into private.portal_admin_log (actor, action, account_id, detail) values (p_actor, 'update', p_id, 'Notes updated');
  end if;
end $$;

create or replace function public.portal_admin_invite(
  p_secret text, p_actor text, p_id uuid, p_name text, p_email text, p_phone text, p_role text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_inv uuid;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  insert into public.account_invites (account_id, name, email, phone_e164, role, invited_by)
  values (p_id, nullif(btrim(coalesce(p_name, '')), ''), nullif(lower(btrim(coalesce(p_email, ''))), ''),
    nullif(btrim(coalesce(p_phone, '')), ''), p_role, null)
  returning id into v_inv;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'invite', p_id, p_role || ' invite for ' || coalesce(nullif(btrim(p_name), ''), p_email, p_phone));
  return v_inv;
end $$;

create or replace function public.portal_admin_cancel_invite(p_secret text, p_actor text, p_invite uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_acc uuid; v_who text;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  delete from public.account_invites where id = p_invite and accepted_at is null
    returning account_id, coalesce(name, email, phone_e164) into v_acc, v_who;
  if v_acc is not null then
    insert into private.portal_admin_log (actor, action, account_id, detail)
      values (p_actor, 'cancel_invite', v_acc, 'Cancelled the invite for ' || v_who);
  end if;
end $$;

revoke all on function
  public.portal_admin_clients(text, text, text, text, text),
  public.portal_admin_client(text, text, uuid, boolean),
  public.portal_admin_create_client(text, text, text, text, text, text, text, text[], text, text, text),
  public.portal_admin_update_client(text, text, uuid, text, text),
  public.portal_admin_invite(text, text, uuid, text, text, text, text),
  public.portal_admin_cancel_invite(text, text, uuid)
  from public;
grant execute on function
  public.portal_admin_clients(text, text, text, text, text),
  public.portal_admin_client(text, text, uuid, boolean),
  public.portal_admin_create_client(text, text, text, text, text, text, text, text[], text, text, text),
  public.portal_admin_update_client(text, text, uuid, text, text),
  public.portal_admin_invite(text, text, uuid, text, text, text, text),
  public.portal_admin_cancel_invite(text, text, uuid)
  to anon, authenticated;

-- ---------- 5: creating a second account keeps the person's name ----------
-- (Someone invited into a company who later sets up their own account kept getting renamed to
-- the new account's name.) Same as before, except an existing profile name wins.
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
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    email = coalesce(excluded.email, public.profiles.email),
    phone_e164 = coalesce(excluded.phone_e164, public.profiles.phone_e164);
  return v_id;
end $$;
revoke all on function public.create_my_account(text, text, text, text, text, text, text[]) from public, anon;
grant execute on function public.create_my_account(text, text, text, text, text, text, text[]) to authenticated;
