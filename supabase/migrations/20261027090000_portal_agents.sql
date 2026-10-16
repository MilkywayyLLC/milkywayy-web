-- Agency teams: agents (owner, 17 Oct 2026). Additive.
-- * Shoots and listings get an optional Agent (one of the account's contacts) and a "Share with"
--   list of teammates (Owner/Admins set it).
-- * A contact can be linked to a teammate (contacts.member_id). Inviting with the Agent preset
--   creates or links their contact; accepting the invite links it to their login.
-- * Agent preset (access.preset = 'agent': shoots + listings, no billing, not all projects, no
--   team): sees a shoot or listing only if they're its Agent, it's shared with them, or they made it.
--   Projects already honour assigned_member_ids everywhere (RLS, every RPC, notifications), so it
--   now holds Share with + the Agent's login, kept in sync by trigger. Listings get their own check.

-- ---------- columns ----------
alter table public.contacts add column if not exists member_id uuid references auth.users (id) on delete set null;
create unique index if not exists contacts_one_per_member on public.contacts (account_id, member_id)
  where member_id is not null;

alter table public.account_invites add column if not exists contact_id uuid
  references public.contacts (id) on delete set null;

alter table public.projects
  add column if not exists agent_contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists agent_user_id uuid,
  add column if not exists shared_with uuid[] not null default '{}';
create index if not exists projects_agent_idx on public.projects (agent_contact_id);

alter table public.listings
  add column if not exists agent_contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists agent_user_id uuid,
  add column if not exists shared_with uuid[] not null default '{}';
create index if not exists listings_agent_idx on public.listings (agent_contact_id);

-- Nothing set assigned_member_ids from the app; whatever is there becomes the Share with list.
update public.projects set shared_with = assigned_member_ids
  where assigned_member_ids <> '{}' and shared_with = '{}';

-- ---------- helpers ----------
-- Owner or Admin role (not a member with extra toggles).
create or replace function private.is_account_admin(p_account uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.account_members m
    where m.account_id = p_account and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
$$;

-- A listing an agent sees: they're its Agent, or it's shared with them.
create or replace function private.sees_as_agent(p_account uuid, p_agent uuid, p_shared uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_account in (select private.my_account_ids())
    and (auth.uid() = p_agent or auth.uid() = any (p_shared)), false)
$$;

revoke all on function private.is_account_admin(uuid), private.sees_as_agent(uuid, uuid, uuid[]) from public, anon;
grant execute on function private.is_account_admin(uuid), private.sees_as_agent(uuid, uuid, uuid[]) to authenticated;

-- Agent's login and (projects) assigned_member_ids follow the Agent and Share with. A new item
-- booked or built by an Agent-preset member defaults to their own contact.
create or replace function private.sync_item_people() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_by uuid;
begin
  if tg_op = 'INSERT' and new.agent_contact_id is null then
    -- Listings have no requested_by (to_jsonb: plpgsql would resolve new.requested_by anyway).
    v_by := coalesce((to_jsonb(new) ->> 'requested_by')::uuid, new.created_by);
    select c.id into new.agent_contact_id from public.contacts c
      join public.account_members m on m.account_id = c.account_id and m.user_id = c.member_id
      where c.account_id = new.account_id and c.member_id = v_by and m.access ->> 'preset' = 'agent';
  end if;
  if new.agent_contact_id is not null and not exists (select 1 from public.contacts c
      where c.id = new.agent_contact_id and c.account_id = new.account_id) then
    raise exception 'that agent isn''t one of the account''s contacts' using errcode = '22023';
  end if;
  new.agent_user_id := (select c.member_id from public.contacts c where c.id = new.agent_contact_id);
  new.shared_with := array(select distinct u from unnest(coalesce(new.shared_with, '{}')) u where u is not null);
  if tg_table_name = 'projects' then
    new.assigned_member_ids := array(select distinct u from unnest(new.shared_with || new.agent_user_id) u
      where u is not null);
  end if;
  return new;
end $$;
revoke all on function private.sync_item_people() from public, anon, authenticated;

drop trigger if exists projects_people on public.projects;
create trigger projects_people before insert or update of agent_contact_id, shared_with, account_id
  on public.projects for each row execute function private.sync_item_people();
drop trigger if exists listings_people on public.listings;
create trigger listings_people before insert or update of agent_contact_id, shared_with, account_id
  on public.listings for each row execute function private.sync_item_people();

-- Linking or unlinking a contact re-syncs the items it's the Agent of.
create or replace function private.contact_member_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.projects set agent_contact_id = agent_contact_id where agent_contact_id = new.id;
  update public.listings set agent_contact_id = agent_contact_id where agent_contact_id = new.id;
  return null;
end $$;
revoke all on function private.contact_member_changed() from public, anon, authenticated;
drop trigger if exists contacts_member_changed on public.contacts;
create trigger contacts_member_changed after update of member_id on public.contacts
  for each row when (old.member_id is distinct from new.member_id)
  execute function private.contact_member_changed();

-- The contact for an agent: an unlinked one with the same email or phone, else a new one.
create or replace function private.agent_contact(p_account uuid, p_name text, p_email text, p_phone text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select id into v from public.contacts
    where account_id = p_account and member_id is null
      and ((p_email is not null and email = lower(p_email)) or (p_phone is not null and whatsapp = p_phone))
    order by created_at limit 1;
  if v is null then
    insert into public.contacts (account_id, name, email, whatsapp, role, created_by)
    values (p_account, left(coalesce(nullif(btrim(p_name), ''), split_part(p_email, '@', 1), 'Agent'), 120),
      lower(p_email), p_phone, 'Agent', auth.uid())
    returning id into v;
  end if;
  return v;
end $$;
revoke all on function private.agent_contact(uuid, text, text, text) from public, anon, authenticated;

-- Inviting with the Agent preset creates or links their contact.
create or replace function private.invite_agent_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.accepted_at is null and new.contact_id is null and new.access ->> 'preset' = 'agent' then
    new.contact_id := private.agent_contact(new.account_id, new.name, new.email, new.phone_e164);
  end if;
  return new;
end $$;
revoke all on function private.invite_agent_contact() from public, anon, authenticated;
drop trigger if exists account_invites_agent_contact on public.account_invites;
create trigger account_invites_agent_contact before insert or update of access on public.account_invites
  for each row execute function private.invite_agent_contact();

-- Accepting the invite links the contact to the new login.
create or replace function private.invite_accepted_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.contact_id is not null and new.accepted_by is not null
     and not exists (select 1 from public.contacts where account_id = new.account_id and member_id = new.accepted_by) then
    update public.contacts set member_id = new.accepted_by where id = new.contact_id and member_id is null;
  end if;
  return null;
end $$;
revoke all on function private.invite_accepted_link() from public, anon, authenticated;
drop trigger if exists account_invites_accepted_link on public.account_invites;
create trigger account_invites_accepted_link after update of accepted_by on public.account_invites
  for each row when (old.accepted_by is null and new.accepted_by is not null)
  execute function private.invite_accepted_link();

-- An existing teammate switched to Agent gets a linked contact too; one who leaves is unlinked.
create or replace function private.member_agent_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.profiles%rowtype; v uuid;
begin
  if tg_op = 'DELETE' then
    update public.contacts set member_id = null where account_id = old.account_id and member_id = old.user_id;
    return null;
  end if;
  if new.access ->> 'preset' = 'agent' and not exists (select 1 from public.contacts
      where account_id = new.account_id and member_id = new.user_id) then
    select * into p from public.profiles where user_id = new.user_id;
    if p.email is not null or p.phone_e164 is not null then
      v := private.agent_contact(new.account_id, p.full_name, p.email, p.phone_e164);
      update public.contacts set member_id = new.user_id where id = v;
    end if;
  end if;
  return null;
end $$;
revoke all on function private.member_agent_contact() from public, anon, authenticated;
drop trigger if exists account_members_agent_contact on public.account_members;
create trigger account_members_agent_contact after update of access or delete on public.account_members
  for each row execute function private.member_agent_contact();

-- ---------- RLS ----------
-- Listings: as before, plus the ones you're the Agent of or that are shared with you.
drop policy if exists "read visible listings" on public.listings;
create policy "read visible listings" on public.listings
  for select to authenticated using ((select private.sees_share(account_id, created_by))
    or (select private.sees_as_agent(account_id, agent_user_id, shared_with)));

-- Contacts: a teammate manages their own linked card (company contacts stay Admin/author only).
drop policy if exists "admins and authors edit contacts" on public.contacts;
create policy "admins and authors edit contacts" on public.contacts
  for update to authenticated
  using (account_id in (select private.my_admin_account_ids())
    or ((created_by = (select auth.uid()) or member_id = (select auth.uid()))
      and account_id in (select private.my_account_ids())))
  with check (account_id in (select private.my_account_ids()));

-- ---------- client functions ----------
-- Set a shoot's Agent: Owner/Admins, or whoever booked it.
create or replace function public.set_project_agent(p_project uuid, p_contact uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  select * into p from public.projects where id = p_project;
  if p.id is null or not coalesce(private.is_account_admin(p.account_id)
      or (p.account_id in (select private.my_account_ids())
        and auth.uid() in (p.created_by, p.requested_by)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.projects set agent_contact_id = p_contact where id = p_project;
end $$;

-- Share a shoot ('p') or listing ('l') with teammates: Owner/Admins only.
create or replace function public.set_share_with(p_kind text, p_id uuid, p_users uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_account uuid;
begin
  if p_kind = 'p' then select account_id into v_account from public.projects where id = p_id;
  elsif p_kind = 'l' then select account_id into v_account from public.listings where id = p_id;
  end if;
  if v_account is null or not private.is_account_admin(v_account) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  p_users := coalesce(p_users, '{}');
  if cardinality(p_users) > 50 or exists (select 1 from unnest(p_users) u where u not in (
      select m.user_id from public.account_members m where m.account_id = v_account)) then
    raise exception 'share with teammates only' using errcode = '22023';
  end if;
  if p_kind = 'p' then update public.projects set shared_with = p_users where id = p_id;
  else update public.listings set shared_with = p_users where id = p_id; end if;
end $$;

revoke all on function public.set_project_agent(uuid, uuid), public.set_share_with(text, uuid, uuid[]) from public, anon;
grant execute on function public.set_project_agent(uuid, uuid), public.set_share_with(text, uuid, uuid[]) to authenticated;

-- save_listing: same as before, plus the Agent (p.agent_contact_id), and a listing's Agent may edit it.
create or replace function public.save_listing(p_id uuid, p_project uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pr public.projects%rowtype; l public.listings%rowtype;
  v_photos uuid[]; v_contacts uuid[]; v_reel uuid; v_high text[]; v_id uuid; v_slug text; v_agent uuid;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_id is not null then
    select * into l from public.listings where id = p_id;
    if not found or not coalesce(private.edits_share(l.account_id, l.created_by)
        or (l.account_id in (select private.my_account_ids()) and l.agent_user_id = auth.uid()), false) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    p_project := l.project_id;
  end if;
  select * into pr from public.projects where id = p_project;
  if not found or not private.sees_project(pr.account_id, pr.created_by, pr.requested_by, pr.assigned_member_ids) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if pr.type <> 'shoot' or pr.status not in ('delivered', 'completed') then
    raise exception 'only delivered shoots get share pages' using errcode = '22023';
  end if;

  v_photos := array(select x::uuid from jsonb_array_elements_text(coalesce(p -> 'photo_ids', '[]')) x);
  if cardinality(v_photos) = 0 then raise exception 'choose at least one photo' using errcode = '22023'; end if;
  if cardinality(v_photos) <> (select count(distinct u) from unnest(v_photos) u)
    or exists (select 1 from unnest(v_photos) u where u not in (
      select f.id from public.project_files f where f.project_id = pr.id and f.direction = 'out'
        and f.published and f.deleted_at is null and f.kind = 'photos' and f.source = 'r2')) then
    raise exception 'a photo isn''t from this shoot' using errcode = '22023';
  end if;

  v_contacts := array(select x::uuid from jsonb_array_elements_text(coalesce(p -> 'contact_ids', '[]')) x);
  if cardinality(v_contacts) not between 1 and 2
    or cardinality(v_contacts) <> (select count(distinct u) from unnest(v_contacts) u)
    or exists (select 1 from unnest(v_contacts) u
      where u not in (select c.id from public.contacts c where c.account_id = pr.account_id)) then
    raise exception 'choose one or two of your contacts' using errcode = '22023';
  end if;

  v_agent := nullif(p ->> 'agent_contact_id', '')::uuid;
  if v_agent is not null and not exists (select 1 from public.contacts c
      where c.id = v_agent and c.account_id = pr.account_id) then
    raise exception 'choose the agent from your contacts' using errcode = '22023';
  end if;

  v_reel := nullif(p ->> 'reel_id', '')::uuid;
  if v_reel is not null and not exists (select 1 from public.project_files f where f.id = v_reel
      and f.project_id = pr.id and f.published and f.deleted_at is null and f.web_key is not null
      and f.kind in ('reel', 'long_form')) then
    raise exception 'that video isn''t ready for share pages' using errcode = '22023';
  end if;

  v_high := array(select btrim(x) from jsonb_array_elements_text(coalesce(p -> 'highlights', '[]')) x
    where btrim(x) <> '');
  if exists (select 1 from unnest(v_high) h where length(h) > 40) then
    raise exception 'keep each highlight under 40 characters' using errcode = '22023';
  end if;

  if p_id is null then
    v_slug := private.new_share_slug(p ->> 'title');
    insert into public.listings (account_id, project_id, slug, title, purpose, price, location,
      property_type, beds, baths, size_sqft, furnishing, description, highlights, permit_no,
      permit_qr_key, contact_ids, photo_ids, reel_id, video_url, tour_url, show_brand, expires_on, agent_contact_id)
    values (pr.account_id, pr.id, v_slug, btrim(p ->> 'title'), p ->> 'purpose', (p ->> 'price')::numeric,
      nullif(btrim(p ->> 'location'), ''), nullif(btrim(p ->> 'property_type'), ''),
      nullif(btrim(p ->> 'beds'), ''), nullif(p ->> 'baths', '')::numeric,
      nullif(p ->> 'size_sqft', '')::int, nullif(p ->> 'furnishing', ''),
      nullif(btrim(p ->> 'description'), ''), v_high, nullif(btrim(p ->> 'permit_no'), ''),
      nullif(p ->> 'permit_qr_key', ''), v_contacts, v_photos, v_reel, nullif(btrim(p ->> 'video_url'), ''),
      nullif(btrim(p ->> 'tour_url'), ''), coalesce((p ->> 'show_brand')::boolean, true),
      nullif(p ->> 'expires_on', '')::date, v_agent)
    returning id into v_id;
  else
    update public.listings set title = btrim(p ->> 'title'), purpose = p ->> 'purpose',
      price = (p ->> 'price')::numeric, location = nullif(btrim(p ->> 'location'), ''),
      property_type = nullif(btrim(p ->> 'property_type'), ''), beds = nullif(btrim(p ->> 'beds'), ''),
      baths = nullif(p ->> 'baths', '')::numeric, size_sqft = nullif(p ->> 'size_sqft', '')::int,
      furnishing = nullif(p ->> 'furnishing', ''), description = nullif(btrim(p ->> 'description'), ''),
      highlights = v_high, permit_no = nullif(btrim(p ->> 'permit_no'), ''),
      permit_qr_key = nullif(p ->> 'permit_qr_key', ''), contact_ids = v_contacts, photo_ids = v_photos,
      reel_id = v_reel, video_url = nullif(btrim(p ->> 'video_url'), ''),
      tour_url = nullif(btrim(p ->> 'tour_url'), ''), show_brand = coalesce((p ->> 'show_brand')::boolean, true),
      expires_on = nullif(p ->> 'expires_on', '')::date, agent_contact_id = v_agent
    where id = p_id returning id, slug into v_id, v_slug;
  end if;
  select slug into v_slug from public.listings where id = v_id;

  -- Saved to the property for next time (everything but the expiry date).
  update public.projects set listing_defaults = (p - 'expires_on') where id = pr.id;
  return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;

-- Admin: a project's Agent and who it's shared with (names), for the project page.
create or replace function public.portal_admin_project_people(p_secret text, p_actor text, p_project uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_project;
  return jsonb_build_object(
    'agent', (select jsonb_build_object('name', c.name, 'email', c.email, 'whatsapp', c.whatsapp,
      'has_login', c.member_id is not null) from public.contacts c where c.id = p.agent_contact_id),
    'shared_with', coalesce((select jsonb_agg(coalesce(pr.full_name, pr.email, 'Team member'))
      from unnest(p.shared_with) u left join public.profiles pr on pr.user_id = u), '[]'::jsonb));
end $$;
revoke all on function public.portal_admin_project_people(text, text, uuid) from public, anon, authenticated;
grant execute on function public.portal_admin_project_people(text, text, uuid) to anon, authenticated;
